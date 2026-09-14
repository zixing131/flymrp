import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MRPArchive } from "../../src/mrp/archive.ts";
import { MR_FAILED, MR_FILE_RDONLY, MR_SEEK_CUR, MR_SEEK_END, MR_SEEK_SET, MR_SUCCESS } from "../../src/mythroad/constants.ts";
import { MythroadRuntime } from "../../src/mythroad/index.ts";
import {
  FILECHAIN,
  FILE_SLOT_INVENTORY,
  MINIMAL_STARTUP_FILE_SLOTS,
  NOT_REQUIRED_STARTUP_FILE_SLOTS,
  runFileChainForensics,
  specReadCount,
  specSeek,
} from "../../src/real/filechain.ts";
import { FILE_ABI_SLOTS, OPEN40 } from "../../src/real/open40.ts";

const REAL_APP = resolve(import.meta.dirname, "../fixtures/real/app.mrp");

describe("5-C.10J current-pack file ABI forensics", () => {
  it("static CFG after table[40] is read/seek/close; current runtime exposes the file handlers", () => {
    const bytes = new Uint8Array(readFileSync(REAL_APP));
    const r = runFileChainForensics(bytes);

    expect(r.productionThrown).toBe("");
    expect(r.probeThrown).toBe("");
    expect(r.packName).toBe("gssjxz.mrp");
    expect(r.packFilenameAt40).toBe("gssjxz.mrp");
    expect(r.resourceNameAt40).toBe(OPEN40.sprintfText);
    expect(r.readFileName).toBe(OPEN40.sprintfText);
    expect(r.entryR0).toBe(0);
    expect(r.entryR1).toBe(OPEN40.sprintfBuf);
    expect(r.lookfor).toBe(0);

    expect(r.handlers[40]).toBe(true);
    expect(r.handlers[41]).toBe(true);
    expect(r.handlers[43]).toBe(true);
    expect(r.handlers[44]).toBe(true);
    expect(r.handlers[45]).toBe(true);
    for (const s of NOT_REQUIRED_STARTUP_FILE_SLOTS) expect(r.handlers[s]).toBe(true);
    expect(r.handlers[14]).toBe(true);
    expect(r.handlers[0]).toBe(true);
    expect(r.handlers[1]).toBe(true);
    expect(r.handlers[3]).toBe(true);
    expect(r.handlers[10]).toBe(true);

    expect(r.wraps.find((w) => w.pc === FILECHAIN.openWrap)?.slot).toBe(40);
    expect(r.wraps.find((w) => w.pc === FILECHAIN.readWrap)?.slot).toBe(44);
    expect(r.wraps.find((w) => w.pc === FILECHAIN.closeWrap)?.slot).toBe(41);
    expect(r.wraps.find((w) => w.pc === FILECHAIN.seekWrap)?.slot).toBe(45);

    const slotsFromFn = new Set(r.fileSlotsInFn);
    expect([...slotsFromFn].sort((a, b) => a - b)).toEqual([40, 41, 44, 45]);
    expect(r.bls.some((b) => b.from === FILECHAIN.openBl && b.to === FILECHAIN.openWrap && b.slot === 40)).toBe(true);
    expect(r.bls.some((b) => b.from === FILECHAIN.headerReadBl && b.to === FILECHAIN.readWrap && b.slot === 44)).toBe(true);
    expect(r.bls.some((b) => b.from === FILECHAIN.indexSeekBl && b.to === FILECHAIN.seekWrap && b.slot === 45)).toBe(true);
    expect(r.bls.some((b) => b.from === FILECHAIN.indexReadBl && b.to === FILECHAIN.readWrap && b.slot === 44)).toBe(true);
    expect(r.bls.some((b) => b.from === FILECHAIN.payloadSeekBl && b.to === FILECHAIN.seekWrap && b.slot === 45)).toBe(true);
    expect(r.bls.some((b) => b.from === FILECHAIN.successCloseBl && b.to === FILECHAIN.closeWrap && b.slot === 41)).toBe(true);
    expect(r.bls.some((b) => b.slot === 42 || b.slot === 46 || b.slot === 39 || b.slot === 43)).toBe(false);

    expect(r.nextUnimplementedFileSlot).toBe(44);
    expect(r.cmp16).toBe(16);
    expect(r.cmp232).toBe(0xe8);
    expect(r.efsBranchHw).toBe(0xe04f);
    expect(r.inlineReadOff).toBe(0x30);

    expect(r.archiveSameRef).toBe(true);
    expect(r.archiveBytes).toBe(bytes.length);
    expect(r.archiveBytes).toBe(382778);
    expect(r.archiveMagic).toBe(FILECHAIN.magicLe);
    expect(r.fileStart).toBe(5728);
    expect(r.fileStart).toBeGreaterThan(FILECHAIN.newStyleMin);
    expect(r.listStart).toBe(240);
    expect(r.indexLen).toBe(5728 + 8 - 240);
    expect(r.vfsHasPackName).toBe(true);
    expect(r.vfsHasResLang).toBe(true);
    expect(r.vfsHasResLangAsPack).toBe(false);
    expect(r.design).toBe("SUPPORTED DESIGN / INFERRED COMPATIBLE");

    expect(FILE_SLOT_INVENTORY.find((s) => s.slot === 42)?.symbol).toContain("mr_info");
    expect(FILE_SLOT_INVENTORY.find((s) => s.slot === 44)?.symbol).toContain("mr_read");
    expect(FILE_ABI_SLOTS.find((s) => s.slot === 42)?.ident).toContain("mr_info");
    expect(MINIMAL_STARTUP_FILE_SLOTS).toEqual([40, 44, 45, 41, 43]);
  });

  it("exposes current package bytes to both Lua and ARM file APIs", () => {
    const rt = new MythroadRuntime();
    expect(rt.ext).toBeNull();
    const bytes = new Uint8Array(readFileSync(REAL_APP));
    rt.loadMrp(bytes);
    expect(rt.mrp?.data).toBe(bytes);
    expect(rt.packName).toBe(rt.mrp?.header.filename);
    expect(rt.vfs.exists(rt.packName)).toBe(true);
    expect(rt.vfs.exists("res_lang0.rc")).toBe(true);
    expect(MRPArchive.parse(bytes).data).toBe(bytes);
  });

  it("locks read/seek guest-observable spec without a production backend", () => {
    expect(specReadCount(0, 16, 16)).toBe(16);
    expect(specReadCount(16, 16, 16)).toBe(0);
    expect(specReadCount(8, 16, 16)).toBe(8);
    expect(specReadCount(0, 16, 0)).toBe(0);
    expect(specSeek(16, 100, 240 - 16, MR_SEEK_CUR)).toEqual({ ret: MR_SUCCESS, pos: 240 });
    expect(specSeek(0, 100, 50, MR_SEEK_SET)).toEqual({ ret: MR_SUCCESS, pos: 50 });
    expect(specSeek(0, 100, 0, MR_SEEK_END)).toEqual({ ret: MR_SUCCESS, pos: 100 });
    expect(specSeek(0, 100, 5, MR_SEEK_END)).toEqual({ ret: MR_SUCCESS, pos: 105 });
    expect(specSeek(10, 100, -20, MR_SEEK_SET)).toEqual({ ret: MR_FAILED, pos: 10 });
    expect(MR_FILE_RDONLY).toBe(1);
    expect(MR_SEEK_SET).toBe(0);
    expect(MR_SEEK_CUR).toBe(1);
  });
});
