import { describe, expect, it } from "vitest";
import { EXT_CODE_ADDR } from "../../src/abi/layout.ts";
import { ExtRuntime } from "../../src/abi/runtime.ts";
import { OP_ADD, OP_MOV, armBx, armDpImm } from "../helpers/asm.ts";
import { wordsToBytes } from "../helpers/ext-asm.ts";
import { thumbBx, thumbMovImm } from "../helpers/asm.ts";
import { halfsToBytes } from "../helpers/ext-asm.ts";

describe("4-H code cache / self-modifying code", () => {
  it("fixture: ARM load → cache → modify → invalidate → new code", () => {
    const rt = new ExtRuntime();
    const dest = EXT_CODE_ADDR;
    rt.pokeCode(dest, wordsToBytes([armDpImm(OP_MOV, 0, 0, 0, 1), armBx(14)]));
    expect(rt.runGuest(dest).r0).toBe(1);
    const id1 = rt.cache.lookupId(dest, 0);
    expect(id1).toBeGreaterThan(0);
    const gen1 = rt.cache.findRegion(dest)!.generation;
    rt.pokeCode(dest, wordsToBytes([armDpImm(OP_MOV, 0, 0, 0, 7), armBx(14)]));
    expect(rt.cache.lookupId(dest, 0)).toBe(0);
    expect(rt.cache.findRegion(dest)!.generation).toBeGreaterThan(gen1);
    expect(rt.runGuest(dest).r0).toBe(7);
    expect(rt.cache.lookupId(dest, 0)).toBeGreaterThan(0);
  });

  it("fixture: Thumb cache is independent of ARM at the same address", () => {
    const rt = new ExtRuntime();
    const dest = EXT_CODE_ADDR;
    rt.pokeCode(dest, wordsToBytes([armDpImm(OP_ADD, 0, 0, 0, 1), armBx(14)]));
    rt.runGuest(dest);
    const armId = rt.cache.lookupId(dest, 0);
    const armBlock = rt.cache.pool[armId];
    rt.pokeCode(dest, halfsToBytes([thumbMovImm(0, 9), thumbBx(14)]));
    expect(rt.runGuest(dest, { thumb: 1 }).r0).toBe(9);
    const thumbId = rt.cache.lookupId(dest, 1);
    expect(thumbId).toBeGreaterThan(0);
    expect(rt.cache.lookupId(dest, 0)).toBe(0);
    expect(rt.cache.pool[thumbId]).not.toBe(armBlock);
    expect(rt.cache.pool[thumbId]!.thumb).toBe(1);
  });

  it("fixture: module unload invalidates old blocks without a global wipe", () => {
    const rt = new ExtRuntime();
    const a = EXT_CODE_ADDR;
    const b = 0x0020_8000;
    rt.pokeCode(a, wordsToBytes([armDpImm(OP_MOV, 0, 0, 0, 1), armBx(14)]));
    rt.pokeCode(b, wordsToBytes([armDpImm(OP_MOV, 0, 0, 0, 2), armBx(14)]));
    rt.runGuest(a);
    rt.runGuest(b);
    expect(rt.cache.lookupId(a, 0)).toBeGreaterThan(0);
    expect(rt.cache.lookupId(b, 0)).toBeGreaterThan(0);
    const otherGen = rt.cache.findRegion(a)!.generation;
    rt.unload(b, 8);
    expect(rt.cache.lookupId(b, 0)).toBe(0);
    expect(rt.cache.lookupId(a, 0)).toBeGreaterThan(0);
    expect(rt.cache.findRegion(a)!.generation).toBe(otherGen);
  });
});

it('caches heap-relocated code and invalidates compiled blocks on ordinary writes', () => {
  const rt = new ExtRuntime(), dest = rt.alloc(8192) + 4096;
  // No pokeCode/addCodeRegion: this is the malloc/memcpy loader path.
  rt.mem.load(dest, wordsToBytes([armDpImm(OP_MOV, 0, 0, 0, 3), armBx(14)]));
  for(let i=0;i<40;i++) expect(rt.runGuest(dest).r0).toBe(3);
  const id = rt.cache.lookupId(dest, 0), block = rt.cache.pool[id]!;
  expect(block.compiled).not.toBeNull();
  expect(rt.cache.misses).toBe(1);
  rt.mem.write32(dest, armDpImm(OP_MOV, 0, 0, 0, 8));
  expect(block.valid).toBe(false);
  expect(rt.runGuest(dest).r0).toBe(8);
  expect(rt.cache.misses).toBe(2);
});
