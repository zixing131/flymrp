import { LuaRuntimeError, NativeAbiError, UnknownAbiError } from "../err/errors.ts";
import { LuaState, parseIntStr } from "./state.ts";
import { LuaTable } from "./table.ts";
import {
  NativeFunction,
  TAG_BOOL,
  TAG_FUNCTION,
  TAG_NIL,
  TAG_NUMBER,
  TAG_STRING,
  TAG_TABLE,
} from "./types.ts";

const SPECIALS = "^$*+?.([%-";

export function luaNext(L: LuaState): number {
  const t = L.checkTable(1);
  const keyi = L.absindex(2);
  const keyTag = keyi < L.top ? L.tags[keyi]! : TAG_NIL;
  const keyNum = keyi < L.top ? L.nums[keyi]! : 0;
  const pair = t.next(keyTag, keyNum);
  if (!pair) {
    L.pushNil();
    return 1;
  }
  L.grow(2);
  L.tags[L.top] = pair.k.tag;
  L.nums[L.top] = pair.k.num;
  L.tags[L.top + 1] = pair.v.tag;
  L.nums[L.top + 1] = pair.v.num;
  L.top += 2;
  return 2;
}

export function installLuaStdlib(L: LuaState): void {
  installBase(L);
  installString(L);
  installTable(L);
}

function installBase(L: LuaState): void {
  L.register("_setTab", setMetatable);
  L.register("_getTab", getMetatable);
  L.register("_num", tonumberFn);
  L.register("tonumber", tonumberFn);
  L.register("_str", tostringFn);
  L.register("tostring", tostringFn);
  L.register("_next", luaNext);
  L.register("next", luaNext);
  L.register("_iPairs", ipairsFn);
  L.register("_rawEq", rawequalFn);
  L.register("pcall", protectedCall);
  L.register("_pCall", protectedCall);
}

function protectedCall(L: LuaState): number {
  L.checkAny(1);
  const base = L.base, depth = L.ci.length, func = L.top;
  const count = L.gettop();
  L.grow(count + 1);
  for (let i = 0; i < count; i++) L.copy(base + i, L.top++);
  try {
    requireCall().call(L, func, -1);
  } catch (error) {
    // Host faults and execution limits must still reach the emulator debugger.
    if (error instanceof UnknownAbiError ||
        !(error instanceof LuaRuntimeError || error instanceof NativeAbiError) ||
        L.insnCount > L.insnBudget) throw error;
    L.closeFrom(func);
    L.ci.length = depth;
    L.base = base;
    L.top = func;
    L.pushBoolean(false);
    L.pushString(error.message);
    return 2;
  }
  const results = L.top - func;
  L.grow(1);
  for (let i = L.top; i > func; i--) L.copy(i - 1, i);
  L.setBool(func, 1);
  L.top++;
  return results + 1;
}

function installString(L: LuaState): void {
  const id = L.newTable();
  const put = (name: string, fn: NativeFunction) => L.setTableFn(id, name, fn);
  put("len", strLen);
  put("clen", strClen);
  put("wlen", strWlen);
  put("cstr", strCstr);
  put("wstr", strWstr);
  put("sub", strSub);
  put("lower", strLower);
  put("upper", strUpper);
  put("char", strChar);
  put("rep", strRep);
  put("byte", strByte);
  put("format", strFormat);
  put('new', Ls => {
    const n = Ls.toNumber(Ls.checkArg(1));
    if (n < 0 || n > 16_777_216) throw new LuaRuntimeError('string.new size overflow');
    const id = Ls.newMutableString('\0'.repeat(n));
    Ls.grow(1); Ls.setStr(Ls.top++, id); return 1;
  });
  put('set', Ls => {
    const { s, id } = Ls.checkString(1), position = Ls.toNumber(Ls.checkArg(2));
    const offset = position < 0 ? s.length + position : position - 1;
    const value = Ls.toNumber(Ls.checkArg(3)) & 255;
    if (offset < 0 || offset >= s.length) throw new LuaRuntimeError('set overflow');
    Ls.replaceString(id, s.slice(0, offset) + String.fromCharCode(value) + s.slice(offset + 1)); return 0;
  });
  put('update', Ls => {
    const { s, id } = Ls.checkString(1), src = Ls.checkString(2).s;
    const pos = (n: number, len: number) => n < 0 ? len + n : n - 1;
    const offset = pos(Ls.optNumber(3, 1), s.length), start = pos(Ls.optNumber(4, 1), src.length), end = pos(Ls.optNumber(5, src.length), src.length);
    if (offset < 0 || offset > s.length || start < 0 || start > src.length || end < start - 1) throw new LuaRuntimeError('update overflow');
    // Handset readers request a full buffer even for a shorter final line.
    // slice clamps to the available source bytes instead of reading past it.
    const piece = src.slice(start, end + 1).slice(0, s.length - offset);
    Ls.replaceString(id, s.slice(0, offset) + piece + s.slice(offset + piece.length)); return 0;
  });
  put("find", strFind);
  put("subV", strSubV);
  put("pack", strPack);
  put("unpack", strUnpack);
  put("packLen", strPackLen);
  L.setGlobal("string", TAG_TABLE, id);
}

