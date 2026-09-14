import { LuaRuntimeError, NativeAbiError } from "../err/errors.ts";
import { LuaTable } from "./table.ts";
import {
  CallInfo,
  Closure,
  CClosure,
  LClosure,
  MRP_MAXCCALLS,
  MRP_MINSTACK,
  NativeFunction,
  Proto,
  TAG_BOOL,
  TAG_FUNCTION,
  TAG_LIGHT,
  TAG_NIL,
  TAG_NUMBER,
  TAG_STRING,
  TAG_TABLE,
  UpVal,
} from "./types.ts";

export class LuaState {
  tags: Uint8Array;
  nums: Int32Array;
  stacksize: number;
  top = 0;
  base = 1;
  strings: string[] = [""];
  intern = new Map<string, number>();
  private mutableStrings = new Set<number>();
  tables: LuaTable[] = [null as unknown as LuaTable];
  closures: Closure[] = [null as unknown as Closure];
  natives: NativeFunction[] = [null as unknown as NativeFunction];
  ci: CallInfo[] = [];
  openUpvals: UpVal[] = [];
  globalsId = 0;
  insnCount = 0;
  insnBudget = 1_000_000;
  nCcalls = 0;
  stats = { interns: 0, tables: 0, closures: 0, upvals: 0 };
  tmIndex = 0;
  tmNewindex = 0;
  tmEq = 0;
  tmAdd = 0;
  tmSub = 0;
  tmMul = 0;
  tmDiv = 0;
  tmPow = 0;
  tmOp = 0;
  tmUnm = 0;
  tmLt = 0;
  tmLe = 0;
  tmConcat = 0;
  tmCall = 0;
  tmMetatable = 0;
  keyN = 0;

  constructor(stacksize = 256) {
    this.stacksize = stacksize;
    this.tags = new Uint8Array(stacksize);
    this.nums = new Int32Array(stacksize);
    this.globalsId = this.newTable();
    this.tmIndex = this.internStr("__index");
    this.tmNewindex = this.internStr("__newindex");
    this.tmEq = this.internStr("__eq");
    this.tmAdd = this.internStr("__add");
    this.tmSub = this.internStr("__sub");
    this.tmMul = this.internStr("__mul");
    this.tmDiv = this.internStr("__div");
    this.tmPow = this.internStr("__pow");
    this.tmOp = this.internStr("__op");
    this.tmUnm = this.internStr("__unm");
    this.tmLt = this.internStr("__lt");
    this.tmLe = this.internStr("__le");
    this.tmConcat = this.internStr("__concat");
    this.tmCall = this.internStr("__call");
    this.tmMetatable = this.internStr("__metatable");
    this.keyN = this.internStr("n");
    this.ci.push({
      base: 1,
      top: stacksize,
      pc: 0,
      closure: 0,
      isC: true,
      calling: false,
      savedpc: 0,
      tailcalls: 0,
    });
  }

  get globals(): LuaTable {
    return this.tables[this.globalsId]!;
  }

  internStr(s: string): number {
    const hit = this.intern.get(s);
    if (hit !== undefined) return hit;
    const id = this.strings.length;
    this.strings.push(s);
    this.intern.set(s, id);
    this.stats.interns++;
    return id;
  }

  /** Handset string.new buffers have identity and must never be interned. */
  newMutableString(s: string): number {
    const id = this.strings.length;
    this.strings.push(s);
    this.mutableStrings.add(id);
    return id;
  }

  replaceString(id: number, value: string): void {
    if (!this.mutableStrings.has(id)) throw new LuaRuntimeError('mutable string.new buffer expected');
    this.strings[id] = value;
  }

  isMutableString(id: number): boolean { return this.mutableStrings.has(id); }

  newTable(): number {
    const t = new LuaTable();
    const id = this.tables.length;
    this.tables.push(t);
    this.stats.tables++;
    return id;
  }

  newLClosure(proto: Proto, nups: number, g = this.globalsId): number {
    const cl: LClosure = { isC: false, proto, upvals: new Array(nups), g };
    const id = this.closures.length;
    this.closures.push(cl);
    this.stats.closures++;
    return id;
  }

  newCClosure(fn: NativeFunction): number {
    const nativeId = this.natives.length;
    this.natives.push(fn);
    const cl: CClosure = { isC: true, fn, nativeId, upvals: [] };
    const id = this.closures.length;
    this.closures.push(cl);
    this.stats.closures++;
    return id;
  }

