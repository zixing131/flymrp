/**
 * Stage 5-C.10N — table[1] / mr_free ownership + allocation header forensics.
 * Read-only. Does not register table[1]. Does not change table[0]/[3]/[10] or the file backend.
 * Stage 5-D is not started.
 */
import { AEX_P_ER_RW_OFF, EXT_CODE_ADDR, tableSlotIndex } from "../abi/layout.ts";
import type { ExtRuntime } from "../abi/runtime.ts";
import { decodeThumb16, isThumb32Prefix } from "../hot/decode-thumb16.ts";
import { decodeThumb32 } from "../hot/decode-thumb32.ts";
import { OP_NAMES, Op, unpackW0 } from "../hot/opcodes.ts";
import { MR_SUCCESS } from "../mythroad/constants.ts";
import { MythroadRuntime, NullGraphicsBackend, RuntimeTrace, type AllocRecord } from "../mythroad/index.ts";
import { extractNamedExt } from "./code6.ts";
import { runProductionCode0Fault } from "./code0chain.ts";
import { FILECHAIN } from "./filechain.ts";
import { scanMrTableSlotCalls, type MrTableCall, type ThumbLine } from "./memcpy3.ts";

const PACK = new Uint32Array(3);

/** Pack-local addresses. Forensics only — not an implementation. */
export const FREE1 = {
  slot: 1,
  mallocSlot: 0,
  stub: 0x00010004,
  mallocWrap: 0x01ea8918,
  mallocAdd4: 0x01ea8924,
  mallocStoreSize: 0x01ea892c,
  freeWrap: 0x01ea7ab4,
  freeWrapBlx: 0x01ea7ac4,
  liveCaller: 0x01ea904e,
  liveRet: 0x01ea9052,
  liveLr: 0x01ea7ac7,
  liveCallerLr: 0x01ea9053,
  liveSp: 0x01e7ff00,
  liveInsn: 507,
  header: 0x00251a78,
  payload: 0x00251a7c,
  headerWord: 128,
  table1Len: 132,
  table0Request: 132,
  payloadRequest: 128,
  alignedSize: 136,
  indexHeader: 0x002504f8,
  indexTable0: 5500,
  indexPayload: 0x002504fc,
  indexLen: 5496,
  indexAligned: 5504,
  filePos: 7065,
  fileLen: 17174,
  p: 0x00a4b728,
  helper: 0x01ea5e9d,
  erRw: 0x0024b704,
  r5: 1,
  r6: 0x01e7ff74,
  r7: 0x00251a7c,
  cpsr: 0x10,
  payloadMallocBl: 0x01ea90b8,
  payloadSeekBl: 0x01ea90d0,
  successCloseBl: 0x01ea9128,
  enc: {
    freePush: 0xb580,
    freeSub4: 0x3804,
    mallocAdd4: 0x1d20,
    mallocStmia: 0xc010,
  },
} as const;

export type Free1Cpu = {
  r: number[];
  pc: number;
  lr: number;
  sp: number;
  r9: number;
  cpsr: number;
  tBit: number;
  insnCount: number;
  stack0: number;
  stack4: number;
  stack8: number;
  stack12: number;
};

export type Table0Snap = {
  request: number;
  ret: number;
  headerAfterHandler: number;
  lr: number;
  insnCount: number;
};

export type RegistryMatch = {
  guestAddr: number;
  size: number;
  alignedSize: number;
  owner: string;
  matchesR0: boolean;
  matchesLen: boolean;
};

export type Free1Report = {
  handler130: boolean;
  handler38: boolean;
  handler33: boolean;
  handler17: boolean;
  handler40: boolean;
  handler44: boolean;
  handler45: boolean;
  handler41: boolean;
  handler3: boolean;
  handler10: boolean;
  handler1: boolean;
  handler0: boolean;
  productionThrown: string;
  probeThrown: string;
  cpu: Free1Cpu;
  p: number;
  helper: number;
  erRw: number;
  owner: string;
  table0: Table0Snap[];
  tempNameAlloc: Table0Snap | null;
  indexAlloc: Table0Snap | null;
  headerAfterTable0: number;
  headerAtTable1: number;
  headerBytes: number[];
  payloadBytes: number[];
  registry: AllocRecord[];
  registryMatch: RegistryMatch | null;
  wrapCaller: number;
  headerWriter: "guest mrc_malloc wrap";
  returnConsumer: "none / not executed";
  mallocWrap: ThumbLine[];
  freeWrap: ThumbLine[];
  afterFreeWrap: ThumbLine[];
  afterCaller: ThumbLine[];
  table1Inline: MrTableCall[];
  freeWrapBls: { from: number; inReadFile: boolean; kind: "LIVE startup required" | "STATIC future observed" }[];
  nextStaticSlots: number[];
  nextChain: string[];
  decision: "FORENSICS_ONLY";
};

