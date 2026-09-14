import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MythroadRuntime } from "../../src/mythroad/index.ts";
import { FILECHAIN } from "../../src/real/filechain.ts";
import {
  FREE1,
  firstFitReuseSameSize,
  flymrpBumpSecond,
  realLGmemSize,
  runFree1Forensics,
} from "../../src/real/free1.ts";
import { runProductionCode0Fault } from "../../src/real/code0chain.ts";

const REAL_APP = resolve(import.meta.dirname, "../fixtures/real/app.mrp");

describe("5-C.10N table[1] mr_free ownership forensics", () => {
  it("LIVE table[1] is mrc_free of TempName header; ABI snapshot still holds", () => {
    const bytes = new Uint8Array(readFileSync(REAL_APP));
    const r = runFree1Forensics(bytes);

    expect(r.productionThrown).toBe("");
    expect(r.probeThrown).toBe("");
    expect(r.owner).toBe("gssjxz.mrp");
    expect(r.handler0).toBe(true);
    expect(r.handler1).toBe(true);
    expect(r.handler3).toBe(true);
    expect(r.handler10).toBe(true);
    expect(r.decision).toBe("FORENSICS_ONLY");

    expect(r.cpu.pc).toBe(FREE1.stub);
    expect(r.cpu.lr).toBe(FREE1.liveLr);
    expect(r.cpu.sp).toBe(FREE1.liveSp);
    expect(r.cpu.insnCount).toBe(FREE1.liveInsn);
    expect(r.cpu.r[0]).toBe(FREE1.header);
    expect(r.cpu.r[1]).toBe(FREE1.table1Len);
    expect(r.cpu.r[7]).toBe(FREE1.payload);
    expect(r.cpu.stack4).toBe(FREE1.liveCallerLr);
    expect(r.wrapCaller).toBe(FREE1.liveCallerLr);

    expect(r.tempNameAlloc).toMatchObject({
      request: FREE1.table0Request,
      ret: FREE1.header,
      headerAfterHandler: 8 * 1024 * 1024,
    });
    expect(r.indexAlloc).toMatchObject({
      request: FREE1.indexTable0,
      ret: FREE1.indexHeader,
    });
    expect(r.headerAfterTable0).toBe(8 * 1024 * 1024);
    expect(r.headerAtTable1).toBe(FREE1.headerWord);
    expect(r.headerWriter).toBe("guest mrc_malloc wrap");
    expect(String.fromCharCode(...r.payloadBytes.slice(0, 12))).toBe("res_lang0.rc");

    expect(r.registryMatch).toMatchObject({
      guestAddr: FREE1.header,
      size: FREE1.table0Request,
      alignedSize: FREE1.alignedSize,
      matchesR0: true,
      matchesLen: true,
    });
    expect(r.returnConsumer).toBe("none / not executed");

    expect(r.mallocWrap[0]?.pc).toBe(FREE1.mallocWrap);
    expect(r.freeWrap[0]?.pc).toBe(FREE1.freeWrap);
    expect(r.freeWrap.some((l) => l.pc === FREE1.freeWrap && (l.text.includes("b580") || l.op !== undefined))).toBe(true);
    expect(r.freeWrap.find((l) => l.pc === 0x01ea7ab6)?.text).toContain("3804");
    expect(r.mallocWrap.find((l) => l.pc === FREE1.mallocAdd4)?.text).toContain("1d20");

    const liveBl = r.freeWrapBls.find((b) => b.kind === "LIVE startup required");
    expect(liveBl?.from).toBe(FREE1.liveCaller);
    expect(liveBl?.inReadFile).toBe(true);
    expect(r.freeWrapBls.filter((b) => b.inReadFile).length).toBe(14);

    expect(r.afterCaller[0]?.pc).toBe(FREE1.liveRet);
    expect(r.afterCaller.some((l) => l.target === FILECHAIN.freeWrap)).toBe(true);
    expect(r.afterCaller.some((l) => l.target === FILECHAIN.mallocWrap)).toBe(true);
    expect(r.afterCaller.some((l) => l.target === FILECHAIN.seekWrap)).toBe(true);
    expect(r.afterCaller.some((l) => l.target === FILECHAIN.closeWrap)).toBe(true);
    expect(r.nextStaticSlots).toEqual(expect.arrayContaining([1, 0, 45, 41]));
    expect(r.nextChain[0]).toContain("indexbuf");
  });

  it("header/payload/len protocol matches two wrap allocations, not one 128/132 guess", () => {
    expect(FREE1.table1Len).toBe(FREE1.headerWord + 4);
    expect(FREE1.table0Request).toBe(FREE1.payloadRequest + 4);
    expect(FREE1.payload).toBe((FREE1.header + 4) >>> 0);
    expect(FREE1.indexTable0).toBe(FREE1.indexLen + 4);
    expect(FREE1.indexPayload).toBe((FREE1.indexHeader + 4) >>> 0);
    expect(realLGmemSize(132)).toBe(136);
    expect(realLGmemSize(5500)).toBe(5504);
  });

  it("rxgj first-fit reuses same-size blocks; flymrp bump does not", () => {
    const model = firstFitReuseSameSize(132);
    expect(model.reused).toBe(true);
    expect(model.second).toBe(model.first);
    expect(flymrpBumpSecond(model.first, 132)).toBe(model.first + 136);
    expect(flymrpBumpSecond(model.first, 132)).not.toBe(model.second);
    const payload = firstFitReuseSameSize(17174);
    expect(payload.reused).toBe(true);
    expect(realLGmemSize(17174)).toBeGreaterThan(136);
  });

  it("5 production runs stay deterministic at table[9]", () => {
    const bytes = new Uint8Array(readFileSync(REAL_APP));
    const runs = Array.from({ length: 5 }, () => runProductionCode0Fault(bytes));
    expect(new Set(runs)).toEqual(new Set([""]));
    const rt = new MythroadRuntime();
    expect(rt.ext).toBeNull();
  });
});
