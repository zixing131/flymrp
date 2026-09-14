/**
 * Stage 5-C.10H — table[40] / mr_open ABI + filename provenance forensics.
 * Read-only. Does not register table[40]. Does not rewrite filenames.
 * table[100] is populated by production bindExt (5-C.10I), not by this probe.
 * Stage 5-D is not started.
 */
import {
  EXT_CODE_ADDR,
  EXT_HEAP_ADDR,
  MR_MAX_FILENAME_SIZE,
  tableSlotAddr,
  tableSlotIndex,
} from "../abi/layout.ts";
import { DATA_SLOTS as DATA_SLOT_SET, dataSlotAllocSize } from "../abi/table.ts";
import type { ExtRuntime } from "../abi/runtime.ts";
import { decodeThumb16, isThumb32Prefix } from "../hot/decode-thumb16.ts";
import { decodeThumb32 } from "../hot/decode-thumb32.ts";
import { OP_NAMES, Op, unpackW0 } from "../hot/opcodes.ts";
import { MRPArchive } from "../mrp/archive.ts";
import { MR_FILE_RDONLY } from "../mythroad/constants.ts";
import { MythroadRuntime, NullGraphicsBackend, RuntimeTrace } from "../mythroad/index.ts";
import { extractNamedExt } from "./code6.ts";
import { runProductionCode0Fault } from "./code0chain.ts";

const PACK = new Uint32Array(3);

/** Pack-local addresses and source identities. Forensics only — not an implementation. */
export const OPEN40 = {
  slot: 40,
  stub: 0x000100a0,
  tableOff: 0xa0,
  wrap: 0x01ea89d8,
  wrapBlx: 0x01ea89e4,
  wrapPop: 0x01ea89e6,
  consumer: 0x01ea8cdc,
  consumerLookfor: 0x01ea8cfc,
  consumerOpen: 0x01ea8e8e,
  consumerBl: 0x01ea8e92,
  consumerAfter: 0x01ea8e96,
  filename: 0x00200400,
  sprintfBuf: 0x01e7ff74,
  sprintfText: "res_lang0.rc",
  mode: MR_FILE_RDONLY,
  packSlot: 100,
  nativePackBytes: MR_MAX_FILENAME_SIZE,
  flymrpPackBytes: MR_MAX_FILENAME_SIZE,
  enc: {
    wrapLdrPc: 0x4a03,
    wrapPush: 0xb580,
    wrapAddPc: 0x447a,
    wrapLdr38: 0x6b92,
    wrapAdd80: 0x3280,
    wrapLdr20: 0x6a12,
    wrapBlx: 0x4790,
    wrapPop: 0xbd80,
    movR6R1: 0x1c0e,
    ldrR5Off10: 0x690d,
    ldrbR5: 0x7828,
    cmpStar: 0x282a,
    cmpDollar: 0x2824,
    movsR1One: 0x2101,
    movR0R5: 0x1c28,
    addsR5R0: 0x1c05,
    bneFail: 0xd101,
  },
} as const;

/** rxgj mythroad.c table slots. Inventory only. */
export const FILE_ABI_SLOTS = [
  { slot: 39, ident: "mr_ferrno" },
  { slot: 40, ident: "asm_mr_open / mr_open" },
  { slot: 41, ident: "asm_mr_close / mr_close" },
  { slot: 42, ident: "asm_mr_info / mr_info" },
  { slot: 43, ident: "asm_mr_write / mr_write" },
  { slot: 44, ident: "asm_mr_read / mr_read" },
  { slot: 45, ident: "asm_mr_seek / mr_seek" },
  { slot: 46, ident: "asm_mr_getLen / mr_getLen" },
  { slot: 47, ident: "asm_mr_remove / mr_remove" },
  { slot: 48, ident: "asm_mr_rename / mr_rename" },
  { slot: 49, ident: "asm_mr_mkDir / mr_mkDir" },
  { slot: 50, ident: "asm_mr_rmDir / mr_rmDir" },
  { slot: 51, ident: "asm_mr_findStart / mr_findStart" },
  { slot: 52, ident: "asm_mr_findGetNext / mr_findGetNext" },
  { slot: 53, ident: "asm_mr_findStop / mr_findStop" },
] as const;