type Mem16 = { read16(a: number): number; read8(a: number): number; read32(a: number): number };

function hx(n: number): string {
  return `0x${(n >>> 0).toString(16)}`;
}

function fmtThumb(pc: number, mem: Mem16): ThumbLine {
  const hw1 = mem.read16(pc) & 0xffff;
  if (isThumb32Prefix(hw1)) {
    const hw2 = mem.read16((pc + 2) >>> 0) & 0xffff;
    decodeThumb32(hw1, hw2, PACK, 0);
    const u = unpackW0(PACK[0]!);
    const imm = PACK[1]! | 0;
    let target: number | null = null;
    let extra = "";
    if (u.op === Op.BL || u.op === Op.B || u.op === Op.BLX) {
      target = (pc + 4 + imm) >>> 0;
      extra = ` target=${hx(target)}`;
    }
    return {
      pc,
      size: 4,
      op: u.op,
      target,
      text: `${hx(pc)}  ${hw1.toString(16).padStart(4, "0")} ${hw2.toString(16).padStart(4, "0")}  ${OP_NAMES[u.op] ?? u.op} rd=${u.rd} rn=${u.rn} rm=${u.rm} imm=${hx(PACK[1]!)}${extra}`,
    };
  }
  decodeThumb16(hw1, PACK, 0);
  const u = unpackW0(PACK[0]!);
  let extra = "";
  if (u.op === Op.BLX || u.op === Op.BX) extra = ` rm=r${u.rm}`;
  return {
    pc,
    size: 2,
    op: u.op,
    target: null,
    text: `${hx(pc)}  ${hw1.toString(16).padStart(4, "0")}  ${OP_NAMES[u.op] ?? u.op} rd=${u.rd} rn=${u.rn} rm=${u.rm} imm=${hx(PACK[1]!)}${extra}`,
  };
}

function disasmRange(mem: Mem16, start: number, end: number): ThumbLine[] {
  const out: ThumbLine[] = [];
  let p = start >>> 0;
  while (p < end) {
    const d = fmtThumb(p, mem);
    out.push(d);
    p = (p + d.size) >>> 0;
  }
  return out;
}

function snapCpu(e: ExtRuntime): Free1Cpu {
  const r = [...e.cpu.r].map((v) => v >>> 0);
  const sp = r[13]!;
  let stack0 = 0;
  let stack4 = 0;
  let stack8 = 0;
  let stack12 = 0;
  try {
    stack0 = e.mem.read32(sp) >>> 0;
    stack4 = e.mem.read32(sp + 4) >>> 0;
    stack8 = e.mem.read32(sp + 8) >>> 0;
    stack12 = e.mem.read32(sp + 12) >>> 0;
  } catch {
    /* unmapped stack */
  }
  return {
    r,
    pc: r[15]!,
    lr: r[14]!,
    sp,
    r9: r[9]!,
    cpsr: e.cpu.cpsr >>> 0,
    tBit: e.cpu.t & 1,
    insnCount: e.cpu.insnCount | 0,
    stack0,
    stack4,
    stack8,
    stack12,
  };
}

function blTarget(pc: number, mem: Mem16): number | null {
  const hw1 = mem.read16(pc) & 0xffff;
  if (!isThumb32Prefix(hw1)) return null;
  decodeThumb32(hw1, mem.read16((pc + 2) >>> 0) & 0xffff, PACK, 0);
  const u = unpackW0(PACK[0]!);
  if (u.op !== Op.BL) return null;
  return (pc + 4 + (PACK[1]! | 0)) >>> 0;
}

