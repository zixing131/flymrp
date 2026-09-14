import { describe, expect, it } from "vitest";
import { EXT_CODE_ADDR, EXT_STOP_ADDR, tableSlotAddr } from "../../src/abi/layout.ts";
import { ExtRuntime } from "../../src/abi/runtime.ts";
import { ExtStopKind } from "../../src/abi/fault.ts";
import { MR_SUCCESS } from "../../src/mythroad/constants.ts";
import { MrTableBridge } from "../../src/mythroad/mr-table.ts";
import { MythroadVfs } from "../../src/mythroad/vfs.ts";
import { OP_MOV, armBx, armDpReg, armLdrImm, armBlx } from "../helpers/asm.ts";
import { wordsToBytes } from "../helpers/ext-asm.ts";

function wire(ext = new ExtRuntime()): { ext: ExtRuntime; b: MrTableBridge } {
  const b = new MrTableBridge(ext, new MythroadVfs(), "test");
  b.install();
  return { ext, b };
}

function runSlot(ext: ExtRuntime, slot: number, r0: number, r1: number) {
  const stub = EXT_CODE_ADDR + 0x80;
  ext.pokeCode(
    stub,
    wordsToBytes([
      armDpReg(OP_MOV, 0, 0, 6, 14),
      armLdrImm(4, 15, 4),
      armBlx(4),
      armBx(6),
      tableSlotAddr(slot),
    ]),
  );
  return ext.runGuest(stub, { r0, r1, lr: EXT_STOP_ADDR });
}

describe("5-C.10O table[1] first-fit mr_free", () => {
  it("exact valid free returns 0 and retires the live record", () => {
    const { ext, b } = wire();
    const p = b.malloc(132);
    ext.mem.write32(p, 128);
    ext.mem.load((p + 4) >>> 0, [0xaa, 0xbb]);
    expect(b.liveAllocs()).toHaveLength(1);
    expect(b.free(p, 132)).toBe(MR_SUCCESS);
    expect(b.liveAllocs()).toHaveLength(0);
    expect(b.allocs[0]).toMatchObject({ guestAddr: p, size: 132, alignedSize: 136, live: false });
    expect(ext.mem.read32(p)).toBe(8 * 1024 * 1024);
    expect(ext.mem.read32(p + 4)).toBe(8 * 1024 * 1024);
  });

  it("NULL / unknown pointer / already-free return MR_SUCCESS without touching others", () => {
    const { b } = wire();
    const keep = b.malloc(16);
    expect(b.free(0, 16)).toBe(MR_SUCCESS);
    expect(b.free(0, 0)).toBe(MR_SUCCESS);
    expect(b.free(0x00206de0, 132)).toBe(MR_SUCCESS);
    expect(b.liveAllocs().map((a) => a.guestAddr)).toEqual([keep]);
    expect(b.free(keep, 16)).toBe(MR_SUCCESS);
    expect(b.free(keep, 16)).toBe(MR_SUCCESS);
    expect(b.liveAllocs()).toHaveLength(0);
    expect(b.allocs.filter((a) => a.guestAddr === keep)).toHaveLength(1);
  });

  it("uses the owned allocation size even when the guest length hint differs", () => {
    const { b } = wire();
    const p = b.malloc(56);
    const keep = b.malloc(16);
    expect(b.free(p, 24)).toBe(MR_SUCCESS);
    expect(b.liveAllocs().map(a => a.guestAddr)).toEqual([keep]);
    expect(b.free(p, 56)).toBe(MR_SUCCESS);
    expect(b.liveAllocs().map(a => a.guestAddr)).toEqual([keep]);
  });

  it("free A does not affect B; first-fit reuses A", () => {
    const { b } = wire();
    const a = b.malloc(132);
    const keep = b.malloc(64);
    expect(b.free(a, 132)).toBe(MR_SUCCESS);
    expect(b.liveAllocs().map((x) => x.guestAddr)).toEqual([keep]);
    const again = b.malloc(132);
    expect(again).toBe(a);
    expect(again).toBeLessThan(keep);
    expect(b.liveAllocs().map((x) => x.guestAddr)).toEqual([keep, again]);
  });

  it("guest table[1] writes R0=MR_SUCCESS and reuses the block", () => {
    const { ext, b } = wire();
    const p = b.malloc(8);
    const out = runSlot(ext, 1, p, 8);
    expect(out.kind).toBe(ExtStopKind.Return);
    expect(out.r0).toBe(MR_SUCCESS);
    expect(b.allocs[0]!.live).toBe(false);
    const second = runSlot(ext, 0, 8, 0);
    expect(second.kind).toBe(ExtStopKind.Return);
    expect(second.r0).toBe(p);
  });
});
