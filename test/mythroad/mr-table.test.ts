import { describe, expect, it } from "vitest";
import { EXT_CODE_ADDR, EXT_MEM_SIZE, EXT_PLATFORM_MEM_ADDR, EXT_PLATFORM_MEM_SIZE, EXT_STACK_ADDR, EXT_STOP_ADDR, tableSlotAddr } from "../../src/abi/layout.ts";
import { ExtRuntime } from "../../src/abi/runtime.ts";
import { ExtStopKind } from "../../src/abi/fault.ts";
import { MemoryFault } from "../../src/hot/memory.ts";
import { buildMrp } from "../../src/mrp/index.ts";
import { MRPArchive } from "../../src/mrp/archive.ts";
import { MrTableBridge } from "../../src/mythroad/mr-table.ts";
import { MythroadVfs } from "../../src/mythroad/vfs.ts";
import { OP_MOV, armBlx, armBx, armDpReg, armLdrImm } from "../helpers/asm.ts";
import { buildArmTableCaller, wordsToBytes } from "../helpers/ext-asm.ts";

function wire(ext: ExtRuntime, vfs = new MythroadVfs()): MrTableBridge {
  const b = new MrTableBridge(ext, vfs, "test");
  b.install();
  return b;
}

describe("5-C.2 table[0] mr_malloc", () => {
  it("returns an 8-aligned guest pointer, not MR_IGNORE", () => {
    const ext = new ExtRuntime();
    const b = wire(ext);
    const dest = EXT_CODE_ADDR;
    ext.pokeCode(dest, buildArmTableCaller({ dest, slot: 0, r0: 16, r1: 0 }));
    const out = ext.runGuest(dest, { thumb: 0, lr: EXT_STOP_ADDR });
    expect(out.kind).toBe(ExtStopKind.Return);
    expect(out.r0).not.toBe(1);
    expect(out.r0).toBeGreaterThan(0);
    expect(out.r0 & 7).toBe(0);
    expect(b.allocs[0]).toMatchObject({ size: 16, alignedSize: 16, owner: "test", guestAddr: out.r0 });
  });

  it("guest CPU can store and load the allocation", () => {
    const ext = new ExtRuntime();
    wire(ext);
    const dest = EXT_CODE_ADDR;
    ext.pokeCode(dest, buildArmTableCaller({ dest, slot: 0, r0: 16, r1: 0 }));
    const addr = ext.runGuest(dest, { lr: EXT_STOP_ADDR }).r0 >>> 0;
    const stub = dest + 0x40;
    ext.pokeCode(stub, wordsToBytes([armLdrImm(0, 1, 0, 0), armBx(14)]));
    const st = ext.runGuest(stub, { r0: 0xaabbccdd, r1: addr, lr: EXT_STOP_ADDR });
    expect(st.kind).toBe(ExtStopKind.Return);
    expect(ext.mem.read32(addr)).toBe(0xaabbccdd);
    ext.pokeCode(stub, wordsToBytes([armLdrImm(0, 1, 0, 1), armBx(14)]));
    const ld = ext.runGuest(stub, { r1: addr, lr: EXT_STOP_ADDR });
    expect(ld.r0).toBe(0xaabbccdd);
  });

  it("aligns odd sizes to 8 and rejects empty / oversize", () => {
    const ext = new ExtRuntime();
    const b = wire(ext);
    const a = b.malloc(1);
    expect(a).toBeGreaterThan(0);
    expect(a & 7).toBe(0);
    expect(b.allocs.at(-1)!.alignedSize).toBe(8);
    expect(b.malloc(0)).toBe(0);
    expect(b.malloc((EXT_STACK_ADDR - (ext.heapTop >>> 0)) + 64)).toBe(0);
  });
});

