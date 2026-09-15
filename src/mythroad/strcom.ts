import { errorNameIs, ExtFault, isExtFault, isExtStopped } from "../abi/fault.ts";
import { ExtRuntime } from "../abi/runtime.ts";
import { NativeAbiError } from "../err/errors.ts";
import { LuaState } from "../lua/state.ts";
import { NativeFunction, TAG_NUMBER, TAG_STRING, TAG_TABLE } from "../lua/types.ts";
import { UnsupportedInsn, CpuTrap } from "../hot/cpu.ts";
import { MemoryFault } from "../hot/memory.ts";
import { gunzip, isGzip } from "../mrp/gzip.ts";
import { md5, mrDecode, mrEncode } from "./codec.ts";
import { MR_SUCCESS } from "./constants.ts";
import type { MythroadVfs } from "./vfs.ts";

/**
 * `_strCom(code, str [, extra])` — rxgj `TestCom1` / `_mr_TestCom1`.
 *
 * Confirmed ABI (mythroad.c):
 *   601: read file; push string or nil; return 1
 *   602: exists; push nil or MR_SUCCESS; return 1
 *   800: arm_ext_load(str, len, optint(3)=code); push ext_r0 or status; return 1
 *   801: arm_ext_call(tonumber(3), str, len); push output, ret; return 2
 *   802: same load path as 800
 *
 * Arg 2 is `mr_L_checklstring` → `mrp_tostring_t` / `mrp_strlen_t`
 * (mr_api.c): a table is `{ptr, len}` in the current EXT guest space,
 * not a Lua string. 800/801/802 use that payload; other codes still
 * take a host string.
 */
export function createStrCom(ctx: {
  getVfs: () => MythroadVfs;
  getExt: () => ExtRuntime | null;
  setExt: (rt: ExtRuntime | null) => void;
  setReturnApp?: (pack: string, entry: string) => void;
  setRamPack?: (bytes: Uint8Array) => void;
  onUnknown?: (code: number, L: LuaState) => number;
}): NativeFunction {
  return (L: LuaState) => {
    const code = L.optNumber(1, 0) | 0;
    const extra = code >= 800 && code <= 802 ? L.optNumber(3, 0) | 0 : 0;
    switch (code) {
      case 2: ctx.setRamPack?.(strComPayload(L, 2, ctx.getExt())); return 0;
      case 3:
        ctx.setReturnApp?.(L.checkString(2).s, L.top > L.base + 2 ? L.checkString(3).s : 'start.mr');
        return 0;
      case 601: {
        // _mr_readFile takes a C filename, even when Lua supplies a binary string.
        const data = ctx.getVfs().readFile(L.checkString(2).s.split("\0", 1)[0]!);
        if (!data) {
          L.pushNil();
          return 1;
        }
        L.pushString(data);
        return 1;
      }
      case 602: {
        if (!ctx.getVfs().exists(L.checkString(2).s.split("\0", 1)[0]!)) L.pushNil();
        else L.pushInteger(MR_SUCCESS);
        return 1;
      }
      case 600: {
        // Legacy launcher metadata reader: return a bounded byte slice from
        // an MRP file (offset/length are the historical third/fourth args).
        const data = ctx.getVfs().readFile(L.checkString(2).s);
        const offset = Math.max(0, L.optNumber(3, 0) | 0);
        const length = Math.max(0, L.optNumber(4, 0) | 0);
        if (!data || offset > data.length) { L.pushNil(); return 1; }
        L.pushString(data.subarray(offset, Math.min(data.length, offset + length)));
        return 1;
      }
      case 300: {
        const s = L.checkString(2).s;
        const raw = strBytes(s);
        if (!isGzip(raw)) {
          L.pushString(s);
          return 1;
        }
        try {
          L.pushString(gunzip(raw));
          return 1;
        } catch {
          return 0;
        }
      }
      case 500: {
        L.pushString(md5(strBytes(L.checkString(2).s)));
        return 1;
      }
      case 501: {
        const enc = mrEncode(strBytes(L.checkString(2).s));
        if (!enc) return 0;
        L.pushString(enc);
        return 1;
      }
      case 502: {
        const dec = mrDecode(strBytes(L.checkString(2).s));
        if (!dec) return 0;
        L.pushString(dec);
        return 1;
      }
      case 800:
      case 802: {
        const bytes = strComPayload(L, 2, ctx.getExt());
        const rt = new ExtRuntime();
        ctx.setExt(rt);
        try {
          const loaded = rt.load(bytes, { loadCode: extra });
          if (loaded.kind !== "return") {
            throw new ExtFault(loaded.kind, loaded.pc ?? 0, `_strCom(${code}) load${loaded.detail ? `: ${loaded.detail}` : ""}`);
          }
          L.pushInteger(loaded.ret | 0);
          return 1;
        } catch (e) {
          ctx.setExt(null);
          rethrowExt(e);
        }
      }
      case 801: {
        const rt = ctx.getExt();
        if (!rt) throw new NativeAbiError("_strCom(801) without a loaded EXT");
        const input = strComPayload(L, 2, rt);
        try {
          const out = rt.arm_ext_call(extra, input);
          if (out.kind !== "return") {
            throw new ExtFault(out.kind, out.pc ?? 0, `arm_ext_call${out.detail ? `: ${out.detail}` : ""}`);
          }
          L.pushString(out.output);
          L.pushInteger(out.r0 | 0);
          return 2;
        } catch (e) {
          rethrowExt(e);
        }
      }
      default:
        if (ctx.onUnknown) return ctx.onUnknown(code, L);
        throw new NativeAbiError(`_strCom code ${code} not implemented in Stage 5-C`);
    }
  };
}

function strBytes(s: string): Uint8Array {
  const o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 0xff;
  return o;
}

/** `mrp_tostring_t` + `mrp_strlen_t`: string / number, or table `{ptr,len}`. */
function strComPayload(L: LuaState, idx: number, ext: ExtRuntime | null): Uint8Array {
  const i = L.checkArg(idx);
  const tag = L.tags[i]!;
  if (tag === TAG_STRING) return strBytes(L.strings[L.nums[i]!]!);
  if (tag === TAG_NUMBER) return strBytes(String(L.nums[i]!));
  if (tag === TAG_TABLE) {
    const t = L.tables[L.nums[i]!]!;
    const a = t.getNum(1);
    const b = t.getNum(2);
    const ptr = (a.tag === TAG_NUMBER ? a.num : 0) >>> 0;
    const len = (b.tag === TAG_NUMBER ? b.num : 0) >>> 0;
    if (!ext) throw new NativeAbiError("_strCom table payload without a loaded EXT");
    if (len > 0x20_0000) throw new NativeAbiError("_strCom table payload too large");
    try {
      return new Uint8Array(ext.mem.slice(ptr, len));
    } catch (e) {
      if (e instanceof MemoryFault || errorNameIs(e, "MemoryFault")) {
        throw new NativeAbiError(`_strCom guest slice 0x${ptr.toString(16)}+${len}`);
      }
      throw e;
    }
  }
  throw new NativeAbiError(`argument #${idx} must be a string`);
}

function rethrowExt(e: unknown): never {
  if (
    isExtFault(e) ||
    isExtStopped(e) ||
    e instanceof UnsupportedInsn ||
    errorNameIs(e, "UnsupportedInsn") ||
    e instanceof CpuTrap ||
    errorNameIs(e, "CpuTrap") ||
    e instanceof MemoryFault ||
    errorNameIs(e, "MemoryFault") ||
    e instanceof NativeAbiError ||
    errorNameIs(e, "NativeAbiError")
  ) {
    throw e;
  }
  throw e;
}
