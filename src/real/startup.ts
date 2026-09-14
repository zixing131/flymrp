/**
 * Stage 5-C.10Q — real MRP production startup.
 * table[130] case 7 + table[38] code 0x4c6 + table[33] mr_getTime
 * + table[17] sprintf_ (literal bytes + `%d` only)
 * + table[100] pack_filename 128-byte data slot
 * + table[40]/[44]/[45]/[41] current-pack read-only file alias
 * + table[3] memcpy2 + table[10] strcmp2 + table[9] memcmp2
 * + table[1] mr_free registry-only (no origin_mem reuse).
 * Guest inflate completes inside ARM/Thumb; host gunzip is verification-only.
 * table[30] mr_getCharBitmap + table[37] mr_plat(1206) + table[26] mr_printf are REAL_EXECUTED.
 * Production ARM watchdog is configurable (`armInstructionBudget`, default/max 128e6).
 * table[42] mr_info + table[49] mr_mkDir + table[5] strcpy2 are REAL_EXECUTED.
 * table[35] getUserInfo + table[61] getNetworkID + table[15] strlen2 +
 * table[6] strncpy2 + table[18] atoi2 + table[7] strcat2 are REAL_EXECUTED.
 * table[38] platEx 1204 `dsmSwitchPath` Y/B/C is REAL_EXECUTED.
 * table[122]/[123]/[29] DrawRect/DrawText/drawBitmap and [78] winCreate are REAL_EXECUTED.
 * table[37] mr_plat(1205) returns MR_TOUCH_SCREEN (rxgj FULL).
 * AppFS EFS create/write for `gssjxz\\69` is REAL_EXECUTED.
 * table[32]/[31] timer and table[80] getScreenInfo are REAL_EXECUTED.
 * arm_ext_call(0) returns; Lua resumes. Stage 5-C COMPLETE. Stage 5-D STARTED.
 * No cbRet bypass. No gzip/inflate host ABI.
 * No host filesystem / IndexedDB / archive.getResource shortcut.
 */
import { ExtStopKind } from "../abi/fault.ts";
import { DEFAULT_INSN_BUDGET } from "../abi/runtime.ts";
import { AEX_P_ER_RW_LEN_OFF, AEX_P_ER_RW_OFF, MR_MAX_FILENAME_SIZE, PACK_FILENAME_SLOT, tableSlotIndex } from "../abi/layout.ts";
import type { ExtRuntime } from "../abi/runtime.ts";
import { LuaRuntimeError } from "../err/errors.ts";
import { LuaChunkReader } from "../lua/chunk.ts";
import { GET_OPCODE, GETARG_Bx, OP_CALL, OP_GETGLOBAL } from "../lua/opcodes.ts";
import { TAG_FUNCTION, TAG_STRING, TAG_TABLE, type ColdProto } from "../lua/types.ts";
import { MRPArchive } from "../mrp/archive.ts";
import {
  MythroadRuntime,
  NullGraphicsBackend,
  RuntimeTrace,
  readGuestCString,
  type PackFileOp,
} from "../mythroad/index.ts";
import { stackPreview, type TraceRecord } from "../mythroad/probe.ts";
import { inspectBytes } from "./inspect.ts";

export type ExecStatus = "REAL_EXECUTED" | "FORENSIC_BYPASSED" | "NOT_EXECUTED";
export type StagePass = "PASS" | "BLOCKED" | "NOT REACHED";

export const REAL_MRP_BASELINE = {
  slot130: 130,
  slot38: 38,
  slot33: 33,
  slot17: 17,
  slot40: 40,
  p: 0x00a4b728,
  helper: 0x01ea5e9d,
  erRw: 0x0024b704,
  rwLen: 19952,
  stub130: 0x00010208,
  stub38: 0x00010098,
  stub33: 0x00010084,
  stub17: 0x00010044,
  stub40: 0x000100a0,
  stub44: 0x000100b0,
  stub45: 0x000100b4,
  stub41: 0x000100a4,
  stub3: 0x0001000c,
  stub10: 0x00010028,
  stub1: 0x00010004,
  stub9: 0x00010024,
  slot30: 30,
  stub30: 0x00010078,
  slot37: 37,
  stub37: 0x00010094,
  slot26: 26,
  stub26: 0x00010068,
  slot42: 42,
  stub42: 0x000100a8,
  slot49: 49,
  stub49: 0x000100c4,
  slot5: 5,
  stub5: 0x00010014,
  slot35: 35,
  stub35: 0x0001008c,
  slot61: 61,
  stub61: 0x000100f4,
  slot15: 15,
  stub15: 0x0001003c,
  slot6: 6,
  stub6: 0x00010018,
  slot18: 18,
  stub18: 0x00010048,
  slot7: 7,
  stub7: 0x0001001c,
  platex1204: 1204,
  slot122: 122,
  stub122: 0x000101e8,
  stopPc: 0x00010140,
  stopLr: 0x01ea7c79,
  stopR0: 0x01e7ffa8,
  stopR1: 0x00010140,
  infoName: "dbglog.txt",
  infoName2: "gsidbak",
  mkdirName: "gsidbak",
  inflateInsnCount: 1_404_897,
  productionInsnCount: 1_596_592,
  gzipOutLen: 30192,
  gzipAlloc: 30196,
  gzipMagic: [0x1f, 0x8b] as const,
  memcmp9R0: 0x01e7fee8,
  memcmp9R1: 0x01eadefc,
  memcmp9N: 2,
  memcmp9Ret: 0,
  memcmp9CmpPc: 0x01ea7d58,
  memcmp9EqualPc: 0x01ea7d6c,
  budgetStopPc: 0x01ea1ee8,
  budgetStopLr: 0x01ea1f83,
  insnBudget: DEFAULT_INSN_BUDGET,
  totalHitCount: 4864,
  headerReadLen: 16,
  listStart: 240,
  indexLen: 5496,
  firstSeekOffset: 224,
  firstSeekOrigin: 1,
  archiveBytes: 382778,
  case7: 7,
  case7Input1: 0x270f,
  erRw1cAfterCase7: 0x270d,
  platexCode: 0x4c6,
  getTimeErOff: 0x4358,
  storeFn: 0x01ea92c8,
  init2: 0x01ea9254,
  sprintfBuffer: 0x01e7ff74,
  sprintfFormat: 0x01eaf204,
  sprintfExpected: "res_lang0.rc",
  sprintfReturn: 12,
  consumer: 0x01ea8cdc,
  packFilenameSlot: PACK_FILENAME_SLOT,
  packFilenameAddr: 0x00200400,
  packFilenameBytes: MR_MAX_FILENAME_SIZE,
} as const;

/** strcom throws this after arm_ext_call(0) returns kind=abi-fault (budget). */
export const ARM_INSN_BUDGET_THROWN = "EXT fault abi-fault at 0x1ea1ee8 (arm_ext_call: budget exceeded)";
/** Historical 5-C.10Q/R stop. table[30] is now REAL_EXECUTED. */
export const UNKNOWN_SLOT_30_THROWN = "UNKNOWN_REQUIRED_SLOT = 30";
/** Historical stop after getCharBitmap/plat/printf. table[42] is now REAL_EXECUTED. */
export const UNKNOWN_SLOT_42_THROWN = "UNKNOWN_REQUIRED_SLOT = 42";
/** Historical stop after mr_info. table[49] is now REAL_EXECUTED. */
export const UNKNOWN_SLOT_49_THROWN = "UNKNOWN_REQUIRED_SLOT = 49";
/** Historical stop after mkdir/strcpy. table[35] is now REAL_EXECUTED. */
export const UNKNOWN_SLOT_35_THROWN = "UNKNOWN_REQUIRED_SLOT = 35";
/** Historical stop after identity cluster. platEx 1204 SWITCHPATH is now REAL_EXECUTED. */
export const UNKNOWN_PLATEX_1204_THROWN = "unsupported mr_platEx code 1204";
/** Historical stop after SWITCHPATH. table[122] DrawRect is now REAL_EXECUTED. */
export const UNKNOWN_SLOT_122_THROWN = "UNKNOWN_REQUIRED_SLOT = 122";
/** Historical stop after DrawRect cluster. mr_plat(1205) is now REAL_EXECUTED. */
export const UNKNOWN_PLAT_1205_THROWN = "unsupported mr_plat code 1205";
/** Historical stop after plat 1205. AppFS EFS `gssjxz\\69` is now REAL_EXECUTED. */
export const UNKNOWN_OPEN_GSSJXZ69_THROWN = 'unsupported mr_open filename "gssjxz\\\\69"';
/** Historical stop after AppFS. table[32]/[31] timer ABI is now REAL_EXECUTED. */
export const UNKNOWN_SLOT_32_THROWN = "UNKNOWN_REQUIRED_SLOT = 32";
/** Historical stop after timer. table[80] getScreenInfo is now REAL_EXECUTED. */
export const UNKNOWN_SLOT_80_THROWN = "UNKNOWN_REQUIRED_SLOT = 80";
/** Production start() now returns; arm_ext_call(0) + Lua resume completed. */
export const STARTUP_COMPLETED = "(completed)";

export type CpuSnap = {
  pc: number;
  cpsr: number;
  r0: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  r5: number;
  r6: number;
  r7: number;
  r8: number;
  r9: number;
  sp: number;
  lr: number;
  tBit: number;
  insnCount: number;
  stack0: number;
  stack4: number;
  stack8: number;
  stack12: number;
};

export type NativeCallRec = {
  name: string;
  args: unknown[];
  nresults: number | null;
  ok: boolean;
  error?: string;
};

export type TableHit = {
  slot: number;
  callsite: number;
  arguments: [number, number, number, number];
  return: number | null;
  status: ExecStatus;
  note: string;
  pc: number;
  lr: number;
  r9: number;
  sp: number;
};

export type ExtCallRec = {
  code: number;
  ok: boolean;
  r0: number | null;
  kind: string | null;
  insnCount: number | null;
  error?: string;
};

export type ProgressRow = { stage: string; status: StagePass; note: string };

export type StartupFingerprint = {
  firstUnknownSlot: number | null;
  stopPc: number;
  p: number;
  helper: number;
  erRw: number;
  rwLen: number;
  armInsnCount: number;
  luaInsnCount: number;
  luaNativeSeq: string;
  tableSlots: number[];
  vfsReads: string[];
  table33Return: number | null;
  erRwPlus4358: number;
  sprintfFilename: string;
  packFilename: string;
  handleIds: number[];
  readPositions: number[];
  seekPositions: number[];
  headerMatch: boolean;
  indexMatch: boolean;
  firstSeekNewPos: number;
  payloadDest: number;
  payloadMatch: boolean;
  closeRet: number;
  memcmp9Ret: number | null;
  gzipPath: boolean;
  hitCount: number;
  stopKind: string;
};

export type FileReadEvidence = {
  handle: number;
  dest: number;
  requested: number;
  returned: number;
  sourceOffset: number;
  guestBytes: number[];
  archiveBytes: number[];
  match: boolean;
};

export type FileSeekEvidence = {
  handle: number;
  origin: number;
  offset: number;
  oldPos: number;
  newPos: number;
  ret: number;
};

export type PackFileEvidence = {
  headerRead: FileReadEvidence | null;
  firstSeek: FileSeekEvidence | null;
  indexRead: FileReadEvidence | null;
  handleIds: number[];
  ops: PackFileOp[];
  reached40: boolean;
  reached44: boolean;
  reached45: boolean;
  reached41: boolean;
};

export type Memcpy3Snap = {
  dst: number;
  src: number;
  count: number;
  srcBytes: number[];
  dstBytes: number[];
  ret: number;
};

export type Strcmp10Snap = {
  filename: string;
  tempName: string;
  ret: number;
};

export type DirectoryScan = {
  names: string[];
  visited: number;
  matchedName: string;
  filePos: number | null;
  fileLen: number | null;
  archiveOffset: number | null;
  archiveLength: number | null;
  posLenMatch: boolean;
};