  grow(need: number): void {
    if (this.top + need <= this.stacksize) return;
    const n = Math.max(this.stacksize * 2, this.top + need + 32);
    if (n > 200000) throw new LuaRuntimeError("Lua stack overflow");
    const tags = new Uint8Array(n);
    const nums = new Int32Array(n);
    tags.set(this.tags);
    nums.set(this.nums);
    this.tags = tags;
    this.nums = nums;
    this.stacksize = n;
  }

  setNil(i: number): void {
    this.tags[i] = TAG_NIL;
    this.nums[i] = 0;
  }
  setBool(i: number, b: number): void {
    this.tags[i] = TAG_BOOL;
    this.nums[i] = b ? 1 : 0;
  }
  setNum(i: number, n: number): void {
    this.tags[i] = TAG_NUMBER;
    this.nums[i] = n | 0;
  }
  setStr(i: number, id: number): void {
    this.tags[i] = TAG_STRING;
    this.nums[i] = id;
  }
  setTbl(i: number, id: number): void {
    this.tags[i] = TAG_TABLE;
    this.nums[i] = id;
  }
  setFn(i: number, id: number): void {
    this.tags[i] = TAG_FUNCTION;
    this.nums[i] = id;
  }
  setLight(i: number, p: number): void {
    this.tags[i] = TAG_LIGHT;
    this.nums[i] = p;
  }
  copy(from: number, to: number): void {
    this.tags[to] = this.tags[from]!;
    this.nums[to] = this.nums[from]!;
  }
  isFalse(i: number): boolean {
    const t = this.tags[i]!;
    return t === TAG_NIL || (t === TAG_BOOL && this.nums[i] === 0);
  }

  slot(i: number): { tag: number; num: number } {
    return { tag: this.tags[i]!, num: this.nums[i]! };
  }

  pushNil(): void {
    this.grow(1);
    this.setNil(this.top++);
  }
  pushBoolean(b: boolean): void {
    this.grow(1);
    this.setBool(this.top++, b ? 1 : 0);
  }
  pushInteger(n: number): void {
    this.grow(1);
    this.setNum(this.top++, n | 0);
  }
  pushNumber(n: number): void {
    this.pushInteger(n);
  }
  pushString(s: string | Uint8Array): void {
    this.grow(1);
    this.setStr(this.top++, this.internStr(typeof s === "string" ? s : bytesToBin(s)));
  }
  pushCFunction(fn: NativeFunction): void {
    this.grow(1);
    this.setFn(this.top++, this.newCClosure(fn));
  }
  pushTable(): number {
    const id = this.newTable();
    this.grow(1);
    this.setTbl(this.top++, id);
    return id;
  }
  setTableField(tblId: number, name: string, tag: number, num: number): void {
    this.tables[tblId]!.set(TAG_STRING, this.internStr(name), { tag, num });
  }
  setTableNum(tblId: number, name: string, n: number): void {
    this.setTableField(tblId, name, TAG_NUMBER, n | 0);
  }
  setTableStr(tblId: number, name: string, s: string): void {
    this.setTableField(tblId, name, TAG_STRING, this.internStr(s));
  }
  setTableFn(tblId: number, name: string, fn: NativeFunction): void {
    this.setTableField(tblId, name, TAG_FUNCTION, this.newCClosure(fn));
  }

  absindex(idx: number): number {
    if (idx > 0) return this.base + idx - 1;
    if (idx === 0) throw new NativeAbiError("invalid stack index 0");
    return this.top + idx;
  }

  gettop(): number {
    return this.top - this.base;
  }

  settop(idx: number): void {
    const want = idx >= 0 ? this.base + idx : this.top + idx + 1;
    if (want < this.base) throw new NativeAbiError("settop underflow");
    this.grow(Math.max(0, want - this.top));
    while (this.top < want) this.setNil(this.top++);
    this.top = want;
  }

  checkArg(idx: number): number {
    const i = this.absindex(idx);
    if (i < this.base || i >= this.top) throw new NativeAbiError(`missing argument #${idx}`);
    return i;
  }

  optNumber(idx: number, def = 0): number {
    const i = this.absindex(idx);
    if (i >= this.top) return def;
    return this.toNumber(i);
  }

  toNumber(i: number): number {
    const t = this.tags[i]!;
    if (t === TAG_NUMBER) return this.nums[i]!;
    if (t === TAG_STRING) {
      const n = parseIntStr(this.strings[this.nums[i]!]!);
      if (n !== null) return n;
    }
    return 0;
  }

  checkString(idx: number): { s: string; id: number } {
    const i = this.checkArg(idx);
    if (this.tags[i] !== TAG_STRING) throw new NativeAbiError(`argument #${idx} must be a string`);
    const id = this.nums[i]!;
    return { s: this.strings[id]!, id };
  }

