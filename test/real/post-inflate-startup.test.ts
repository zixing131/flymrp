import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_INSN_BUDGET } from "../../src/abi/runtime.ts";
import {
  ARM_INSN_BUDGET_THROWN,
  REAL_MRP_BASELINE,
} from "../../src/real/startup.ts";
import {
  POST_INFLATE,
  decodeSlotRle,
  encodeSlotRle,
  runPostInflateStartup,
} from "../../src/real/post-inflate.ts";

const REAL_APP = resolve(import.meta.dirname, "../fixtures/real/app.mrp");

describe("5-C.10R post-inflate startup gate", () => {
  it("slot RLE round-trips the production sequence", () => {
    const slots = decodeSlotRle(POST_INFLATE.slotRle);
    expect(slots).toHaveLength(POST_INFLATE.hitCount);
    expect(slots.at(-1)).toBe(80);
    expect(encodeSlotRle(slots)).toBe(POST_INFLATE.slotRle);
    expect(slots.filter((s) => s === 3)).toHaveLength(POST_INFLATE.table3);
    expect(slots.filter((s) => s === 1)).toHaveLength(POST_INFLATE.table1);
  });

  it("low explicit budget still hits ARM_INSN_BUDGET before inflate completes", () => {
    expect(existsSync(REAL_APP)).toBe(true);
    const bytes = new Uint8Array(readFileSync(REAL_APP));
    const r = runPostInflateStartup(bytes, { budget: 1_000_000 });
    expect(DEFAULT_INSN_BUDGET).toBe(256_000_000);
    expect(r.watchdog).toBe(1_000_000);
    expect(r.thrown).toBe(ARM_INSN_BUDGET_THROWN);
    expect(r.insnCount).toBe(1_000_000);
    expect(r.cpu.pc).toBe(REAL_MRP_BASELINE.budgetStopPc);
    expect(r.inflate.completed).toBe(false);
    expect(r.output.equal).toBe(false);
    expect(r.unknownSlot).toBeNull();
    expect(r.armExt0.returned).toBe(false);
    expect(r.lua.resumed).toBe(false);
    expect(r.gate.stage5cComplete).toBe(false);
    expect(r.gate.recommendStage5d).toBe(false);
  });

  it("production watchdog completes guest inflate and arm_ext_call(0) returns", () => {
    const bytes = new Uint8Array(readFileSync(REAL_APP));
    const r = runPostInflateStartup(bytes, { consistencyRuns: 5 });

    expect(r.watchdog).toBe(DEFAULT_INSN_BUDGET);
    expect(r.insnCount).toBe(REAL_MRP_BASELINE.productionInsnCount);
    expect(r.insnCount).toBeGreaterThan(1_000_000);
    expect(r.tableStubCount).toBe(POST_INFLATE.hitCount);
    expect(r.thrown).toBe("");
    expect(r.unknownSlot).toBeNull();

    expect(r.inflate.completed).toBe(true);
    expect(r.inflate.lastInsidePc).toBe(POST_INFLATE.lastInsidePc);
    expect(r.inflate.lastInsideLr).toBe(POST_INFLATE.lastInsideLr);
    expect(r.inflate.lastInsideInsn).toBe(POST_INFLATE.lastInsideInsn);
    expect(r.inflate.subsequentCaller).toBe(POST_INFLATE.table30Lr);

    expect(r.gzip.name).toBe("res_lang0.rc");
    expect(r.gzip.rawLength).toBe(POST_INFLATE.gzipInLen);
    expect(r.gzip.inputPtr).toBe(POST_INFLATE.gzipIn);
    expect(r.gzip.magic).toEqual([0x1f, 0x8b]);
    expect(r.gzip.isize).toBe(POST_INFLATE.outLen);

    expect(r.output.ptr).toBe(POST_INFLATE.outBuf);
    expect(r.output.alloc).toBe(POST_INFLATE.outAlloc);
    expect(r.output.header).toBe(POST_INFLATE.outLen);
    expect(r.output.dataOff).toBe(POST_INFLATE.dataOff);
    expect(r.output.length).toBe(POST_INFLATE.outLen);
    expect(r.output.guestSha256).toBe(POST_INFLATE.outputSha256);
    expect(r.output.referenceSha256).toBe(POST_INFLATE.outputSha256);
    expect(r.output.equal).toBe(true);

    expect(r.hits.table9).toBe(6);
    expect(r.hits.table3).toBe(POST_INFLATE.table3);
    expect(r.hits.table1).toBe(POST_INFLATE.table1);
    expect(r.slotRle).toBe(POST_INFLATE.slotRle);
    expect(decodeSlotRle(r.slotRle)).toHaveLength(r.tableStubCount);

    expect(r.allocs.count).toBe(POST_INFLATE.mrAllocs);
    expect(r.allocs.live).toBe(POST_INFLATE.liveAllocs);
    expect(r.allocs.bump).toBe(POST_INFLATE.bump);
    const out = r.allocs.records.find((a) => a.addr === POST_INFLATE.outBuf);
    const raw = r.allocs.records.find((a) => a.size === POST_INFLATE.gzipAlloc);
    expect(out?.live).toBe(true);
    expect(raw?.live).toBe(false);

    expect(r.armExt0.returned).toBe(true);
    expect(r.lua.resumed).toBe(true);
    expect(r.lua.insn).toBe(73);
    expect(r.strCom.map((s) => [s.code, s.extra, s.ok])).toEqual([
      [601, undefined, true],
      [800, 0, true],
      [801, 1, true],
      [800, 0, true],
      [801, 6, true],
      [801, 0, true],
    ]);
    expect(r.graphicsCommands).toBe(7);

    expect(r.table30?.r0).toBe(POST_INFLATE.table30R0);
    expect(r.table30?.r1).toBe(POST_INFLATE.table30R1);
    expect(r.table30?.r2).toBe(POST_INFLATE.table30R2);
    expect(r.table30?.r3).toBe(POST_INFLATE.table30R3);
    expect(r.table30?.lr).toBe(POST_INFLATE.table30Lr);
    expect(r.table30?.callerFn).toBe(POST_INFLATE.table30Fn);
    expect(r.cpu.pc).toBe(REAL_MRP_BASELINE.stopPc);

    expect(r.gate).toMatchObject({
      packFile: "PASS",
      directory: "PASS",
      resourceLookup: "PASS",
      gzipDetect: "PASS",
      guestInflate: "PASS",
      armExt0Return: "PASS",
      strCom0Return: "PASS",
      luaResume: "PASS",
      stage5cComplete: true,
      recommendStage5d: true,
      category: "EVENT",
    });

    expect(r.consistency.runs).toBe(5);
    expect(r.consistency.deterministic).toBe(true);
    expect(r.consistency.mismatches).toEqual([]);
    expect(new Set(r.consistency.fingerprints.map((f) => f.outputSha256))).toEqual(new Set([POST_INFLATE.outputSha256]));
    expect(new Set(r.consistency.fingerprints.map((f) => f.thrown))).toEqual(new Set([""]));
  });
});
