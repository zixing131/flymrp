import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXT_CODE_ADDR } from "../../src/abi/layout.ts";
import { MythroadRuntime } from "../../src/mythroad/index.ts";
import { analyzeExtImage, extractNamedExt, runCode6Forensics, sha256hex } from "../../src/real/code6.ts";
import { REAL_MRP_BASELINE } from "../../src/real/startup.ts";

const REAL_APP = resolve(import.meta.dirname, "../fixtures/real/app.mrp");
const CF_SHA = "94b8b47f15a91e6900488d8c84cecfeffe19aa9f3a76adb98ef55983d484a926";

describe("5-C.5 cfunction init / code-6 forensics", () => {
  it("static image identity and BLX(1) at dest+0x14", () => {
    const bytes = extractNamedExt(new Uint8Array(readFileSync(REAL_APP)), "cfunction.ext");
    expect(bytes.length).toBe(220596);
    expect(sha256hex(bytes)).toBe(CF_SHA);
    const st = analyzeExtImage(bytes, "cfunction.ext");
    expect(st.kind).toBe("mrpgcmap");
    expect(st.loadAddr).toBe((EXT_CODE_ADDR + 8) >>> 0);
    expect(st.loadWords[3]).toBe(0xfa00977c);
    expect(st.blxImmTargets.some((t) => t.from === ((EXT_CODE_ADDR + 0x14) >>> 0) && t.to === 0x01ea5e0c)).toBe(true);
  });

  it("memset lets code 6 enter guest; arm_ext_call(0) returns", () => {
    const r = runCode6Forensics(new Uint8Array(readFileSync(REAL_APP)));
    expect(r.fault.loadBlxTaken).toBe(true);
    expect(r.fault.guestEntered).toBe(true);
    expect(r.fault.classification).toBe("CONTROL");
    expect(r.fault.subtype).toBe("arm_ext_call(0) NORMAL RETURN");
    expect(r.fault.site).toBe("arm_ext_call.return");
    expect(r.fault.slot).toBe(80);
    expect(r.fault.kind).toBe("RETURN");
    expect(r.fault.faultPc).toBe(REAL_MRP_BASELINE.stopPc);
    expect(r.fault.r9).toBe(0x0024b704);
    expect(r.fault.p).toBe(0x0034b728);
    expect(r.fault.helper).toBe(0x01ea5e9d);
    expect(r.fault.erRw).toBe(0x0024b704);
    expect(r.preCall?.route).toEqual({ p: 0x0034b728, helper: 0x01ea5e9d });
    expect(r.code6Call).toMatchObject({
      entered: true,
      kind: "return",
      r0: 0,
      helper: 0x01ea5e9d,
      firstPc: 0x01ea5e9c,
      tBit: 1,
      r9: 0x0024b704,
      erRwWord10: 0x7b0,
      erRwWord20: 0,
    });
    expect(r.cfunctionSlots.map((s) => s.slot)).toEqual([25, 0, 14]);
    expect(r.loads.find((l) => l.bytes === 220596)?.ret).toBe(0);
  });

  it("does not wrap the default runtime", () => {
    const rt = new MythroadRuntime();
    expect(rt.trace).toBeNull();
  });
});
