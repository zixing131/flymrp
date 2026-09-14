import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MythroadRuntime } from "../../src/mythroad/index.ts";
import {
  FILE_ABI_SLOTS,
  MR_OPEN_MODES,
  OPEN40,
  runOpen40Forensics,
} from "../../src/real/open40.ts";

const REAL_APP = resolve(import.meta.dirname, "../fixtures/real/app.mrp");

describe("5-C.10H table[40] / mr_open forensics", () => {
  it("LIVE filename is table[100] pack_filename; res_lang0.rc stays in R6; slot 40 is implemented", () => {
    const r = runOpen40Forensics(new Uint8Array(readFileSync(REAL_APP)));

    expect(r.handler130).toBe(true);
    expect(r.handler38).toBe(true);
    expect(r.handler33).toBe(true);
    expect(r.handler17).toBe(true);
    expect(r.handler40).toBe(true);
    expect(r.productionThrown).toBe("");
    expect(r.probeThrown).toBe("");
    expect(r.owner).toBe("gssjxz.mrp");
    expect(r.decision).toBe("B");

    expect(r.cpu.pc).toBe(OPEN40.stub);
    expect(r.cpu.lr).toBe(OPEN40.wrapPop | 1);
    expect(r.cpu.sp).toBe(0x01e7ff00);
    expect(r.cpu.r[0]).toBe(OPEN40.filename);
    expect(r.cpu.r[1]).toBe(OPEN40.mode);
    expect(r.cpu.r[2]).toBe(OPEN40.stub);
    expect(r.cpu.r[5]).toBe(OPEN40.filename);
    expect(r.cpu.r[6]).toBe(OPEN40.sprintfBuf);
    expect(r.cpu.r9).toBe(0x0024b704);
    expect(r.cpu.cpsr).toBe(0x10);
    expect(r.cpu.tBit).toBe(0);
    expect(r.cpu.insnCount).toBe(221);
    expect(r.p).toBe(0x0034b728);
    expect(r.erRw).toBe(0x0024b704);

    expect(r.r0Text).toBe(r.owner);
    expect(r.r0Text).not.toBe("");
    expect(r.r0Text).not.toBe(OPEN40.sprintfText);
    expect(r.r6Text).toBe(OPEN40.sprintfText);
    expect(r.packPtr).toBe(OPEN40.filename);
    expect(r.packPtr).toBe(r.heapExpected);
    expect(r.packAllocSize).toBe(OPEN40.flymrpPackBytes);
    expect(r.packDataSlotIndex).toBe(11);
    expect(r.packBytes).toHaveLength(128);
    expect(r.packBytes[r.r0Text.length]).toBe(0);
    expect(r.packBytes.slice(0, r.r0Text.length)).toEqual([...r.r0Text].map((c) => c.charCodeAt(0)));
    expect(r.packBytes.slice(r.r0Text.length + 1).every((b) => b === 0)).toBe(true);
    expect(r.erRwPackWord).toBe(0);
    expect(r.writes).toEqual([]);
    expect(r.filenameFromMalloc).toBe(false);
    expect(r.mallocs.map((a) => a.guestAddr)).not.toContain(OPEN40.filename);

    expect(r.archiveHasResLang).toBe(true);
    expect(r.vfsExistsResLang).toBe(true);
    expect(r.vfsExistsEmpty).toBe(false);
    expect(r.table125AfterSprintf).toBe(0);

    const lookfor = r.helperSnaps.find((s) => s.pc === OPEN40.consumerLookfor);
    expect(lookfor?.r2).toBe(0x00010000);
    expect(lookfor?.r1).toBe(0x00010180);
    const openCall = r.helperSnaps.find((s) => s.pc === OPEN40.consumerOpen);
    expect(openCall?.r5).toBe(OPEN40.filename);
    expect(openCall?.r6).toBe(OPEN40.sprintfBuf);

    expect(r.encodings.wrapHw).toEqual([
      OPEN40.enc.wrapLdrPc,
      OPEN40.enc.wrapPush,
      OPEN40.enc.wrapAddPc,
      OPEN40.enc.wrapLdr38,
      OPEN40.enc.wrapAdd80,
      OPEN40.enc.wrapLdr20,
      OPEN40.enc.wrapBlx,
      OPEN40.enc.wrapPop,
    ]);
    expect(r.encodings.afterHw.slice(0, 2)).toEqual([OPEN40.enc.addsR5R0, OPEN40.enc.bneFail]);
    expect(r.encodings.consumerBlTarget).toBe(OPEN40.wrap);
    expect(r.encodings.stubLoadSites).toEqual([0x01ea89e0]);
    expect(r.wrapXrefs).toHaveLength(31);
    expect(r.callsites.filter((s) => s.live)).toHaveLength(1);
    expect(r.callsites.find((s) => s.live)?.modeImm).toBe(1);
    expect(r.callsites.some((s) => s.filenameKind === "pic" && s.filename.includes(".sav"))).toBe(true);

    expect(MR_OPEN_MODES.MR_FILE_RDONLY).toBe(1);
    expect(FILE_ABI_SLOTS.find((s) => s.slot === 42)?.ident).toContain("mr_info");
    expect(FILE_ABI_SLOTS.find((s) => s.slot === 44)?.ident).toContain("mr_read");
  });

  it("does not register table[40] on a fresh runtime", () => {
    const rt = new MythroadRuntime();
    expect(rt.ext).toBeNull();
  });
});