describe("5-C.2 table[125] _mr_readFile", () => {
  function packed(name: string, data: Uint8Array): { ext: ExtRuntime; b: MrTableBridge; vfs: MythroadVfs } {
    const vfs = new MythroadVfs();
    vfs.attach(MRPArchive.parse(buildMrp([{ name, data }])));
    const ext = new ExtRuntime();
    const b = wire(ext, vfs);
    return { ext, b, vfs };
  }

  function putName(ext: ExtRuntime, s: string): number {
    const p = ext.alloc(s.length + 1);
    const raw = new Uint8Array(s.length + 1);
    for (let i = 0; i < s.length; i++) raw[i] = s.charCodeAt(i);
    ext.mem.load(p, raw);
    return p;
  }

  it("copies an existing resource into guest memory and writes length", () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const { ext, b } = packed("res.bin", payload);
    const name = putName(ext, "res.bin");
    const lenp = ext.alloc(4);
    ext.mem.write32(lenp, 0);
    const ptr = b.readFile(ext.mem, name, lenp, 0);
    expect(ptr).toBeGreaterThan(1);
    expect(ptr & 7).toBe(0);
    expect(ext.mem.read32(lenp)).toBe(5);
    expect([...ext.mem.slice(ptr, 5)]).toEqual([1, 2, 3, 4, 5]);
    expect(b.reads.at(-1)).toMatchObject({ name: "res.bin", lookfor: 0, guestAddr: ptr, length: 5 });
  });

  it("missing resource returns NULL", () => {
    const { ext, b } = packed("res.bin", new Uint8Array([1]));
    const name = putName(ext, "nope.bin");
    const lenp = ext.alloc(4);
    ext.mem.write32(lenp, 99);
    expect(b.readFile(ext.mem, name, lenp, 0)).toBe(0);
    expect(ext.mem.read32(lenp)).toBe(99);
    expect(b.reads.at(-1)).toMatchObject({ name: "nope.bin", guestAddr: 0, length: 0 });
  });

  it("lookfor=1 is exists only", () => {
    const { ext, b } = packed("res.bin", new Uint8Array([9]));
    expect(b.readFile(ext.mem, putName(ext, "res.bin"), 0, 1)).toBe(1);
    expect(b.readFile(ext.mem, putName(ext, "missing"), 0, 1)).toBe(0);
  });
});

function runMemset(ext: ExtRuntime, dest: number, value: number, length: number) {
  const stub = EXT_CODE_ADDR + 0x80;
  ext.pokeCode(
    stub,
    wordsToBytes([
      armDpReg(OP_MOV, 0, 0, 6, 14),
      armLdrImm(4, 15, 4),
      armBlx(4),
      armBx(6),
      tableSlotAddr(14),
    ]),
  );
  return ext.runGuest(stub, { r0: dest, r1: value, r2: length, lr: EXT_STOP_ADDR });
}

describe("5-C.5 table[14] memset", () => {
  it("fills a guest buffer and returns dest (memset2)", () => {
    const ext = new ExtRuntime();
    const b = wire(ext);
    const buf = b.malloc(16);
    ext.mem.fill(buf, 0xaa, 16);
    const out = runMemset(ext, buf, 0, 8);
    expect(out.kind).toBe(ExtStopKind.Return);
    expect(out.r0).toBe(buf);
    expect([...ext.mem.slice(buf, 16)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa]);
  });

  it("length=0 is a no-op and still returns dest", () => {
    const ext = new ExtRuntime();
    const b = wire(ext);
    const buf = b.malloc(8);
    ext.mem.fill(buf, 0x11, 8);
    const out = runMemset(ext, buf, 0xff, 0);
    expect(out.kind).toBe(ExtStopKind.Return);
    expect(out.r0).toBe(buf);
    expect([...ext.mem.slice(buf, 8)]).toEqual([0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11]);
  });

  it("uses the low 8 bits of a nonzero fill value", () => {
    const ext = new ExtRuntime();
    const b = wire(ext);
    const buf = b.malloc(4);
    expect(b.memset(ext.mem, buf, 0x15a, 4)).toBe(buf);
    expect([...ext.mem.slice(buf, 4)]).toEqual([0x5a, 0x5a, 0x5a, 0x5a]);
  });

  it("can fill up to the last mapped byte", () => {
    const ext = new ExtRuntime();
    wire(ext);
    const last = (0x0001_0000 + EXT_MEM_SIZE - 1) >>> 0;
    const start = (last - 3) >>> 0;
    const out = runMemset(ext, start, 0xab, 4);
    expect(out.kind).toBe(ExtStopKind.Return);
    expect(out.r0).toBe(start);
    expect([...ext.mem.slice(start, 4)]).toEqual([0xab, 0xab, 0xab, 0xab]);
  });

  it("unmapped dest is a MemoryFault / Unmapped, not a guessed success", () => {
    const ext = new ExtRuntime();
    const b = wire(ext);
    expect(() => b.memset(ext.mem, EXT_PLATFORM_MEM_ADDR + EXT_PLATFORM_MEM_SIZE, 0, 4)).toThrow(MemoryFault);
    const out = runMemset(ext, EXT_PLATFORM_MEM_ADDR + EXT_PLATFORM_MEM_SIZE, 0, 8);
    expect(out.kind).toBe(ExtStopKind.Unmapped);
  });

  it("length that walks off the map uses the existing fault", () => {
    const ext = new ExtRuntime();
    wire(ext);
    const last = (0x0001_0000 + EXT_MEM_SIZE - 1) >>> 0;
    const out = runMemset(ext, last, 0xcc, 2);
    expect(out.kind).toBe(ExtStopKind.Unmapped);
    expect(ext.mem.read8(last)).toBe(0xcc);
  });
});
