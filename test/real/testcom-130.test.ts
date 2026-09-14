import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MythroadRuntime } from "../../src/mythroad/index.ts";
import { TESTCOM130, runTestCom130Forensics } from "../../src/real/testcom130.ts";

const REAL_APP = resolve(import.meta.dirname, "../fixtures/real/app.mrp");

describe("5-C.6 table[130] / asm_mr_TestCom forensics", () => {
  it("captures the real guest call site and production encodings", () => {
    const r = runTestCom130Forensics(new Uint8Array(readFileSync(REAL_APP)));

    expect(r.handlerPresent).toBe(true);
    expect(r.thrown).toBe("");
    expect(r.code0Slots.slice(0, 31)).toEqual([130, 14, 38, 33, 17, 40, 14, 44, 0, 45, 44, 0, 3, 3, 10, 3, 3, 10, 3, 3, 10, 3, 3, 1, 1, 0, 45, 44, 41, 9, 9]);
    expect(r.code0Slots.at(-1)).toBe(80);

    expect(r.cpu.pc).toBe(TESTCOM130.stubPc);
    expect(r.cpu.lr).toBe(0x01e9cf63);
    expect(r.cpu.sp).toBe(0x01e7ffb0);
    expect(r.cpu.r[0]).toBe(0);
    expect(r.cpu.r[1]).toBe(7);
    expect(r.cpu.r[2]).toBe(0x270f);
    expect(r.cpu.r[3]).toBe(TESTCOM130.stubPc);
    expect(r.cpu.r9).toBe(0x0024b704);
    expect(r.cpu.cpsr).toBe(0x40000010);
    expect(r.cpu.tBit).toBe(0);

    expect(r.p).toBe(0x00a4b728);
    expect(r.helper).toBe(TESTCOM130.helper);
    expect(r.erRw).toBe(0x0024b704);
    expect(r.r4).toBe(0x0024b708);
    expect(r.r5).toBe(0x270f);
    expect(r.erRwPlus1c).toBe(0);

    expect(r.funcEntry.pc).toBe(TESTCOM130.func);
    expect(r.funcEntry.lr).toBe(0x01ea5ed3);

    expect(r.encodings.r5Load).toBe(TESTCOM130.enc.r5Load);
    expect(r.encodings.r1Mov).toBe(TESTCOM130.enc.r1Mov);
    expect(r.encodings.r2Add).toBe(TESTCOM130.enc.r2Add);
    expect(r.encodings.r0Mov).toBe(TESTCOM130.enc.r0Mov);
    expect(r.encodings.blx).toBe(TESTCOM130.enc.blxR3);
    expect(r.encodings.cmp).toBe(TESTCOM130.enc.cmpR0R5);
    expect(r.encodings.bne).toBe(TESTCOM130.enc.bne);
    expect(r.encodings.sub2).toBe(TESTCOM130.enc.sub2);
    expect(r.encodings.str).toBe(TESTCOM130.enc.strR4_18);
    expect(r.encodings.literal).toBe(0x270f);
  });

  it("does not register table[38] or table[33] on a fresh runtime", () => {
    const rt = new MythroadRuntime();
    expect(rt.ext).toBeNull();
    expect(rt.trace).toBeNull();
  });
});
