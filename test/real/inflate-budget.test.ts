import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ExtStopKind } from "../../src/abi/fault.ts";
import { EXT_CODE_ADDR, EXT_STOP_ADDR } from "../../src/abi/layout.ts";
import { DEFAULT_INSN_BUDGET, ExtRuntime, MAX_INSN_BUDGET } from "../../src/abi/runtime.ts";
import {
  ARM_INSN_BUDGET_THROWN,
  REAL_MRP_BASELINE,
} from "../../src/real/startup.ts";
import {
  FORENSIC_BUDGET_CEILING,
  disasmBudgetStopStatic,
  runInflateBudget,
} from "../../src/real/inflate-budget.ts";
import { armBTo } from "../helpers/asm.ts";
import { wordsToBytes } from "../helpers/ext-asm.ts";

const REAL_APP = resolve(import.meta.dirname, "../fixtures/real/app.mrp");

describe("5-C.10Q forensic ARM insn watchdog", () => {
  it("production default is a finite 256M watchdog, not a slice", () => {
    expect(DEFAULT_INSN_BUDGET).toBe(256_000_000);
    expect(MAX_INSN_BUDGET).toBe(256_000_000);
    expect(FORENSIC_BUDGET_CEILING).toBe(20_000_000);
    expect(REAL_MRP_BASELINE.insnBudget).toBe(DEFAULT_INSN_BUDGET);
  });

  it("ExtRuntime.insnBudget is overridable and still finite", () => {
    const rt = new ExtRuntime();
    const dest = EXT_CODE_ADDR;
    rt.pokeCode(dest, wordsToBytes([armBTo(dest, dest)]));
    rt.insnBudget = 64;
    const out = rt.runGuest(dest, { lr: EXT_STOP_ADDR });
    expect(out.kind).toBe(ExtStopKind.AbiFault);
    expect(out.pc).toBe(dest);
    expect(out.detail).toBe("budget exceeded");
    expect(rt.cpu.insnCount).toBe(64);
    expect(DEFAULT_INSN_BUDGET).toBe(256_000_000);
  });

  it("budget stop PC 0x01ea1ee8 is Thumb inside the memcpy2 caller", () => {
    expect(existsSync(REAL_APP)).toBe(true);
    const bytes = new Uint8Array(readFileSync(REAL_APP));
    const d = disasmBudgetStopStatic(bytes);
    expect(d.stop).toBe(0x01ea1ee8);
    expect(d.memcpyLr).toBe(0x01ea1f83);
    expect(d.fnStart).toBeLessThanOrEqual(d.stop);
    expect(d.fnStart).toBeGreaterThanOrEqual(EXT_CODE_ADDR);
    expect(d.around.some((l) => l.pc === d.stop)).toBe(true);
    expect(d.memcpySite.some((l) => l.text.includes("BLX"))).toBe(true);
  });

  it("low forensic budget hits ARM_INSN_BUDGET at the 1M landmark", () => {
    const bytes = new Uint8Array(readFileSync(REAL_APP));
    const r = runInflateBudget(bytes, { budget: 1_000_000 });
    expect(r.productionDefaultBudget).toBe(256_000_000);
    expect(r.budget).toBe(1_000_000);
    expect(r.thrown).toBe(ARM_INSN_BUDGET_THROWN);
    expect(r.insnCount).toBe(1_000_000);
    expect(r.cpu?.pc).toBe(REAL_MRP_BASELINE.budgetStopPc);
    expect(r.cpu?.lr).toBe(REAL_MRP_BASELINE.budgetStopLr);
    expect(r.cpu?.tBit).toBe(1);
    expect(r.armExt0.returned).toBe(false);
    expect(r.lua.resumed).toBe(false);
    expect(r.unknownSlot).toBeNull();
    expect(r.health.unsupported).toBe(false);
    expect(r.health.memoryFault).toBe(false);
    expect(r.opcodes?.undef ?? 0).toBe(0);
    expect(r.progress.prefixMatch).toBeGreaterThan(20000);
    expect(r.progress.prefixEqual).toBe(false);
  });

  it("sufficient budget completes startup; 2M and 5M are the same guest result", () => {
    const bytes = new Uint8Array(readFileSync(REAL_APP));
    const a = runInflateBudget(bytes, { budget: 2_000_000 });
    const b = runInflateBudget(bytes, { budget: 5_000_000 });
    expect(a.thrown).toBe("");
    expect(b.thrown).toBe("");
    expect(a.unknownSlot).toBeNull();
    expect(b.unknownSlot).toBeNull();
    expect(a.insnCount).toBe(REAL_MRP_BASELINE.productionInsnCount);
    expect(b.insnCount).toBe(a.insnCount);
    expect(a.cpu?.pc).toBe(REAL_MRP_BASELINE.stopPc);
    expect(b.cpu?.pc).toBe(a.cpu?.pc);
    expect(a.cpu?.lr).toBe(REAL_MRP_BASELINE.stopLr);
    expect(b.cpu?.lr).toBe(a.cpu?.lr);
    expect(a.progress.prefixEqual).toBe(true);
    expect(b.progress.prefixEqual).toBe(true);
    expect(a.progress.prefixMatch).toBe(REAL_MRP_BASELINE.gzipOutLen);
    expect(a.outputVerified).toBe(true);
    expect(a.lua.resumed).toBe(true);
    expect(a.armExt0.returned).toBe(true);
    expect(a.hits.total).toBe(b.hits.total);
  });
});