export function scanBlsTo(mem: Mem16, start: number, end: number, target: number): number[] {
  const out: number[] = [];
  let p = start >>> 0;
  while (p + 3 < end) {
    const hw1 = mem.read16(p) & 0xffff;
    if (isThumb32Prefix(hw1)) {
      if (blTarget(p, mem) === (target >>> 0)) out.push(p >>> 0);
      p = (p + 4) >>> 0;
    } else {
      p = (p + 2) >>> 0;
    }
  }
  return out;
}

function slotsAfter(lines: ThumbLine[]): number[] {
  const slots: number[] = [];
  for (const l of lines) {
    if (l.target === FILECHAIN.mallocWrap) slots.push(0);
    if (l.target === FILECHAIN.freeWrap) slots.push(1);
    if (l.target === FILECHAIN.seekWrap) slots.push(45);
    if (l.target === FILECHAIN.readWrap) slots.push(44);
    if (l.target === FILECHAIN.closeWrap) slots.push(41);
  }
  return [...new Set(slots)];
}

/**
 * rxgj `mem.c` `realLGmemSize` / flymrp table[0] align.
 * Model-only. Not a production allocator.
 */
export function realLGmemSize(len: number): number {
  return ((len >>> 0) + 7) & ~7;
}

type FitNode = { addr: number; len: number };

/**
 * Minimal first-fit matching `mr_malloc` / `mr_free` insert+coalesce.
 * Used only to answer reuse questions. Not wired to table[1].
 */
export function firstFitReuseSameSize(len: number): { first: number; second: number; reused: boolean } {
  const want = realLGmemSize(len);
  const base = 0x1000;
  const heap = 0x10000;
  const free: FitNode[] = [{ addr: base, len: heap }];
  const take = (): number => {
    for (let i = 0; i < free.length; i++) {
      const n = free[i]!;
      if (n.len < want) continue;
      const addr = n.addr;
      if (n.len === want) free.splice(i, 1);
      else {
        n.addr += want;
        n.len -= want;
      }
      return addr;
    }
    return 0;
  };
  const give = (addr: number, raw: number): void => {
    const nlen = realLGmemSize(raw);
    const node: FitNode = { addr, len: nlen };
    let i = 0;
    while (i < free.length && free[i]!.addr < addr) i++;
    free.splice(i, 0, node);
    const cur = free[i]!;
    const prev = free[i - 1];
    if (prev && prev.addr + prev.len === cur.addr) {
      prev.len += cur.len;
      free.splice(i, 1);
      i--;
    }
    const now = free[i]!;
    const next = free[i + 1];
    if (next && now.addr + now.len === next.addr) {
      now.len += next.len;
      free.splice(i + 1, 1);
    }
  };
  const first = take();
  give(first, len);
  const second = take();
  return { first, second, reused: first !== 0 && first === second };
}

export function flymrpBumpSecond(first: number, len: number): number {
  return (first + realLGmemSize(len)) >>> 0;
}

