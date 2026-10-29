import { MrpFormatError } from "../err/errors.ts";

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c >>> 0;
}

export function crc32(data: Uint8Array, seed = 0): number {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function isGzip(data: Uint8Array): boolean {
  return data.length >= 3 && data[0] === 0x1f && data[1] === 0x8b && data[2] === 0x08;
}

/** Stored-block gzip. Valid RFC 1952; used by fixtures and as a fallback encoder. */
export function gzipStore(data: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  chunks.push(new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff]));
  let off = 0;
  while (off < data.length || off === 0) {
    const n = Math.min(0xffff, data.length - off);
    const last = off + n >= data.length;
    const block = new Uint8Array(5 + n);
    block[0] = last ? 1 : 0;
    block[1] = n & 0xff;
    block[2] = n >>> 8;
    block[3] = ~n & 0xff;
    block[4] = (~n >>> 8) & 0xff;
    if (n) block.set(data.subarray(off, off + n), 5);
    chunks.push(block);
    off += n;
    if (data.length === 0) break;
  }
  const tail = new Uint8Array(8);
  const crc = crc32(data);
  tail[0] = crc;
  tail[1] = crc >>> 8;
  tail[2] = crc >>> 16;
  tail[3] = crc >>> 24;
  const isize = data.length >>> 0;
  tail[4] = isize;
  tail[5] = isize >>> 8;
  tail[6] = isize >>> 16;
  tail[7] = isize >>> 24;
  chunks.push(tail);
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

class BitReader {
  constructor(
    readonly u8: Uint8Array,
    public i = 0,
  ) {}
  bitbuf = 0;
  bitcnt = 0;

  bits(n: number): number {
    while (this.bitcnt < n) {
      if (this.i >= this.u8.length) throw new MrpFormatError("truncated gzip/deflate");
      this.bitbuf |= this.u8[this.i++]! << this.bitcnt;
      this.bitcnt += 8;
    }
    const v = this.bitbuf & ((1 << n) - 1);
    this.bitbuf >>>= n;
    this.bitcnt -= n;
    return v;
  }

  align(): void {
    this.bitbuf = 0;
    this.bitcnt = 0;
  }
}

type Huff = { lengths: Uint8Array; codes: Int32Array; max: number };

function buildHuff(lengths: ArrayLike<number>): Huff {
  const n = lengths.length;
  const lens = new Uint8Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const l = lengths[i]! | 0;
    lens[i] = l;
    if (l > max) max = l;
  }
  const count = new Int32Array(max + 1);
  for (let i = 0; i < n; i++) if (lens[i]) count[lens[i]!]++;
  const next = new Int32Array(max + 1);
  let code = 0;
  for (let l = 1; l <= max; l++) {
    code = (code + count[l - 1]!) << 1;
    next[l] = code;
  }
  const codes = new Int32Array(n);
  codes.fill(-1);
  for (let i = 0; i < n; i++) {
    const l = lens[i]!;
    if (l) codes[i] = next[l]++;
  }
  return { lengths: lens, codes, max };
}

function decodeHuff(r: BitReader, h: Huff): number {
  let code = 0;
  for (let l = 1; l <= h.max; l++) {
    code = (code << 1) | r.bits(1);
    const lens = h.lengths;
    const codes = h.codes;
    for (let i = 0; i < lens.length; i++) {
      if (lens[i] === l && codes[i] === code) return i;
    }
  }
  throw new MrpFormatError("invalid deflate huffman code");
}

const LEN_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LEN_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function fixedLit(): Huff {
  const L = new Uint8Array(288);
  for (let i = 0; i <= 143; i++) L[i] = 8;
  for (let i = 144; i <= 255; i++) L[i] = 9;
  for (let i = 256; i <= 279; i++) L[i] = 7;
  for (let i = 280; i <= 287; i++) L[i] = 8;
  return buildHuff(L);
}

function fixedDist(): Huff {
  const L = new Uint8Array(32);
  L.fill(5);
  return buildHuff(L);
}

const FIXED_LIT = fixedLit();
const FIXED_DIST = fixedDist();

function readLenExtra(r: BitReader, n: number, lengths: Uint8Array, i: number, sym: number): number {
  let extra = 0;
  if (sym === 16) extra = 3 + r.bits(2);
  else if (sym === 17) extra = 3 + r.bits(3);
  else extra = 11 + r.bits(7);
  const v = sym === 16 ? (i === 0 ? 0 : lengths[i - 1]!) : 0;
  if (i + extra > n) throw new MrpFormatError("deflate code-length overflow");
  for (let k = 0; k < extra; k++) lengths[i + k] = v;
  return extra;
}

