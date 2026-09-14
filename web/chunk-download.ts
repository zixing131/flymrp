import { md5Bytes } from '../src/mythroad/guest-md5.ts';
export const CHUNK_TYPE = 'application/vnd.flymrp.chunks+json';
const MAX_FILE = 128 * 1024 * 1024;
type Part = { key: string; size: number; md5: string };
export type ChunkManifest = { version: 1; size: number; md5: string; parts: Part[] };
const digest = (b: Uint8Array): string => Array.from(md5Bytes(b), n => n.toString(16).padStart(2, '0')).join('');
export function parseChunkManifest(value: unknown): ChunkManifest {
  const m = value as ChunkManifest;
  if (!m || m.version !== 1 || !Number.isSafeInteger(m.size) || m.size < 1 || m.size > MAX_FILE || !/^[a-f0-9]{32}$/.test(m.md5) || !Array.isArray(m.parts) || !m.parts.length || m.parts.length > 100) throw new Error('Invalid chunk manifest');
  let total = 0;
  for (const p of m.parts) {
    if (!p || !/^chunks\/[a-f0-9]{64}\/\d+$/.test(p.key) || !Number.isSafeInteger(p.size) || p.size < 1 || p.size > 1900000 || !/^[a-f0-9]{32}$/.test(p.md5)) throw new Error('Invalid chunk');
    total += p.size;
  }
  if (total !== m.size) throw new Error('Chunk size mismatch');
  return m;
}
export function chunkUrl(key: string, original: string): string {
  return new URL(`/blob/${key}`, new URL(original, globalThis.location?.href || 'http://localhost/')).href;
}
export function checkChunk(bytes: Uint8Array, expected: { size: number; md5: string }): void {
  if (bytes.length !== expected.size || digest(bytes) !== expected.md5) throw new Error('Downloaded file checksum mismatch');
}
/** Both regular streams and chunked downloads retain the same progress API. */
export async function fetchFileBytes(url: string, progress?: (received: number, total: number) => void): Promise<Uint8Array> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`);
  if (response.headers.get('Content-Type')?.split(';')[0] === CHUNK_TYPE) {
    const manifest = parseChunkManifest(await response.json());
    const out = new Uint8Array(manifest.size); let offset = 0;
    for (const part of manifest.parts) {
      let bytes: Uint8Array | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch(chunkUrl(part.key, url));
          if (!r.ok) throw new Error(`分片下载失败（HTTP ${r.status}）`);
          bytes = new Uint8Array(await r.arrayBuffer()); checkChunk(bytes, part); break;
        } catch (e) { if (attempt === 2) throw e; }
      }
      out.set(bytes!, offset); offset += bytes!.length; progress?.(offset, manifest.size);
    }
    checkChunk(out, manifest); return out;
  }
  const total = Number(response.headers.get('Content-Length')) || 0;
  if (total > MAX_FILE) throw new Error('文件过大（超过 128 MB）');
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_FILE) throw new Error('文件过大（超过 128 MB）');
    progress?.(bytes.length, total || bytes.length); return bytes;
  }
  const parts: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > MAX_FILE) { await reader.cancel(); throw new Error('文件过大（超过 128 MB）'); }
    parts.push(value); progress?.(size, total);
  }
  const out = new Uint8Array(size); let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