export type Table1Live = {
  r0: number;
  r1: number;
  r2: number;
  r3: number;
  headerWord: number;
  headerBytes: number[];
  userPtr: number;
  ret: number | null;
  registryMatch: {
    guestAddr: number;
    size: number;
    alignedSize: number;
    matchesR0: boolean;
    matchesLen: boolean;
    liveAfter: boolean;
  } | null;
  returnConsumer: "none";
};

export type Memcmp9Live = {
  r0: number;
  r1: number;
  r2: number;
  r3: number;
  bufA: number[];
  bufB: number[];
  ret: number | null;
  lr: number;
  sp: number;
  equalPath: boolean;
};

export type ReadFileComplete = {
  name: string;
  filePos: number;
  fileLen: number;
  payloadAddr: number;
  rawAlloc: number;
  payloadMatch: boolean;
  closed: boolean;
  closeRet: number | null;
};

export type SlotStatusRow = {
  slot: number;
  status: ExecStatus;
  guestReached: boolean;
  handlerPresent: boolean;
  note: string;
};

export type RealMrpStartupReport = {
  mrp: {
    path: string;
    size: number;
    sha256: string;
    package: string;
    appname: string;
    resourceCount: number;
  };
  vfs: { reads: string[] };
  lua: {
    realStartMrLoaded: boolean;
    startMrBytes: number;
    opcodeCountMain: number;
    opcodeCountTotal: number;
    opcodeCallCount: number;
    getglobalNames: string[];
    luaInsnCount: number;
    nativeCalls: NativeCallRec[];
    strCom: { code: number; extra: number; ok: boolean; nresults: number | null }[];
    strCom801: {
      code: number;
      extra: number;
      returnedToLua: boolean;
      r0: number | null;
      nresults: number | null;
      error?: string;
    }[];
    chunkReturned: boolean;
    exception: { type: string; message: string; isLuaVmError: boolean } | null;
  };
  ext: {
    mrcLoaderLoad: boolean;
    mrcLoaderRet: number | null;
    cfunctionLoad: boolean;
    cfunctionRet: number | null;
    cfunctionBytes: number;
    p: number;
    helper: number;
    erRw: number;
    rwLen: number;
    erRwPlus1c: number;
    calls: ExtCallRec[];
    packFilenameAddr: number;
    packFilenameBeforeCode0: string;
    packFilenameBytes: number[];
  };
  execution: {
    armExtCallCode: number | null;
    cpu130: CpuSnap | null;
    cpu38: CpuSnap | null;
    cpu33: CpuSnap | null;
    cpu17: CpuSnap | null;
    cpu: CpuSnap | null;
    table38Return: number | null;
    table38ReturnConsumer: string;
    table33Return: number | null;
    table33Store: number | null;
    init2Reached: boolean;
    sprintfFilename: string;
    sprintfReturn: number | null;
    sprintfNulTerminated: boolean;
    sprintfBytes: number[];
    table17Count: number;
    consumer: {
      reached: boolean;
      pc: number;
      r0: number;
      r1: number;
      name: string;
    };
    table125After17: boolean;
    packFilenameAt40: string;
    packFilenameAddr: number;
    file: PackFileEvidence;
    memcpy3: Memcpy3Snap[];
    strcmp10: Strcmp10Snap[];
    directory: DirectoryScan;
    table1: Table1Live | null;
    table1Calls: Table1Live[];
    table9: Memcmp9Live | null;
    table9Calls: Memcmp9Live[];
    gzipPathEntered: boolean;
    readFile: ReadFileComplete | null;
  };
  mrTable: {
    hits: TableHit[];
    slots: SlotStatusRow[];
    handlers: { slot: number; present: boolean }[];
  };
  stop: {
    reason: string;
    pc: number | null;
    slot: number | null;
    owner: string;
  };
  progress: ProgressRow[];
  baseline: {
    deterministic: boolean;
    firstProductionBlocker: string;
    firstPost130Blocker: string;
  };
  forensicPrior: {
    table130: ExecStatus;
    table38: ExecStatus;
    table33: ExecStatus;
    table17: ExecStatus;
    table3: ExecStatus;
    table10: ExecStatus;
    table1: ExecStatus;
    table41: ExecStatus;
    note: string;
  };
  consistency: {
    runs: number;
    fingerprints: StartupFingerprint[];
    mismatches: string[];
  };
  stage5d: "NOT STARTED" | "STARTED";
};

export type StartupOptions = {
  path?: string;
  entry?: string;
  consistencyRuns?: number;
};

function hx(n: number): string {
  return `0x${(n >>> 0).toString(16).padStart(8, "0")}`;
}

function u32le(u8: Uint8Array, off: number): number {
  return (u8[off]! | (u8[off + 1]! << 8) | (u8[off + 2]! << 16) | (u8[off + 3]! << 24)) >>> 0;
}

function sliceBytes(u8: Uint8Array, off: number, n: number): number[] {
  const out: number[] = [];
  const end = Math.min(u8.length, Math.max(0, off) + n);
  const start = Math.max(0, off);
  for (let i = start; i < end; i++) out.push(u8[i]!);
  return out;
}

function decodeGbkCstr(u8: Uint8Array): string {
  let n = 0;
  while (n < u8.length && u8[n]) n++;
  const slice = u8.subarray(0, n);
  try {
    return new TextDecoder("gbk").decode(slice);
  } catch {
    return String.fromCharCode(...slice);
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function errType(e: unknown): string {
  return e instanceof Error ? e.name : typeof e;
}

function countOpcodes(p: ColdProto): { main: number; total: number; calls: number; globals: string[] } {
  let total = 0;
  let calls = 0;
  const globals: string[] = [];
  const walk = (f: ColdProto): void => {
    total += f.code.length;
    for (const insn of f.code) {
      const op = GET_OPCODE(insn);
      if (op === OP_CALL) calls++;
      if (op === OP_GETGLOBAL) {
        const c = f.k[GETARG_Bx(insn)];
        if (c && c.t === TAG_STRING) globals.push(c.s);
      }
    }
    for (const ch of f.p) walk(ch);
  };
  walk(p);
  return { main: p.code.length, total, calls, globals };
}

function wrapSlot(rt: MythroadRuntime, slot: { tag: number; num: number }, name: string, log: NativeCallRec[]): void {
  if (slot.tag !== TAG_FUNCTION) return;
  const cl = rt.lua.L.closures[slot.num];
  if (!cl || !cl.isC) return;
  const orig = cl.fn;
  cl.fn = (L) => {
    const preview = stackPreview(L, 8);
    try {
      const n = orig(L);
      log.push({ name, args: preview.arguments, nresults: n, ok: true });
      return n;
    } catch (e) {
      log.push({ name, args: preview.arguments, nresults: null, ok: false, error: errText(e) });
      throw e;
    }
  };
}

function wrapNamedNatives(rt: MythroadRuntime, log: NativeCallRec[]): void {
  const L = rt.lua.L;
  for (const name of ["_strCom", "_com", "GetSysInfo", "TestCom1", "TestCom"]) {
    wrapSlot(rt, L.getGlobal(name), name, log);
  }
  const str = L.getGlobal("string");
  if (str.tag === TAG_TABLE) {
    const tab = L.tables[str.num]!;
    wrapSlot(rt, tab.getStr(L.internStr("unpack")), "string.unpack", log);
  }
}

function snapCpu(e: ExtRuntime): CpuSnap {
  const r = e.cpu.r;
  const sp = r[13] >>> 0;
  return {
    pc: r[15] >>> 0,
    cpsr: e.cpu.cpsr >>> 0,
    r0: r[0] >>> 0,
    r1: r[1] >>> 0,
    r2: r[2] >>> 0,
    r3: r[3] >>> 0,
    r4: r[4] >>> 0,
    r5: r[5] >>> 0,
    r6: r[6] >>> 0,
    r7: r[7] >>> 0,
    r8: r[8] >>> 0,
    r9: r[9] >>> 0,
    sp,
    lr: r[14] >>> 0,
    tBit: e.cpu.t & 1,
    insnCount: e.cpu.insnCount | 0,
    stack0: e.mem.read32(sp) >>> 0,
    stack4: e.mem.read32((sp + 4) >>> 0) >>> 0,
    stack8: e.mem.read32((sp + 8) >>> 0) >>> 0,
    stack12: e.mem.read32((sp + 12) >>> 0) >>> 0,
  };
}

function strComFromNatives(natives: NativeCallRec[]): RealMrpStartupReport["lua"]["strCom"] {
  const out: RealMrpStartupReport["lua"]["strCom"] = [];
  for (const n of natives) {
    if (n.name !== "_strCom" && n.name !== "TestCom1") continue;
    const code = typeof n.args[0] === "number" ? (n.args[0] as number) | 0 : 0;
    const extra = typeof n.args[2] === "number" ? (n.args[2] as number) | 0 : 0;
    out.push({ code, extra, ok: n.ok, nresults: n.nresults });
  }
  return out;
}

function strCom801(natives: NativeCallRec[], extCalls: ExtCallRec[]): RealMrpStartupReport["lua"]["strCom801"] {
  const srcs = natives.filter((n) => {
    if (n.name !== "_strCom" && n.name !== "TestCom1") return false;
    return typeof n.args[0] === "number" && ((n.args[0] as number) | 0) === 801;
  });
  return srcs.map((n, i) => {
    const extra = typeof n.args[2] === "number" ? (n.args[2] as number) | 0 : 0;
    const call = extCalls[i];
    return {
      code: 801,
      extra,
      returnedToLua: n.ok,
      r0: call && call.ok ? call.r0 : null,
      nresults: n.nresults,
      error: n.error,
    };
  });
}

function vfsReads(records: TraceRecord[]): string[] {
  const out: string[] = [];
  for (const r of records) {
    if (r.operation !== "vfs_read") continue;
    const a = r.arguments as { name?: string } | null;
    if (a && typeof a.name === "string") out.push(a.name);
  }
  return out;
}

function loadRets(records: TraceRecord[]): number[] {
  const out: number[] = [];
  for (const r of records) {
    if (r.operation !== "ext_load_return") continue;
    const a = r.arguments as { ret?: number } | null;
    if (a && typeof a.ret === "number") out.push(a.ret | 0);
  }
  return out;
}

function fingerprintOf(p: {
  firstUnknownSlot: number | null;
  stopPc: number;
  p: number;
  helper: number;
  erRw: number;
  rwLen: number;
  armInsnCount: number;
  luaInsnCount: number;
  natives: NativeCallRec[];
  tableSlots: number[];
  vfs: string[];
  table33Return: number | null;
  erRwPlus4358: number;
  sprintfFilename: string;
  packFilename: string;
  handleIds: number[];
  readPositions: number[];
  seekPositions: number[];
  headerMatch: boolean;
  indexMatch: boolean;
  firstSeekNewPos: number;
  payloadDest: number;
  payloadMatch: boolean;
  closeRet: number;
  memcmp9Ret: number | null;
  gzipPath: boolean;
  hitCount: number;
  stopKind: string;
}): StartupFingerprint {
  return {
    firstUnknownSlot: p.firstUnknownSlot,
    stopPc: p.stopPc,
    p: p.p,
    helper: p.helper,
    erRw: p.erRw,
    rwLen: p.rwLen,
    armInsnCount: p.armInsnCount,
    luaInsnCount: p.luaInsnCount,
    luaNativeSeq: JSON.stringify(
      p.natives.map((n) => ({
        name: n.name,
        args: n.args,
        ok: n.ok,
      })),
    ),
    tableSlots: p.tableSlots.slice(),
    vfsReads: p.vfs.slice(),
    table33Return: p.table33Return,
    erRwPlus4358: p.erRwPlus4358,
    sprintfFilename: p.sprintfFilename,
    packFilename: p.packFilename,
    handleIds: p.handleIds.slice(),
    readPositions: p.readPositions.slice(),
    seekPositions: p.seekPositions.slice(),
    headerMatch: p.headerMatch,
    indexMatch: p.indexMatch,
    firstSeekNewPos: p.firstSeekNewPos,
    payloadDest: p.payloadDest,
    payloadMatch: p.payloadMatch,
    closeRet: p.closeRet,
    memcmp9Ret: p.memcmp9Ret,
    gzipPath: p.gzipPath,
    hitCount: p.hitCount,
    stopKind: p.stopKind,
  };
}

function fpKey(f: StartupFingerprint): string {
  return JSON.stringify(f);
}

function diffFingerprints(a: StartupFingerprint, b: StartupFingerprint): string[] {
  const keys: (keyof StartupFingerprint)[] = [
    "firstUnknownSlot",
    "stopPc",
    "p",
    "helper",
    "erRw",
    "rwLen",
    "armInsnCount",
    "luaInsnCount",
    "luaNativeSeq",
    "tableSlots",
    "vfsReads",
    "table33Return",
    "erRwPlus4358",
    "sprintfFilename",
    "packFilename",
    "handleIds",
    "readPositions",
    "seekPositions",
    "headerMatch",
    "indexMatch",
    "firstSeekNewPos",
    "payloadDest",
    "payloadMatch",
    "closeRet",
    "memcmp9Ret",
    "gzipPath",
    "hitCount",
    "stopKind",
  ];
  const out: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k);
  }
  return out;
}

