/**
 * Stage 5-C.10L — table[3] memcpy2 ABI + directory-loop continuation forensics.
 * Read-only. Does not register table[3] / [10] / [1]. Does not change file backend.
 * Stage 5-D is not started.
 */
import { AEX_P_ER_RW_OFF, EXT_CODE_ADDR, tableSlotIndex } from "../abi/layout.ts";
import type { ExtRuntime } from "../abi/runtime.ts";
import { decodeThumb16, isThumb32Prefix } from "../hot/decode-thumb16.ts";
import { decodeThumb32 } from "../hot/decode-thumb32.ts";
import { GuestMemory } from "../hot/memory.ts";
import { OP_NAMES, Op, unpackW0 } from "../hot/opcodes.ts";
import { MRPArchive } from "../mrp/archive.ts";
import { MythroadRuntime, NullGraphicsBackend, RuntimeTrace } from "../mythroad/index.ts";
import { extractNamedExt } from "./code6.ts";
import { runProductionCode0Fault } from "./code0chain.ts";
import { FILECHAIN } from "./filechain.ts";
import { OPEN40 } from "./open40.ts";

const PACK = new Uint32Array(3);

/** Pack-local addresses. Forensics only — not an implementation. */
export const MEMCPY3 = {
  slot: 3,
  strcmpSlot: 10,
  freeSlot: 1,
  stub: 0x0001000c,
  strcmpStub: 0x00010028,
  freeStub: 0x00010004,
  tableOff: 0x0c,
  liveBlx: 0x01ea8f52,
  liveRet: 0x01ea8f54,
  dst: 0x01e7ff34,
  src: 0x002504fc,
  count: 4,
  srcLe: 9,
  indexHeaderGuest: 0x002504f8,
  indexHeaderSize: 5500,
  indexUser: 0x002504fc,
  indexLen: 5496,
  archiveOff: 240,
  firstName: "start.mr",
  searchName: "res_lang0.rc",
  sprintfBuf: 0x01e7ff74,
  tempName: 0x00251a7c,
  tempNameHeader: 0x00251a78,
  tempNameAllocSize: 132,
  nameScratchRequest: 0x80,
  mallocWrap: 0x01ea8918,
  mallocAdd4: 0x01ea8924,
  mallocStoreSize: 0x01ea892c,
  freeWrap: 0x01ea7ab4,
  nameMemcpyBlx: 0x01ea8f94,
  strcmpBlx: 0x01ea8fac,
  filePosBlx: 0x01ea8fda,
  fileLenBlx: 0x01ea8fec,
  p: 0x00a4b728,
  helper: 0x01ea5e9d,
  erRw: 0x0024b704,
  insnCount: 332,
  sp: 0x01e7ff08,
  lr: 0x01ea8f55,
  cpsr: 0x10,
  r4: 0x01e7ffc8,
  r5: 1,
  r8: 0,
  dstSpOff: 0x2c,
  posSpOff: 0x08,
  indexSpOff: 0x0c,
  indexLenSpOff: 0x10,
  maxFilename: 128,
  enc: {
    ldrTable: 0x6ba0,
    movs4: 0x2204,
    ldrSlot3: 0x68c3,
    addDst: 0xa80b,
    blxR3: 0x4798,
    ldrPos: 0x9802,
    ldrLen: 0x9a0b,
    add4: 0x3004,
    cmp1: 0x2a01,
    cmp80: 0x2a80,
    ldrSlot10: 0x6a82,
    blxR2: 0x4790,
    cmpR0: 0x2800,
    mallocAdd4: 0x1d20,
    mallocStmia: 0xc010,
    freePush: 0xb580,
    freeSub4: 0x3804,
  },
} as const;

export type Memcpy3Cpu = {
  r: number[];
  pc: number;
  lr: number;
  sp: number;
  r9: number;
  cpsr: number;
  tBit: number;
  insnCount: number;
};

export type ThumbLine = { pc: number; size: number; op: number; text: string; target: number | null };

export type MrTableCall = {
  load38: number;
  loadSlot: number;
  blx: number;
  slot: number;
  inReadFile: boolean;
  kind: "LIVE startup required" | "STATIC future observed";
};

export type Memcpy3Report = {
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
  productionThrown: string;
  probeThrown: string;
  cpu: Memcpy3Cpu;
  p: number;
  helper: number;
  erRw: number;
  owner: string;
  srcBytes: number[];
  dstBytes: number[];
  srcU32: number;
  archiveBytes: number[];
  archiveOff: number;
  indexHeaderGuest: number;
  indexHeaderSize: number;
  indexUser: number;
  overlap: boolean;
  returnConsumer: "none";
  after: ThumbLine[];
  mallocWrap: ThumbLine[];
  freeWrap: ThumbLine[];
  table3Calls: MrTableCall[];
  table10Calls: MrTableCall[];
  table1Calls: MrTableCall[];
  nextSlots: number[];
  decision: "SPLIT";
};

type Mem16 = { read16(a: number): number; read8(a: number): number; read32(a: number): number };

