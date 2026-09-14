import { MrpFormatError } from "../err/errors.ts";
import { gunzip, isGzip } from "./gzip.ts";

const MAGIC_MRPG = 0x4750524d; // "MRPG" as LE uint32
const MAGIC_MRPF = 0x4650524d; // "MRPF" as LE uint32
const HEADER_SIZE = 240;
const MAX_NAME = 255;
const MAX_FILE = 32 * 1024 * 1024;
const MAX_ENTRIES = 8192;

export type MrpMagic = "MRPG" | "MRPF";

export type MrpHeader = {
  magic: MrpMagic;
  fileStart: number;
  fileLen: number;
  listStart: number;
  filename: string;
  appname: string;
  appid: number;
  version: number;
  vendor: string;
  description: string;
};

export type MrpEntry = {
  name: string;
  rawName: Uint8Array;
  offset: number;
  storedLength: number;
  reserved: number;
  compressed: boolean;
};

function rd32(u8: Uint8Array, off: number): number {
  return (u8[off]! | (u8[off + 1]! << 8) | (u8[off + 2]! << 16) | (u8[off + 3]! << 24)) >>> 0;
}

function cstr(u8: Uint8Array, off: number, max: number): string {
  let n = 0;
  while (n < max && u8[off + n]) n++;
  return bytesToBin(u8.subarray(off, off + n));
}

export function bytesToBin(u8: Uint8Array): string {
  const CHUNK = 0x2000;
  if (u8.length <= CHUNK) return String.fromCharCode(...u8);
  let s = "";
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  }
  return s;
}

export function binToBytes(s: string): Uint8Array {
  const o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 0xff;
  return o;
}

function stripName(raw: Uint8Array): string {
  let n = raw.length;
  if (n > 0 && raw[n - 1] === 0) n--;
  let z = 0;
  while (z < n && raw[z]) z++;
  return bytesToBin(raw.subarray(0, z));
}

function inRange(off: number, len: number, size: number): boolean {
  return off <= size && len <= size - off;
}

export class MRPArchive {
  readonly data: Uint8Array;
  readonly header: MrpHeader;
  readonly entries: MrpEntry[];

  private constructor(data: Uint8Array, header: MrpHeader, entries: MrpEntry[]) {
    this.data = data;
    this.header = header;
    this.entries = entries;
  }

  static parse(data: Uint8Array): MRPArchive {
    if (data.length < 16) throw new MrpFormatError("truncated MRP header");
    const magicU32 = rd32(data, 0);
    let magic: MrpMagic;
    if (magicU32 === MAGIC_MRPG) magic = "MRPG";
    else if (magicU32 === MAGIC_MRPF) magic = "MRPF";
    else throw new MrpFormatError("malformed MRP magic (need MRPG or MRPF)");

    const fileStart = rd32(data, 4);
    const fileLen = rd32(data, 8);
    const listStart = data.length >= 16 ? rd32(data, 12) : HEADER_SIZE;
    const size = data.length;
    const dataStart = fileStart + 8;
    // Modified indexed packs can retain the original total length (e.g.
    // 恋爱气球). Native reads validate individual resources, not physical EOF
    // against this metadata. Require the complete index and all its payloads
    // within the actual buffer below; sequential packs keep the strict check.
    const indexed = fileStart > 232 && listStart >= 16 && listStart <= dataStart;
    if (fileLen > size && !indexed) {
      throw new MrpFormatError(`MRP FileLen ${fileLen} exceeds buffer ${size}`);
    }
    const bound = fileLen !== 0 && fileLen < size ? fileLen : size;

    const header: MrpHeader = {
      magic,
      fileStart,
      fileLen: fileLen || size,
      listStart,
      filename: data.length >= 28 ? cstr(data, 16, 12) : "",
      appname: data.length >= 52 ? cstr(data, 28, 24) : "",
      appid: data.length >= 72 ? rd32(data, 68) : 0,
      version: data.length >= 76 ? rd32(data, 72) : 0,
      vendor: data.length >= 128 ? cstr(data, 88, 40) : "",
      description: data.length >= 192 ? cstr(data, 128, 64) : "",
    };

    const entries: MrpEntry[] = [];

    if (fileStart > 232 && listStart >= 16 && listStart <= dataStart) {
      parseIndex(data, listStart, dataStart, bound, entries);
    } else if (listStart >= 16 && listStart < bound && listStart < dataStart) {
      parseIndex(data, listStart, dataStart, bound, entries);
    } else if (dataStart <= bound) {
      parseSequential(data, dataStart, bound, entries);
    } else if (fileStart <= 232 && listStart === HEADER_SIZE && dataStart === HEADER_SIZE) {
      // empty new-style package: FileStart=232, ListStart=240
    } else if (data.length < HEADER_SIZE && entries.length === 0 && fileStart <= 232) {
      throw new MrpFormatError("truncated MRP header");
    }

    return new MRPArchive(data, header, entries);
  }