function describeTable38ReturnConsumer(hits: TableHit[]): string {
  const i = hits.findIndex((h) => h.slot === 38);
  if (i < 0) return "not reached";
  const h38 = hits[i]!;
  if (h38.status !== "REAL_EXECUTED") return "not returned (NOT_EXECUTED)";
  const next = hits[i + 1];
  if (!next) return "none (no following slot)";
  const ret = h38.return;
  const nextR0 = next.arguments[0]!;
  if (ret === 0 && nextR0 === 0) {
    return `LIVE leftover MR_SUCCESS at table[${next.slot}] r0=0 — investigate`;
  }
  return `none / overwritten before use (next table[${next.slot}] r0=${hx(nextR0)})`;
}

function firstUnknownAfter130(hits: TableHit[], unknownSlot: number | null, fallback: string): string {
  const i130 = hits.findIndex((h) => h.slot === 130);
  const later = i130 >= 0 ? hits.slice(i130 + 1) : hits;
  const blocked = later.find((h) => h.status === "NOT_EXECUTED");
  if (blocked) return `table[${blocked.slot}]`;
  if (unknownSlot !== null) return `table[${unknownSlot}]`;
  return fallback;
}

function productionBlocker(run: OneRun): string {
  if (run.unknownSlot !== null) return `table[${run.unknownSlot}]`;
  const code0 = run.extCalls.find((c) => c.code === 0);
  if (code0?.kind === ExtStopKind.AbiFault) return "ARM_INSN_BUDGET";
  if (run.thrown.includes("abi-fault")) return "ARM_INSN_BUDGET";
  if (run.thrown) return run.thrown;
  return "(none)";
}

function slotRow(
  slot: number,
  hits: TableHit[],
  handlers: Map<number, boolean>,
  productionNote: string,
): SlotStatusRow {
  const reached = hits.some((h) => h.slot === slot);
  const present = handlers.get(slot) === true;
  if (reached && present) {
    return {
      slot,
      status: "REAL_EXECUTED",
      guestReached: true,
      handlerPresent: true,
      note: "guest BLX + host handler returned",
    };
  }
  if (reached && !present) {
    return {
      slot,
      status: "NOT_EXECUTED",
      guestReached: true,
      handlerPresent: false,
      note: productionNote,
    };
  }
  return {
    slot,
    status: "NOT_EXECUTED",
    guestReached: false,
    handlerPresent: present,
    note: "not reached on production path",
  };
}

type OneRun = {
  natives: NativeCallRec[];
  hits: TableHit[];
  extCalls: ExtCallRec[];
  cpu130: CpuSnap | null;
  cpu38: CpuSnap | null;
  cpu33: CpuSnap | null;
  cpu17: CpuSnap | null;
  cpu: CpuSnap | null;
  table33Return: number | null;
  erRwPlus4358: number;
  init2Reached: boolean;
  sprintfFilename: string;
  sprintfReturn: number | null;
  sprintfNulTerminated: boolean;
  sprintfBytes: number[];
  table17Count: number;
  consumerReached: boolean;
  consumerR0: number;
  consumerR1: number;
  consumerName: string;
  table125After17: boolean;
  packFilenameAddr: number;
  packFilenameBeforeCode0: string;
  packFilenameAt40: string;
  packFilenameBytes: number[];
  headerRead: FileReadEvidence | null;
  firstSeek: FileSeekEvidence | null;
  indexRead: FileReadEvidence | null;
  fileOps: PackFileOp[];
  memcpy3: Memcpy3Snap[];
  strcmp10: Strcmp10Snap[];
  filePos: number | null;
  fileLen: number | null;
  table1: Table1Live | null;
  table1Calls: Table1Live[];
  table9Calls: Memcmp9Live[];
  gzipPathEntered: boolean;
  payloadRead: FileReadEvidence | null;
  payloadRaw: number | null;
  p: number;
  helper: number;
  erRw: number;
  rwLen: number;
  erRwPlus1c: number;
  luaInsnCount: number;
  unknownSlot: number | null;
  thrown: string;
  thrownType: string;
  isLuaVmError: boolean;
  chunkReturned: boolean;
  startMrBytes: number;
  cfunctionBytes: number;
  handlerMap: Map<number, boolean>;
  owner: string;
  records: TraceRecord[];
  luaLoaded: boolean;
};