function hx(n: number): string {
  return `0x${(n >>> 0).toString(16)}`;
}

function ldrImm(hw: number): { rd: number; rn: number; imm: number } | null {
  const u = hw & 0xffff;
  if ((u & 0xf800) !== 0x6800) return null;
  return { rd: u & 7, rn: (u >> 3) & 7, imm: ((u >> 6) & 0x1f) * 4 };
}

function blxRm(hw: number): number | null {
  const u = hw & 0xffff;
  if ((u & 0xff87) !== 0x4780) return null;
  return (u >> 3) & 0xf;
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

function snapCpu(e: ExtRuntime): Memcpy3Cpu {
  const r = [...e.cpu.r].map((v) => v >>> 0);
  return {
    r,
    pc: r[15]!,
    lr: r[14]!,
    sp: r[13]!,
    r9: r[9]!,
    cpsr: e.cpu.cpsr >>> 0,
    tBit: e.cpu.t & 1,
    insnCount: e.cpu.insnCount | 0,
  };
}

function writesRd(hw: number, reg: number): boolean {
  decodeThumb16(hw, PACK, 0);
  const u = unpackW0(PACK[0]!);
  if (u.rd !== reg) return false;
  switch (u.op) {
    case Op.AND:
    case Op.EOR:
    case Op.SUB:
    case Op.RSB:
    case Op.ADD:
    case Op.ADC:
    case Op.SBC:
    case Op.RSC:
    case Op.ORR:
    case Op.MOV:
    case Op.BIC:
    case Op.MVN:
    case Op.LDR:
    case Op.LDRB:
    case Op.LDRH:
    case Op.LDRSB:
    case Op.LDRSH:
      return true;
    default:
      return false;
  }
}

/**
 * Inline `LDR [Rn,#0x38]; … LDR [Rt,#slot*4]; BLX` with no ADD/SUB on the
 * table pointer. PIC wraps that add 0x80/0x1c0 before the slot LDR are excluded.
 */
export function scanMrTableSlotCalls(
  mem: Mem16,
  start: number,
  end: number,
  slot: number,
): MrTableCall[] {
  const off = (slot * 4) >>> 0;
  const out: MrTableCall[] = [];
  let p = start >>> 0;
  const last = (end - 4) >>> 0;
  while (p <= last) {
    const hw = mem.read16(p) & 0xffff;
    if (isThumb32Prefix(hw)) {
      p = (p + 4) >>> 0;
      continue;
    }
    const ldr38 = ldrImm(hw);
    if (ldr38 && ldr38.imm === 0x38) {
      const tableReg = ldr38.rd;
      let slotRd: number | null = null;
      let loadSlot = 0;
      let q = (p + 2) >>> 0;
      for (let step = 0; step < 12 && q <= last; step++) {
        const n = mem.read16(q) & 0xffff;
        if (isThumb32Prefix(n)) break;
        const ldr = ldrImm(n);
        if (slotRd === null && ldr && ldr.rn === tableReg && ldr.imm === off) {
          slotRd = ldr.rd;
          loadSlot = q;
          q = (q + 2) >>> 0;
          continue;
        }
        if (slotRd === null && writesRd(n, tableReg)) break;
        const rm = blxRm(n);
        if (slotRd !== null && rm === slotRd) {
          const inReadFile = q >= FILECHAIN.fn && q < FILECHAIN.fnEnd;
          const kind = q === MEMCPY3.liveBlx ? "LIVE startup required" : "STATIC future observed";
          out.push({ load38: p, loadSlot, blx: q, slot, inReadFile, kind });
          break;
        }
        q = (q + 2) >>> 0;
      }
    }
    p = (p + 2) >>> 0;
  }
  return out;
}

export function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/** memcpy2 forward byte copy. Host helper for overlap contrast tests only. */
export function memcpy2Forward(dst: Uint8Array, src: Uint8Array, count: number): Uint8Array {
  let i = 0;
  while (i < count) {
    dst[i] = src[i]!;
    i++;
  }
  return dst;
}

export function runMemcpy3Forensics(mrp: Uint8Array): Memcpy3Report {
  const productionThrown = runProductionCode0Fault(mrp);
  const cf = extractNamedExt(mrp, "cfunction.ext");
  const archive = MRPArchive.parse(mrp);
  const codeEnd = (EXT_CODE_ADDR + cf.length) >>> 0;

  const rt = new MythroadRuntime({
    graphics: new NullGraphicsBackend(),
    trace: new RuntimeTrace(),
    abiMode: "strict",
  });

  let cpu: Memcpy3Cpu | null = null;
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
  let srcBytes: number[] = [];
  let dstBytes: number[] = [];
  let srcU32 = 0;
  let after: ThumbLine[] = [];
  let mallocWrap: ThumbLine[] = [];
  let freeWrap: ThumbLine[] = [];
  let table3Calls: MrTableCall[] = [];
  let table10Calls: MrTableCall[] = [];
  let table1Calls: MrTableCall[] = [];

  const origBind = rt.bindExt.bind(rt);
  rt.bindExt = (ext) => {
    origBind(ext);
    const e = rt.ext;
    if (!e) return;
    const origD = e.table.dispatch.bind(e.table);
    e.table.dispatch = (c, mem, pc) => {
      const n = tableSlotIndex(pc);
      if (n === MEMCPY3.slot && !cpu) {
        cpu = snapCpu(e);
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
        const r0 = c.r[0] >>> 0;
        const r1 = c.r[1] >>> 0;
        srcBytes = [...mem.slice(r1, 16)];
        dstBytes = [...mem.slice(r0, 8)];
        srcU32 = mem.read32(r1) >>> 0;
        after = disasmRange(mem, MEMCPY3.liveRet, MEMCPY3.fileLenBlx + 4);
        mallocWrap = disasmRange(mem, MEMCPY3.mallocWrap, MEMCPY3.mallocWrap + 0x18);
        freeWrap = disasmRange(mem, MEMCPY3.freeWrap, MEMCPY3.freeWrap + 0x14);
        table3Calls = scanMrTableSlotCalls(mem, EXT_CODE_ADDR, codeEnd, 3);
        table10Calls = scanMrTableSlotCalls(mem, EXT_CODE_ADDR, codeEnd, 10);
        table1Calls = scanMrTableSlotCalls(mem, EXT_CODE_ADDR, codeEnd, 1);
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

  if (!cpu) throw new Error("table[3] was not reached");
  const live = cpu as Memcpy3Cpu;
  const r0 = live.r[0]!;
  const r1 = live.r[1]!;
  const r2 = live.r[2]!;
  const overlap = rangesOverlap(r0, r0 + r2, r1, r1 + r2);
  const indexAlloc = rt.mrAllocs.find((a) => a.guestAddr === MEMCPY3.indexHeaderGuest);
  const archiveOff = MEMCPY3.archiveOff;
  const archiveBytes = [...archive.data.subarray(archiveOff, archiveOff + 16)];

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
    productionThrown,
    probeThrown,
    cpu: live,
    p,
    helper,
    erRw,
    owner: rt.packName || "wrapper",
    srcBytes,
    dstBytes,
    srcU32,
    archiveBytes,
    archiveOff,
    indexHeaderGuest: indexAlloc?.guestAddr ?? 0,
    indexHeaderSize: indexAlloc?.size ?? 0,
    indexUser: r1,
    overlap,
    returnConsumer: "none",
    after,
    mallocWrap,
    freeWrap,
    table3Calls,
    table10Calls,
    table1Calls,
    nextSlots: [3, 10, 1],
    decision: "SPLIT",
  };
}

export function renderMemcpy3Markdown(r: Memcpy3Report): string {
  const c = r.cpu;
  const lines = [
    "# table[3] memcpy2 forensics (5-C.10L)",
    "",
    `- handlers 40/44/45/41: ${r.handler40}/${r.handler44}/${r.handler45}/${r.handler41}`,
    `- handlers 3/10/1: ${r.handler3}/${r.handler10}/${r.handler1} (1 stays unimplemented)`,
    `- production/probe: ${r.productionThrown} / ${r.probeThrown}`,
    `- stub PC ${hx(c.pc)} LR ${hx(c.lr)} SP ${hx(c.sp)} CPSR ${hx(c.cpsr)} t=${c.tBit} insn=${c.insnCount}`,
    `- R0 dst ${hx(c.r[0]!)} R1 src ${hx(c.r[1]!)} R2 count ${c.r[2]} R3 ${hx(c.r[3]!)}`,
    `- R4 ${hx(c.r[4]!)} R5 ${c.r[5]} R6 ${hx(c.r[6]!)} R7 ${hx(c.r[7]!)} R8 ${c.r[8]} R9 ${hx(c.r9)}`,
    `- P ${hx(r.p)} helper ${hx(r.helper)} ER_RW ${hx(r.erRw)}`,
    `- src[0:4] LE=${r.srcU32} bytes=${r.srcBytes.slice(0, 4).join(" ")}`,
    `- archive.data[${r.archiveOff}:] ${r.archiveBytes.slice(0, 4).join(" ")}`,
    `- overlap=${r.overlap} returnConsumer=${r.returnConsumer}`,
    `- table3 callsites ${r.table3Calls.length} (readFile ${r.table3Calls.filter((x) => x.inReadFile).length})`,
    `- table10 callsites ${r.table10Calls.length} (readFile ${r.table10Calls.filter((x) => x.inReadFile).length})`,
    `- table1 callsites ${r.table1Calls.length}`,
    `- directory loop after first table3: table3 → table10 → … → table1`,
    `- decision: ${r.decision} (3+10 implemented in 5-C.10M; keep 1 separate)`,
    `- Stage 5-D: NOT STARTED`,
  ];
  return lines.join("\n");
}

/** Contrast helper: not a production path. */
export function guestLoadSliceIsMemmove(mem: GuestMemory, dst: number, src: number, n: number): void {
  mem.load(dst, mem.slice(src, n));
}
