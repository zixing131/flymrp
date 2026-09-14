import { describe, expect, it } from "vitest";
import {
  CREATE_ABC,
  CREATE_ABx,
  OP_CALL,
  OP_GETGLOBAL,
  OP_GETTABLE,
  OP_LOADK,
  OP_RETURN,
  TAG_NUMBER,
} from "../../src/lua/index.ts";
import { MythroadRuntime } from "../../src/mythroad/index.ts";
import { kn, ks, proto } from "../helpers/lua.ts";

function tblNum(rt: MythroadRuntime, field: string): number {
  const id = rt.lua.L.nums[0]!;
  return rt.lua.L.tables[id]!.getStr(rt.lua.L.internStr(field)).num;
}

describe("5-B system info", () => {
  it('uses the SDK identity by default while preserving explicit handset profiles', () => {
    expect(new MythroadRuntime().profile.hsman).toBe('sdk');
    expect(new MythroadRuntime({profile:{hsman:'custom'}}).profile.hsman).toBe('custom');
  });
  it("GetSysInfo scrw/scrh from DeviceProfile", () => {
    const rt = new MythroadRuntime({ profile: { width: 128, height: 160 } });
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("GetSysInfo")],
        code: [CREATE_ABx(OP_GETGLOBAL, 0, 0), CREATE_ABC(OP_CALL, 0, 1, 2), CREATE_ABC(OP_RETURN, 0, 2, 0)],
      }),
    );
    expect(tblNum(rt, "scrw")).toBe(128);
    expect(tblNum(rt, "scrh")).toBe(160);
    expect(tblNum(rt, "ScreenW")).toBe(128);
  });

  it("vmver is FULL 1968", () => {
    const rt = new MythroadRuntime();
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("GetSysInfo")],
        code: [CREATE_ABx(OP_GETGLOBAL, 0, 0), CREATE_ABC(OP_CALL, 0, 1, 2)],
      }),
    );
    expect(tblNum(rt, "vmver")).toBe(1968);
  });

  it("font metrics are gb16 MEDIUM", () => {
    const rt = new MythroadRuntime();
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("GetSysInfo")],
        code: [CREATE_ABx(OP_GETGLOBAL, 0, 0), CREATE_ABC(OP_CALL, 0, 1, 2)],
      }),
    );
    expect(tblNum(rt, "chw")).toBe(16);
    expect(tblNum(rt, "chh")).toBe(16);
    expect(tblNum(rt, "ascw")).toBe(8);
    expect(tblNum(rt, "asch")).toBe(16);
  });

  it("GetDatetime fields", () => {
    const rt = new MythroadRuntime({
      profile: { datetime: { year: 2024, month: 5, day: 6, hour: 7, minute: 8, second: 9 } },
    });
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("GetDatetime")],
        code: [CREATE_ABx(OP_GETGLOBAL, 0, 0), CREATE_ABC(OP_CALL, 0, 1, 2)],
      }),
    );
    expect(tblNum(rt, "year")).toBe(2024);
    expect(tblNum(rt, "mon")).toBe(5);
    expect(tblNum(rt, "sec")).toBe(9);
  });

  it("sys.getuptime follows advance", () => {
    const rt = new MythroadRuntime();
    rt.advance(42);
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("sys"), ks("getuptime")],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABC(OP_GETTABLE, 0, 0, 251),
          CREATE_ABC(OP_CALL, 0, 1, 2),
          CREATE_ABC(OP_RETURN, 0, 2, 0),
        ],
      }),
    );
    expect(rt.lua.L.tags[0]).toBe(TAG_NUMBER);
    expect(rt.lua.L.nums[0]).toBe(42);
  });

  it("_com(1) is virtual clock", () => {
    const rt = new MythroadRuntime();
    rt.advance(7);
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("_com"), kn(1)],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABx(OP_LOADK, 1, 1),
          CREATE_ABC(OP_CALL, 0, 2, 2),
        ],
      }),
    );
    expect(rt.lua.L.nums[0]).toBe(7);
  });
});
