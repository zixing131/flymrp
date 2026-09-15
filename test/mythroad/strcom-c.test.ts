import { describe, expect, it } from "vitest";
import { EXT_CODE_ADDR } from "../../src/abi/layout.ts";
import { NativeAbiError } from "../../src/err/errors.ts";
import { CREATE_ABC, CREATE_ABx, OP_CALL, OP_GETGLOBAL, OP_LOADK, OP_RETURN, TAG_NUMBER, TAG_TABLE, call, proto } from "../../src/lua/index.ts";
import { gzipStore } from "../../src/mrp/gzip.ts";
import { buildMrp } from "../../src/mrp/index.ts";
import { md5, mrDecode, mrEncode, MythroadRuntime } from "../../src/mythroad/index.ts";
import { ARM_LOAD_HELPER_OFF, assembleArmHelperAt, buildArmLoadImage } from "../helpers/ext-asm.ts";
import { kn, ks } from "../helpers/lua.ts";

function bin(s: string): Uint8Array {
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
  return u;
}

function strOf(u: Uint8Array): string {
  return String.fromCharCode(...u);
}

describe("5-C _strCom / _com", () => {
  it("300 unzip gzip", () => {
    const rt = new MythroadRuntime();
    const gz = gzipStore(bin("hello"));
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("_strCom"), kn(300), ks(strOf(gz))],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABx(OP_LOADK, 1, 1),
          CREATE_ABx(OP_LOADK, 2, 2),
          CREATE_ABC(OP_CALL, 0, 3, 2),
          CREATE_ABC(OP_RETURN, 0, 2, 0),
        ],
      }),
    );
    expect(rt.lua.L.strings[rt.lua.L.nums[0]!]!).toBe("hello");
  });

  it("300 non-gzip returns original", () => {
    const rt = new MythroadRuntime();
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("_strCom"), kn(300), ks("plain")],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABx(OP_LOADK, 1, 1),
          CREATE_ABx(OP_LOADK, 2, 2),
          CREATE_ABC(OP_CALL, 0, 3, 2),
          CREATE_ABC(OP_RETURN, 0, 2, 0),
        ],
      }),
    );
    expect(rt.lua.L.strings[rt.lua.L.nums[0]!]!).toBe("plain");
  });

  it("500 MD5 length 16", () => {
    const rt = new MythroadRuntime();
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("_strCom"), kn(500), ks("")],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABx(OP_LOADK, 1, 1),
          CREATE_ABx(OP_LOADK, 2, 2),
          CREATE_ABC(OP_CALL, 0, 3, 2),
          CREATE_ABC(OP_RETURN, 0, 2, 0),
        ],
      }),
    );
    expect(rt.lua.L.strings[rt.lua.L.nums[0]!]!.length).toBe(16);
    expect(strOf(md5(bin("")))).toBe(rt.lua.L.strings[rt.lua.L.nums[0]!]!);
  });

  it("501/502 encode decode roundtrip", () => {
    const raw = bin("Mythroad");
    const enc = mrEncode(raw)!;
    const dec = mrDecode(enc)!;
    expect(strOf(dec)).toBe("Mythroad");
    const rt = new MythroadRuntime();
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("_strCom"), kn(501), ks("Mythroad")],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABx(OP_LOADK, 1, 1),
          CREATE_ABx(OP_LOADK, 2, 2),
          CREATE_ABC(OP_CALL, 0, 3, 2),
          CREATE_ABC(OP_RETURN, 0, 2, 0),
        ],
      }),
    );
    expect(rt.lua.L.strings[rt.lua.L.nums[0]!]!).toBe(strOf(enc));
  });

  it("502 decodes 501 output", () => {
    const rt = new MythroadRuntime();
    const enc = strOf(mrEncode(bin("ab"))!);
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("_strCom"), kn(502), ks(enc)],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABx(OP_LOADK, 1, 1),
          CREATE_ABx(OP_LOADK, 2, 2),
          CREATE_ABC(OP_CALL, 0, 3, 2),
          CREATE_ABC(OP_RETURN, 0, 2, 0),
        ],
      }),
    );
    expect(rt.lua.L.strings[rt.lua.L.nums[0]!]!).toBe("ab");
  });

  it.each([601, 602])("%i terminates resource filenames at NUL", (code) => {
    const rt = new MythroadRuntime();
    rt.loadMrp(buildMrp([{ name: "logo.ext", data: bin("A\0B") }]));
    rt.lua.runCold(proto({
      maxstack: 4,
      k: [ks("_strCom"), kn(code), ks("logo.ext\0ignored")],
      code: [CREATE_ABx(OP_GETGLOBAL, 0, 0), CREATE_ABx(OP_LOADK, 1, 1),
        CREATE_ABx(OP_LOADK, 2, 2), CREATE_ABC(OP_CALL, 0, 3, 2), CREATE_ABC(OP_RETURN, 0, 2, 0)],
    }));
    if (code === 601) expect(rt.lua.L.strings[rt.lua.L.nums[0]!]!).toBe("A\0B");
    else { expect(rt.lua.L.tags[0]).toBe(TAG_NUMBER); expect(rt.lua.L.nums[0]).toBe(0); }
  });

  it("601 still reads resource", () => {
    const rt = new MythroadRuntime();
    rt.loadMrp(buildMrp([{ name: "a.txt", data: bin("Z") }]));
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("_strCom"), kn(601), ks("a.txt")],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABx(OP_LOADK, 1, 1),
          CREATE_ABx(OP_LOADK, 2, 2),
          CREATE_ABC(OP_CALL, 0, 3, 2),
          CREATE_ABC(OP_RETURN, 0, 2, 0),
        ],
      }),
    );
    expect(rt.lua.L.strings[rt.lua.L.nums[0]!]!).toBe("Z");
  });

  it("602 exists", () => {
    const rt = new MythroadRuntime();
    rt.loadMrp(buildMrp([{ name: "a.txt", data: bin("Z") }]));
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("_strCom"), kn(602), ks("a.txt")],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABx(OP_LOADK, 1, 1),
          CREATE_ABx(OP_LOADK, 2, 2),
          CREATE_ABC(OP_CALL, 0, 3, 2),
          CREATE_ABC(OP_RETURN, 0, 2, 0),
        ],
      }),
    );
    expect(rt.lua.L.nums[0]).toBe(0);
  });

  it("_com 1 returns clock", () => {
    const rt = new MythroadRuntime();
    rt.clock = 123;
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("_com"), kn(1)],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABx(OP_LOADK, 1, 1),
          CREATE_ABC(OP_CALL, 0, 2, 2),
          CREATE_ABC(OP_RETURN, 0, 2, 0),
        ],
      }),
    );
    expect(rt.lua.L.nums[0]).toBe(123);
  });

  it("800 table {ptr,len} reloads guest bytes (tostring_t)", () => {
    const helperAt = EXT_CODE_ADDR + ARM_LOAD_HELPER_OFF;
    const first = buildArmLoadImage({
      dest: EXT_CODE_ADDR,
      helperWords: assembleArmHelperAt(helperAt, { ret0: 0x11 }),
    });
    const second = buildArmLoadImage({
      dest: EXT_CODE_ADDR,
      helperWords: assembleArmHelperAt(helperAt, { ret0: 0x22 }),
    });
    const rt = new MythroadRuntime();
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("_strCom"), kn(800), ks(strOf(first)), kn(0)],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABx(OP_LOADK, 1, 1),
          CREATE_ABx(OP_LOADK, 2, 2),
          CREATE_ABx(OP_LOADK, 3, 3),
          CREATE_ABC(OP_CALL, 0, 4, 2),
          CREATE_ABC(OP_RETURN, 0, 2, 0),
        ],
      }),
    );
    expect(rt.lua.L.nums[0]).toBe(0);
    const old = rt.ext;
    expect(old).not.toBeNull();
    const ptr = old!.alloc(second.length);
    old!.mem.load(ptr, second);
    const L = rt.lua.L;
    const g = L.getGlobal("_strCom");
    L.top = 0;
    L.base = 1;
    L.ci.length = 1;
    L.ci[0]!.base = 1;
    L.ci[0]!.calling = false;
    L.setFn(0, g.num);
    L.top = 1;
    L.pushInteger(800);
    const tid = L.newTable();
    L.tables[tid]!.setNum(1, { tag: TAG_NUMBER, num: ptr });
    L.tables[tid]!.setNum(2, { tag: TAG_NUMBER, num: second.length });
    L.pushSlot({ tag: TAG_TABLE, num: tid });
    L.pushInteger(0);
    call(L, 0, 1);
    expect(L.nums[0]).toBe(0);
    expect(rt.ext).not.toBeNull();
    expect(rt.ext).not.toBe(old);
  });

  it("unimplemented stays NativeAbiError", () => {
    const rt = new MythroadRuntime();
    expect(() =>
      rt.lua.runCold(
        proto({
          maxstack: 4,
          k: [ks("_strCom"), kn(700), ks("x")],
          code: [CREATE_ABx(OP_GETGLOBAL, 0, 0), CREATE_ABx(OP_LOADK, 1, 1), CREATE_ABx(OP_LOADK, 2, 2), CREATE_ABC(OP_CALL, 0, 3, 2)],
        }),
      ),
    ).toThrow(NativeAbiError);
  });
});
