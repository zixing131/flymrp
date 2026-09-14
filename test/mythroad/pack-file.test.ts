import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXT_PLATFORM_MEM_ADDR, EXT_PLATFORM_MEM_SIZE, EXT_STOP_ADDR, tableSlotAddr } from "../../src/abi/layout.ts";
import { ExtRuntime } from "../../src/abi/runtime.ts";
import { ExtStopKind } from "../../src/abi/fault.ts";
import { UnknownAbiError } from "../../src/err/errors.ts";
import { MemoryFault } from "../../src/hot/memory.ts";
import { buildMrp } from "../../src/mrp/index.ts";
import {
  CurrentPackFileBackend,
  MR_FAILED,
  MR_FILE_RDONLY,
  MR_FILE_RDWR,
  MR_FILE_WRONLY,
  MR_SEEK_CUR,
  MR_SEEK_END,
  MR_SEEK_SET,
  MR_SUCCESS,
  MrTableBridge,
  MythroadRuntime,
  MythroadVfs,
} from "../../src/mythroad/index.ts";

const REAL_APP = resolve(import.meta.dirname, "../fixtures/real/app.mrp");
const PACK = "gssjxz.mrp";
const SMALL = new Uint8Array([0x10, 0x20, 0x30, 0x40]);

function writeCString(ext: ExtRuntime, addr: number, s: string): void {
  for (let i = 0; i < s.length; i++) ext.mem.write8((addr + i) >>> 0, s.charCodeAt(i));
  ext.mem.write8((addr + s.length) >>> 0, 0);
}

function guestBytes(ext: ExtRuntime, addr: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(ext.mem.read8((addr + i) >>> 0));
  return out;
}

function wirePack(bytes: Uint8Array = SMALL, name = PACK) {
  const ext = new ExtRuntime();
  const pack = { name, bytes };
  const bridge = new MrTableBridge(ext, new MythroadVfs(), "pack", { getPack: () => pack });
  bridge.install();
  return { ext, bridge, pack };
}

function callSlot(ext: ExtRuntime, slot: number, r0: number, r1 = 0, r2 = 0) {
  return ext.runGuest(tableSlotAddr(slot), { r0, r1, r2, lr: EXT_STOP_ADDR });
}

function putName(ext: ExtRuntime, s: string): number {
  const p = ext.alloc(s.length + 1);
  writeCString(ext, p, s);
  return p;
}