/** Lua's integer/string formatting; MRP numbers are signed 32-bit integers. */
function strFormat(L: LuaState): number {
  const fmt = L.checkString(1).s;
  let arg = 2, output = '';
  for (let i = 0; i < fmt.length;) {
    if (fmt[i] !== '%') { output += fmt[i++]; continue; }
    if (fmt[i + 1] === '%') { output += '%'; i += 2; continue; }
    const match = /^%([-+ #0]*)(\d{0,3})(?:\.(\d{0,3}))?([cdiouxXs])/.exec(fmt.slice(i));
    if (!match) throw new LuaRuntimeError(`unsupported string.format ${fmt.slice(i, i + 2)}`);
    const [,flags,widthText,precisionText,spec] = match;
    const width = Number(widthText || 0), precision = precisionText === undefined ? undefined : Number(precisionText || 0);
    let text: string, sign = '';
    if (spec === 's') { text = L.checkLString(arg++).s; if (precision !== undefined) text = text.slice(0, precision); }
    else {
      const slot = L.checkArg(arg++);
      const n = L.tags[slot] === TAG_NUMBER ? L.nums[slot] : L.tags[slot] === TAG_STRING ? parseIntStr(L.strings[L.nums[slot]]) : null;
      if (n === null) throw new NativeAbiError('string.format number expected');
      if (spec === 'c') text = String.fromCharCode(n & 255);
      else {
        const signed = spec === 'd' || spec === 'i';
        const value = signed ? Math.abs(n) : n >>> 0;
        text = value.toString(spec === 'o' ? 8 : spec === 'x' || spec === 'X' ? 16 : 10);
        if (spec === 'X') text = text.toUpperCase();
        if (precision === 0 && !value) text = '';
        if (precision !== undefined) text = text.padStart(precision, '0');
        if (signed) sign = n < 0 ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '';
        else if (flags.includes('#') && value) sign = spec === 'x' ? '0x' : spec === 'X' ? '0X' : spec === 'o' && !text.startsWith('0') ? '0' : '';
      }
    }
    const left = flags.includes('-'), zero = flags.includes('0') && !left && precision === undefined && !'sc'.includes(spec);
    const padded = zero ? sign + text.padStart(Math.max(0, width - sign.length), '0') : sign + text;
    output += left ? padded.padEnd(width, ' ') : padded.padStart(width, ' ');
    if (output.length > 1_048_576) throw new LuaRuntimeError('string.format result too large');
    i += match[0].length;
  }
  L.pushString(output); return 1;
}

function installTable(L: LuaState): void {
  const id = L.newTable();
  const put = (name: string, fn: NativeFunction) => L.setTableFn(id, name, fn);
  put("concat", tabConcat);
  put("getArrSize", tabGetn);
  put("setArrSize", tabSetn);
  put("getn", tabGetn);
  put("setn", tabSetn);
  put("insert", tabInsert);
  put("remove", tabRemove);
  put("rawGet", tabRawget);
  put("rawSet", tabRawset);
  put("next", luaNext);
  put("items", tabItems);
  put("pairs", tabPairs);
  put("iPairs", ipairsFn);
  put("sort", tabSort);
  put('foreachi', tabForeachi);
  put('foreach', tabForeach);
  L.setGlobal("table", TAG_TABLE, id);
}

function setMetatable(L: LuaState): number {
  const t = L.checkTable(1);
  const i2 = L.checkArg(2);
  const tt = L.tags[i2]!;
  if (tt !== TAG_NIL && tt !== TAG_TABLE) throw new NativeAbiError("nil or table expected");
  if (t.meta) {
    const prot = L.tables[t.meta]!.getStr(L.tmMetatable);
    if (prot.tag !== TAG_NIL) throw new LuaRuntimeError("cannot change a protected metatable");
  }
  t.meta = tt === TAG_TABLE ? L.nums[i2]! : 0;
  L.copy(L.absindex(1), L.top);
  L.grow(1);
  L.top++;
  return 1;
}

function getMetatable(L: LuaState): number {
  const i = L.checkAny(1);
  if (L.tags[i] !== TAG_TABLE) {
    L.pushNil();
    return 1;
  }
  const t = L.tables[L.nums[i]!]!;
  if (!t.meta) {
    L.pushNil();
    return 1;
  }
  const prot = L.tables[t.meta]!.getStr(L.tmMetatable);
  if (prot.tag !== TAG_NIL) {
    L.pushSlot(prot);
    return 1;
  }
  L.pushSlot({ tag: TAG_TABLE, num: t.meta });
  return 1;
}

function tonumberFn(L: LuaState): number {
  const i = L.checkAny(1);
  const t = L.tags[i]!;
  if (t === TAG_NUMBER) {
    L.pushInteger(L.nums[i]!);
    return 1;
  }
  if (t === TAG_STRING) {
    const n = parseDec(L.strings[L.nums[i]!]!);
    if (n !== null) {
      L.pushInteger(n);
      return 1;
    }
  }
  L.pushNil();
  return 1;
}

function tostringFn(L: LuaState): number {
  const i = L.checkAny(1);
  const t = L.tags[i]!;
  if (t === TAG_STRING) {
    L.copy(i, L.top);
    L.grow(1);
    L.top++;
    return 1;
  }
  if (t === TAG_NUMBER) {
    L.pushString(String(L.nums[i]!));
    return 1;
  }
  if (t === TAG_BOOL) {
    L.pushString(L.nums[i]! ? "true" : "false");
    return 1;
  }
  if (t === TAG_NIL) {
    L.pushString("nil");
    return 1;
  }
  L.pushString(`${typeName(t)}: ${L.nums[i]!}`);
  return 1;
}

function typeName(t: number): string {
  return ["nil", "boolean", "object", "number", "string", "table", "function", "object", "thread"][t] ?? "no value";
}

function rawequalFn(L: LuaState): number {
  const a = L.checkAny(1);
  const b = L.checkAny(2);
  L.pushBoolean(L.tags[a] === L.tags[b] && L.nums[a] === L.nums[b]);
  return 1;
}

function ipairsFn(L: LuaState): number {
  L.checkTable(1);
  const i2 = L.absindex(2);
  if (i2 >= L.top) {
    L.pushCFunction(ipairsFn);
    L.copy(L.absindex(1), L.top);
    L.grow(1);
    L.top++;
    L.pushInteger(0);
    return 3;
  }
  const i = (L.tags[i2] === TAG_NUMBER ? L.nums[i2]! : 0) + 1;
  const v = L.checkTable(1).getNum(i);
  if (v.tag === TAG_NIL) return 0;
  L.pushInteger(i);
  L.pushSlot(v);
  return 2;
}

function tabPairs(L: LuaState): number {
  L.checkTable(1);
  const nx = L.getGlobal("_next");
  L.pushSlot(nx.tag === TAG_FUNCTION ? nx : { tag: TAG_FUNCTION, num: L.newCClosure(luaNext) });
  L.copy(L.absindex(1), L.top);
  L.grow(1);
  L.top++;
  L.pushNil();
  return 3;
}

function parseDec(s: string): number | null {
  let i = 0;
  while (i < s.length && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9)) i++;
  if (i >= s.length) return null;
  let sign = 1;
  if (s.charCodeAt(i) === 45) {
    sign = -1;
    i++;
  } else if (s.charCodeAt(i) === 43) i++;
  let n = 0;
  let any = false;
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) break;
    n = (n * 10 + (c - 48)) | 0;
    any = true;
    i++;
  }
  return any ? (sign * n) | 0 : null;
}

