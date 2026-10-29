import { crc32, inflateRaw } from './gzip.ts';

/** Extract the store's SD resource ZIPs without requiring DecompressionStream. */
export function unzipResources(src: Uint8Array): { path: string; bytes: Uint8Array }[] {
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const check = (offset: number, size: number) => {
    if (offset < 0 || size < 0 || offset + size > src.length) throw new Error('资源 ZIP 不完整');
  };
  const u16 = (n: number) => { check(n, 2); return view.getUint16(n, true); };
  const u32 = (n: number) => { check(n, 4); return view.getUint32(n, true); };
  let eocd = src.length - 22;
  while (eocd >= Math.max(0, src.length - 65557) &&
    (u32(eocd) !== 0x06054b50 || eocd + 22 + u16(eocd + 20) !== src.length)) eocd--;
  if (eocd < 0 || eocd < src.length - 65557) throw new Error('找不到资源 ZIP 目录');
  const count = u16(eocd + 10), directorySize = u32(eocd + 12), directory = u32(eocd + 16);
  if (u16(eocd + 4) || u16(eocd + 6) || u16(eocd + 8) !== count || count > 4096 || directory + directorySize !== eocd) {
    throw new Error('不支持此资源 ZIP 目录');
  }
  let cursor = directory, total = 0;
  const files: { path: string; bytes: Uint8Array }[] = [], seen = new Set<string>();
  for (let index = 0; index < count; index++) {
    check(cursor, 46);
    if (u32(cursor) !== 0x02014b50) throw new Error('资源 ZIP 目录损坏');
    const flags = u16(cursor + 8), method = u16(cursor + 10), crc = u32(cursor + 16);
    const packed = u32(cursor + 20), size = u32(cursor + 24), nameSize = u16(cursor + 28);
    const local = u32(cursor + 42), next = cursor + 46 + nameSize + u16(cursor + 30) + u16(cursor + 32);
    check(cursor, next - cursor);
    if (next > eocd || flags & 0x41 || ![0, 8].includes(method) || u16(cursor + 34)) throw new Error('不支持此资源 ZIP 文件');
    const rawName = src.subarray(cursor + 46, cursor + 46 + nameSize);
    const name = new TextDecoder(flags & 0x800 ? 'utf-8' : 'gbk', { fatal: true }).decode(rawName).replace(/\\/g, '/');
    const parts = name.split('/');
    if (name.startsWith('/') || parts.some(p => p === '..' || /[:\x00-\x1f]/.test(p))) throw new Error('资源 ZIP 包含非法路径');
    const path = parts.filter(p => p && p !== '.').join('/').toLowerCase();
    if (!path || seen.has(path)) throw new Error('资源 ZIP 路径为空或重复');
    seen.add(path);
    total += size;
    if (size > 32 * 1024 * 1024 || total > 128 * 1024 * 1024) throw new Error('资源 ZIP 解压大小超限');
    check(local, 30);
    if (u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method || u16(local + 26) !== nameSize) throw new Error('资源 ZIP 文件头不一致');
    const start = local + 30 + nameSize + u16(local + 28);
    check(local + 30, nameSize);
    if (!rawName.every((b, i) => b === src[local + 30 + i]) || start + packed > directory) throw new Error('资源 ZIP 数据越界');
    const payload = src.subarray(start, start + packed);
    const bytes = method === 0 ? payload.slice() : inflateRaw(payload, 0, size).bytes;
    if (bytes.length !== size || crc32(bytes) !== crc) throw new Error('资源 ZIP 文件校验失败');
    if (!name.endsWith('/')) files.push({ path, bytes });
    cursor = next;
  }
  if (cursor !== eocd) throw new Error('资源 ZIP 目录长度不一致');
  return files;
}