function runOnce(mrp: Uint8Array, entry: string): OneRun {
  const tr = new RuntimeTrace();
  const rt = new MythroadRuntime({ graphics: new NullGraphicsBackend(), trace: tr, abiMode: "strict" });
  const natives: NativeCallRec[] = [];
  wrapNamedNatives(rt, natives);

  const hits: TableHit[] = [];
  const extCalls: ExtCallRec[] = [];
  let cpu130: CpuSnap | null = null;
  let cpu38: CpuSnap | null = null;
  let cpu33: CpuSnap | null = null;
  let cpu17: CpuSnap | null = null;
  let cpu: CpuSnap | null = null;
  let p = 0;
  let helper = 0;
  let erRw = 0;
  let rwLen = 0;
  let init2Reached = false;
  let sprintfFilename = "";
  let sprintfReturn: number | null = null;
  let sprintfNulTerminated = false;
  let sprintfBytes: number[] = [];
  let table17Count = 0;
  let consumerReached = false;
  let consumerR0 = 0;
  let consumerR1 = 0;
  let consumerName = "";
  let table125After17 = false;
  let packFilenameAddr = 0;
  let packFilenameBeforeCode0 = "";
  let packFilenameAt40 = "";
  let packFilenameBytes: number[] = [];
  let memcpy3: Memcpy3Snap[] = [];
  let strcmp10: Strcmp10Snap[] = [];
  let table1: Table1Live | null = null;
  const table1Calls: Table1Live[] = [];
  const table9Calls: Memcmp9Live[] = [];
  let payloadRead: FileReadEvidence | null = null;
  let payloadRaw: number | null = null;
  let sawStrcmpMatch = false;
  let filePos: number | null = null;
  let fileLen: number | null = null;
  let headerRead: FileReadEvidence | null = null;
  let firstSeek: FileSeekEvidence | null = null;
  let indexRead: FileReadEvidence | null = null;
  const handlerMap = new Map<number, boolean>();
  const indexLen = u32le(mrp, 4) + 8 - u32le(mrp, 12);

  const origBind = rt.bindExt.bind(rt);
  rt.bindExt = (ext) => {
    origBind(ext);
    const e = rt.ext;
    if (!e) return;
    packFilenameAddr = e.packFilenameAddr();
    packFilenameBytes = [...e.mem.slice(packFilenameAddr, MR_MAX_FILENAME_SIZE)];
    try {
      packFilenameBeforeCode0 = readGuestCString(e.mem, packFilenameAddr, MR_MAX_FILENAME_SIZE);
    } catch {
      packFilenameBeforeCode0 = "";
    }

    const prevFetch = e.cpu.onBeforeFetch;
    e.cpu.onBeforeFetch = (c) => {
      const pc = c.r[15] >>> 0;
      if (pc === REAL_MRP_BASELINE.init2) init2Reached = true;
      if (pc === REAL_MRP_BASELINE.consumer && !consumerReached) {
        consumerReached = true;
        consumerR0 = c.r[0] >>> 0;
        consumerR1 = c.r[1] >>> 0;
        try {
          consumerName = readGuestCString(e.mem, consumerR1, 64);
        } catch {
          consumerName = "";
        }
      }
      return prevFetch ? prevFetch(c) : false;
    };

    const origCall = e.arm_ext_call.bind(e);
    e.arm_ext_call = (code, input, inputAddr, inputLen) => {
      try {
        const out = origCall(code, input, inputAddr, inputLen);
        if (out.kind !== ExtStopKind.Return && !cpu) cpu = snapCpu(e);
        extCalls.push({
          code,
          ok: out.kind === ExtStopKind.Return,
          r0: out.r0 | 0,
          kind: out.kind,
          insnCount: out.insnCount | 0,
        });
        return out;
      } catch (err) {
        if (!cpu) cpu = snapCpu(e);
        extCalls.push({
          code,
          ok: false,
          r0: null,
          kind: null,
          insnCount: e.cpu.insnCount | 0,
          error: errText(err),
        });
        throw err;
      }
    };

    const origD = e.table.dispatch.bind(e.table);
    e.table.dispatch = (c, mem, pc) => {
      const n = tableSlotIndex(pc);
      const had = !!e.table.handlers[n];
      handlerMap.set(n, had);
      const hit: TableHit = {
        slot: n,
        callsite: c.r[14] >>> 0,
        arguments: [c.r[0] >>> 0, c.r[1] >>> 0, c.r[2] >>> 0, c.r[3] >>> 0],
        return: null,
        status: had ? "REAL_EXECUTED" : "NOT_EXECUTED",
        note: had
          ? n === 130
            ? "REAL_EXECUTED case 7 (rxgj FULL)"
            : n === 38
              ? "REAL_EXECUTED mr_platEx (0x4c6 / SWITCHPATH)"
              : n === 33
                ? "REAL_EXECUTED mr_getTime (runtime.clock >>> 0); no Date.now"
                : n === 17
                  ? "REAL_EXECUTED sprintf_ literal+%d (guest-aware; no host va_list)"
                  : n === 40
                    ? "REAL_EXECUTED mr_open current-pack RDONLY (archive.data)"
                    : n === 44
                      ? "REAL_EXECUTED mr_read archive.data"
                      : n === 45
                        ? "REAL_EXECUTED mr_seek"
                        : n === 41
                          ? "REAL_EXECUTED mr_close"
                          : n === 3
                            ? "REAL_EXECUTED memcpy2 forward byte-copy"
                            : n === 10
                              ? "REAL_EXECUTED strcmp2 -1/0/1"
                              : n === 1
                                ? "REAL_EXECUTED mr_free registry-only (no origin_mem reuse)"
                                : n === 9
                                  ? "REAL_EXECUTED memcmp2 unsigned-char exact difference"
                                : "host handler"
          : "NOT_EXECUTED by host",
        pc: pc >>> 0,
        lr: c.r[14] >>> 0,
        r9: c.r[9] >>> 0,
        sp: c.r[13] >>> 0,
      };
      hits.push(hit);
      if (n === 130) {
        cpu130 = snapCpu(e);
        p = e.owners.wrapper.p >>> 0;
        helper = e.owners.wrapper.helper >>> 0;
        erRw = p ? e.mem.read32(p + AEX_P_ER_RW_OFF) >>> 0 : 0;
        rwLen = p ? e.mem.read32(p + AEX_P_ER_RW_LEN_OFF) >>> 0 : 0;
      }
      if (n === 38) cpu38 = snapCpu(e);
      if (n === 33 && !cpu33) cpu33 = snapCpu(e);
      if (n === 17 && !cpu17) cpu17 = snapCpu(e);
      if (n === 17) table17Count++;
      if (n === 125 && table17Count > 0) table125After17 = true;
      if (n === 40 && !packFilenameAt40) {
        try {
          packFilenameAt40 = readGuestCString(mem, c.r[0] >>> 0, MR_MAX_FILENAME_SIZE);
        } catch {
          packFilenameAt40 = "";
        }
      }
      cpu = snapCpu(e);
      handlerMap.set(130, !!e.table.handlers[130]);
      handlerMap.set(38, !!e.table.handlers[38]);
      handlerMap.set(33, !!e.table.handlers[33]);
      handlerMap.set(17, !!e.table.handlers[17]);
      handlerMap.set(40, !!e.table.handlers[40]);
      handlerMap.set(41, !!e.table.handlers[41]);
      handlerMap.set(44, !!e.table.handlers[44]);
      handlerMap.set(45, !!e.table.handlers[45]);
      handlerMap.set(3, !!e.table.handlers[3]);
      handlerMap.set(10, !!e.table.handlers[10]);
      handlerMap.set(1, !!e.table.handlers[1]);
      handlerMap.set(9, !!e.table.handlers[9]);
      handlerMap.set(30, !!e.table.handlers[30]);
      handlerMap.set(37, !!e.table.handlers[37]);
      handlerMap.set(26, !!e.table.handlers[26]);
      handlerMap.set(42, !!e.table.handlers[42]);
      handlerMap.set(49, !!e.table.handlers[49]);
      handlerMap.set(5, !!e.table.handlers[5]);
      handlerMap.set(35, !!e.table.handlers[35]);
      handlerMap.set(0, !!e.table.handlers[0]);
      handlerMap.set(14, !!e.table.handlers[14]);
      handlerMap.set(25, !!e.table.handlers[25]);
      handlerMap.set(125, !!e.table.handlers[125]);
      handlerMap.set(31, !!e.table.handlers[31]);
      handlerMap.set(32, !!e.table.handlers[32]);
      handlerMap.set(80, !!e.table.handlers[80]);
      handlerMap.set(122, !!e.table.handlers[122]);
      handlerMap.set(123, !!e.table.handlers[123]);
      handlerMap.set(29, !!e.table.handlers[29]);
      handlerMap.set(78, !!e.table.handlers[78]);
      const filePosBefore =
        (n === 44 || n === 45) && had ? (rt.mrTable?.files.peek(c.r[0] | 0)?.pos ?? -1) : -1;
      let memcpySrcPreview: number[] = [];
      if (n === 3 && had) {
        const count = c.r[2] >>> 0;
        const src = c.r[1] >>> 0;
        if (count) memcpySrcPreview = [...mem.slice(src, Math.min(count, 16))];
      }
      if (n === 1) {
        const r0 = hit.arguments[0]!;
        const r1 = hit.arguments[1]!;
        let headerBytes: number[] = [];
        let headerWord = 0;
        try {
          headerBytes = [...mem.slice(r0, 8)];
          headerWord = mem.read32(r0) >>> 0;
        } catch {
          headerBytes = [];
        }
        const rec = rt.mrAllocs.find((a) => a.guestAddr === r0);
        const snap: Table1Live = {
          r0,
          r1,
          r2: hit.arguments[2]!,
          r3: hit.arguments[3]!,
          headerWord,
          headerBytes,
          userPtr: (r0 + 4) >>> 0,
          ret: null,
          registryMatch: rec
            ? {
                guestAddr: rec.guestAddr,
                size: rec.size,
                alignedSize: rec.alignedSize,
                matchesR0: rec.guestAddr === r0,
                matchesLen: rec.size === r1,
                liveAfter: rec.live,
              }
            : null,
          returnConsumer: "none",
        };
        table1Calls.push(snap);
        if (!table1) table1 = snap;
      }
      let table9Snap: Memcmp9Live | null = null;
      if (n === 9) {
        const r0 = hit.arguments[0]!;
        const r1 = hit.arguments[1]!;
        let bufA: number[] = [];
        let bufB: number[] = [];
        try {
          bufA = [mem.read8(r0) & 0xff, mem.read8((r0 + 1) >>> 0) & 0xff];
          bufB = [mem.read8(r1) & 0xff, mem.read8((r1 + 1) >>> 0) & 0xff];
        } catch {
          bufA = [];
          bufB = [];
        }
        table9Snap = {
          r0,
          r1,
          r2: hit.arguments[2]!,
          r3: hit.arguments[3]!,
          bufA,
          bufB,
          ret: null,
          lr: hit.lr,
          sp: hit.sp,
          equalPath: false,
        };
      }
      origD(c, mem, pc);
      if (had) hit.return = c.r[0] >>> 0;
      if (table9Snap) {
        table9Snap.ret = (c.r[0] | 0);
        table9Snap.equalPath = table9Snap.ret === 0;
        table9Calls.push(table9Snap);
      }
      if (n === 0 && had && fileLen !== null && hit.arguments[0] === ((fileLen + 4) >>> 0) && payloadRaw === null) {
        payloadRaw = (hit.return ?? 0) >>> 0;
      }
      if (n === 1 && table1Calls.length) {
        const last = table1Calls[table1Calls.length - 1]!;
        last.ret = c.r[0] >>> 0;
        if (last.registryMatch) {
          const rec = rt.mrAllocs.find((a) => a.guestAddr === last.r0);
          last.registryMatch.liveAfter = rec ? rec.live : true;
        }
      }
      if (n === 3 && had) {
        const dst = hit.arguments[0]!;
        const src = hit.arguments[1]!;
        const count = hit.arguments[2]!;
        const nCopy = count > 0 ? Math.min(count, 16) : 0;
        const snap: Memcpy3Snap = {
          dst,
          src,
          count,
          srcBytes: memcpySrcPreview,
          dstBytes: nCopy ? [...mem.slice(dst, nCopy)] : [],
          ret: c.r[0] >>> 0,
        };
        memcpy3.push(snap);
        if (sawStrcmpMatch && count === 4) {
          const word = mem.read32(dst) >>> 0;
          if (filePos === null) filePos = word;
          else if (fileLen === null) fileLen = word;
        }
      }
      if (n === 10 && had) {
        let filename = "";
        let tempName = "";
        try {
          filename = readGuestCString(mem, hit.arguments[0]!, MR_MAX_FILENAME_SIZE);
          tempName = readGuestCString(mem, hit.arguments[1]!, MR_MAX_FILENAME_SIZE);
        } catch {
          filename = "";
          tempName = "";
        }
        const ret = (c.r[0] | 0);
        strcmp10.push({ filename, tempName, ret });
        if (ret === 0) sawStrcmpMatch = true;
      }
      if (n === 44 && had) {
        const dest = hit.arguments[1]!;
        const requested = hit.arguments[2]!;
        const returned = c.r[0] | 0;
        const src = filePosBefore;
        const nCopy = returned > 0 ? returned : 0;
        const guest = nCopy ? [...mem.slice(dest, Math.min(nCopy, 16))] : [];
        const arch = nCopy ? sliceBytes(mrp, src, Math.min(nCopy, 16)) : [];
        const match = nCopy > 0 && mem.compare(dest, mrp.subarray(src, src + nCopy)) === -1;
        const rec: FileReadEvidence = {
          handle: hit.arguments[0]! | 0,
          dest,
          requested,
          returned,
          sourceOffset: src,
          guestBytes: guest,
          archiveBytes: arch,
          match,
        };
        if (!headerRead && requested === REAL_MRP_BASELINE.headerReadLen) headerRead = rec;
        else if (!indexRead && requested === indexLen) indexRead = rec;
        else if (!payloadRead && fileLen !== null && requested === fileLen) payloadRead = rec;
      }
      if (n === 45 && had && !firstSeek) {
        firstSeek = {
          handle: hit.arguments[0]! | 0,
          origin: hit.arguments[2]! | 0,
          offset: hit.arguments[1]! | 0,
          oldPos: filePosBefore,
          newPos: rt.mrTable?.files.peek(hit.arguments[0]! | 0)?.pos ?? -1,
          ret: c.r[0] | 0,
        };
      }
      if (n === 17 && had && !sprintfFilename) {
        const buf = hit.arguments[0]!;
        sprintfReturn = hit.return;
        try {
          sprintfFilename = readGuestCString(mem, buf, 64);
          sprintfBytes = [];
          for (let i = 0; i <= sprintfFilename.length; i++) {
            sprintfBytes.push(mem.read8((buf + i) >>> 0) & 0xff);
          }
          sprintfNulTerminated = sprintfBytes[sprintfFilename.length] === 0;
        } catch {
          sprintfFilename = "";
          sprintfBytes = [];
          sprintfNulTerminated = false;
        }
      }
    };
  };

  let thrown = "";
  let thrownType = "";
  let isLuaVmError = false;
  let chunkReturned = false;
  try {
    rt.loadMrp(mrp);
    rt.start(entry);
    chunkReturned = true;
  } catch (e) {
    thrown = errText(e);
    thrownType = errType(e);
    isLuaVmError = e instanceof LuaRuntimeError;
  }

  const cf = rt.mrReads.find((r) => r.name === "cfunction.ext" && r.lookfor === 0);
  const startRead = tr.records.find((r) => {
    if (r.operation !== "vfs_read") return false;
    return (r.arguments as { name?: string } | null)?.name === "start.mr";
  });

  if (!p && rt.ext) {
    p = rt.ext.owners.wrapper.p >>> 0;
    helper = rt.ext.owners.wrapper.helper >>> 0;
    erRw = p ? rt.ext.mem.read32(p + AEX_P_ER_RW_OFF) >>> 0 : 0;
    rwLen = p ? rt.ext.mem.read32(p + AEX_P_ER_RW_LEN_OFF) >>> 0 : 0;
  }
  const erRwPlus1c = rt.ext && erRw ? rt.ext.mem.read32(erRw + 0x1c) >>> 0 : 0;
  const table33Return = hits.find((h) => h.slot === 33)?.return ?? null;
  const erRwPlus4358 =
    rt.ext && erRw ? rt.ext.mem.read32(erRw + REAL_MRP_BASELINE.getTimeErOff) >>> 0 : 0;

  return {
    natives,
    hits,
    extCalls,
    cpu130,
    cpu38,
    cpu33,
    cpu17,
    cpu,
    table33Return,
    erRwPlus4358,
    init2Reached,
    sprintfFilename,
    sprintfReturn,
    sprintfNulTerminated,
    sprintfBytes,
    table17Count,
    consumerReached,
    consumerR0,
    consumerR1,
    consumerName,
    table125After17,
    packFilenameAddr,
    packFilenameBeforeCode0,
    packFilenameAt40,
    packFilenameBytes,
    headerRead,
    firstSeek,
    indexRead,
    fileOps: rt.mrTable?.files.ops.slice() ?? [],
    memcpy3,
    strcmp10,
    filePos,
    fileLen,
    table1,
    table1Calls,
    table9Calls,
    gzipPathEntered: table9Calls.some(
      (c) =>
        c.equalPath &&
        c.bufA[0] === REAL_MRP_BASELINE.gzipMagic[0] &&
        c.bufA[1] === REAL_MRP_BASELINE.gzipMagic[1] &&
        c.bufB[0] === REAL_MRP_BASELINE.gzipMagic[0] &&
        c.bufB[1] === REAL_MRP_BASELINE.gzipMagic[1],
    ),
    payloadRead,
    payloadRaw,
    p,
    helper,
    erRw,
    rwLen,
    erRwPlus1c,
    luaInsnCount: rt.lua.L.insnCount | 0,
    unknownSlot: rt.unknownRequiredSlot,
    thrown,
    thrownType,
    isLuaVmError,
    chunkReturned,
    startMrBytes: typeof startRead?.returnValue === "number" ? startRead.returnValue : 0,
    cfunctionBytes: cf?.length ?? 0,
    handlerMap,
    owner: rt.packName || "wrapper",
    records: tr.records.slice(),
    luaLoaded: tr.records.some((r) => r.operation === "lua_chunk"),
  };
}

