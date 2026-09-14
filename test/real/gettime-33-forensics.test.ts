import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MythroadRuntime } from "../../src/mythroad/index.ts";
import { GETTIME33, runGetTime33Forensics } from "../../src/real/gettime33.ts";

const REAL_APP = resolve(import.meta.dirname, "../fixtures/real/app.mrp");

describe("5-C.10D table[33] / asm_mr_getTime forensics", () => {
  it("LIVE stub is zero-arg; handler[33] present; store helper target unchanged", () => {
    const r = runGetTime33Forensics(new Uint8Array(readFileSync(REAL_APP)));

    expect(r.handler130).toBe(true);
    expect(r.handler38).toBe(true);
    expect(r.handler33).toBe(true);
    expect(r.productionThrown).toBe("");
    expect(r.probeThrown).toBe("");
    expect(r.init2Reached).toBe(true);
    expect(r.owner).toBe("gssjxz.mrp");

    expect(r.cpu.pc).toBe(GETTIME33.stub);
    expect(r.cpu.lr).toBe(GETTIME33.wrapPop | 1);
    expect(r.cpu.sp).toBe(0x01e7ffa0);
    expect(r.cpu.r[0]).toBe(GETTIME33.stub);
    expect(r.cpu.r[1]).toBe(0);
    expect(r.cpu.r[2]).toBe(0);
    expect(r.cpu.r[3]).toBe(0);
    expect(r.cpu.r[6]).toBe(0x00a4b728);
    expect(r.cpu.r[7]).toBe(0x0024b704);
    expect(r.cpu.r9).toBe(0x0024b704);
    expect(r.cpu.cpsr).toBe(0x10);
    expect(r.cpu.tBit).toBe(0);
    expect(r.cpu.insnCount).toBe(145);
    expect(r.p).toBe(0x00a4b728);
    expect(r.erRw).toBe(0x0024b704);
    expect(r.helper).toBe(0x01ea5e9d);

    expect(r.encodings.wrapBlx).toBe(GETTIME33.enc.wrapBlx);
    expect(r.encodings.callerGetTimeTarget).toBe(GETTIME33.wrap);
    expect(r.encodings.callerStoreTarget).toBe(GETTIME33.storeFn);
    expect(r.encodings.storeHw).toEqual([
      GETTIME33.enc.storeLdrPc,
      GETTIME33.enc.storeAddR9,
      GETTIME33.enc.storeStr,
      GETTIME33.enc.storeBx,
    ]);
    expect(r.encodings.storeLiteral).toBe(GETTIME33.erOff);

    const afterStore = r.encodings.caller.find((l) => l.pc === GETTIME33.callerStoreBl + 4);
    expect(afterStore?.text).toContain("imm=0x55");

    expect(r.gotSequences).toEqual([0x01ea7cee, 0x01ea94e8, 0x01ea967c, 0x01ea96ae]);
    expect(r.wrapXrefs.filter((x) => x.to === GETTIME33.wrap).map((x) => x.from)).toEqual([
      0x01e8d18c, 0x01e8d404, 0x01e8d416, 0x01e8d430, 0x01ea6a92, 0x01ea7f76, 0x01ea806e,
    ]);
    expect(r.wrapXrefs.filter((x) => x.to === GETTIME33.wrapB).map((x) => x.from)).toEqual([0x01ea95d2]);
    expect(r.wrapXrefs.filter((x) => x.to === GETTIME33.wrapC).map((x) => x.from)).toEqual([
      0x01ea9622, 0x01ea974c,
    ]);
    expect(r.wrapXrefs.filter((x) => x.to === GETTIME33.wrapD).map((x) => x.from)).toEqual([
      0x01ea5f06, 0x01ea7a0c,
    ]);
    expect(r.storeXrefs.map((x) => x.from)).toEqual([GETTIME33.callerStoreBl]);
    expect(r.literals4358).toEqual([0x01ea8c24, 0x01ea92d0, 0x01eb07fe, 0x01eb0852]);

    const wrapBBlx = r.encodings.wrapB.find((l) => l.op !== 0 && l.text.includes("4780"));
    expect(wrapBBlx?.pc).toBe(0x01ea94ee);
    expect(r.encodings.wrapB.some((l) => l.pc === 0x01ea94f2 && l.text.includes("SUB"))).toBe(true);
    expect(r.encodings.wrapC.some((l) => l.pc === 0x01ea9684 && l.text.includes("ADD"))).toBe(true);
    expect(r.encodings.wrapC.some((l) => l.pc === 0x01ea968a && l.text.includes("STR"))).toBe(true);
    expect(r.encodings.wrapD.some((l) => l.pc === 0x01ea96c6 && l.text.includes("SUB"))).toBe(true);
  });

  it("does not register table[33] on a fresh runtime", () => {
    const rt = new MythroadRuntime();
    expect(rt.ext).toBeNull();
  });
});