function posrelat(pos: number, len: number): number {
  return pos >= 0 ? pos : (len + pos + 1) | 0;
}

function strLen(L: LuaState): number {
  L.pushInteger(L.checkLString(1).s.length);
  return 1;
}

function strClen(L: LuaState): number {
  const s = L.checkLString(1).s;
  let n = 0;
  while (n < s.length && s.charCodeAt(n) !== 0) n++;
  L.pushInteger(n);
  return 1;
}

function strWlen(L: LuaState): number {
  L.pushInteger(wstrlen(L.checkLString(1).s));
  return 1;
}

function strCstr(L: LuaState): number {
  const s = L.checkLString(1).s;
  let n = 0;
  while (n < s.length && s.charCodeAt(n) !== 0) n++;
  L.pushString(s.slice(0, n));
  return 1;
}

function strWstr(L: LuaState): number {
  const s = L.checkLString(1).s;
  L.pushString(s.slice(0, wstrlen(s)));
  return 1;
}

function wstrlen(s: string): number {
  const lim = s.length & ~1;
  let i = 0;
  while (i + 1 < lim) {
    if (s.charCodeAt(i) === 0 && s.charCodeAt(i + 1) === 0) return i;
    i += 2;
  }
  return s.length < lim + 2 ? s.length : lim;
}