export function runFree1Forensics(mrp: Uint8Array): Free1Report {
  const productionThrown = runProductionCode0Fault(mrp);
  const cf = extractNamedExt(mrp, "cfunction.ext");
  const codeEnd = (EXT_CODE_ADDR + cf.length) >>> 0;

  const rt = new MythroadRuntime({
    graphics: new NullGraphicsBackend(),
    trace: new RuntimeTrace(),
    abiMode: "strict",
  });

  const table0: Table0Snap[] = [];
  const cap: { cpu: Free1Cpu | null } = { cpu: null };
  let p = 0;
  let helper = 0;
  let erRw = 0;
  let handler130 = false;
  let handler38 = false;
  let handler33 = false;
  let handler17 = false;
  let handler40 = false;
  let handler44 = false;
  let handler45 = false;
  let handler41 = false;
  let handler3 = false;
  let handler10 = false;
  let handler1 = false;
  let handler0 = false;
  let headerAfterTable0 = -1;
  let headerAtTable1 = 0;
  let headerBytes: number[] = [];
  let payloadBytes: number[] = [];
  let wrapCaller = 0;
  let mallocWrap: ThumbLine[] = [];
  let freeWrap: ThumbLine[] = [];
  let afterFreeWrap: ThumbLine[] = [];
  let afterCaller: ThumbLine[] = [];
  let table1Inline: MrTableCall[] = [];
  let freeWrapBls: Free1Report["freeWrapBls"] = [];

  const origBind = rt.bindExt.bind(rt);
  rt.bindExt = (ext) => {
    origBind(ext);
    const e = rt.ext;
    if (!e) return;
    const origD = e.table.dispatch.bind(e.table);
    e.table.dispatch = (c, mem, pc) => {
      const n = tableSlotIndex(pc);
      const had = !!e.table.handlers[n];
      if (n === 0 && had) {
        const request = c.r[0] >>> 0;
        origD(c, mem, pc);
        const ret = c.r[0] >>> 0;
        let headerAfterHandler = 0;
        try {
          headerAfterHandler = mem.read32(ret) >>> 0;
        } catch {
          headerAfterHandler = 0xffffffff;
        }
        table0.push({ request, ret, headerAfterHandler, lr: c.r[14] >>> 0, insnCount: e.cpu.insnCount | 0 });
        if (request === FREE1.table0Request && ret === FREE1.header) headerAfterTable0 = headerAfterHandler;
        return;
      }
      if (n === FREE1.slot && !cap.cpu) {
        cap.cpu = snapCpu(e);
        p = e.owners.wrapper.p >>> 0;
        helper = e.owners.wrapper.helper >>> 0;
        erRw = p ? e.mem.read32(p + AEX_P_ER_RW_OFF) >>> 0 : 0;
        handler130 = !!e.table.handlers[130];
        handler38 = !!e.table.handlers[38];
        handler33 = !!e.table.handlers[33];
        handler17 = !!e.table.handlers[17];
        handler40 = !!e.table.handlers[40];
        handler44 = !!e.table.handlers[44];
        handler45 = !!e.table.handlers[45];
        handler41 = !!e.table.handlers[41];
        handler3 = !!e.table.handlers[3];
        handler10 = !!e.table.handlers[10];
        handler1 = !!e.table.handlers[1];
        handler0 = !!e.table.handlers[0];
        const r0 = c.r[0] >>> 0;
        try {
          headerAtTable1 = mem.read32(r0) >>> 0;
          headerBytes = [...mem.slice(r0, 8)];
          payloadBytes = [...mem.slice((r0 + 4) >>> 0, 16)];
        } catch {
          headerBytes = [];
        }
        mallocWrap = disasmRange(mem, FREE1.mallocWrap, FREE1.mallocWrap + 0x20);
        freeWrap = disasmRange(mem, FREE1.freeWrap, FREE1.freeWrap + 0x18);
        afterFreeWrap = disasmRange(mem, FREE1.freeWrapBlx + 2, FREE1.freeWrap + 0x20);
        table1Inline = scanMrTableSlotCalls(mem, EXT_CODE_ADDR, codeEnd, 1);
        const bls = scanBlsTo(mem, EXT_CODE_ADDR, codeEnd, FREE1.freeWrap);
        wrapCaller = cap.cpu.stack4 >>> 0;
        const callerPc = (wrapCaller & ~1) >>> 0;
        afterCaller = disasmRange(mem, callerPc, (callerPc + 0xf0) >>> 0);
        freeWrapBls = bls.map((from) => ({
          from,
          inReadFile: from >= FILECHAIN.fn && from < FILECHAIN.fnEnd,
          kind: from === FREE1.liveCaller ? "LIVE startup required" : "STATIC future observed",
        }));
      }
      origD(c, mem, pc);
    };
  };

  let probeThrown = "";
  try {
    rt.loadMrp(mrp);
    rt.start("start.mr");
  } catch (err) {
    probeThrown = err instanceof Error ? err.message : String(err);
  }

  const live = cap.cpu;
  if (!live) throw new Error("table[1] was not reached");
  const rec = rt.mrAllocs.find((a) => a.guestAddr === live.r[0]);
  const registryMatch: RegistryMatch | null = rec
    ? {
        guestAddr: rec.guestAddr,
        size: rec.size,
        alignedSize: rec.alignedSize,
        owner: rec.owner,
        matchesR0: rec.guestAddr === live.r[0],
        matchesLen: rec.size === live.r[1],
      }
    : null;

  const nextStaticSlots = slotsAfter(afterCaller);
  const nextChain = [
    "table1 mrc_free(indexbuf) via same wrap",
    "table0 mrc_malloc(file_len)",
    "table45 mr_seek SET file_pos",
    "table44 mr_read payload",
    "table41 mr_close",
  ];

  return {
    handler130,
    handler38,
    handler33,
    handler17,
    handler40,
    handler44,
    handler45,
    handler41,
    handler3,
    handler10,
    handler1,
    handler0,
    productionThrown,
    probeThrown,
    cpu: live,
    p,
    helper,
    erRw,
    owner: rt.packName || "wrapper",
    table0,
    tempNameAlloc: table0.find((a) => a.request === FREE1.table0Request && a.ret === FREE1.header) ?? null,
    indexAlloc: table0.find((a) => a.request === FREE1.indexTable0 && a.ret === FREE1.indexHeader) ?? null,
    headerAfterTable0,
    headerAtTable1,
    headerBytes,
    payloadBytes,
    registry: rt.mrAllocs.slice(),
    registryMatch,
    wrapCaller,
    headerWriter: "guest mrc_malloc wrap",
    returnConsumer: "none / not executed",
    mallocWrap,
    freeWrap,
    afterFreeWrap,
    afterCaller,
    table1Inline,
    freeWrapBls,
    nextStaticSlots,
    nextChain,
    decision: "FORENSICS_ONLY",
  };
}

