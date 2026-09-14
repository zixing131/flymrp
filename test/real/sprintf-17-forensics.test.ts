import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MythroadRuntime } from "../../src/mythroad/index.ts";
import { SPRINTF17, runSprintf17Forensics } from "../../src/real/sprintf17.ts";

const REAL_APP = resolve(import.meta.dirname, "../fixtures/real/app.mrp");

describe("5-C.10F table[17] / sprintf_ forensics", () => {
  it("LIVE %d is R2; handler[17] present; production continues past 17 through file ABI to table[1]", () => {
    const r = runSprintf17Forensics(new Uint8Array(readFileSync(REAL_APP)));

    expect(r.handler130).toBe(true);
    expect(r.handler38).toBe(true);
    expect(r.handler33).toBe(true);
    expect(r.handler17).toBe(true);
    expect(r.productionThrown).toBe("");
    expect(r.probeThrown).toBe("");
    expect(r.owner).toBe("gssjxz.mrp");

    expect(r.cpu.pc).toBe(SPRINTF17.stub);
    expect(r.cpu.lr).toBe(SPRINTF17.ret | 1);
    expect(r.cpu.sp).toBe(0x01e7ff68);
    expect(r.cpu.r[0]).toBe(SPRINTF17.buffer);
    expect(r.cpu.r[1]).toBe(SPRINTF17.format);
    expect(r.cpu.r[2]).toBe(0);
    expect(r.cpu.r[3]).toBe(SPRINTF17.stub);
    expect(r.cpu.r[4]).toBe(0);
    expect(r.cpu.r[5]).toBe(SPRINTF17.buffer);
    expect(r.cpu.r9).toBe(0x0024b704);
    expect(r.cpu.cpsr).toBe(0x10);
    expect(r.cpu.tBit).toBe(0);
    expect(r.cpu.insnCount).toBe(183);
    expect(r.p).toBe(0x00a4b728);
    expect(r.erRw).toBe(0x0024b704);

    expect(r.format).toBe(SPRINTF17.formatText);
    expect(r.formatAscii).toBe(true);
    expect(r.formatBytes.slice(0, 14)).toEqual(
      [...SPRINTF17.formatText].map((ch) => ch.charCodeAt(0)).concat([0]).slice(0, 14),
    );
    expect(r.langVal).toBe(0);
    expect(r.got17).toBe(SPRINTF17.stub);
    expect(r.got26).toBe(SPRINTF17.printfStub);
    expect(r.encodings.litGot).toBe(SPRINTF17.gotOff);
    expect(r.encodings.parentBlTarget).toBe(SPRINTF17.wrap);
    expect(r.encodings.callerBlTarget).toBe(SPRINTF17.parent);
    expect(r.encodings.consumerBlTarget).toBe(SPRINTF17.consumer);

    expect(r.encodings.wrapHw).toEqual([
      SPRINTF17.enc.push,
      SPRINTF17.enc.movR4,
      SPRINTF17.enc.movs0,
      SPRINTF17.enc.subSp,
      SPRINTF17.enc.ldrR1,
      SPRINTF17.enc.strSp8,
      SPRINTF17.enc.strSp4,
      SPRINTF17.enc.movR2R4,
      SPRINTF17.enc.addR1Pc,
      SPRINTF17.enc.ldrR3,
      SPRINTF17.enc.addR5Sp,
      SPRINTF17.enc.addR3R9,
      SPRINTF17.enc.ldrR3R3,
      SPRINTF17.enc.movR0R5,
      SPRINTF17.enc.blxR3,
    ]);
    expect(r.encodings.afterHw).toEqual([
      SPRINTF17.enc.movsR2,
      SPRINTF17.enc.strSp0,
      SPRINTF17.enc.movR1R5,
      SPRINTF17.enc.movs0,
    ]);

    const afterLenClobber = r.encodings.after.find((l) => l.pc === SPRINTF17.ret + 6);
    expect(afterLenClobber?.text).toContain("imm=0x0");

    expect(r.cpu.sp + 0x0c).toBe(SPRINTF17.buffer);
    expect(r.writableToStackTop).toBe(0x8c);
    expect(r.bufferRegion?.base).toBe(0x00010000);

    expect(r.wrapXrefs.map((x) => x.from)).toEqual([SPRINTF17.parentBl]);
    expect(r.callsites).toHaveLength(12);
    expect(r.callsites.filter((s) => s.live)).toHaveLength(1);
    expect(r.callsites.find((s) => s.live)?.format).toBe("res_lang%d.rc");
    expect(r.callsites.filter((s) => s.format === "%s/chn%d")).toHaveLength(2);
    expect(r.callsites.every((s) => !s.stackVarargs)).toBe(true);
    expect(r.liveSpecs).toEqual(["%d"]);
    expect(r.staticSpecs.sort()).toEqual(["%d", "%s"]);
    expect(r.specCensus).toEqual({ "%d": 12, "%s": 2 });

    const live = r.callsites.find((s) => s.live);
    expect(live?.varargCount).toBe(1);
    expect(live?.blx).toBe(SPRINTF17.blx);
  });

  it("does not register table[17] on a fresh runtime", () => {
    const rt = new MythroadRuntime();
    expect(rt.ext).toBeNull();
  });
});
