import { expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { crc32, inflateRaw } from '../../src/mrp/gzip.ts';
import { unzipResources } from '../../src/mrp/zip.ts';

function zip(entries: { name: string; data: Buffer; method?: number; flags?: number }[]): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const { name, data, method = 8, flags = 0x800 } of entries) {
    const filename = Buffer.from(name), packed = method === 8 ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30), item = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    item.writeUInt32LE(0x02014b50); item.writeUInt16LE(flags, 8); item.writeUInt16LE(method, 10);
    item.writeUInt32LE(crc32(data), 16); item.writeUInt32LE(packed.length, 20); item.writeUInt32LE(data.length, 24);
    item.writeUInt16LE(filename.length, 28); item.writeUInt32LE(offset, 42);
    locals.push(local, filename, packed); central.push(item, filename); offset += 30 + filename.length + packed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

it('extracts stored and deflated SD files, skipping directory entries', () => {
  const data = Buffer.from('ROM '.repeat(1024));
  const result = unzipResources(zip([
    { name: 'PeanutGB/', data: Buffer.alloc(0), method: 0 },
    { name: 'PeanutGB/game.gb', data },
    { name: '说明.txt', data: Buffer.from('ok'), method: 0 },
  ]));
  expect(result.map(f => f.path)).toEqual(['peanutgb/game.gb', '说明.txt']);
  expect(Buffer.from(result[0].bytes)).toEqual(data);
});

it('rejects traversal, encryption, collisions, corruption and truncated archives before installation', () => {
  for (const name of ['../escape', '/absolute', 'C:\\escape', 'dir/../../escape', 'a\0b']) {
    expect(() => unzipResources(zip([{ name, data: Buffer.from('x') }]))).toThrow();
  }
  expect(() => unzipResources(zip([{ name: 'a', data: Buffer.from('x'), flags: 1 }]))).toThrow();
  expect(() => unzipResources(zip([{ name: 'A', data: Buffer.alloc(0) }, { name: 'a', data: Buffer.alloc(0) }]))).toThrow();
  const archive = zip([{ name: 'a', data: Buffer.from('test'), method: 0 }]);
  archive[31] ^= 1;
  expect(() => unzipResources(archive)).toThrow(/校验/);
  for (const n of [0, 4, 22, archive.length - 1]) expect(() => unzipResources(archive.subarray(0, n))).toThrow();
});

it('limits inflate output while expanding, including repeat matches and stored blocks', () => {
  for (const level of [0, 9] as const) {
    const packed = deflateRawSync(Buffer.alloc(100000, 65), { level });
    expect(() => inflateRaw(packed, 0, 32)).toThrow(/exceeds limit/);
  }
});