  /** mr_L_checklstring: string or number→decimal. */
  checkLString(idx: number): { s: string; id: number } {
    const i = this.checkArg(idx);
    if (this.tags[i] === TAG_STRING) {
      const id = this.nums[i]!;
      return { s: this.strings[id]!, id };
    }
    if (this.tags[i] === TAG_NUMBER) {
      const s = String(this.nums[i]!);
      return { s, id: this.internStr(s) };
    }
    throw new NativeAbiError(`argument #${idx} must be a string`);
  }

  pushSlot(s: { tag: number; num: number }): void {
    this.grow(1);
    this.tags[this.top] = s.tag;
    this.nums[this.top] = s.num;
    this.top++;
  }

  optString(idx: number, def = ""): string {
    const i = this.absindex(idx);
    if (i >= this.top) return def;
    if (this.tags[i] === TAG_STRING) return this.strings[this.nums[i]!]!;
    if (this.tags[i] === TAG_NUMBER) return String(this.nums[i]!);
    return def;
  }

  checkAny(idx: number): number {
    return this.checkArg(idx);
  }

  checkTable(idx: number): LuaTable {
    const i = this.checkArg(idx);
    if (this.tags[i] !== TAG_TABLE) throw new NativeAbiError(`argument #${idx} must be a table`);
    return this.tables[this.nums[i]!]!;
  }

  register(name: string, fn: NativeFunction): void {
    const id = this.newCClosure(fn);
    this.globals.set(TAG_STRING, this.internStr(name), { tag: TAG_FUNCTION, num: id });
  }

  getGlobal(name: string): { tag: number; num: number } {
    return this.globals.getStr(this.internStr(name));
  }

  setGlobal(name: string, tag: number, num: number): void {
    this.globals.set(TAG_STRING, this.internStr(name), { tag, num });
  }

  findUpval(slot: number): UpVal {
    for (const u of this.openUpvals) {
      if (u.open && u.slot === slot) return u;
    }
    const u: UpVal = { open: true, slot, tag: TAG_NIL, num: 0 };
    this.openUpvals.push(u);
    this.stats.upvals++;
    return u;
  }

  closeFrom(level: number): void {
    const keep: UpVal[] = [];
    for (const u of this.openUpvals) {
      if (u.open && u.slot >= level) {
        u.tag = this.tags[u.slot]!;
        u.num = this.nums[u.slot]!;
        u.open = false;
      } else keep.push(u);
    }
    this.openUpvals = keep;
  }

  readUp(u: UpVal): { tag: number; num: number } {
    if (u.open) return { tag: this.tags[u.slot]!, num: this.nums[u.slot]! };
    return { tag: u.tag, num: u.num };
  }

  writeUp(u: UpVal, tag: number, num: number): void {
    if (u.open) {
      this.tags[u.slot] = tag;
      this.nums[u.slot] = num;
    } else {
      u.tag = tag;
      u.num = num;
    }
  }

  enterC(): void {
    if (++this.nCcalls >= MRP_MAXCCALLS) throw new LuaRuntimeError("stack(C) overflow");
  }
  leaveC(): void {
    this.nCcalls--;
  }

  checkstack(n: number): void {
    this.grow(n + MRP_MINSTACK);
  }
}

function bytesToBin(u8: Uint8Array): string {
  const CHUNK = 0x2000;
  if (u8.length <= CHUNK) return String.fromCharCode(...u8);
  let s = "";
  for (let i = 0; i < u8.length; i += CHUNK) s += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  return s;
}

export function parseIntStr(s: string): number | null {
  let i = 0;
  while (i < s.length && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9 || s.charCodeAt(i) === 10 || s.charCodeAt(i) === 13)) i++;
  if (i >= s.length) return null;
  let sign = 1;
  if (s.charCodeAt(i) === 45) {
    sign = -1;
    i++;
  } else if (s.charCodeAt(i) === 43) i++;
  if (i >= s.length) return null;
  let n = 0;
  let any = false;
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) break;
    n = (n * 10 + (c - 48)) | 0;
    any = true;
    i++;
  }
  if (!any) return null;
  while (i < s.length && (s.charCodeAt(i) === 32 || s.charCodeAt(i) === 9 || s.charCodeAt(i) === 10 || s.charCodeAt(i) === 13)) i++;
  if (i !== s.length) return null;
  return (sign * n) | 0;
}

export function i32(n: number): number {
  return n | 0;
}