function progressOf(run: OneRun, loads: number[]): ProgressRow[] {
  const code6 = run.extCalls.find((c) => c.code === 6);
  const code0 = run.extCalls.find((c) => c.code === 0);
  const pass = (ok: boolean): StagePass => (ok ? "PASS" : "BLOCKED");
  const i130 = run.hits.findIndex((h) => h.slot === 130);
  const hit130 = i130 >= 0 ? run.hits[i130]! : null;
  const post14 = i130 >= 0 && run.hits.slice(i130 + 1).some((h) => h.slot === 14);
  const hit38 = run.hits.find((h) => h.slot === 38);
  const hit33 = run.hits.find((h) => h.slot === 33);
  const hit17 = run.hits.find((h) => h.slot === 17);
  const hit40 = run.hits.find((h) => h.slot === 40);
  const hit44 = run.hits.find((h) => h.slot === 44);
  const hit45 = run.hits.find((h) => h.slot === 45);
  const hit41 = run.hits.find((h) => h.slot === 41);
  const hit3 = run.hits.find((h) => h.slot === 3);
  const hit10 = run.hits.find((h) => h.slot === 10);
  const hit1 = run.hits.find((h) => h.slot === 1);
  const hit9 = run.hits.find((h) => h.slot === 9);
  const hit30 = run.hits.find((h) => h.slot === 30);
  const hit37 = run.hits.find((h) => h.slot === 37);
  const hit26 = run.hits.find((h) => h.slot === 26);
  const hit42 = run.hits.find((h) => h.slot === 42);
  const hit49 = run.hits.find((h) => h.slot === 49);
  const hit5 = run.hits.find((h) => h.slot === 5);
  const hit35 = run.hits.find((h) => h.slot === 35);
  const hit61 = run.hits.find((h) => h.slot === 61);
  const hit15 = run.hits.find((h) => h.slot === 15);
  const hit6 = run.hits.find((h) => h.slot === 6);
  const hit18 = run.hits.find((h) => h.slot === 18);
  const hit7 = run.hits.find((h) => h.slot === 7);
  const hit122 = run.hits.find((h) => h.slot === 122);
  const hit123 = run.hits.find((h) => h.slot === 123);
  const hit29 = run.hits.find((h) => h.slot === 29);
  const hit78 = run.hits.find((h) => h.slot === 78);
  const switchPathOk = run.hits.some((h) => h.slot === 38 && h.arguments[0] === 1204 && h.return === 0);
  const plat1205ok = run.hits.some((h) => h.slot === 37 && h.arguments[0] === 1205 && h.return === 1001);
  const openEfs69ok = run.fileOps.filter((o) => o.op === "open").length > 4;
  const openEfs69 = run.thrown.includes("gssjxz");
  const hit31 = run.hits.find((h) => h.slot === 31);
  const hit32 = run.hits.find((h) => h.slot === 32);
  const hit80 = run.hits.find((h) => h.slot === 80);
  const t130ok = hit130?.status === "REAL_EXECUTED";
  const t38blocked = !!hit38 && hit38.status === "NOT_EXECUTED";
  const t33blocked = !!hit33 && hit33.status === "NOT_EXECUTED";
  const t17blocked = !!hit17 && hit17.status === "NOT_EXECUTED";
  const t40ok = hit40?.status === "REAL_EXECUTED";
  const t40blocked = !!hit40 && hit40.status === "NOT_EXECUTED";
  const t44ok = hit44?.status === "REAL_EXECUTED";
  const t45ok = hit45?.status === "REAL_EXECUTED";
  const t41ok = hit41?.status === "REAL_EXECUTED";
  const t3ok = hit3?.status === "REAL_EXECUTED";
  const t3blocked = !!hit3 && hit3.status === "NOT_EXECUTED";
  const t10ok = hit10?.status === "REAL_EXECUTED";
  const t10blocked = !!hit10 && hit10.status === "NOT_EXECUTED";
  const t1blocked = !!hit1 && hit1.status === "NOT_EXECUTED";
  const t9blocked = !!hit9 && hit9.status === "NOT_EXECUTED";
  return [
    { stage: "MRP parse", status: "PASS", note: "real app.mrp parsed" },
    {
      stage: "start.mr",
      status: pass(run.luaLoaded && run.startMrBytes > 0),
      note: "first start.mr loaded and executed until host stop",
    },
    {
      stage: "mrc_loader.ext",
      status: pass(loads.includes(3)),
      note: loads.includes(3) ? "arm_ext_load r0=3" : "mrc_loader load not observed",
    },
    {
      stage: "cfunction.ext",
      status: pass(loads.includes(0) && run.cfunctionBytes > 0),
      note: run.cfunctionBytes ? `${run.cfunctionBytes} bytes via table[125]` : "cfunction not loaded",
    },
    {
      stage: "cfunction init",
      status: pass(!!run.p && !!run.helper && run.rwLen > 0),
      note: run.p ? `P=${hx(run.p)} helper=${hx(run.helper)}` : "P not set",
    },
    {
      stage: "code6",
      status: pass(!!code6 && code6.ok && code6.r0 === 0),
      note: code6?.ok ? "arm_ext_call(6) guest return 0" : "code 6 not returned",
    },
    {
      stage: "code0 entry",
      status: pass(!!code0),
      note: code0 ? "arm_ext_call(0) entered mrc_init" : "code 0 not called",
    },
    {
      stage: "table130",
      status: t130ok ? "PASS" : hit130 ? "BLOCKED" : "NOT REACHED",
      note: t130ok ? "REAL_EXECUTED case 7 (rxgj FULL)" : "table[130] not REAL_EXECUTED",
    },
    {
      stage: "table14 post-130",
      status: post14 ? "PASS" : "NOT REACHED",
      note: post14 ? "REAL_EXECUTED memset after TestCom" : "no table[14] after 130",
    },
    {
      stage: "table38",
      status: t38blocked ? "BLOCKED" : hit38?.status === "REAL_EXECUTED" ? "PASS" : hit38 ? "BLOCKED" : "NOT REACHED",
      note: t38blocked
        ? "UNKNOWN_REQUIRED_SLOT; NOT_EXECUTED by host"
        : hit38?.status === "REAL_EXECUTED"
          ? "REAL_EXECUTED mr_platEx(0x4c6, NULL, 0, NULL, NULL, NULL); no side effects"
          : hit38
            ? "reached"
            : "not reached",
    },
    {
      stage: "table33",
      status: t33blocked ? "BLOCKED" : hit33?.status === "REAL_EXECUTED" ? "PASS" : hit33 ? "BLOCKED" : "NOT REACHED",
      note: t33blocked
        ? "UNKNOWN_REQUIRED_SLOT; NOT_EXECUTED by host"
        : hit33?.status === "REAL_EXECUTED"
          ? "REAL_EXECUTED mr_getTime (runtime.clock >>> 0)"
          : hit33
            ? "reached"
            : "not reached on production path",
    },
    {
      stage: "table17",
      status: t17blocked ? "BLOCKED" : hit17?.status === "REAL_EXECUTED" ? "PASS" : hit17 ? "BLOCKED" : "NOT REACHED",
      note: t17blocked
        ? "UNKNOWN_REQUIRED_SLOT; sprintf_ NOT_EXECUTED by host"
        : hit17?.status === "REAL_EXECUTED"
          ? "REAL_EXECUTED sprintf_ literal+%d; LIVE buffer res_lang0.rc"
          : hit17
            ? "reached"
            : "not reached on production path",
    },
    {
      stage: "table40",
      status: t40blocked ? "BLOCKED" : t40ok ? "PASS" : hit40 ? "BLOCKED" : "NOT REACHED",
      note: t40blocked
        ? "UNKNOWN_REQUIRED_SLOT; asm_mr_open NOT_EXECUTED by host"
        : t40ok
          ? "REAL_EXECUTED mr_open(packName, MR_FILE_RDONLY); handle 1; archive.data"
          : hit40
            ? "reached"
            : "not reached on production path",
    },
    {
      stage: "table44",
      status: t44ok ? "PASS" : hit44 ? "BLOCKED" : "NOT REACHED",
      note: t44ok ? "REAL_EXECUTED mr_read of MRPArchive.data" : hit44 ? "reached" : "not reached",
    },
    {
      stage: "table45",
      status: t45ok ? "PASS" : hit45 ? "BLOCKED" : "NOT REACHED",
      note: t45ok ? "REAL_EXECUTED mr_seek (beyond EOF allowed; no clamp)" : hit45 ? "reached" : "not reached",
    },
    {
      stage: "table41",
      status: t41ok ? "PASS" : hit41 ? "BLOCKED" : "NOT REACHED",
      note: t41ok ? "REAL_EXECUTED mr_close" : "not reached; guest still holds the pack handle",
    },
    {
      stage: "table3",
      status: t3blocked ? "BLOCKED" : t3ok ? "PASS" : hit3 ? "BLOCKED" : "NOT REACHED",
      note: t3blocked
        ? "UNKNOWN_REQUIRED_SLOT; memcpy NOT_EXECUTED by host (directory parse)"
        : t3ok
          ? "REAL_EXECUTED memcpy2 forward byte-copy (not memmove)"
          : hit3
            ? "reached"
            : "not reached",
    },
    {
      stage: "table10",
      status: t10blocked ? "BLOCKED" : t10ok ? "PASS" : hit10 ? "BLOCKED" : "NOT REACHED",
      note: t10blocked
        ? "UNKNOWN_REQUIRED_SLOT; strcmp2 NOT_EXECUTED by host"
        : t10ok
          ? "REAL_EXECUTED strcmp2 byte-string -1/0/1"
          : hit10
            ? "reached"
            : "not reached",
    },
    {
      stage: "table1",
      status: t1blocked ? "BLOCKED" : hit1?.status === "REAL_EXECUTED" ? "PASS" : hit1 ? "BLOCKED" : "NOT REACHED",
      note: t1blocked
        ? "UNKNOWN_REQUIRED_SLOT; mr_free NOT_EXECUTED by host"
        : hit1?.status === "REAL_EXECUTED"
          ? "REAL_EXECUTED mr_free registry-only (no origin_mem reuse)"
          : hit1
            ? "reached"
            : "not reached",
    },
    {
      stage: "table9",
      status: t9blocked ? "BLOCKED" : hit9?.status === "REAL_EXECUTED" ? "PASS" : hit9 ? "BLOCKED" : "NOT REACHED",
      note: t9blocked
        ? "UNKNOWN_REQUIRED_SLOT; memcmp2 NOT_EXECUTED by host"
        : hit9?.status === "REAL_EXECUTED"
          ? "REAL_EXECUTED memcmp2 unsigned-char exact difference; LIVE 1F 8B == 1F 8B"
          : hit9
            ? "reached"
            : "not reached",
    },
    {
      stage: "guest inflate",
      status: hit30?.status === "REAL_EXECUTED" || run.gzipPathEntered
        ? "PASS"
        : run.thrown.includes("abi-fault")
          ? "BLOCKED"
          : run.chunkReturned
            ? "PASS"
            : "NOT REACHED",
      note: hit30?.status === "REAL_EXECUTED" || run.gzipPathEntered
        ? `guest inflate completed in ${REAL_MRP_BASELINE.inflateInsnCount} ARM/Thumb insns; output matches reference gunzip`
        : run.thrown.includes("abi-fault")
          ? `ARM insn watchdog ${REAL_MRP_BASELINE.insnBudget}; inflate still running`
          : run.chunkReturned
            ? "arm_ext_call(0) returned"
            : "not reached",
    },
    {
      stage: "table30",
      status: hit30?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 30 ? "BLOCKED" : "NOT REACHED",
      note: hit30?.status === "REAL_EXECUTED"
        ? "REAL_EXECUTED mr_getCharBitmap (gb16 metrics; generated glyphs)"
        : run.unknownSlot === 30
          ? "UNKNOWN_REQUIRED_SLOT; mr_getCharBitmap NOT_EXECUTED by host"
          : "not reached",
    },
    {
      stage: "table37",
      status: hit37?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 37 ? "BLOCKED" : "NOT REACHED",
      note: hit37?.status === "REAL_EXECUTED"
        ? "REAL_EXECUTED mr_plat(1206) → MR_CHINESE (rxgj FULL)"
        : run.unknownSlot === 37
          ? "UNKNOWN_REQUIRED_SLOT; mr_plat NOT_EXECUTED by host"
          : "not reached",
    },
    {
      stage: "table26",
      status: hit26?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 26 ? "BLOCKED" : "NOT REACHED",
      note: hit26?.status === "REAL_EXECUTED"
        ? "REAL_EXECUTED mr_printf literals/%d/%s/width"
        : run.unknownSlot === 26
          ? "UNKNOWN_REQUIRED_SLOT; mr_printf NOT_EXECUTED by host"
          : "not reached",
    },
    {
      stage: "table42",
      status: hit42?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 42 ? "BLOCKED" : "NOT REACHED",
      note: hit42?.status === "REAL_EXECUTED"
        ? "REAL_EXECUTED mr_info (pack name IS_FILE; else IS_INVALID)"
        : run.unknownSlot === 42
          ? "UNKNOWN_REQUIRED_SLOT; mr_info NOT_EXECUTED by host; LIVE name dbglog.txt"
          : "not reached",
    },
    {
      stage: "table49",
      status: hit49?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 49 ? "BLOCKED" : "NOT REACHED",
      note: hit49?.status === "REAL_EXECUTED"
        ? "REAL_EXECUTED mr_mkDir (in-memory EFS dir)"
        : run.unknownSlot === 49
          ? "UNKNOWN_REQUIRED_SLOT; mr_mkDir NOT_EXECUTED by host; LIVE name gsidbak"
          : "not reached",
    },
    {
      stage: "table5",
      status: hit5?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 5 ? "BLOCKED" : "NOT REACHED",
      note: hit5?.status === "REAL_EXECUTED"
        ? "REAL_EXECUTED strcpy2 (NUL-terminated copy)"
        : run.unknownSlot === 5
          ? "UNKNOWN_REQUIRED_SLOT; strcpy2 NOT_EXECUTED by host"
          : "not reached",
    },
    {
      stage: "table35",
      status: hit35?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 35 ? "BLOCKED" : "NOT REACHED",
      note: hit35?.status === "REAL_EXECUTED"
        ? "REAL_EXECUTED mr_getUserInfo (flymrp DeviceProfile)"
        : run.unknownSlot === 35
          ? "UNKNOWN_REQUIRED_SLOT; mr_getUserInfo NOT_EXECUTED by host"
          : "not reached",
    },
    {
      stage: "table61",
      status: hit61?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 61 ? "BLOCKED" : "NOT REACHED",
      note: hit61?.status === "REAL_EXECUTED"
        ? "REAL_EXECUTED mr_getNetworkID → MR_NET_ID_MOBILE (rxgj FULL)"
        : run.unknownSlot === 61
          ? "UNKNOWN_REQUIRED_SLOT; mr_getNetworkID NOT_EXECUTED by host"
          : "not reached",
    },
    {
      stage: "table15",
      status: hit15?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 15 ? "BLOCKED" : "NOT REACHED",
      note: hit15?.status === "REAL_EXECUTED" ? "REAL_EXECUTED strlen2" : "not reached",
    },
    {
      stage: "table6",
      status: hit6?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 6 ? "BLOCKED" : "NOT REACHED",
      note: hit6?.status === "REAL_EXECUTED" ? "REAL_EXECUTED strncpy2" : "not reached",
    },
    {
      stage: "table18",
      status: hit18?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 18 ? "BLOCKED" : "NOT REACHED",
      note: hit18?.status === "REAL_EXECUTED" ? "REAL_EXECUTED atoi2 (rxgj atol2)" : "not reached",
    },
    {
      stage: "table7",
      status: hit7?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 7 ? "BLOCKED" : "NOT REACHED",
      note: hit7?.status === "REAL_EXECUTED" ? "REAL_EXECUTED strcat2" : "not reached",
    },
    {
      stage: "platEx1204",
      status: switchPathOk ? "PASS" : run.thrown.includes("SWITCHPATH") || run.thrown.includes("mr_platEx code 1204") ? "BLOCKED" : "NOT REACHED",
      note: switchPathOk
        ? "REAL_EXECUTED dsmSwitchPath Y query + B:/mythroad/ + c:/mythroad/"
        : "not reached",
    },
    {
      stage: "table122",
      status: hit122?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 122 ? "BLOCKED" : "NOT REACHED",
      note: hit122?.status === "REAL_EXECUTED"
        ? "REAL_EXECUTED DrawRect"
        : run.unknownSlot === 122
          ? "UNKNOWN_REQUIRED_SLOT; asm_DrawRect NOT_EXECUTED by host"
          : "not reached",
    },
    {
      stage: "table123",
      status: hit123?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 123 ? "BLOCKED" : "NOT REACHED",
      note: hit123?.status === "REAL_EXECUTED" ? "REAL_EXECUTED DrawText (generated gb16)" : "not reached",
    },
    {
      stage: "table29",
      status: hit29?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 29 ? "BLOCKED" : "NOT REACHED",
      note: hit29?.status === "REAL_EXECUTED" ? "REAL_EXECUTED mr_drawBitmap present" : "not reached",
    },
    {
      stage: "table78",
      status: hit78?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 78 ? "BLOCKED" : "NOT REACHED",
      note: hit78?.status === "REAL_EXECUTED" ? "REAL_EXECUTED mr_winCreate → MR_IGNORE" : "not reached",
    },
    {
      stage: "plat1205",
      status: plat1205ok ? "PASS" : run.thrown.includes("mr_plat code 1205") ? "BLOCKED" : "NOT REACHED",
      note: plat1205ok ? "REAL_EXECUTED mr_plat(1205) → MR_TOUCH_SCREEN (rxgj FULL)" : "not reached",
    },
    {
      stage: "openEfs69",
      status: openEfs69ok ? "PASS" : openEfs69 ? "BLOCKED" : "NOT REACHED",
      note: openEfs69ok ? "REAL_EXECUTED AppFS create/write gssjxz/69" : "not reached",
    },
    {
      stage: "table32",
      status: hit32?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 32 ? "BLOCKED" : "NOT REACHED",
      note: hit32?.status === "REAL_EXECUTED"
        ? "REAL_EXECUTED mr_timerStop (zero-arg; leftover R0 ignored)"
        : run.unknownSlot === 32
          ? "UNKNOWN_REQUIRED_SLOT; mr_timerStop NOT_EXECUTED"
          : "not reached",
    },
    {
      stage: "table31",
      status: hit31?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 31 ? "BLOCKED" : "NOT REACHED",
      note: hit31?.status === "REAL_EXECUTED"
        ? "REAL_EXECUTED mr_timerStart (LIVE interval 80ms; deterministic clock)"
        : run.unknownSlot === 31
          ? "UNKNOWN_REQUIRED_SLOT; mr_timerStart NOT_EXECUTED"
          : "not reached",
    },
    {
      stage: "table80",
      status: hit80?.status === "REAL_EXECUTED" ? "PASS" : run.unknownSlot === 80 ? "BLOCKED" : "NOT REACHED",
      note: hit80?.status === "REAL_EXECUTED"
        ? "REAL_EXECUTED mr_getScreenInfo (host 240x320 bit=16)"
        : run.unknownSlot === 80
          ? "UNKNOWN_REQUIRED_SLOT; mr_getScreenInfo NOT_EXECUTED"
          : "not reached",
    },
    {
      stage: "arm_ext_call0",
      status: code0?.ok && code0.kind === ExtStopKind.Return ? "PASS" : code0 ? "BLOCKED" : "NOT REACHED",
      note: code0?.ok ? `arm_ext_call(0) NORMAL RETURN r0=${code0.r0} insn=${code0.insnCount}` : "arm_ext_call(0) did not return",
    },
    {
      stage: "lua resume",
      status: run.chunkReturned && !run.thrown ? "PASS" : "BLOCKED",
      note: run.chunkReturned && !run.thrown ? "Lua resumed after _strCom(801,...,0)" : "Lua did not resume",
    },
  ];
}

