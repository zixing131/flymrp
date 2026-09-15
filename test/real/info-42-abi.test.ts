import { describe, expect, it } from "vitest";
import { EXT_STOP_ADDR, stackTop, tableSlotAddr } from "../../src/abi/layout.ts";
import { ExtRuntime } from "../../src/abi/runtime.ts";
import { ExtStopKind } from "../../src/abi/fault.ts";
import { MR_IS_FILE, MR_IS_INVALID, MR_IS_DIR } from "../../src/mythroad/constants.ts";
import { MrTableBridge } from "../../src/mythroad/index.ts";
import { MythroadVfs } from "../../src/mythroad/vfs.ts";

/**
 * table[42] mr_info: pack name is the RDONLY alias.
 * Archive members and unbacked names are MR_IS_INVALID.
 */

function wire(packName = "gssjxz.mrp") {
  const ext = new ExtRuntime();
  const pack = { name: packName, bytes: new Uint8Array([1, 2, 3, 4]) };
  const bridge = new MrTableBridge(ext, new MythroadVfs(), packName, {
    getPack: () => pack,
  });
  bridge.install();
  return { ext, bridge };
}

function writeCString(ext: ExtRuntime, addr: number, s: string): void {
  for (let i = 0; i < s.length; i++) ext.mem.write8((addr + i) >>> 0, s.charCodeAt(i));
  ext.mem.write8((addr + s.length) >>> 0, 0);
}

function call42(ext: ExtRuntime, nameAddr: number) {
  return ext.runGuest(tableSlotAddr(42), { r0: nameAddr, r1: 0, r2: 0, r3: 0, sp: stackTop() - 16, lr: EXT_STOP_ADDR });
}

describe("table[42] mr_info ABI", () => {
  it("current pack name is MR_IS_FILE", () => {
    const { ext } = wire();
    const p = ext.alloc(16);
    writeCString(ext, p, "gssjxz.mrp");
    const out = call42(ext, p);
    expect(out.kind).toBe(ExtStopKind.Return);
    expect(out.r0).toBe(MR_IS_FILE);
  });

  it("LIVE dbglog.txt and archive members are MR_IS_INVALID", () => {
    const { ext, bridge } = wire();
    for (const name of ["dbglog.txt", "gsidbak", "res_lang0.rc"]) {
      const p = ext.alloc(32);
      writeCString(ext, p, name);
      expect(call42(ext, p).r0).toBe(MR_IS_INVALID);
      expect(bridge.lastInfo).toBe(name);
    }
  });

  it("resolves an empty name and dot paths to the working directory", () => {
    const { ext, bridge } = wire();
    bridge.appFs.mkdir('games');
    for (const name of ['', '.', 'games/..']) {
      const p = ext.alloc(32);
      writeCString(ext, p, name);
      expect(call42(ext, p).r0).toBe(MR_IS_DIR);
    }
  });
});