describe("5-C.10K current-pack read-only file backend", () => {
  it('opens extracted files case-insensitively like handset FAT storage', () => {
    const { ext, bridge } = wirePack();
    bridge.appFs.mkdir('Game');
    bridge.appFs.replace('Game/mapValue.txt', new Uint8Array([1, 2, 3]));
    const handle = bridge.files.open('GAME\\mapvalue.TXT', MR_FILE_RDWR);
    expect(handle).toBeGreaterThan(0);
    const data = ext.alloc(4); ext.mem.write8(data, 9);
    expect(bridge.files.write(ext.mem, handle, data, 1)).toBe(1);
    expect([...bridge.appFs.file('game/MAPVALUE.txt')!]).toEqual([9, 2, 3]);
    expect(bridge.files.rename('GAME/mapvalue.txt', 'Game/Next.TXT')).toBe(0);
    expect(bridge.appFs.file('game/next.txt')?.[0]).toBe(9);
    expect(bridge.files.remove('GAME/NEXT.txt')).toBe(0);
    expect(bridge.appFs.file('game/next.txt')).toBeNull();
  });
  it('keeps container writes private, shares changes with open handles and resets the copy', () => {
    const { ext, bridge, pack } = wirePack(new Uint8Array([1, 2, 3, 4]));
    const reader = bridge.files.open(PACK, MR_FILE_RDONLY);
    const writer = bridge.files.open(PACK, MR_FILE_RDWR);
    const data = ext.alloc(8); ext.mem.load(data, new Uint8Array([5, 6, 7, 8]));
    expect(bridge.files.seek(writer, 2, MR_SEEK_SET)).toBe(MR_SUCCESS);
    expect(bridge.files.write(ext.mem, writer, data, 4)).toBe(4);
    expect([...pack.bytes]).toEqual([1, 2, 3, 4]);
    expect(bridge.files.getLen(PACK)).toBe(6);
    expect(bridge.files.read(ext.mem, reader, data, 8)).toBe(6);
    expect(guestBytes(ext, data, 6)).toEqual([1, 2, 5, 6, 7, 8]);
    expect(bridge.files.write(ext.mem, reader, data, 1)).toBe(MR_FAILED);
    const reopened = bridge.files.open(PACK, MR_FILE_RDONLY);
    expect(bridge.files.peek(reopened)!.bytes).toBe(bridge.files.peek(reader)!.bytes);
    bridge.files.reset();
    expect(bridge.files.getLen(PACK)).toBe(4);
    const fresh = bridge.files.open(PACK, MR_FILE_RDONLY);
    expect(bridge.files.peek(fresh)!.bytes).toBe(pack.bytes);
  });

  it("open packName+RDONLY returns handle 1 then 2; other names are EFS misses", () => {
    const { ext, bridge } = wirePack();
    const name = putName(ext, PACK);
    const other = putName(ext, "app.mrp");
    const empty = putName(ext, "");

    const a = callSlot(ext, 40, name, MR_FILE_RDONLY);
    expect(a.kind).toBe(ExtStopKind.Return);
    expect(a.r0).toBe(1);
    expect(bridge.files.peek(1)?.pos).toBe(0);
    expect(bridge.files.peek(1)?.bytes).toBe(SMALL);

    const b = callSlot(ext, 40, name, MR_FILE_RDONLY);
    expect(b.r0).toBe(2);

    expect(() => callSlot(ext, 40, name, 0)).toThrow(UnknownAbiError);
    expect(() => callSlot(ext, 40, name, 0x80000000)).toThrow(UnknownAbiError);
    expect(callSlot(ext, 40, other, MR_FILE_RDONLY).r0).toBe(0);
    expect(callSlot(ext, 40, empty, MR_FILE_RDONLY).r0).toBe(0);
    expect(MR_FILE_RDONLY).toBe(1);
    expect(MR_FILE_RDONLY).not.toBe(0);
  });

  it("read copies archive bytes, short-reads, EOF 0, requested 0, invalid = 0xffffffff", () => {
    const { ext } = wirePack();
    const name = putName(ext, PACK);
    expect(callSlot(ext, 40, name, MR_FILE_RDONLY).r0).toBe(1);
    const buf = ext.alloc(16);
    ext.mem.fill(buf, 0xaa, 16);

    const r2 = callSlot(ext, 44, 1, buf, 2);
    expect(r2.r0).toBe(2);
    expect(guestBytes(ext, buf, 2)).toEqual([0x10, 0x20]);

    const r8 = callSlot(ext, 44, 1, buf, 8);
    expect(r8.r0).toBe(2);
    expect(guestBytes(ext, buf, 2)).toEqual([0x30, 0x40]);

    expect(callSlot(ext, 44, 1, buf, 4).r0).toBe(0);
    expect(callSlot(ext, 44, 1, buf, 0).r0).toBe(0);

    const bad = callSlot(ext, 44, 99, buf, 4);
    expect(bad.kind).toBe(ExtStopKind.Return);
    expect(bad.r0).toBe(0xffffffff);
  });

  it("seek SET/CUR/END; beyond EOF allowed; negative pos fails without moving cursor", () => {
    const { ext, bridge } = wirePack();
    const name = putName(ext, PACK);
    expect(callSlot(ext, 40, name, MR_FILE_RDONLY).r0).toBe(1);
    const buf = ext.alloc(8);

    expect(callSlot(ext, 45, 1, 0, MR_SEEK_SET).r0).toBe(0);
    expect(bridge.files.peek(1)?.pos).toBe(0);

    expect(callSlot(ext, 45, 1, 2, MR_SEEK_CUR).r0).toBe(0);
    expect(bridge.files.peek(1)?.pos).toBe(2);
    expect(callSlot(ext, 44, 1, buf, 1).r0).toBe(1);
    expect(ext.mem.read8(buf)).toBe(0x30);

    expect(callSlot(ext, 45, 1, 0, MR_SEEK_END).r0).toBe(0);
    expect(bridge.files.peek(1)?.pos).toBe(4);

    expect(callSlot(ext, 45, 1, 8, MR_SEEK_END).r0).toBe(0);
    expect(bridge.files.peek(1)?.pos).toBe(12);
    expect(callSlot(ext, 44, 1, buf, 4).r0).toBe(0);

    expect(callSlot(ext, 45, 1, -20, MR_SEEK_SET).r0).toBe(0xffffffff);
    expect(bridge.files.peek(1)?.pos).toBe(12);

    expect(callSlot(ext, 45, 1, 99, 3).r0).toBe(0xffffffff);
    expect(bridge.files.peek(1)?.pos).toBe(12);

    const bad = callSlot(ext, 45, 7, 0, MR_SEEK_SET);
    expect(bad.r0).toBe(0xffffffff);
  });

  it("close invalidates; second close / read / seek are 0xffffffff", () => {
    const { ext } = wirePack();
    const name = putName(ext, PACK);
    expect(callSlot(ext, 40, name, MR_FILE_RDONLY).r0).toBe(1);
    expect(callSlot(ext, 41, 1).r0).toBe(0);
    expect(callSlot(ext, 41, 1).r0).toBe(0xffffffff);
    const buf = ext.alloc(4);
    expect(callSlot(ext, 44, 1, buf, 2).r0).toBe(0xffffffff);
    expect(callSlot(ext, 45, 1, 0, MR_SEEK_SET).r0).toBe(0xffffffff);
  });

  it("unmapped read dest is MemoryFault, not converted to -1", () => {
    const { ext, bridge } = wirePack();
    const name = putName(ext, PACK);
    expect(callSlot(ext, 40, name, MR_FILE_RDONLY).r0).toBe(1);
    expect(() => bridge.files.read(ext.mem, 1, EXT_PLATFORM_MEM_ADDR + EXT_PLATFORM_MEM_SIZE, 2)).toThrow(MemoryFault);
    expect(bridge.files.peek(1)?.pos).toBe(0);
    const out = callSlot(ext, 44, 1, EXT_PLATFORM_MEM_ADDR + EXT_PLATFORM_MEM_SIZE, 2);
    expect(out.kind).toBe(ExtStopKind.Unmapped);
    expect(out.kind).not.toBe(ExtStopKind.Return);
  });

  it("handles start at 1 per backend; loadMrp resets old handles", () => {
    const aBytes = buildMrp([{ name: "x.bin", data: new Uint8Array([1, 2]) }], { filename: "a.mrp" });
    const bBytes = buildMrp([{ name: "x.bin", data: new Uint8Array([3, 4]) }], { filename: "b.mrp" });
    const rt = new MythroadRuntime();
    rt.loadMrp(aBytes);
    const ext = new ExtRuntime();
    rt.bindExt(ext);
    const aName = putName(ext, "a.mrp");
    expect(callSlot(ext, 40, aName, MR_FILE_RDONLY).r0).toBe(1);
    expect(rt.mrTable!.files.peek(1)!.bytes).toBe(rt.mrp!.data);
    expect(rt.mrp!.data).toBe(aBytes);

    rt.loadMrp(bBytes);
    expect(rt.mrp!.data).toBe(bBytes);
    expect(callSlot(ext, 44, 1, ext.alloc(2), 2).r0).toBe(0xffffffff);

    const bName = putName(ext, "b.mrp");
    expect(callSlot(ext, 40, bName, MR_FILE_RDONLY).r0).toBe(1);
    expect(rt.mrTable!.files.peek(1)!.bytes).toBe(bBytes);
    expect(callSlot(ext, 40, aName, MR_FILE_RDONLY).r0).toBe(0);

    const rt2 = new MythroadRuntime();
    rt2.loadMrp(aBytes);
    const ext2 = new ExtRuntime();
    rt2.bindExt(ext2);
    expect(callSlot(ext2, 40, putName(ext2, "a.mrp"), MR_FILE_RDONLY).r0).toBe(1);
  });

  it("real fixture open aliases original 382778-byte MRP stream, not a member", () => {
    const bytes = new Uint8Array(readFileSync(REAL_APP));
    const rt = new MythroadRuntime();
    rt.loadMrp(bytes);
    expect(rt.packName).toBe(PACK);
    expect(rt.mrp!.data).toBe(bytes);
    expect(rt.mrp!.data.length).toBe(382778);
    const ext = new ExtRuntime();
    rt.bindExt(ext);
    expect(callSlot(ext, 40, putName(ext, PACK), MR_FILE_RDONLY).r0).toBe(1);
    expect(rt.mrTable!.files.peek(1)!.bytes).toBe(bytes);
    const buf = ext.alloc(16);
    expect(callSlot(ext, 44, 1, buf, 16).r0).toBe(16);
    expect(guestBytes(ext, buf, 16)).toEqual([...bytes.subarray(0, 16)]);
    expect(rt.vfs.exists(PACK)).toBe(true);
  });

  it("reports mr_ferrno as MR_FAILED like rxgj dsm.c", () => {
    const { ext } = wirePack();
    expect(callSlot(ext, 39, 0).r0 | 0).toBe(MR_FAILED);
  });

  it("backend host values stay signed; IDs are monotonic and not reused", () => {
    const files = new CurrentPackFileBackend(() => ({ name: PACK, bytes: SMALL }));
    expect(files.open(PACK, MR_FILE_RDONLY)).toBe(1);
    expect(files.open(PACK, MR_FILE_RDONLY)).toBe(2);
    expect(files.close(1)).toBe(MR_SUCCESS);
    expect(files.open(PACK, MR_FILE_RDONLY)).toBe(3);
    const ext = new ExtRuntime();
    expect(files.read(ext.mem, 99, ext.alloc(1), 1)).toBe(MR_FAILED);
  });
});