/** rxgj mrporting.h / mrc_base.h. Not POSIX. */
export const MR_OPEN_MODES = {
  MR_FILE_RDONLY: 1,
  MR_FILE_WRONLY: 2,
  MR_FILE_RDWR: 4,
  MR_FILE_CREATE: 8,
  MR_FILE_SHARD: 16,
  MR_FILE_RECREATE: 16,
  MR_FILE_COMMITTED: 32,
} as const;

export type Open40Cpu = {
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

export type ThumbLine = { pc: number; size: number; op: number; text: string; target: number | null };

export type Open40Bl = { from: number; to: number };

export type Open40HelperSnap = {
  pc: number;
  r0: number;
  r1: number;
  r2: number;
  r4: number;
  r5: number;
  r6: number;
  lr: number;
  sp: number;
};

export type Open40Callsite = {
  bl: number;
  live: boolean;
  modeImm: number | null;
  filename: string;
  filenameKind: "pic" | "reg" | "stack" | "unknown";
};

export type Open40Write = { addr: number; size: number };

export type Open40Alloc = { size: number; alignedSize: number; guestAddr: number };

export type Open40Report = {
  handler130: boolean;
  handler38: boolean;
  handler33: boolean;
  handler17: boolean;
  handler40: boolean;
  productionThrown: string;
  probeThrown: string;
  cpu: Open40Cpu;
  p: number;
  helper: number;
  erRw: number;
  owner: string;
  r0Text: string;
  r6Text: string;
  packSlotAddr: number;
  packPtr: number;
  packBytes: number[];
  packAllocSize: number;
  packDataSlotIndex: number;
  heapExpected: number;
  erRwPackWord: number;
  writes: Open40Write[];
  mallocs: Open40Alloc[];
  filenameFromMalloc: boolean;
  helperSnaps: Open40HelperSnap[];
  encodings: {
    wrap: ThumbLine[];
    consumerHead: ThumbLine[];
    consumerOpen: ThumbLine[];
    after: ThumbLine[];
    wrapHw: number[];
    afterHw: number[];
    consumerBlTarget: number | null;
    stubLoadSites: number[];
  };
  wrapXrefs: Open40Bl[];
  callsites: Open40Callsite[];
  modeCensus: Record<string, number>;
  archiveHasResLang: boolean;
  vfsExistsResLang: boolean;
  vfsExistsEmpty: boolean;
  table125AfterSprintf: number;
  mrReads: string[];
  decision: "A" | "B" | "C";
};

function hx(n: number): string {
  return `0x${(n >>> 0).toString(16)}`;
}

type Mem16 = { read16: (a: number) => number; read32: (a: number) => number; read8: (a: number) => number };

function fmtThumb(pc: number, mem: Mem16): ThumbLine {
  const hw1 = mem.read16(pc);
  if (isThumb32Prefix(hw1)) {
    const hw2 = mem.read16((pc + 2) >>> 0);
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

function snapCpu(e: ExtRuntime): Open40Cpu {
  const r = [...e.cpu.r].map((v) => v >>> 0);
  const sp = r[13]!;
  return {
    r,
    pc: r[15]!,
    lr: r[14]!,
    sp,
    r9: r[9]!,
    cpsr: e.cpu.cpsr >>> 0,
    tBit: e.cpu.t & 1,
    insnCount: e.cpu.insnCount | 0,
    stack0: e.mem.read32(sp) >>> 0,
    stack4: e.mem.read32((sp + 4) >>> 0) >>> 0,
    stack8: e.mem.read32((sp + 8) >>> 0) >>> 0,
    stack12: e.mem.read32((sp + 12) >>> 0) >>> 0,
  };
}

function cstr(mem: Mem16, addr: number, max = 96): string {
  let text = "";
  for (let i = 0; i < max; i++) {
    const b = mem.read8((addr + i) >>> 0) & 0xff;
    if (b === 0) break;
    text += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2, "0")}`;
  }
  return text;
}

function ldrPc(pc: number, hw: number): { rd: number; lit: number } | null {
  if ((hw & 0xf800) !== 0x4800) return null;
  const rd = (hw >> 8) & 7;
  const imm8 = hw & 0xff;
  return { rd, lit: ((((pc + 4) & ~3) + imm8 * 4) >>> 0) };
}

function scanBlTo(mem: Mem16, start: number, end: number, target: number): Open40Bl[] {
  const out: Open40Bl[] = [];
  let p = start >>> 0;
  while (p + 3 < end) {
    const hw1 = mem.read16(p);
    if (isThumb32Prefix(hw1)) {
      const hw2 = mem.read16((p + 2) >>> 0);
      decodeThumb32(hw1, hw2, PACK, 0);
      const u = unpackW0(PACK[0]!);
      if (u.op === Op.BL) {
        const to = (p + 4 + (PACK[1]! | 0)) >>> 0;
        if (to === target) out.push({ from: p, to });
      }
      p = (p + 4) >>> 0;
    } else {
      p = (p + 2) >>> 0;
    }
  }
  return out;
}

function scanStubLoadSites(mem: Mem16, codeEnd: number): number[] {
  const hits: number[] = [];
  let p = EXT_CODE_ADDR;
  while (p + 6 < codeEnd) {
    const a = mem.read16(p);
    const b = mem.read16((p + 2) >>> 0);
    const c = mem.read16((p + 4) >>> 0);
    if (a === OPEN40.enc.wrapAdd80 && b === OPEN40.enc.wrapLdr20 && c === OPEN40.enc.wrapBlx) {
      hits.push(p);
    }
    p = (p + (isThumb32Prefix(a) ? 4 : 2)) >>> 0;
  }
  return hits;
}

function recoverCallsite(mem: Mem16, bl: number): Open40Callsite {
  let modeImm: number | null = null;
  let filename = "";
  let filenameKind: Open40Callsite["filenameKind"] = "unknown";
  let addR0Pc = 0;
  let ldrR0 = 0;
  for (let off = 2; off <= 0x18; off += 2) {
    const q = (bl - off) >>> 0;
    const hw = mem.read16(q);
    if ((hw & 0xff00) === 0x2100 && modeImm === null) modeImm = hw & 0xff;
    if (hw === 0x4478 && !addR0Pc) addR0Pc = q;
    const ref = ldrPc(q, hw);
    if (ref?.rd === 0 && !ldrR0) ldrR0 = q;
    if (filenameKind === "unknown" && (hw & 0xffc0) === 0x1c00 && (hw & 7) === 0) {
      filenameKind = "reg";
    }
    if (filenameKind === "unknown" && (hw & 0xff00) === 0x9800) filenameKind = "stack";
  }
  if (addR0Pc && ldrR0 && ldrR0 < addR0Pc) {
    const ref = ldrPc(ldrR0, mem.read16(ldrR0));
    if (ref) {
      const lit = mem.read32(ref.lit) >>> 0;
      const va = (lit + ((addR0Pc + 4) >>> 0)) >>> 0;
      filename = cstr(mem, va);
      filenameKind = "pic";
    }
  }
  return { bl, live: bl === OPEN40.consumerBl, modeImm, filename, filenameKind };
}

function dataSlotIndex(slot: number): number {
  let i = 0;
  for (const n of DATA_SLOT_SET) {
    if (n === slot) return i;
    i++;
  }
  return -1;
}

function align8(n: number): number {
  return (n + 7) & ~7;
}

/** Guest addr of a DATA_SLOT buffer after sequential 8-aligned bump allocs. */
function expectedDataSlotAddr(slot: number): number {
  let addr = EXT_HEAP_ADDR;
  for (const n of DATA_SLOT_SET) {
    if (n === slot) return addr;
    addr = (addr + align8(Math.max(dataSlotAllocSize(n), 1))) >>> 0;
  }
  return 0;
}

function thrownMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Production-path snapshot at table[40]. Does not register or skip slot 40.
 * Does not write pack_filename or rewrite R0.
 */
export function runOpen40Forensics(mrp: Uint8Array): Open40Report {
  const productionThrown = runProductionCode0Fault(mrp);
  const cf = extractNamedExt(mrp, "cfunction.ext");
  const codeEnd = (EXT_CODE_ADDR + cf.length) >>> 0;
  const archive = MRPArchive.parse(mrp);
  const archiveHasResLang = archive.hasFile(OPEN40.sprintfText);

  const rt = new MythroadRuntime({
    graphics: new NullGraphicsBackend(),
    trace: new RuntimeTrace(),
    abiMode: "strict",
  });

  let cpu: Open40Cpu | null = null;
  let p = 0;
  let helper = 0;
  let erRw = 0;
  let handler130 = false;
  let handler38 = false;
  let handler33 = false;
  let handler17 = false;
  let handler40 = false;
  let r0Text = "";
  let r6Text = "";
  let packSlotAddr = 0;
  let packPtr = 0;
  let packBytes: number[] = [];
  let packAllocSize = OPEN40.flymrpPackBytes;
  let packDataSlotIndex = dataSlotIndex(OPEN40.packSlot);
  let erRwPackWord = 0;
  const writes: Open40Write[] = [];
  let mallocs: Open40Alloc[] = [];
  const helperSnaps: Open40HelperSnap[] = [];
  let wrap: ThumbLine[] = [];
  let consumerHead: ThumbLine[] = [];
  let consumerOpen: ThumbLine[] = [];
  let after: ThumbLine[] = [];
  let wrapHw: number[] = [];
  let afterHw: number[] = [];
  let consumerBlTarget: number | null = null;
  let stubLoadSites: number[] = [];
  let wrapXrefs: Open40Bl[] = [];
  let callsites: Open40Callsite[] = [];
  let table125AfterSprintf = 0;
  let seenSprintf = false;
  let vfsExistsResLang = false;
  let vfsExistsEmpty = false;
  let mrReads: string[] = [];

  const origBind = rt.bindExt.bind(rt);
  rt.bindExt = (ext) => {
    origBind(ext);
    const e = rt.ext;
    if (!e) return;

    const prevWrite = e.mem.onWrite;
    e.mem.onWrite = (addr, size) => {
      prevWrite?.(addr, size);
      const a = addr >>> 0;
      const end = (OPEN40.filename + OPEN40.flymrpPackBytes) >>> 0;
      if (a < end && (a + size) >>> 0 > OPEN40.filename) {
        writes.push({ addr: a, size });
      }
    };

    const watch = new Set<number>([OPEN40.consumer, OPEN40.consumerLookfor, OPEN40.consumerOpen, OPEN40.wrap]);
    const prevFetch = e.cpu.onBeforeFetch;
    e.cpu.onBeforeFetch = (c) => {
      const pc = c.r[15] >>> 0;
      if (watch.has(pc) && !helperSnaps.some((s) => s.pc === pc)) {
        helperSnaps.push({
          pc,
          r0: c.r[0] >>> 0,
          r1: c.r[1] >>> 0,
          r2: c.r[2] >>> 0,
          r4: c.r[4] >>> 0,
          r5: c.r[5] >>> 0,
          r6: c.r[6] >>> 0,
          lr: c.r[14] >>> 0,
          sp: c.r[13] >>> 0,
        });
      }
      return prevFetch ? prevFetch(c) : false;
    };

    const origD = e.table.dispatch.bind(e.table);
    e.table.dispatch = (c, mem, pc) => {
      const n = tableSlotIndex(pc);
      if (n === 17) seenSprintf = true;
      if (n === 125 && seenSprintf) table125AfterSprintf++;
      if (n === OPEN40.slot && !cpu) {
        cpu = snapCpu(e);
        p = e.owners.wrapper.p >>> 0;
        helper = e.owners.wrapper.helper >>> 0;
        erRw = c.r[9] >>> 0;
        handler130 = !!e.table.handlers[130];
        handler38 = !!e.table.handlers[38];
        handler33 = !!e.table.handlers[33];
        handler17 = !!e.table.handlers[17];
        handler40 = !!e.table.handlers[40];
        r0Text = cstr(mem, c.r[0] >>> 0);
        r6Text = cstr(mem, c.r[6] >>> 0);
        packSlotAddr = tableSlotAddr(OPEN40.packSlot);
        packPtr = mem.read32(packSlotAddr) >>> 0;
        packBytes = [...mem.slice(packPtr, OPEN40.flymrpPackBytes)];
        erRwPackWord = mem.read32((erRw + 0x190) >>> 0) >>> 0;
        mallocs = rt.mrAllocs.map((a) => ({
          size: a.size,
          alignedSize: a.alignedSize,
          guestAddr: a.guestAddr,
        }));
        mrReads = rt.mrReads.map((r) => r.name);
        vfsExistsResLang = rt.vfs.exists(OPEN40.sprintfText);
        vfsExistsEmpty = rt.vfs.exists("");
        wrap = disasmRange(mem, OPEN40.wrap, OPEN40.wrapPop + 2);
        consumerHead = disasmRange(mem, OPEN40.consumer, OPEN40.consumer + 0x30);
        consumerOpen = disasmRange(mem, OPEN40.consumerOpen, OPEN40.consumerAfter);
        after = disasmRange(mem, OPEN40.consumerAfter, OPEN40.consumerAfter + 0x0a);
        wrapHw = wrap.map((l) => mem.read16(l.pc));
        afterHw = after.map((l) => mem.read16(l.pc));
        const blLine = consumerOpen.find((l) => l.pc === OPEN40.consumerBl);
        consumerBlTarget = blLine?.target ?? null;
        stubLoadSites = scanStubLoadSites(mem, codeEnd);
        wrapXrefs = scanBlTo(mem, EXT_CODE_ADDR, codeEnd, OPEN40.wrap);
        callsites = wrapXrefs.map((x) => recoverCallsite(mem, x.from));
      }
      return origD(c, mem, pc);
    };
  };

  let probeThrown = "";
  try {
    rt.loadMrp(mrp);
    rt.start("start.mr");
  } catch (e) {
    probeThrown = thrownMessage(e);
  }

  if (!cpu) throw new Error("table[40] was not reached");

  const modeCensus: Record<string, number> = {};
  for (const s of callsites) {
    const key = s.modeImm === null ? "unknown" : hx(s.modeImm);
    modeCensus[key] = (modeCensus[key] ?? 0) + 1;
  }

  return {
    handler130,
    handler38,
    handler33,
    handler17,
    handler40,
    productionThrown,
    probeThrown,
    cpu,
    p,
    helper,
    erRw,
    owner: rt.packName || "wrapper",
    r0Text,
    r6Text,
    packSlotAddr,
    packPtr,
    packBytes,
    packAllocSize,
    packDataSlotIndex,
    heapExpected: expectedDataSlotAddr(OPEN40.packSlot),
    erRwPackWord,
    writes,
    mallocs,
    filenameFromMalloc: mallocs.some((a) => a.guestAddr === OPEN40.filename),
    helperSnaps,
    encodings: {
      wrap,
      consumerHead,
      consumerOpen,
      after,
      wrapHw,
      afterHw,
      consumerBlTarget,
      stubLoadSites,
    },
    wrapXrefs,
    callsites,
    modeCensus,
    archiveHasResLang,
    vfsExistsResLang,
    vfsExistsEmpty,
    table125AfterSprintf,
    mrReads,
    decision: "B",
  };
}

export function renderOpen40Markdown(r: Open40Report): string {
  const c = r.cpu;
  const sites = r.callsites
    .map(
      (s) =>
        `${s.live ? "LIVE  " : "STATIC"} ${hx(s.bl)}  mode=${s.modeImm === null ? "—" : hx(s.modeImm)}  ${s.filenameKind}${s.filename ? ` ${JSON.stringify(s.filename)}` : ""}`,
    )
    .join("\n");
  return [
    "# table[40] / mr_open forensics (Stage 5-C.10H)",
    "",
    "Read-only snapshot of the first LIVE table[40] entry.",
    "**table[40] is not implemented. Stage 5-D NOT STARTED.**",
    "",
    "## LIVE CPU at stub",
    "",
    "```text",
    `PC    ${hx(c.pc)}`,
    `LR    ${hx(c.lr)}`,
    `SP    ${hx(c.sp)}`,
    `R0-R3 ${[c.r[0], c.r[1], c.r[2], c.r[3]].map(hx).join(" ")}`,
    `R4-R8 ${c.r.slice(4, 9).map(hx).join(" ")}`,
    `R9    ${hx(c.r9)}`,
    `CPSR  ${hx(c.cpsr)} T=${c.tBit} insn=${c.insnCount}`,
    `R0    ${JSON.stringify(r.r0Text)}`,
    `R6    ${JSON.stringify(r.r6Text)}`,
    `pack  slot=${hx(r.packSlotAddr)} ptr=${hx(r.packPtr)} bytes=${r.packBytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")}`,
    `ER_RW+0x190 ${hx(r.erRwPackWord)}`,
    `P     ${hx(r.p)} helper=${hx(r.helper)} ER_RW=${hx(r.erRw)} owner=${r.owner}`,
    "```",
    "",
    "## Wrapper 0x01ea89d8",
    "",
    "```text",
    ...r.encodings.wrap.map((l) => l.text),
    "```",
    "",
    "## Guest _mr_readFile 0x01ea8cdc",
    "",
    "```text",
    ...r.encodings.consumerHead.map((l) => l.text),
    "```",
    "",
    "## Open call 0x01ea8e8e / after 0x01ea8e96",
    "",
    "```text",
    ...r.encodings.consumerOpen.map((l) => l.text),
    ...r.encodings.after.map((l) => l.text),
    "```",
    "",
    "## Helper snaps",
    "",
    "```text",
    ...r.helperSnaps.map(
      (s) =>
        `${hx(s.pc)} r0=${hx(s.r0)} r1=${hx(s.r1)} r2=${hx(s.r2)} r4=${hx(s.r4)} r5=${hx(s.r5)} r6=${hx(s.r6)}`,
    ),
    "```",
    "",
    "## wrap callsites",
    "",
    "```text",
    sites,
    "```",
    "",
    `- production throw: ${r.productionThrown}`,
    `- probe throw: ${r.probeThrown}`,
    `- handlers 130/38/33/17/40: ${r.handler130}/${r.handler38}/${r.handler33}/${r.handler17}/${r.handler40}`,
    `- wrap BL target: ${r.encodings.consumerBlTarget === null ? "—" : hx(r.encodings.consumerBlTarget)}`,
    `- stub-load sites: ${r.encodings.stubLoadSites.map(hx).join(" ") || "—"}`,
    `- wrap xrefs: ${r.wrapXrefs.length}`,
    `- mode census: ${JSON.stringify(r.modeCensus)}`,
    `- writes to pack buffer: ${r.writes.length}`,
    `- mallocs: ${r.mallocs.map((a) => `${a.size}@${hx(a.guestAddr)}`).join(" ") || "—"}`,
    `- filename from mr_malloc: ${r.filenameFromMalloc}`,
    `- archive has res_lang0.rc: ${r.archiveHasResLang}`,
    `- VFS exists res_lang0.rc: ${r.vfsExistsResLang}`,
    `- VFS exists "": ${r.vfsExistsEmpty}`,
    `- table125 after sprintf: ${r.table125AfterSprintf}`,
    `- decision: ${r.decision} (pack_filename producer is implemented; do not implement table[40] this stage)`,
    "",
    "Stage 5-D: NOT STARTED.",
    "",
  ].join("\n");
}