  listFiles(): string[] {
    return this.entries.map((e) => e.name);
  }

  hasFile(name: string): boolean {
    return this.findEntry(name) !== undefined;
  }

  readFile(name: string): Uint8Array {
    const e = this.findEntry(name);
    if (!e) throw new MrpFormatError(`MRP file not found: ${name}`);
    if (!inRange(e.offset, e.storedLength, this.data.length)) {
      throw new MrpFormatError(`invalid offset/length for ${name}`);
    }
    if (e.storedLength === 0) return new Uint8Array();
    const slice = this.data.subarray(e.offset, e.offset + e.storedLength);
    if (isGzip(slice)) return gunzip(slice, MAX_FILE);
    return slice;
  }

  openNested(name: string): MRPArchive {
    return MRPArchive.parse(this.readFile(name));
  }

  findEntry(name: string): MrpEntry | undefined {
    for (const e of this.entries) {
      if (e.name === name) return e;
    }
    // Legacy packs may lowercase resource names while scripts retain capitals
    // (e.g. UID.scene). Exact entries win; ambiguous folded names stay missing.
    const key = name.replace(/[A-Z]/g, ch => ch.toLowerCase());
    const matches = this.entries.filter(e => e.name.replace(/[A-Z]/g, ch => ch.toLowerCase()) === key);
    return matches.length === 1 ? matches[0] : undefined;
  }
}

function pushEntry(
  data: Uint8Array,
  bound: number,
  rawName: Uint8Array,
  offset: number,
  storedLength: number,
  reserved: number,
  entries: MrpEntry[],
): void {
  if (entries.length >= MAX_ENTRIES) throw new MrpFormatError("too many MRP entries");
  if (storedLength > MAX_FILE) throw new MrpFormatError("invalid compressed length");
  if (!inRange(offset, storedLength, bound)) {
    throw new MrpFormatError("invalid offset or compressed length");
  }
  const slice = storedLength ? data.subarray(offset, offset + storedLength) : new Uint8Array();
  entries.push({
    name: stripName(rawName),
    rawName,
    offset,
    storedLength,
    reserved,
    compressed: isGzip(slice),
  });
}

function parseIndex(
  data: Uint8Array,
  listStart: number,
  dataStart: number,
  bound: number,
  entries: MrpEntry[],
): void {
  if (dataStart > bound) throw new MrpFormatError("truncated MRP index");
  let pos = listStart;
  while (pos < dataStart) {
    if (pos + 4 > dataStart) throw new MrpFormatError("truncated entry");
    const nameLen = rd32(data, pos);
    pos += 4;
    if (nameLen === 0) break;
    if (nameLen > MAX_NAME) throw new MrpFormatError("filename too long");
    if (pos + nameLen + 12 > dataStart) throw new MrpFormatError("truncated entry");
    const rawName = data.subarray(pos, pos + nameLen);
    pos += nameLen;
    const offset = rd32(data, pos);
    const storedLength = rd32(data, pos + 4);
    const reserved = rd32(data, pos + 8);
    pos += 12;
    pushEntry(data, bound, rawName, offset, storedLength, reserved, entries);
  }
}

function parseSequential(data: Uint8Array, start: number, bound: number, entries: MrpEntry[]): void {
  let pos = start;
  while (pos + 4 <= bound) {
    const nameLen = rd32(data, pos);
    if (nameLen === 0) break;
    if (nameLen > MAX_NAME) throw new MrpFormatError("filename too long");
    pos += 4;
    if (pos + nameLen + 4 > bound) throw new MrpFormatError("truncated entry");
    const rawName = data.subarray(pos, pos + nameLen);
    pos += nameLen;
    const storedLength = rd32(data, pos);
    pos += 4;
    if (storedLength > MAX_FILE) throw new MrpFormatError("invalid compressed length");
    if (!inRange(pos, storedLength, bound)) throw new MrpFormatError("invalid offset or compressed length");
    pushEntry(data, bound, rawName, pos, storedLength, 0, entries);
    pos += storedLength;
  }
}