/**
 * Production-path baseline against a real MRP. No unknown-slot handlers. No cbRet bypass.
 */
export function runRealMrpStartup(mrp: Uint8Array, opts: StartupOptions = {}): RealMrpStartupReport {
  const path = opts.path ?? "test/fixtures/real/app.mrp";
  const entry = opts.entry ?? "start.mr";
  const nRuns = Math.max(1, opts.consistencyRuns ?? 5);

  const inspect = inspectBytes(mrp, { fixtureKind: "real" });
  const arc = MRPArchive.parse(mrp);
  const startBytes = arc.readFile(entry);
  if (!startBytes) throw new LuaRuntimeError(`real ${entry} missing`);
  const proto = LuaChunkReader.load(startBytes);
  const ops = countOpcodes(proto);

  const fingerprints: StartupFingerprint[] = [];
  let first: OneRun | null = null;

  for (let i = 0; i < nRuns; i++) {
    const run = runOnce(mrp, entry);
    if (!first) first = run;
    fingerprints.push(
      fingerprintOf({
        firstUnknownSlot: run.unknownSlot,
        stopPc: run.cpu?.pc ?? 0,
        p: run.p,
        helper: run.helper,
        erRw: run.erRw,
        rwLen: run.rwLen,
        armInsnCount: run.extCalls.find((c) => c.code === 0)?.insnCount ?? run.cpu?.insnCount ?? 0,
        luaInsnCount: run.luaInsnCount,
        natives: run.natives,
        tableSlots: run.hits.map((h) => h.slot),
        vfs: vfsReads(run.records),
        table33Return: run.table33Return,
        erRwPlus4358: run.erRwPlus4358,
        sprintfFilename: run.sprintfFilename,
        packFilename: run.packFilenameAt40,
        handleIds: run.fileOps.filter((o) => o.op === "open").map((o) => o.handle),
        readPositions: run.fileOps.filter((o) => o.op === "read").map((o) => o.pos),
        seekPositions: run.fileOps.filter((o) => o.op === "seek").map((o) => o.pos),
        headerMatch: run.headerRead?.match === true,
        indexMatch: run.indexRead?.match === true,
        firstSeekNewPos: run.firstSeek?.newPos ?? -1,
        payloadDest: run.payloadRead?.dest ?? 0,
        payloadMatch: run.payloadRead?.match === true,
        closeRet: run.fileOps.find((o) => o.op === "close")?.ret ?? -1,
        memcmp9Ret: run.table9Calls[0]?.ret ?? null,
        gzipPath: run.gzipPathEntered,
        hitCount: run.hits.length,
        stopKind: run.extCalls.find((c) => c.code === 0)?.kind ?? "",
      }),
    );
  }

  const run = first!;
  const loads = loadRets(run.records);
  const mismatches = new Set<string>();
  for (let i = 1; i < fingerprints.length; i++) {
    for (const k of diffFingerprints(fingerprints[0]!, fingerprints[i]!)) mismatches.add(k);
  }

  const code0 = [...run.extCalls].reverse().find((c) => !c.ok) ?? run.extCalls.find((c) => c.code === 0) ?? null;
  const strCom = strComFromNatives(run.natives);
  const s801 = strCom801(run.natives, run.extCalls);

  const slots: SlotStatusRow[] = [
    slotRow(0, run.hits, run.handlerMap, ""),
    slotRow(14, run.hits, run.handlerMap, ""),
    slotRow(25, run.hits, run.handlerMap, ""),
    slotRow(125, run.hits, run.handlerMap, ""),
    slotRow(130, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(38, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(33, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(17, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(40, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(44, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(45, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(41, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(3, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(10, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(1, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(9, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(30, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(37, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(26, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(42, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(49, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(5, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(35, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(61, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(15, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(6, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(18, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(7, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(31, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(32, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
    slotRow(80, run.hits, run.handlerMap, "NOT_EXECUTED by host"),
  ];

  const handlerSlots = [0, 14, 25, 125, 130, 38, 33, 17, 40, 44, 45, 41, 3, 10, 1, 9, 30, 37, 26, 42, 49, 5, 35, 61, 15, 6, 18, 7, 31, 32, 80];
  const handlers = handlerSlots.map((slot) => ({
    slot,
    present: run.handlerMap.get(slot) === true,
  }));

  return {
    mrp: {
      path,
      size: mrp.length,
      sha256: inspect.sha256,
      package: arc.header.filename,
      appname: decodeGbkCstr(mrp.subarray(28, 52)),
      resourceCount: arc.entries.length,
    },
    vfs: { reads: vfsReads(run.records) },
    lua: {
      realStartMrLoaded: run.luaLoaded && run.startMrBytes > 0,
      startMrBytes: run.startMrBytes,
      opcodeCountMain: ops.main,
      opcodeCountTotal: ops.total,
      opcodeCallCount: ops.calls,
      getglobalNames: ops.globals,
      luaInsnCount: run.luaInsnCount,
      nativeCalls: run.natives,
      strCom,
      strCom801: s801,
      chunkReturned: run.chunkReturned,
      exception: run.thrown
        ? { type: run.thrownType, message: run.thrown, isLuaVmError: run.isLuaVmError }
        : null,
    },
    ext: {
      mrcLoaderLoad: loads.includes(3),
      mrcLoaderRet: loads.includes(3) ? 3 : loads[0] ?? null,
      cfunctionLoad: loads.includes(0) && run.cfunctionBytes > 0,
      cfunctionRet: loads.includes(0) ? 0 : null,
      cfunctionBytes: run.cfunctionBytes,
      p: run.p,
      helper: run.helper,
      erRw: run.erRw,
      rwLen: run.rwLen,
      erRwPlus1c: run.erRwPlus1c,
      calls: run.extCalls,
      packFilenameAddr: run.packFilenameAddr,
      packFilenameBeforeCode0: run.packFilenameBeforeCode0,
      packFilenameBytes: run.packFilenameBytes,
    },
    execution: {
      armExtCallCode: code0?.code ?? 0,
      cpu130: run.cpu130,
      cpu38: run.cpu38,
      cpu33: run.cpu33,
      cpu17: run.cpu17,
      cpu: run.cpu,
      table38Return: run.hits.find((h) => h.slot === 38)?.return ?? null,
      table38ReturnConsumer: describeTable38ReturnConsumer(run.hits),
      table33Return: run.table33Return,
      table33Store: run.erRwPlus4358,
      init2Reached: run.init2Reached,
      sprintfFilename: run.sprintfFilename,
      sprintfReturn: run.sprintfReturn,
      sprintfNulTerminated: run.sprintfNulTerminated,
      sprintfBytes: run.sprintfBytes,
      table17Count: run.table17Count,
      consumer: {
        reached: run.consumerReached,
        pc: REAL_MRP_BASELINE.consumer,
        r0: run.consumerR0,
        r1: run.consumerR1,
        name: run.consumerName,
      },
      table125After17: run.table125After17,
      packFilenameAt40: run.packFilenameAt40,
      packFilenameAddr: run.packFilenameAddr,
      file: {
        headerRead: run.headerRead,
        firstSeek: run.firstSeek,
        indexRead: run.indexRead,
        handleIds: run.fileOps.filter((o) => o.op === "open").map((o) => o.handle),
        ops: run.fileOps,
        reached40: run.hits.some((h) => h.slot === 40),
        reached44: run.hits.some((h) => h.slot === 44),
        reached45: run.hits.some((h) => h.slot === 45),
        reached41: run.hits.some((h) => h.slot === 41),
      },
      memcpy3: run.memcpy3,
      strcmp10: run.strcmp10,
      directory: directoryOf(run, arc),
      table1: run.table1,
      table1Calls: run.table1Calls,
      table9: run.table9Calls[0] ?? null,
      table9Calls: run.table9Calls,
      gzipPathEntered: run.gzipPathEntered,
      readFile: readFileOf(run),
    },
    mrTable: { hits: run.hits, slots, handlers },
    stop: {
      reason: run.thrown || "(completed)",
      pc: run.cpu?.pc ?? null,
      slot: run.unknownSlot,
      owner: run.owner,
    },
    progress: progressOf(run, loads),
    baseline: {
      deterministic: mismatches.size === 0 && fingerprints.every((f) => fpKey(f) === fpKey(fingerprints[0]!)),
      firstProductionBlocker: productionBlocker(run),
      firstPost130Blocker: firstUnknownAfter130(run.hits, run.unknownSlot, productionBlocker(run)),
    },
    forensicPrior: {
      table130: run.hits.find((h) => h.slot === 130)?.status ?? "NOT_EXECUTED",
      table38: run.hits.find((h) => h.slot === 38)?.status ?? "NOT_EXECUTED",
      table33: run.hits.find((h) => h.slot === 33)?.status ?? "NOT_EXECUTED",
      table17: run.hits.find((h) => h.slot === 17)?.status ?? "NOT_EXECUTED",
      table3: run.hits.find((h) => h.slot === 3)?.status ?? "NOT_EXECUTED",
      table10: run.hits.find((h) => h.slot === 10)?.status ?? "NOT_EXECUTED",
      table1: run.hits.find((h) => h.slot === 1)?.status ?? "NOT_EXECUTED",
      table41: run.hits.find((h) => h.slot === 41)?.status ?? "NOT_EXECUTED",
      note: "This run does not cbRet unknown slots. table[40]/[44]/[45]/[41]/[43] include current-pack RDONLY plus AppFS EFS create/write. table[3] memcpy2 and table[10] strcmp2 are REAL_EXECUTED. table[1] mr_free is registry-only (no origin_mem reuse). table[9] memcmp2 is REAL_EXECUTED (unsigned-char exact difference, not libc-clamped). gzip/inflate is guest-side and completes; host gunzip is verification-only. platEx 1204, DrawRect/DrawText/drawBitmap, winCreate, mr_plat(1205), AppFS EFS, timer 31/32, and getScreenInfo 80 are REAL_EXECUTED. arm_ext_call(0) returns; Lua resumes. Stage 5-C COMPLETE. Stage 5-D STARTED. table[100] pack_filename is a 128-byte data slot populated at bindExt.",
    },
    consistency: {
      runs: nRuns,
      fingerprints,
      mismatches: [...mismatches],
    },
    stage5d: "STARTED",
  };
}

function directoryOf(run: OneRun, arc: MRPArchive): DirectoryScan {
  const names = run.strcmp10.map((s) => s.tempName);
  const matched = run.strcmp10.find((s) => s.ret === 0)?.filename ?? "";
  const ent = matched ? arc.entries.find((e) => e.name === matched) : undefined;
  return {
    names,
    visited: names.length,
    matchedName: matched,
    filePos: run.filePos,
    fileLen: run.fileLen,
    archiveOffset: ent?.offset ?? null,
    archiveLength: ent?.storedLength ?? null,
    posLenMatch:
      ent != null && run.filePos !== null && run.fileLen !== null && ent.offset === run.filePos && ent.storedLength === run.fileLen,
  };
}

function readFileOf(run: OneRun): ReadFileComplete | null {
  const name = run.strcmp10.find((s) => s.ret === 0)?.filename ?? "";
  const close = run.fileOps.find((o) => o.op === "close");
  if (!run.payloadRead || run.filePos === null || run.fileLen === null || !name) return null;
  return {
    name,
    filePos: run.filePos,
    fileLen: run.fileLen,
    payloadAddr: run.payloadRead.dest,
    rawAlloc: run.payloadRaw ?? ((run.payloadRead.dest - 4) >>> 0),
    payloadMatch: run.payloadRead.match,
    closed: close?.ret === 0,
    closeRet: close?.ret ?? null,
  };
}

export function renderRealMrpStartupMarkdown(r: RealMrpStartupReport): string {
  const cpu = r.execution.cpu;
  const cpu130 = r.execution.cpu130;
  const cpu38 = r.execution.cpu38;
  const cpu33 = r.execution.cpu33;
  const cpu17 = r.execution.cpu17;
  const lines = [
    "# Real MRP Startup (Stage 5-C.10Q)",
    "",
    "Production path. table[130] case 7 + table[38] code 0x4c6 + table[33] mr_getTime",
    "+ table[17] sprintf_ (literal bytes + `%d` only).",
    "table[100] is a 128-byte pack_filename data slot populated at bindExt.",
    "table[40]/[44]/[45]/[41] current-pack RDONLY file alias reads MRPArchive.data.",
    "table[3] memcpy2 (forward byte-copy, not memmove) + table[10] strcmp2 (-1/0/1).",
    "table[1] mr_free is registry-only: validates and retires flymrp bump allocations",
    "but does not reproduce rxgj origin_mem free-list reuse/coalescing.",
    "table[9] memcmp2 is REAL_EXECUTED (unsigned char; exact *su1-*su2; early exit).",
    "gzip/inflate is not a host ABI this stage. Guest inflate completes; arm_ext_call(0) returns; Lua resumes.",
    "No forensic bypass. No host filesystem / IndexedDB / getResource shortcut.",
    "Stage 5-C: **COMPLETE**. Stage 5-D: **STARTED** (event loop / frames / input still required).",
    "",
    "Only the observed guest sprintf subset consisting of",
    "literal bytes and %d is currently implemented.",
    "",
    "## MRP",
    "",
    `- path: \`${r.mrp.path}\``,
    `- size: ${r.mrp.size}`,
    `- sha256: \`${r.mrp.sha256}\``,
    `- package: ${r.mrp.package}`,
    `- appname: ${r.mrp.appname}`,
    `- resource count: ${r.mrp.resourceCount}`,
    "",
    "## VFS",
    "",
    ...r.vfs.reads.map((n) => `- ${n}`),
    "",
    "## Lua",
    "",
    `- real start.mr loaded: ${r.lua.realStartMrLoaded}`,
    `- start.mr bytes: ${r.lua.startMrBytes}`,
    `- opcode count (main/total): ${r.lua.opcodeCountMain}/${r.lua.opcodeCountTotal}`,
    `- CALL opcodes: ${r.lua.opcodeCallCount}`,
    `- GETGLOBAL: ${r.lua.getglobalNames.join(", ")}`,
    `- lua insnCount: ${r.lua.luaInsnCount}`,
    `- chunk returned: ${r.lua.chunkReturned}`,
    `- Lua VM error: ${r.lua.exception?.isLuaVmError ? "yes" : "no"}`,
    `- exception: ${r.lua.exception ? `${r.lua.exception.type}: ${r.lua.exception.message}` : "(none)"}`,
    "",
    "### native calls",
    "",
    ...r.lua.nativeCalls.map(
      (n) =>
        `- ${n.ok ? "REAL_EXECUTED" : "NOT_EXECUTED"} ${n.name}(${n.args.map(String).join(", ")}) nresults=${n.nresults}${n.error ? ` error=${n.error}` : ""}`,
    ),
    "",
    "### _strCom",
    "",
    ...r.lua.strCom.map((s) => `- _strCom(${s.code}, …, ${s.extra}) ok=${s.ok} nresults=${s.nresults}`),
    "",
    "### _strCom(801) → Lua",
    "",
    ...r.lua.strCom801.map(
      (s) =>
        `- extra=${s.extra} returnedToLua=${s.returnedToLua} r0=${s.r0} nresults=${s.nresults}${s.error ? ` error=${s.error}` : ""}`,
    ),
    "",
    "## EXT",
    "",
    `- mrc_loader load: ${r.ext.mrcLoaderLoad} ret=${r.ext.mrcLoaderRet}`,
    `- cfunction load: ${r.ext.cfunctionLoad} ret=${r.ext.cfunctionRet} bytes=${r.ext.cfunctionBytes}`,
    `- P: ${hx(r.ext.p)}`,
    `- helper: ${hx(r.ext.helper)}`,
    `- ER_RW: ${hx(r.ext.erRw)}`,
    `- rwLen: ${r.ext.rwLen}`,
    `- ER_RW+0x1c: ${hx(r.ext.erRwPlus1c)}`,
    `- pack_filename addr: ${hx(r.ext.packFilenameAddr)}`,
    `- pack_filename before code0: ${JSON.stringify(r.ext.packFilenameBeforeCode0)}`,
    `- pack_filename at table40: ${JSON.stringify(r.execution.packFilenameAt40)}`,
    "",
    ...r.ext.calls.map(
      (c) =>
        `- arm_ext_call(${c.code}) ok=${c.ok} r0=${c.r0} kind=${c.kind} insns=${c.insnCount}${c.error ? ` error=${c.error}` : ""}`,
    ),
    "",
    "## Execution",
    "",
    `- arm_ext_call code: ${r.execution.armExtCallCode}`,
    `- table38 return: ${r.execution.table38Return === null ? "—" : hx(r.execution.table38Return)}`,
    `- table38 return consumer: ${r.execution.table38ReturnConsumer}`,
    `- table33 return: ${r.execution.table33Return === null ? "—" : hx(r.execution.table33Return)}`,
    `- ER_RW+0x4358 store: ${hx(r.execution.table33Store ?? 0)}`,
    `- 0x01ea9254 reached: ${r.execution.init2Reached}`,
    `- sprintf filename: ${JSON.stringify(r.execution.sprintfFilename)}`,
    `- sprintf return (excluding NUL): ${r.execution.sprintfReturn}`,
    `- sprintf NUL: ${r.execution.sprintfNulTerminated}`,
    `- table[17] count: ${r.execution.table17Count}`,
    `- consumer 0x01ea8cdc reached: ${r.execution.consumer.reached} r0=${hx(r.execution.consumer.r0)} r1=${hx(r.execution.consumer.r1)} name=${JSON.stringify(r.execution.consumer.name)}`,
    `- table[125] after table[17]: ${r.execution.table125After17}`,
    `- file handle ids: ${r.execution.file.handleIds.join(", ") || "(none)"}`,
    `- table[40]/[44]/[45]/[41] reached: ${r.execution.file.reached40}/${r.execution.file.reached44}/${r.execution.file.reached45}/${r.execution.file.reached41}`,
    r.execution.file.headerRead
      ? `- header read: dest=${hx(r.execution.file.headerRead.dest)} requested=${r.execution.file.headerRead.requested} returned=${r.execution.file.headerRead.returned} off=${r.execution.file.headerRead.sourceOffset} match=${r.execution.file.headerRead.match}`
      : "- header read: (none)",
    r.execution.file.firstSeek
      ? `- first seek: handle=${r.execution.file.firstSeek.handle} origin=${r.execution.file.firstSeek.origin} offset=${r.execution.file.firstSeek.offset} ${r.execution.file.firstSeek.oldPos}→${r.execution.file.firstSeek.newPos} ret=${r.execution.file.firstSeek.ret}`
      : "- first seek: (none)",
    r.execution.file.indexRead
      ? `- index read: dest=${hx(r.execution.file.indexRead.dest)} requested=${r.execution.file.indexRead.requested} returned=${r.execution.file.indexRead.returned} off=${r.execution.file.indexRead.sourceOffset} match=${r.execution.file.indexRead.match}`
      : "- index read: (none)",
    `- directory visited: ${r.execution.directory.visited} names=${r.execution.directory.names.join(", ") || "(none)"}`,
    `- directory match: ${JSON.stringify(r.execution.directory.matchedName)} file_pos=${r.execution.directory.filePos} file_len=${r.execution.directory.fileLen}`,
    `- MRPArchive offset/length: ${r.execution.directory.archiveOffset}/${r.execution.directory.archiveLength} posLenMatch=${r.execution.directory.posLenMatch}`,
    r.execution.table1
      ? `- table[1] first: R0=${hx(r.execution.table1.r0)} R1=${r.execution.table1.r1} header=${r.execution.table1.headerWord} user=${hx(r.execution.table1.userPtr)} ret=${r.execution.table1.ret} consumer=${r.execution.table1.returnConsumer}`
      : "- table[1] LIVE: (none)",
    `- table[1] calls: ${r.execution.table1Calls.length}`,
    r.execution.readFile
      ? `- _mr_readFile: name=${JSON.stringify(r.execution.readFile.name)} pos=${r.execution.readFile.filePos} len=${r.execution.readFile.fileLen} payload=${hx(r.execution.readFile.payloadAddr)} raw=${hx(r.execution.readFile.rawAlloc)} match=${r.execution.readFile.payloadMatch} closed=${r.execution.readFile.closed} closeRet=${r.execution.readFile.closeRet}`
      : "- _mr_readFile: (incomplete)",
    r.execution.table9
      ? `- table[9] first: s1=${hx(r.execution.table9.r0)} s2=${hx(r.execution.table9.r1)} n=${r.execution.table9.r2} A=${r.execution.table9.bufA.map((b) => b.toString(16).padStart(2, "0")).join(" ")} B=${r.execution.table9.bufB.map((b) => b.toString(16).padStart(2, "0")).join(" ")} ret=${r.execution.table9.ret} equal=${r.execution.table9.equalPath}`
      : "- table[9] LIVE: (none)",
    `- table[9] calls: ${r.execution.table9Calls.length}`,
    `- gzip path entered: ${r.execution.gzipPathEntered}`,
    cpu130
      ? [
          "### table[130] entry",
          `- PC: ${hx(cpu130.pc)}`,
          `- R0-R3: ${hx(cpu130.r0)} ${hx(cpu130.r1)} ${hx(cpu130.r2)} ${hx(cpu130.r3)}`,
          `- R9: ${hx(cpu130.r9)} SP: ${hx(cpu130.sp)} LR: ${hx(cpu130.lr)}`,
        ].join("\n")
      : "- table[130] CPU: (none)",
    cpu38
      ? [
          "### table[38] entry",
          `- PC: ${hx(cpu38.pc)}`,
          `- R0-R3: ${hx(cpu38.r0)} ${hx(cpu38.r1)} ${hx(cpu38.r2)} ${hx(cpu38.r3)}`,
          `- [SP+0]/[SP+4]: ${hx(cpu38.stack0)} ${hx(cpu38.stack4)}`,
          `- R9: ${hx(cpu38.r9)} SP: ${hx(cpu38.sp)} LR: ${hx(cpu38.lr)}`,
        ].join("\n")
      : "- table[38] CPU: (none)",
    cpu33
      ? [
          "### table[33] entry",
          `- PC: ${hx(cpu33.pc)}`,
          `- R0-R3: ${hx(cpu33.r0)} ${hx(cpu33.r1)} ${hx(cpu33.r2)} ${hx(cpu33.r3)}`,
          `- R9: ${hx(cpu33.r9)} SP: ${hx(cpu33.sp)} LR: ${hx(cpu33.lr)}`,
        ].join("\n")
      : "- table[33] CPU: (none)",
    cpu17
      ? [
          "### table[17] entry",
          `- PC: ${hx(cpu17.pc)}`,
          `- R0-R3: ${hx(cpu17.r0)} ${hx(cpu17.r1)} ${hx(cpu17.r2)} ${hx(cpu17.r3)}`,
          `- R9: ${hx(cpu17.r9)} SP: ${hx(cpu17.sp)} LR: ${hx(cpu17.lr)}`,
          `- insnCount: ${cpu17.insnCount}`,
        ].join("\n")
      : "- table[17] CPU: (none)",
    cpu
      ? [
          "### STOP CPU",
          `- PC: ${hx(cpu.pc)}`,
          `- CPSR: ${hx(cpu.cpsr)}`,
          `- R0-R3: ${hx(cpu.r0)} ${hx(cpu.r1)} ${hx(cpu.r2)} ${hx(cpu.r3)}`,
          `- R4-R8: ${hx(cpu.r4)} ${hx(cpu.r5)} ${hx(cpu.r6)} ${hx(cpu.r7)} ${hx(cpu.r8)}`,
          `- R9: ${hx(cpu.r9)}`,
          `- SP: ${hx(cpu.sp)}`,
          `- LR: ${hx(cpu.lr)}`,
          `- stack: ${hx(cpu.stack0)} ${hx(cpu.stack4)} ${hx(cpu.stack8)} ${hx(cpu.stack12)}`,
          `- T: ${cpu.tBit} insnCount=${cpu.insnCount}`,
        ].join("\n")
      : "- STOP CPU: (none)",
    "",
    "## mr_table",
    "",
    ...r.mrTable.hits.map(
      (h) =>
        `- slot ${h.slot} ${h.status} callsite=${hx(h.callsite)} args=(${h.arguments.map(hx).join(", ")}) return=${h.return === null ? "—" : hx(h.return)} ${h.note}`,
    ),
    "",
    "### slot status (do not mix)",
    "",
    ...r.mrTable.slots.map(
      (s) =>
        `- table[${s.slot}] = ${s.status}${s.guestReached ? " guestReached" : " not-reached"} handler=${s.handlerPresent} — ${s.note}`,
    ),
    "",
    "### handlers",
    "",
    ...r.mrTable.handlers.map((h) => `- table[${h.slot}] handler=${h.present}`),
    "",
    "## STOP",
    "",
    `- reason: ${r.stop.reason}`,
    `- PC: ${r.stop.pc === null ? "—" : hx(r.stop.pc)}`,
    `- slot: ${r.stop.slot}`,
    `- owner: ${r.stop.owner}`,
    "",
    "## Progress (PASS = real guest execution only)",
    "",
    "```",
    "Stage              Status",
    "--------------------------------",
    ...r.progress.map((p) => `${p.stage.padEnd(18)} ${p.status}`),
    "```",
    "",
    ...r.progress.map((p) => `- ${p.stage}: **${p.status}** — ${p.note}`),
    "",
    "## REAL MRP BASELINE",
    "",
    "```",
    "REAL MRP BASELINE:",
    `  deterministic: ${r.baseline.deterministic ? "yes" : "no"}`,
    `  first production blocker: ${r.baseline.firstProductionBlocker}`,
    `  first post-130 blocker: ${r.baseline.firstPost130Blocker}`,
    "```",
    "",
    r.consistency.mismatches.length
      ? `- consistency mismatches: ${r.consistency.mismatches.join(", ")}`
      : `- consistency: ${r.consistency.runs} runs identical`,
    "",
    "## Slot status (this run)",
    "",
    `- 130 = ${r.forensicPrior.table130} (case 7 only; not the full TestCom switch)`,
    `- 38 = ${r.forensicPrior.table38} (0x4c6 + SWITCHPATH Y/B/C; not the complete mr_platEx API)`,
    `- 33 = ${r.forensicPrior.table33} (mr_getTime via runtime.clock >>> 0)`,
    `- 17 = ${r.forensicPrior.table17} (sprintf_ literal+%d only; not %s / full mpaland)`,
    `- 3 = ${r.forensicPrior.table3} (memcpy2 forward byte-copy; not memmove)`,
    `- 10 = ${r.forensicPrior.table10} (strcmp2 unsigned-char -1/0/1)`,
    `- 1 = ${r.forensicPrior.table1} (mr_free registry-only; no origin_mem reuse)`,
    `- 41 = ${r.forensicPrior.table41} (mr_close current-pack handle)`,
    `- 9 = memcmp2 unsigned-char exact difference (not libc-clamped -1/0/1)`,
    `- ${r.forensicPrior.note}`,
    "",
    "## Stage 5-D",
    "",
    r.stage5d,
    "",
  ];
  return lines.join("\n");
}
