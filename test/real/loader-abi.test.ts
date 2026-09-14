import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MythroadRuntime, NullGraphicsBackend, RuntimeTrace } from "../../src/mythroad/index.ts";

const REAL_APP = resolve(import.meta.dirname, "../fixtures/real/app.mrp");

describe("5-C.5 real loader chain", () => {
  it("cfunction load + code 6 return, then arm_ext_call(0) returns", () => {
    const bytes = new Uint8Array(readFileSync(REAL_APP));
    const tr = new RuntimeTrace();
    const rt = new MythroadRuntime({ graphics: new NullGraphicsBackend(), trace: tr, abiMode: "strict" });
    rt.loadMrp(bytes);
    expect(() => rt.start("start.mr")).not.toThrow();
    expect(rt.unknownRequiredSlot).toBeNull();
    expect(rt.unknownEvents).toEqual([]);
    expect(rt.unknownEvents.some((e) => e.family === "mr_table" && e.code === 9)).toBe(false);

    const cf = rt.mrReads.find((r) => r.name === "cfunction.ext" && r.lookfor === 0);
    expect(cf).toBeTruthy();
    expect(cf!.length).toBe(220596);
    expect(rt.ext?.codeLen).toBe(220596);
    expect(rt.ext?.owners.wrapper.p).toBe(0x0034b728);
    expect(rt.ext?.owners.wrapper.helper).toBe(0x01ea5e9d);

    const loads = tr.records.filter((r) => r.operation === "ext_load_return");
    expect(loads.some((r) => (r.arguments as { ret?: number }).ret === 3)).toBe(true);
    expect(loads.some((r) => (r.arguments as { ret?: number }).ret === 0)).toBe(true);

    const code6 = tr.records.find((r) => r.operation === "ext_return" && (r.arguments as { slot?: number }).slot === 6);
    expect(code6).toBeTruthy();
    expect((code6!.arguments as { kind?: string; r0?: number }).kind).toBe("return");
    expect((code6!.arguments as { r0?: number }).r0).toBe(0);

    const code0 = tr.records.find((r) => r.operation === "ext_call" && (r.arguments as { slot?: number }).slot === 0);
    expect(code0).toBeTruthy();
  });
});
