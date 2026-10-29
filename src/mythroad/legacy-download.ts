import { MRPArchive } from "../mrp/archive.ts";
import { dumpChunk, proto } from "../lua/chunk.ts";
import * as op from "../lua/opcodes.ts";
import { TAG_NUMBER, TAG_STRING, type ColdConst, type ColdProto } from "../lua/types.ts";

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};
const text = (value: string) => new TextEncoder().encode(value);

/** 2007 collection client: c16 + five BE integers, then bounded TLV records. */
export function legacyDownloadRequest(body: Uint8Array): { sequence: number; appid: number } | null {
  if (body.length < 36 || body.subarray(0, 16).some((b, i) => b !== (i % 2 ? 255 : 0))) return null;
  const view = new DataView(body.buffer, body.byteOffset, body.length);
  if (view.getUint32(20) !== 0 || view.getUint32(24) !== 258 || view.getUint32(28) !== body.length - 36 || view.getUint32(32) !== 0) return null;
  const seen = new Set<number>();
  let appid: number | null = null;
  for (let p = 36; p < body.length;) {
    if (body.length - p < 8) return null;
    const tag = view.getUint32(p), size = view.getUint32(p + 4);
    if (seen.has(tag) || size > body.length - p - 8) return null;
    seen.add(tag);
    if (tag === 0x10021) {
      if (size !== 4) return null;
      appid = view.getUint32(p + 8);
    }
    p += 8 + size;
  }
  return appid ? { sequence: view.getUint32(16), appid } : null;
}

// The shipped dealdowncode.mr only implements `code`: the original service
// supplied its file handlers as Lua bytecode. Supply our own small installer,
// using the same public file API and client-owned codeStruct. No guest package
// is patched, and no unknown/payment operation is answered with success.
function installer(): Uint8Array {
  const abc = op.CREATE_ABC, abx = op.CREATE_ABx;
  const constants: ColdConst[] = ["cmd", "getfile", "data", "fileend", "filename", "downdir", "fileId", "file", "open", "write", "close"].map(s => ({ t: TAG_STRING, s }));
  constants.push({ t: TAG_NUMBER, n: 26 }, { t: TAG_NUMBER, n: 1 });
  constants.push(...[".part", "sys", "rename", "data_info", "text", "title", "\xcf\xc2\xd4\xd8\xcd\xea\xb3\xc9", "\xb8\xfc\xd0\xc2"].map(s => ({ t: TAG_STRING as typeof TAG_STRING, s })));
  constants.push({ t: TAG_NUMBER, n: -2 });
  const k = (i: number) => op.Kst(i);
  const fn = (code: number[]): ColdProto => proto({ numparams: 2, maxstack: 8, k: constants, code });
  const success = [abx(op.OP_LOADK, 2, 12), abc(op.OP_RETURN, 2, 2, 0)];
  const check = [abc(op.OP_TEST, 2, 2, 1), op.CREATE_AsBx(op.OP_JMP, 0, 2), abx(op.OP_LOADK, 2, 21), abc(op.OP_RETURN, 2, 2, 0)];
  const getfile = fn([
    // function(payload, state): state.filename=state.downdir..payload;
    abc(op.OP_GETTABLE, 2, 1, k(5)), abc(op.OP_MOVE, 3, 0, 0), abc(op.OP_CONCAT, 2, 2, 3), abc(op.OP_SETTABLE, 1, k(4), 2),
    // Open a temporary file; only fileend publishes the completed download.
    abx(op.OP_GETGLOBAL, 2, 7), abc(op.OP_GETTABLE, 2, 2, k(8)), abc(op.OP_GETTABLE, 3, 1, k(4)), abx(op.OP_LOADK, 4, 13), abc(op.OP_CONCAT, 3, 3, 4), abx(op.OP_LOADK, 4, 11), abc(op.OP_CALL, 2, 3, 2), ...check,
    abc(op.OP_SETTABLE, 1, k(6), 2), ...success,
  ]);
  const data = fn([
    abc(op.OP_GETTABLE, 2, 1, k(6)), abc(op.OP_SELF, 2, 2, k(9)), abc(op.OP_MOVE, 4, 0, 0), abc(op.OP_CALL, 2, 3, 2), ...check, ...success,
  ]);
  const end = fn([
    abc(op.OP_GETTABLE, 2, 1, k(6)), abc(op.OP_SELF, 2, 2, k(10)), abc(op.OP_CALL, 2, 2, 2), ...check,
    abx(op.OP_GETGLOBAL, 2, 14), abc(op.OP_GETTABLE, 2, 2, k(15)), abc(op.OP_GETTABLE, 3, 1, k(4)), abx(op.OP_LOADK, 4, 13), abc(op.OP_CONCAT, 3, 3, 4), abc(op.OP_GETTABLE, 4, 1, k(4)), abc(op.OP_CALL, 2, 3, 2), ...check,
    abc(op.OP_GETTABLE, 2, 1, k(16)), abc(op.OP_SETTABLE, 2, k(17), k(19)), abc(op.OP_SETTABLE, 2, k(18), k(20)), ...success,
  ]);
  return dumpChunk(proto({ k: constants, p: [getfile, data, end], code: [
    abx(op.OP_GETGLOBAL, 0, 0),
    ...[1, 2, 3].flatMap((field, i) => [abx(op.OP_CLOSURE, 1, i), abc(op.OP_SETTABLE, 0, k(field), 1)]),
    abc(op.OP_RETURN, 0, 1, 0),
  ] }));
}

function command(name: string, data: Uint8Array): Uint8Array {
  const payload = concat(text(name + " "), data), size = new Uint8Array(2);
  if (payload.length > 65535) throw new Error("legacy download command too large");
  new DataView(size.buffer).setUint16(0, payload.length);
  return concat(size, payload);
}

/** Real package transfer; reject damaged, wrong-app and unsafe-name inputs. */
export function legacyPackageName(bytes: Uint8Array, appid: number): string | null {
  if (bytes.length > 32 * 1024 * 1024) return null;
  let archive: MRPArchive;
  try { archive = MRPArchive.parse(bytes); } catch { return null; }
  const { filename, fileLen } = archive.header;
  // Early packages also carry the client-visible ID in big endian at 192.
  const legacyId = bytes.length >= 196 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.length).getUint32(192) : 0;
  if (fileLen !== bytes.length || (archive.header.appid !== appid && legacyId !== appid) || !/^[a-zA-Z0-9_-]+\.mrp$/i.test(filename)) return null;
  return filename;
}

export function legacyDownloadResponse(bytes: Uint8Array, appid: number, sequence: number): Uint8Array | null {
  const filename = legacyPackageName(bytes, appid);
  if (!filename) return null;
  const parts = [command("code", installer()), command("getfile", text(filename))];
  for (let p = 0; p < bytes.length; p += 16384) parts.push(command("data", bytes.subarray(p, p + 16384)));
  parts.push(command("fileend", new Uint8Array()));
  const payload = concat(...parts), header = new Uint8Array(36), view = new DataView(header.buffer);
  for (let i = 1; i < 16; i += 2) header[i] = 255;
  view.setUint32(16, sequence); view.setUint32(24, 258); view.setUint32(28, payload.length);
  return concat(header, payload);
}