function strSub(L: LuaState): number {
  const { s, id } = L.checkLString(1);
  const start = posrelat(L.optNumber(2, 1) | 0, s.length);
  const end = posrelat(L.optNumber(3, -1) | 0, s.length);
  let i = start < 1 ? 1 : start;
  let j = end > s.length ? s.length : end;
  const value = i <= j ? s.slice(i - 1, j) : '';
  // Reader scripts slice their string.new work buffers, then update the slice.
  // Keep these buffers separate from shared bytecode/name constants.
  if (L.isMutableString(id)) { L.grow(1); L.setStr(L.top++, L.newMutableString(value)); }
  else L.pushString(value);
  return 1;
}

function strLower(L: LuaState): number {
  const s = L.checkLString(1).s;
  let o = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    o += String.fromCharCode(c >= 65 && c <= 90 ? c + 32 : c);
  }
  L.pushString(o);
  return 1;
}

function strUpper(L: LuaState): number {
  const s = L.checkLString(1).s;
  let o = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    o += String.fromCharCode(c >= 97 && c <= 122 ? c - 32 : c);
  }
  L.pushString(o);
  return 1;
}

function strRep(L: LuaState): number {
  const s = L.checkLString(1).s;
  const n = L.optNumber(2, 0) | 0;
  if (n <= 0) {
    L.pushString("");
    return 1;
  }
  L.pushString(s.repeat(n));
  return 1;
}

function strByte(L: LuaState): number {
  const s = L.checkLString(1).s;
  const pos = posrelat(L.optNumber(2, 1) | 0, s.length);
  if (pos <= 0 || pos > s.length) return 0;
  L.pushInteger(s.charCodeAt(pos - 1) & 0xff);
  return 1;
}

function strChar(L: LuaState): number {
  const n = L.gettop();
  let o = "";
  for (let i = 1; i <= n; i++) {
    const c = L.optNumber(i, 0) | 0;
    if ((c & 0xff) !== c) throw new NativeAbiError("invalid value");
    o += String.fromCharCode(c & 0xff);
  }
  L.pushString(o);
  return 1;
}

function strSubV(L: LuaState): number {
  const s = L.checkLString(1).s;
  L.pushInteger(0);
  L.pushInteger(s.length);
  return 2;
}

