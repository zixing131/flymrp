import { describe, expect, it } from "vitest";
import { EXT_STOP_ADDR, stackTop, tableSlotAddr } from "../../src/abi/layout.ts";
import { ExtRuntime } from "../../src/abi/runtime.ts";
import { ExtStopKind } from "../../src/abi/fault.ts";
import { MR_FAILED, MR_SUCCESS } from "../../src/mythroad/constants.ts";
import {
  MrTableBridge,
  packedUserInfoVer,
  readGuestCString,
  defaultProfile,
  MR_USERINFO_SIZE,
  MR_USERINFO_VER_BASE,
} from "../../src/mythroad/index.ts";
import { MythroadVfs } from "../../src/mythroad/vfs.ts";

function wire(profile = defaultProfile()) {
  const ext = new ExtRuntime();
  const bridge = new MrTableBridge(ext, new MythroadVfs(), "test", { getProfile: () => profile });
  bridge.install();
  return { ext, bridge };
}

function call35(ext: ExtRuntime, info: number) {
  return ext.runGuest(tableSlotAddr(35), {
    r0: info,
    r1: 0,
    r2: 0,
    r3: 0,
    sp: stackTop() - 16,
    lr: EXT_STOP_ADDR,
  });
}

describe("table[35] mr_getUserInfo ABI", () => {
  it("NULL info is MR_FAILED", () => {
    const { ext, bridge } = wire();
    const out = call35(ext, 0);
    expect(out.kind).toBe(ExtStopKind.Return);
    expect(out.r0).toBe(MR_FAILED >>> 0);
    expect(bridge.lastUserInfo).toBe(0);
  });

  it("fills the 64-byte mr_userinfo from DeviceProfile", () => {
    const { ext, bridge } = wire();
    const info = ext.alloc(MR_USERINFO_SIZE);
    ext.mem.fill(info, 0xaa, MR_USERINFO_SIZE);
    const out = call35(ext, info);
    expect(out.kind).toBe(ExtStopKind.Return);
    expect(out.r0).toBe(MR_SUCCESS);
    expect(bridge.lastUserInfo).toBe(info);
    expect(readGuestCString(ext.mem, info, 16)).toBe("000000000000000");
    expect(ext.mem.read8((info + 15) >>> 0)).toBe(0);
    expect(readGuestCString(ext.mem, (info + 16) >>> 0, 16)).toBe("000000000000000");
    expect(readGuestCString(ext.mem, (info + 32) >>> 0, 8)).toBe("sdk");
    expect(readGuestCString(ext.mem, (info + 40) >>> 0, 8)).toBe("stage5b");
    expect(ext.mem.read32((info + 48) >>> 0)).toBe(packedUserInfoVer(1));
    expect(packedUserInfoVer(1)).toBe(MR_USERINFO_VER_BASE + 2 * 10000 + 180);
    expect([...ext.mem.slice((info + 52) >>> 0, 12)]).toEqual(Array(12).fill(0));
  });

  it("already-packed hsver is stored as-is", () => {
    const { ext } = wire(defaultProfile({ hsver: 101070182 }));
    const info = ext.alloc(MR_USERINFO_SIZE);
    call35(ext, info);
    expect(ext.mem.read32((info + 48) >>> 0)).toBe(101070182);
  });
});