function readDynTrees(r: BitReader): { lit: Huff; dist: Huff } {
  const hlit = r.bits(5) + 257;
  const hdist = r.bits(5) + 1;
  const hclen = r.bits(4) + 4;
  const cl = new Uint8Array(19);
  for (let i = 0; i < hclen; i++) cl[CL_ORDER[i]!] = r.bits(3);
  const clH = buildHuff(cl);
  const lengths = new Uint8Array(hlit + hdist);
  let i = 0;
  while (i < lengths.length) {
    const sym = decodeHuff(r, clH);
    if (sym <= 15) {
      lengths[i++] = sym;
    } else {
      i += readLenExtra(r, lengths.length, lengths, i, sym);
    }
  }
  return {
    lit: buildHuff(lengths.subarray(0, hlit)),
    dist: buildHuff(lengths.subarray(hlit)),
  };
}

export function inflateRaw(src: Uint8Array, start = 0, maxOut = 32 * 1024 * 1024): { bytes: Uint8Array; end: number } {
  const r = new BitReader(src, start);
  const out: number[] = [];
  for (;;) {
    const bfinal = r.bits(1);
    const btype = r.bits(2);
    if (btype === 0) {
      r.align();
      if (r.i + 4 > src.length) throw new MrpFormatError("truncated stored deflate block");
      const len = src[r.i]! | (src[r.i + 1]! << 8);
      const nlen = src[r.i + 2]! | (src[r.i + 3]! << 8);
      r.i += 4;
      if ((len ^ 0xffff) !== nlen) throw new MrpFormatError("bad stored-block length");
      if (r.i + len > src.length) throw new MrpFormatError("truncated stored deflate payload");
      if (out.length + len > maxOut) throw new MrpFormatError("deflate output exceeds limit");
      for (let i = 0; i < len; i++) out.push(src[r.i++]!);
    } else if (btype === 1 || btype === 2) {
      const trees = btype === 1 ? { lit: FIXED_LIT, dist: FIXED_DIST } : readDynTrees(r);
      for (;;) {
        const sym = decodeHuff(r, trees.lit);
        if (sym < 256) {
          if (out.length >= maxOut) throw new MrpFormatError("deflate output exceeds limit");
          out.push(sym);
        } else if (sym === 256) {
          break;
        } else if (sym <= 285) {
          const li = sym - 257;
          const length = LEN_BASE[li]! + (LEN_EXTRA[li]! ? r.bits(LEN_EXTRA[li]!) : 0);
          const ds = decodeHuff(r, trees.dist);
          if (ds > 29) throw new MrpFormatError("invalid deflate distance symbol");
          const dist = DIST_BASE[ds]! + (DIST_EXTRA[ds]! ? r.bits(DIST_EXTRA[ds]!) : 0);
          if (dist <= 0 || dist > out.length) throw new MrpFormatError("invalid deflate distance");
          if (out.length + length > maxOut) throw new MrpFormatError("deflate output exceeds limit");
          for (let k = 0; k < length; k++) out.push(out[out.length - dist]!);
        } else {
          throw new MrpFormatError("invalid deflate literal symbol");
        }
      }
    } else {
      throw new MrpFormatError("invalid deflate block type");
    }
    if (bfinal) break;
  }
  return { bytes: Uint8Array.from(out), end: r.i };
}

export function gunzip(src: Uint8Array, maxOut = 32 * 1024 * 1024): Uint8Array {
  if (!isGzip(src)) throw new MrpFormatError("not gzip (missing 1F 8B 08)");
  if (src.length < 18) throw new MrpFormatError("truncated gzip header");
  const flg = src[3]!;
  let i = 10;
  if (flg & 4) {
    if (i + 2 > src.length) throw new MrpFormatError("truncated gzip extra");
    const xlen = src[i]! | (src[i + 1]! << 8);
    i += 2 + xlen;
  }
  if (flg & 8) {
    while (i < src.length && src[i] !== 0) i++;
    i++;
  }
  if (flg & 16) {
    while (i < src.length && src[i] !== 0) i++;
    i++;
  }
  if (flg & 2) i += 2;
  if (i >= src.length) throw new MrpFormatError("truncated gzip");
  const { bytes, end } = inflateRaw(src, i, maxOut);
  if (bytes.length > maxOut) throw new MrpFormatError("gzip output exceeds limit");
  if (end + 8 > src.length) throw new MrpFormatError("truncated gzip trailer");
  return bytes;
}