function memfind(s: string, start: number, p: string): number {
  if (p.length === 0) return start;
  const last = s.length - p.length;
  for (let i = start; i <= last; i++) {
    let ok = true;
    for (let j = 0; j < p.length; j++) {
      if (s.charCodeAt(i + j) !== p.charCodeAt(j)) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function hasSpecial(p: string): boolean {
  for (let i = 0; i < p.length; i++) if (SPECIALS.includes(p[i]!)) return true;
  return false;
}

function strFind(L: LuaState): number {
  const s = L.checkLString(1).s;
  const p = L.checkLString(2).s;
  let init = posrelat(L.optNumber(3, 1) | 0, s.length) - 1;
  if (init < 0) init = 0;
  else if (init > s.length) init = s.length;
  const plain = L.absindex(4) < L.top && !L.isFalse(L.absindex(4));
  if (plain || !hasSpecial(p)) {
    const at = memfind(s, init, p);
    if (at < 0) {
      L.pushNil();
      return 1;
    }
    L.pushInteger(at + 1);
    L.pushInteger(at + p.length);
    return 2;
  }
  const m = matchPlainClass(s, init, p);
  if (!m) {
    L.pushNil();
    return 1;
  }
  L.pushInteger(m[0]);
  L.pushInteger(m[1]);
  return 2;
}

/** Minimal Lua 5.0-style: `^ $ . %a %d %s %w %l %u %%` and literal. Not a full matcher. */
function matchPlainClass(s: string, start: number, p: string): [number, number] | null {
  let anchor = false;
  let pi = 0;
  if (p.charCodeAt(0) === 94) {
    anchor = true;
    pi = 1;
  }
  const dollar = p.charCodeAt(p.length - 1) === 36 && (p.length < 2 || p.charCodeAt(p.length - 2) !== 37);
  const pat = dollar ? p.slice(pi, -1) : p.slice(pi);
  const tryAt = (si: number): number => {
    let i = si;
    let j = 0;
    while (j < pat.length) {
      if (pat.charCodeAt(j) === 37 && j + 1 < pat.length) {
        const cls = pat.charCodeAt(j + 1);
        if (i >= s.length || !matchClass(s.charCodeAt(i) & 0xff, cls)) return -1;
        i++;
        j += 2;
        continue;
      }
      if (pat.charCodeAt(j) === 46) {
        if (i >= s.length) return -1;
        i++;
        j++;
        continue;
      }
      if (i >= s.length || (s.charCodeAt(i) & 0xff) !== (pat.charCodeAt(j) & 0xff)) return -1;
      i++;
      j++;
    }
    return i;
  };
  if (anchor) {
    const end = tryAt(start);
    if (end < 0) return null;
    if (dollar && end !== s.length) return null;
    return [start + 1, end];
  }
  for (let si = start; si <= s.length; si++) {
    const end = tryAt(si);
    if (end >= 0 && (!dollar || end === s.length)) return [si + 1, end];
  }
  return null;
}

function matchClass(c: number, cls: number): boolean {
  const ch = String.fromCharCode(cls);
  switch (ch) {
    case "a":
      return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    case "d":
      return c >= 48 && c <= 57;
    case "s":
      return c === 32 || c === 9 || c === 10 || c === 13;
    case "w":
      return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    case "l":
      return c >= 97 && c <= 122;
    case "u":
      return c >= 65 && c <= 90;
    case "%":
      return c === 37;
    default:
      return c === cls;
  }
}

function getnum(fmt: { s: string; i: number }, df: number): number {
  const c = fmt.s.charCodeAt(fmt.i);
  if (c < 48 || c > 57) return df;
  let a = 0;
  while (fmt.i < fmt.s.length) {
    const d = fmt.s.charCodeAt(fmt.i);
    if (d < 48 || d > 57) break;
    a = a * 10 + (d - 48);
    fmt.i++;
  }
  return a;
}

function optsize(opt: number, fmt: { s: string; i: number }): number {
  const ch = String.fromCharCode(opt);
  switch (ch) {
    case "B":
    case "b":
      return 1;
    case "H":
    case "h":
      return 2;
    case "i":
    case "I":
      return 4;
    case "x":
      return 1;
    case "l":
    case "L": {
      let tmp = getnum(fmt, 4);
      if (tmp > 4) tmp = 4;
      return tmp;
    }
    case "c":
      return getnum(fmt, 1);
    case "s":
    case "p":
      return 0;
    default:
      return 1;
  }
}

function getendian(fmt: { s: string; i: number }): number {
  const c = fmt.s.charCodeAt(fmt.i);
  if (c === 62) {
    fmt.i++;
    return 1;
  }
  if (c === 60) {
    fmt.i++;
    return 0;
  }
  return 0;
}

function getalign(fmt: { s: string; i: number }): number {
  if (fmt.s.charCodeAt(fmt.i) !== 64) return 1;
  fmt.i++;
  return getnum(fmt, 1);
}

function toalign(align: number, opt: number, size: number): number {
  const ch = String.fromCharCode(opt);
  let n = ch === "c" || ch === "s" || ch === "p" ? 1 : size;
  if (n > align) n = align;
  return n || 1;
}

function putInt(out: number[], n: number, endian: number, size: number): void {
  let value = n | 0;
  if (value < 0) value = ((~(-value) + 1) >>> 0) as number;
  else value = value >>> 0;
  if (endian === 0) {
    for (let i = 0; i < size; i++) {
      out.push(value & 0xff);
      value >>>= 8;
    }
  } else {
    const buf: number[] = [];
    for (let i = 0; i < size; i++) {
      buf.push(value & 0xff);
      value >>>= 8;
    }
    for (let i = buf.length - 1; i >= 0; i--) out.push(buf[i]!);
  }
}

function getInt(data: string, pos: number, endian: number, withsign: boolean, size: number): number {
  let l = 0;
  if (endian === 1) {
    for (let i = 0; i < size; i++) l = ((l << 8) | (data.charCodeAt(pos + i) & 0xff)) >>> 0;
  } else {
    for (let i = size - 1; i >= 0; i--) l = ((l << 8) | (data.charCodeAt(pos + i) & 0xff)) >>> 0;
  }
  if (withsign) {
    if (size === 4) return l | 0;
    const bits = size * 8;
    const sign = 1 << (bits - 1);
    if (l & sign) return (l - (1 << bits)) | 0;
  }
  return l | 0;
}

function bytesToBin(b: number[]): string {
  return String.fromCharCode(...b);
}

function strPack(L: LuaState): number {
  const fmt = { s: L.checkLString(1).s, i: 0 };
  const endian = getendian(fmt);
  const align = getalign(fmt);
  let arg = 2;
  let totalsize = 0;
  const out: number[] = [];
  while (fmt.i < fmt.s.length) {
    const opt = fmt.s.charCodeAt(fmt.i++);
    let size = optsize(opt, fmt);
    const al = toalign(align, opt, size);
    while ((totalsize & (al - 1)) !== 0) {
      out.push(0);
      totalsize++;
    }
    const ch = String.fromCharCode(opt);
    switch (ch) {
      case " ":
        break;
      case "b":
      case "B":
      case "h":
      case "H":
      case "l":
      case "L":
      case "i":
      case "I":
        putInt(out, L.optNumber(arg, 0) | 0, endian, size);
        break;
      case "x":
        arg--;
        out.push(0);
        break;
      case "c":
      case "s":
      case "p": {
        const s = L.checkLString(arg).s;
        if (size === 0) size = s.length;
        for (let k = 0; k < size; k++) out.push(k < s.length ? s.charCodeAt(k) & 0xff : 0);
        if (ch === "s") {
          out.push(0);
          size++;
        }
        break;
      }
      default:
        throw new NativeAbiError(`invalid format '${ch}'`);
    }
    totalsize += size;
    arg++;
  }
  L.pushString(bytesToBin(out));
  return 1;
}

function strUnpack(L: LuaState): number {
  const fmt = { s: L.checkLString(1).s, i: 0 };
  const data = L.checkLString(2).s;
  let pos = (L.optNumber(3, 1) | 0) - 1;
  const endian = getendian(fmt);
  const align = getalign(fmt);
  L.settop(2);
  while (fmt.i < fmt.s.length) {
    const opt = fmt.s.charCodeAt(fmt.i++);
    let size = optsize(opt, fmt);
    const al = toalign(align, opt, size);
    pos += al - 1;
    pos -= pos & (al - 1);
    if (pos + size > data.length && String.fromCharCode(opt) !== "s" && String.fromCharCode(opt) !== "p") {
      throw new NativeAbiError("unpack:input too short");
    }
    const ch = String.fromCharCode(opt);
    switch (ch) {
      case " ":
        break;
      case "b":
      case "B":
      case "h":
      case "H":
      case "l":
      case "L":
      case "i":
      case "I":
        if (pos + size > data.length) throw new NativeAbiError("unpack:input too short");
        L.pushInteger(getInt(data, pos, endian, ch === ch.toLowerCase(), size));
        break;
      case "x":
        break;
      case "c":
        if (pos + size > data.length) throw new NativeAbiError("unpack:input too short");
        L.pushString(data.slice(pos, pos + size));
        break;
      case "p": {
        if (L.tags[L.top - 1] !== TAG_NUMBER) throw new LuaRuntimeError("previous size for `p' missing");
        size = L.nums[L.top - 1]!;
        if (pos + size > data.length) throw new NativeAbiError("unpack:input too short");
        L.pushString(data.slice(pos, pos + size));
        break;
      }
      case "s": {
        let e = pos;
        while (e < data.length && data.charCodeAt(e) !== 0) e++;
        if (e >= data.length) throw new LuaRuntimeError("unfinished string in input");
        L.pushString(data.slice(pos, e));
        size = e - pos + 1;
        break;
      }
      default:
        throw new NativeAbiError(`invalid format '${ch}'`);
    }
    pos += size;
  }
  L.pushInteger(pos + 1);
  return L.gettop() - 2;
}

function strPackLen(L: LuaState): number {
  const fmt = { s: L.checkLString(1).s, i: 0 };
  getendian(fmt);
  const align = getalign(fmt);
  let totalsize = 0;
  while (fmt.i < fmt.s.length) {
    const opt = fmt.s.charCodeAt(fmt.i++);
    const size = optsize(opt, fmt);
    const al = toalign(align, opt, size);
    if (size === 0) throw new LuaRuntimeError("meet size 0, check 'c' , 's' or 'p'");
    totalsize += al - 1;
    totalsize -= totalsize & (al - 1);
    totalsize += size;
  }
  L.pushInteger(totalsize);
  return 1;
}

function tabGetn(L: LuaState): number {
  L.pushInteger(L.checkTable(1).getn(L.keyN));
  return 1;
}

function tabForeachi(L: LuaState): number {
  const table = L.checkTable(1), fn = L.slot(L.checkAny(2));
  if (fn.tag !== TAG_FUNCTION) throw new NativeAbiError('function expected');
  const count = table.getn(L.keyN);
  for (let i = 1; i <= count; i++) {
    const top = L.top;
    L.pushSlot(fn); L.pushInteger(i); L.pushSlot(table.getNum(i));
    requireCall().call(L, top, 1);
    if (L.tags[top] !== TAG_NIL) return 1;
    L.top = top;
  }
  return 0;
}

function tabForeach(L: LuaState): number {
  const table = L.checkTable(1), fn = L.slot(L.checkAny(2));
  if (fn.tag !== TAG_FUNCTION) throw new NativeAbiError('function expected');
  let key = { tag: TAG_NIL, num: 0 };
  for (;;) {
    const pair = table.next(key.tag, key.num);
    if (!pair) return 0;
    key = pair.k;
    const top = L.top;
    L.pushSlot(fn); L.pushSlot(pair.k); L.pushSlot(pair.v);
    requireCall().call(L, top, 1);
    if (L.tags[top] !== TAG_NIL) return 1;
    L.top = top;
  }
}

function tabSetn(L: LuaState): number {
  L.checkTable(1).setn(L.keyN, L.optNumber(2, 0) | 0);
  return 0;
}

function tabRawget(L: LuaState): number {
  const t = L.checkTable(1);
  const k = L.checkAny(2);
  L.pushSlot(t.get(L.tags[k]!, L.nums[k]!));
  return 1;
}

function tabRawset(L: LuaState): number {
  const t = L.checkTable(1);
  const k = L.checkAny(2);
  const v = L.checkAny(3);
  t.set(L.tags[k]!, L.nums[k]!, { tag: L.tags[v]!, num: L.nums[v]! });
  L.copy(L.absindex(1), L.absindex(1));
  return 1;
}

function tabItems(L: LuaState): number {
  const t = L.checkTable(1);
  const n = t.getn(L.keyN);
  L.grow(n);
  for (let i = 1; i <= n; i++) L.pushSlot(t.getNum(i));
  return n;
}

function slotToString(L: LuaState, s: { tag: number; num: number }): string | null {
  if (s.tag === TAG_STRING) return L.strings[s.num]!;
  if (s.tag === TAG_NUMBER) return String(s.num);
  return null;
}

function tabConcat(L: LuaState): number {
  const t = L.checkTable(1);
  const sep = L.absindex(2) < L.top && L.tags[L.absindex(2)] === TAG_STRING ? L.strings[L.nums[L.absindex(2)]!]! : "";
  const i0 = L.optNumber(3, 1) | 0;
  let n = L.optNumber(4, 0) | 0;
  if (n === 0) n = t.getn(L.keyN);
  let o = "";
  for (let i = i0; i <= n; i++) {
    const s = slotToString(L, t.getNum(i));
    if (s === null) throw new NativeAbiError("table contains non-strings");
    o += s;
    if (i !== n) o += sep;
  }
  L.pushString(o);
  return 1;
}

function tabInsert(L: LuaState): number {
  const t = L.checkTable(1);
  const v = L.gettop();
  let n = t.getn(L.keyN) + 1;
  let pos: number;
  let vali: number;
  if (v === 2) {
    pos = n;
    vali = L.absindex(2);
  } else {
    pos = L.optNumber(2, n) | 0;
    if (pos > n) n = pos;
    vali = L.absindex(3);
  }
  t.setn(L.keyN, n);
  for (let i = n; i > pos; i--) t.setNum(i, t.getNum(i - 1));
  t.setNum(pos, { tag: L.tags[vali]!, num: L.nums[vali]! });
  return 0;
}

function tabRemove(L: LuaState): number {
  const t = L.checkTable(1);
  let n = t.getn(L.keyN);
  const pos = L.optNumber(2, n) | 0;
  if (n <= 0) {
    L.pushNil();
    return 1;
  }
  const r = t.getNum(pos);
  for (let i = pos; i < n; i++) t.setNum(i, t.getNum(i + 1));
  t.setNum(n, { tag: TAG_NIL, num: 0 });
  t.setn(L.keyN, n - 1);
  L.pushSlot(r);
  return 1;
}

function tabSort(L: LuaState): number {
  const t = L.checkTable(1);
  const n = t.getn(L.keyN);
  const cmpi = L.absindex(2);
  const hasCmp = cmpi < L.top && L.tags[cmpi] === TAG_FUNCTION;
  const cmpId = hasCmp ? L.nums[cmpi]! : 0;
  const less = (a: { tag: number; num: number }, b: { tag: number; num: number }): boolean => {
    if (hasCmp) {
      const f = L.top;
      L.grow(3);
      L.setFn(f, cmpId);
      L.tags[f + 1] = a.tag;
      L.nums[f + 1] = a.num;
      L.tags[f + 2] = b.tag;
      L.nums[f + 2] = b.num;
      L.top = f + 3;
      const { call } = requireCall();
      call(L, f, 1);
      const r = !L.isFalse(f);
      L.top = f;
      return r;
    }
    if (a.tag === TAG_NUMBER && b.tag === TAG_NUMBER) return (a.num | 0) < (b.num | 0);
    if (a.tag === TAG_STRING && b.tag === TAG_STRING) return L.strings[a.num]! < L.strings[b.num]!;
    return false;
  };
  for (let i = 2; i <= n; i++) {
    const key = t.getNum(i);
    let j = i - 1;
    while (j >= 1 && less(key, t.getNum(j))) {
      t.setNum(j + 1, t.getNum(j));
      j--;
    }
    t.setNum(j + 1, key);
  }
  return 0;
}

let callRef: ((L: LuaState, func: number, nresults: number) => void) | null = null;

function requireCall(): { call: (L: LuaState, func: number, nresults: number) => void } {
  if (callRef) return { call: callRef };
  throw new LuaRuntimeError("VM call not bound");
}

export function bindStdlibCall(fn: (L: LuaState, func: number, nresults: number) => void): void {
  callRef = fn;
}

export function tableGetn(t: LuaTable, nId: number): number {
  return t.getn(nId);
}