export function renderFree1Markdown(r: Free1Report): string {
  const c = r.cpu;
  const lines = [
    "# table[1] mr_free forensics (5-C.10N)",
    "",
    `- handlers 0/1: ${r.handler0}/${r.handler1} (1 must stay unimplemented)`,
    `- handlers 3/10/40/44/45/41: ${r.handler3}/${r.handler10}/${r.handler40}/${r.handler44}/${r.handler45}/${r.handler41}`,
    `- production/probe: ${r.productionThrown} / ${r.probeThrown}`,
    `- stub PC ${hx(c.pc)} LR ${hx(c.lr)} SP ${hx(c.sp)} CPSR ${hx(c.cpsr)} t=${c.tBit} insn=${c.insnCount}`,
    `- R0 header ${hx(c.r[0]!)} R1 len ${c.r[1]} R2 ${hx(c.r[2]!)} R3 ${hx(c.r[3]!)}`,
    `- R5 ${c.r[5]} R6 ${hx(c.r[6]!)} R7 payload ${hx(c.r[7]!)} R9 ${hx(c.r9)}`,
    `- stack ${hx(c.stack0)} ${hx(c.stack4)} ${hx(c.stack8)} ${hx(c.stack12)} wrapCaller=${hx(r.wrapCaller)}`,
    `- headerAfterTable0=${r.headerAfterTable0} headerAtTable1=${r.headerAtTable1} bytes=${r.headerBytes.join(" ")}`,
    `- payload[0:16]=${r.payloadBytes.join(" ")}`,
    `- tempName table0 request=${r.tempNameAlloc?.request} ret=${r.tempNameAlloc ? hx(r.tempNameAlloc.ret) : "—"} headerAfterHandler=${r.tempNameAlloc?.headerAfterHandler}`,
    `- index table0 request=${r.indexAlloc?.request} ret=${r.indexAlloc ? hx(r.indexAlloc.ret) : "—"}`,
    `- registry match: ${r.registryMatch ? `addr=${hx(r.registryMatch.guestAddr)} size=${r.registryMatch.size} aligned=${r.registryMatch.alignedSize} r0=${r.registryMatch.matchesR0} len=${r.registryMatch.matchesLen}` : "none"}`,
    `- returnConsumer=${r.returnConsumer}`,
    `- table1 inline callsites ${r.table1Inline.length}`,
    `- free-wrap BLs ${r.freeWrapBls.length} (readFile ${r.freeWrapBls.filter((x) => x.inReadFile).length})`,
    `- headerWriter: ${r.headerWriter}`,
    `- next static slots after wrap return: ${r.nextStaticSlots.join(",") || "(none)"}`,
    `- next chain: ${r.nextChain.join(" → ")}`,
    `- aex_t001 guest R0 = MR_SUCCESS (${MR_SUCCESS}); C mr_free is void`,
    `- decision: ${r.decision} (do not implement table[1])`,
    `- Stage 5-D: NOT STARTED`,
  ];
  return lines.join("\n");
}
