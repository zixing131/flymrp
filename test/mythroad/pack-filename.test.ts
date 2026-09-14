import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXT_CODE_ADDR, MR_MAX_FILENAME_SIZE, PACK_FILENAME_SLOT, tableSlotAddr } from "../../src/abi/layout.ts";
import { ExtStopKind } from "../../src/abi/fault.ts";
import { ExtRuntime } from "../../src/abi/runtime.ts";
import { DATA_SLOTS, dataSlotAllocSize } from "../../src/abi/table.ts";
import { armBx, armLdrImm } from "../helpers/asm.ts";
import { wordsToBytes } from "../helpers/ext-asm.ts";
import { MRPArchive } from "../../src/mrp/archive.ts";
import { MrTableBridge, MythroadRuntime, MythroadVfs, readGuestCString } from "../../src/mythroad/index.ts";

const REAL_APP = resolve(import.meta.dirname, "../fixtures/real/app.mrp");

function guestBytes(rt: ExtRuntime, addr: number, n = MR_MAX_FILENAME_SIZE): number[] {
  return [...rt.mem.slice(addr, n)];
}

describe("5-C.10I table[100] / pack_filename data slot", () => {
  it("is a 128-byte data slot, not an exec handler", () => {
    const rt = new ExtRuntime();
    expect(DATA_SLOTS.has(PACK_FILENAME_SLOT)).toBe(true);
    expect(dataSlotAllocSize(PACK_FILENAME_SLOT)).toBe(128);
    expect(dataSlotAllocSize(91)).toBe(4);
    expect(rt.table.isExec(PACK_FILENAME_SLOT)).toBe(false);
    expect(rt.table.handlers[PACK_FILENAME_SLOT]).toBeNull();

    const addr = rt.packFilenameAddr();
    expect(addr).toBe(rt.mem.read32(tableSlotAddr(PACK_FILENAME_SLOT)) >>> 0);
    expect(addr).toBe(0x00200400);
    expect(guestBytes(rt, addr).every((b) => b === 0)).toBe(true);
    expect(readGuestCString(rt.mem, addr, MR_MAX_FILENAME_SIZE)).toBe("");
  });

  it("BLX to table[100] is InvalidSlot, not MR_IGNORE host callback", () => {
    const rt = new ExtRuntime();
    const dest = EXT_CODE_ADDR;
    rt.pokeCode(dest, wordsToBytes([armLdrImm(0, 15, 0), armBx(0), tableSlotAddr(PACK_FILENAME_SLOT)]));
    const out = rt.runGuest(dest);
    expect(out.kind).toBe(ExtStopKind.InvalidSlot);
    expect(rt.table.handlers[PACK_FILENAME_SLOT]).toBeNull();
    expect(rt.table.isExec(PACK_FILENAME_SLOT)).toBe(false);
  });

  it("MrTableBridge.install does not register a handler for slot 100", () => {
    const ext = new ExtRuntime();
    new MrTableBridge(ext, new MythroadVfs(), "pack").install();
    expect(ext.table.handlers[PACK_FILENAME_SLOT]).toBeNull();
    expect(ext.table.isExec(PACK_FILENAME_SLOT)).toBe(false);
    expect(ext.table.handlers[40]).toBeTruthy();
    expect(ext.table.handlers[17]).toBeTruthy();
  });

  it("snprintf-style copy: short, 127, overflow, empty, and rebind clears tail", () => {
    const rt = new ExtRuntime();
    const addr = rt.packFilenameAddr();

    rt.setPackTableName("abc.mrp");
    expect(readGuestCString(rt.mem, addr)).toBe("abc.mrp");
    expect(rt.mem.read8(addr + 7)).toBe(0);
    expect(guestBytes(rt, addr).slice(8).every((b) => b === 0)).toBe(true);

    const exact = "x".repeat(MR_MAX_FILENAME_SIZE - 1);
    rt.setPackTableName(exact);
    expect(readGuestCString(rt.mem, addr, MR_MAX_FILENAME_SIZE)).toBe(exact);
    expect(rt.mem.read8(addr + 127)).toBe(0);

    const tooLong = "y".repeat(200);
    rt.setPackTableName(tooLong);
    expect(readGuestCString(rt.mem, addr, MR_MAX_FILENAME_SIZE)).toBe("y".repeat(127));
    expect(rt.mem.read8(addr + 127)).toBe(0);

    rt.setPackTableName("x.mrp");
    expect(readGuestCString(rt.mem, addr)).toBe("x.mrp");
    expect(rt.mem.read8(addr + 5)).toBe(0);
    expect(guestBytes(rt, addr).slice(6).every((b) => b === 0)).toBe(true);

    rt.setPackTableName("");
    expect(readGuestCString(rt.mem, addr)).toBe("");
    expect(guestBytes(rt, addr).every((b) => b === 0)).toBe(true);

    const sameAddr = rt.packFilenameAddr();
    rt.setPackTableName("abc.mrp");
    expect(rt.packFilenameAddr()).toBe(sameAddr);
  });

  it("bindExt writes runtime.packName before guest code runs", () => {
    const bytes = new Uint8Array(readFileSync(REAL_APP));
    const headerName = MRPArchive.parse(bytes).header.filename;
    const myth = new MythroadRuntime();
    myth.loadMrp(bytes);
    expect(myth.packName).toBe(headerName);
    expect(myth.packName).not.toBe("app.mrp");
    expect(myth.packName).not.toContain("test/fixtures");

    const ext = new ExtRuntime();
    myth.bindExt(ext);
    const addr = ext.packFilenameAddr();
    expect(readGuestCString(ext.mem, addr)).toBe(myth.packName);
    expect(ext.mem.read8(addr + myth.packName.length)).toBe(0);
    expect(guestBytes(ext, addr).slice(myth.packName.length + 1).every((b) => b === 0)).toBe(true);
    expect(ext.table.handlers[PACK_FILENAME_SLOT]).toBeNull();
  });
});
