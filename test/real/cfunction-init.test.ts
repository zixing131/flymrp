import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AEX_P_ER_RW_LEN_OFF, AEX_P_ER_RW_OFF, EXT_CODE_ADDR, tableSlotIndex } from "../../src/abi/layout.ts";
import { ExtRuntime } from "../../src/abi/runtime.ts";
import { MRPArchive } from "../../src/mrp/archive.ts";
import { MrTableBridge } from "../../src/mythroad/mr-table.ts";
import { MythroadVfs } from "../../src/mythroad/vfs.ts";

const REAL_APP = resolve(import.meta.dirname, "../fixtures/real/app.mrp");
const THUMB_INIT = 0x01ea5e0c;
const HELPER = 0x01ea5e9d;
const P = 0x00a4b728;
const ER_RW = 0x0024b704;

describe("5-C.5 isolated cfunction.ext init", () => {
  it("takes ARM BLX(1), table[25], then table[14] memset zeros ER_RW", () => {
    const mrp = new Uint8Array(readFileSync(REAL_APP));
    const vfs = new MythroadVfs();
    vfs.attach(MRPArchive.parse(mrp));
    const bytes = vfs.readFile("cfunction.ext");
    expect(bytes?.length).toBe(220596);

    const ext = new ExtRuntime();
    const pcs: { pc: number; t: number; lr: number }[] = [];
    const slots: { n: number; r0: number; r1: number; r2: number }[] = [];
    const prev = ext.cpu.onBeforeFetch;
    ext.cpu.onBeforeFetch = (cpu) => {
      if (pcs.length < 80) pcs.push({ pc: cpu.r[15] >>> 0, t: cpu.t & 1, lr: cpu.r[14] >>> 0 });
      return prev ? prev(cpu) : false;
    };
    const orig = ext.table.dispatch.bind(ext.table);
    ext.table.dispatch = (cpu, mem, pc) => {
      const n = tableSlotIndex(pc);
      if (n >= 0 && n < 150 && ext.table.isExec(n)) {
        slots.push({ n, r0: cpu.r[0] >>> 0, r1: cpu.r[1] >>> 0, r2: cpu.r[2] >>> 0 });
        if (n === 14) mem.fill(cpu.r[0] >>> 0, 0xaa, 16);
      }
      orig(cpu, mem, pc);
    };
    new MrTableBridge(ext, vfs, "c5-init").install();

    const out = ext.load(bytes!, { loadCode: 0 });
    expect(out.kind).toBe("return");
    expect(out.ret).toBe(0);

    const thumb = pcs.find((x) => x.pc === THUMB_INIT);
    expect(thumb).toBeTruthy();
    expect(thumb!.t).toBe(1);
    expect(thumb!.lr).toBe((EXT_CODE_ADDR + 0x18) >>> 0);

    expect(slots.map((s) => s.n)).toEqual([25, 0, 14]);
    expect(slots[0]).toMatchObject({ n: 25, r0: HELPER, r1: 20 });
    expect(slots[1]).toMatchObject({ n: 0, r0: 19956 });
    expect(slots[2]).toMatchObject({ n: 14, r0: ER_RW, r1: 0, r2: 19952 });

    expect(ext.mem.read32(ext.codeBase + 4)).toBe(P);
    expect(ext.owners.wrapper).toEqual({ p: P, helper: HELPER });
    expect(ext.mem.read32(P + AEX_P_ER_RW_OFF)).toBe(ER_RW);
    expect(ext.mem.read32(P + AEX_P_ER_RW_LEN_OFF)).toBe(19952);
    expect([...ext.mem.slice(ER_RW, 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...ext.mem.slice(ER_RW + 19944, 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(ext.cpu.r[9]).toBe(0);
    expect(ext.table.handlers[14]).toBeTruthy();
  });
});
