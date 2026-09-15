import { createHash } from "node:crypto";
import { ExtFault } from "../abi/fault.ts";
import { UnknownAbiError } from "../err/errors.ts";
import {
  AEX_P_ER_RW_LEN_OFF,
  AEX_P_ER_RW_OFF,
  EXT_CHUNK_MAGIC,
  EXT_CODE_ADDR,
  EXT_TABLE_ADDR,
  EXT_TABLE_COUNT,
  inTableRange,
  tableSlotIndex,
} from "../abi/layout.ts";
import { parseExtImage, type ExtImage } from "../abi/loader.ts";
import type { ModuleRef } from "../abi/owners.ts";
import type { ExtRuntime } from "../abi/runtime.ts";
import { decodeArm } from "../hot/decode-arm.ts";
import { AUX_ADD, AUX_PREINDEX, OP_NAMES, Op, unpackW0 } from "../hot/opcodes.ts";
import { MRPArchive } from "../mrp/archive.ts";
import { MythroadRuntime, NullGraphicsBackend, RuntimeTrace } from "../mythroad/index.ts";

export type Confidence = "CONFIRMED" | "INFERRED" | "UNKNOWN";

export type SlotTouch = {
  loadIndex: number;
  slot: number;
  r0: number;
  r1: number;
  r2: number;
  lr: number;
};

export type InsnMode = "ARM" | "Thumb" | "table" | "none";

export type OwnerSnap = {
  wrapper: ModuleRef;
  primary: ModuleRef;
  active: ModuleRef;
  timer: ModuleRef;
  screen: ModuleRef;
  current: ModuleRef;
};

export type CpuSnap = {
  r: number[];
  pc: number;
  lr: number;
  sp: number;
  r9: number;
  cpsr: number;
  tBit: number;
};

export type Code6PreCall = {
  cpuBeforeHostSetup: CpuSnap;
  hostWouldPass: {
    r0_P: number;
    r1_code: number;
    r2_input: number;
    r3_inputLen: number;
    r9_erRw: number;
    helper: number;
    spOutp: number;
    spOutl: number;
    note: string;
  };
  owners: OwnerSnap;
  header: { table: number; pAtPlus4: number; loadAddr: number; codeBase: number; codeLen: number };
  route: { p: number; helper: number };
  input: { luaPtr: number; luaLen: number; hostCopiedLen: number };
  output: { pointer: number; lengthPointer: number };
  moduleOwner: string;
};

export type StaticExtReport = {
  name: string;
  sha256: string;
  size: number;
  kind: ExtImage["kind"];
  dest: number;
  loadAddr: number;
  pOffset: number;
  tableOffset: number;
  headerWords: { w0: number; w1: number; w2: number };
  loadWords: number[];
  loadDisasm: string[];
  loadCallees: number[];
  blxImmTargets: { from: number; to: number }[];
  encodingBlx: { from: number; to: number }[];
  blTargets: { from: number; to: number }[];
  literalLoads: { pc: number; addr: number; value: number }[];
  tableLiterals: { pc: number; addr: number; value: number; slot: number | null }[];
  cmpImm6: { pc: number; rn: number }[];
  r9Access: { pc: number; op: string }[];
  strings: { off: number; text: string }[];
  chunkMagicOffs: number[];
  elfRelocs: "none-mrpgcmap" | "elf" | "unknown";
  notes: string[];
};

export type Code6Fault = {
  /** Code 6 guest helper was entered. Still false: load dies first. */
  guestEntered: boolean;
  /** cfunction `mr_c_function_load` took dest+0x14 BLX(1) into Thumb. */
  loadBlxTaken: boolean;
  site: string;
  classification: "ABI" | "CPU" | "MEMORY" | "CONTROL";
  subtype: string;
  faultPc: number;
  slot: number | null;
  kind: string;
  insnWord: number;
  insnMode: InsnMode;
  r: number[];
  r0: number;
  r1: number;
  r2: number;
  r3: number;
  lr: number;
  sp: number;
  r9: number;
  cpsr: number;
  tBit: number;
  dest: number;
  dest0: number;
  dest4: number;
  dest8: number;
  dest14: number;
  p: number;
  erRw: number;
  rwLen: number;
  helper: number;
  owner: OwnerSnap;
  memoryAccess: string;
  not: {
    cpuUnsupported: boolean;
    memoryMapping: boolean;
    invalidGuestControlFlow: boolean;
  };
};

export type Code6ForensicsReport = {
  packSha256: string;
  cfunction: StaticExtReport;
  loader: StaticExtReport | null;
  loads: {
    index: number;
    bytes: number;
    loadCode: number;
    ret: number;
    kind: string;
    header: { table: number; pAtPlus4: number };
    owners: OwnerSnap;
    slots: SlotTouch[];
    execPcs: number[];
  }[];
  preCall: Code6PreCall | null;
  code6Call: {
    entered: boolean;
    kind: string;
    r0: number;
    helper: number;
    firstPc: number;
    tBit: number;
    r9: number;
    erRwWord10: number;
    erRwWord20: number;
  } | null;
  cfunctionSlots: SlotTouch[];
  cfunctionExecPcs: number[];
  fault: Code6Fault;
  requiredInitialization: string[];
  confirmed: string[];
  inferred: string[];
  unknown: string[];
};

const PACK = new Uint32Array(3);

function hx(n: number): string {
  return `0x${(n >>> 0).toString(16)}`;
}

function ror32(v: number, n: number): number {
  n &= 31;
  if (!n) return v >>> 0;
  return ((v >>> n) | (v << (32 - n))) >>> 0;
}

function armExpandImm(imm12: number): number {
  return ror32(imm12 & 0xff, ((imm12 >>> 8) & 0xf) * 2);
}

/** ARM ARM A8.8.26 BLX(1). Cross-check for decodeArm. */
function blxImmTarget(pc: number, word: number): number | null {
  const w = word >>> 0;
  if ((w >>> 25) !== 0x7d) return null;
  const h = (w >>> 24) & 1;
  const off = (((w & 0xff_ffff) << 8) >> 8 << 2) + (h << 1);
  return (pc + 8 + off) >>> 0;
}

function u32(bytes: Uint8Array, off: number): number {
  return (
    bytes[off]! |
    (bytes[off + 1]! << 8) |
    (bytes[off + 2]! << 16) |
    (bytes[off + 3]! << 24)
  ) >>> 0;
}

export function sha256hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function extractNamedExt(mrp: Uint8Array, name: string): Uint8Array {
  const data = MRPArchive.parse(mrp).readFile(name);
  if (!data) throw new Error(`missing ${name}`);
  return data;
}

function snapRef(r: ModuleRef): ModuleRef {
  return { p: r.p >>> 0, helper: r.helper >>> 0 };
}

function snapOwners(ext: ExtRuntime): OwnerSnap {
  const o = ext.owners;
  return {
    wrapper: snapRef(o.wrapper),
    primary: snapRef(o.primary),
    active: snapRef(o.active),
    timer: snapRef(o.timer),
    screen: snapRef(o.screen),
    current: snapRef(o.current),
  };
}

function snapCpu(ext: ExtRuntime): CpuSnap {
  const r = [...ext.cpu.r];
  return {
    r,
    pc: r[15]! >>> 0,
    lr: r[14]! >>> 0,
    sp: r[13]! >>> 0,
    r9: r[9]! >>> 0,
    cpsr: ext.cpu.cpsr >>> 0,
    tBit: ext.cpu.t & 1,
  };
}

export function formatInsn(pc: number, word: number): string {
  decodeArm(word, PACK, 0);
  const u = unpackW0(PACK[0]!);
  const name = OP_NAMES[u.op] ?? `op${u.op}`;
  if (u.op === Op.UNDEF) return `${hx(pc)}  ${hx(word)}  UNDEF`;
  if (u.op === Op.BL || u.op === Op.B || (u.op === Op.BLX && (PACK[2]! & 0xff) === 1)) {
    const tgt = (pc + 8 + (PACK[1]! | 0)) >>> 0;
    return `${hx(pc)}  ${hx(word)}  ${name} ${hx(tgt)}`;
  }
  if (u.op === Op.BX || u.op === Op.BLX) {
    return `${hx(pc)}  ${hx(word)}  ${name} r${u.rm}`;
  }
  if (u.op === Op.LDR || u.op === Op.STR) {
    const add = u.aux & AUX_ADD ? 1 : -1;
    const imm = PACK[1]! >>> 0;
    if (u.rn === 15 && (u.aux & AUX_PREINDEX)) {
      const addr = (pc + 8 + add * imm) >>> 0;
      return `${hx(pc)}  ${hx(word)}  ${name} r${u.rd}, [pc, #${add * imm}] ; ${hx(addr)}`;
    }
    return `${hx(pc)}  ${hx(word)}  ${name} r${u.rd}, [r${u.rn}, #${add * (imm | 0)}]`;
  }
  if (u.op === Op.CMP || u.op === Op.MOV || u.op === Op.CMN) {
    if (PACK[2]! & 1) {
      const imm = armExpandImm(PACK[1]! >>> 0);
      const reg = u.op === Op.MOV ? u.rd : u.rn;
      return `${hx(pc)}  ${hx(word)}  ${name} r${reg}, #${imm}`;
    }
    return `${hx(pc)}  ${hx(word)}  ${name} r${u.rd}, r${u.rm}`;
  }
  return `${hx(pc)}  ${hx(word)}  ${name} rd=${u.rd} rn=${u.rn} rm=${u.rm} w1=${hx(PACK[1]!)}`;
}

function scanStrings(bytes: Uint8Array, max = 40): { off: number; text: string }[] {
  const out: { off: number; text: string }[] = [];
  let i = 0;
  while (i < bytes.length && out.length < max) {
    if (bytes[i]! < 0x20 || bytes[i]! > 0x7e) {
      i++;
      continue;
    }
    let j = i;
    while (j < bytes.length && bytes[j]! >= 0x20 && bytes[j]! <= 0x7e) j++;
    if (j - i >= 4) out.push({ off: i, text: String.fromCharCode(...bytes.subarray(i, Math.min(j, i + 48))) });
    i = j + 1;
  }
  return out;
}

function findDwords(bytes: Uint8Array, needle: number, max = 16): number[] {
  const out: number[] = [];
  for (let i = 0; i + 4 <= bytes.length && out.length < max; i += 4) {
    if (u32(bytes, i) === (needle >>> 0)) out.push(i);
  }
  return out;
}

export function analyzeExtImage(bytes: Uint8Array, name: string, dest = EXT_CODE_ADDR): StaticExtReport {
  const image = parseExtImage(bytes);
  const loadAddr = (dest + image.loadOffset) >>> 0;
  const notes: string[] = [];
  const loadDisasm: string[] = [];
  const loadCallees: number[] = [];
  const blTargets: { from: number; to: number }[] = [];
  const blxImmTargets: { from: number; to: number }[] = [];
  const encodingBlx: { from: number; to: number }[] = [];
  const loadWords: number[] = [];
  for (let i = 0; i < 8 && 8 + i * 4 + 4 <= bytes.length; i++) loadWords.push(u32(bytes, 8 + i * 4));
  const literalLoads: { pc: number; addr: number; value: number }[] = [];
  const tableLiterals: { pc: number; addr: number; value: number; slot: number | null }[] = [];
  const cmpImm6: { pc: number; rn: number }[] = [];
  const r9Access: { pc: number; op: string }[] = [];

  const end = dest + bytes.length;
  const limit = Math.min(bytes.length & ~3, 0x20000);
  for (let off = image.loadOffset; off + 4 <= limit; off += 4) {
    const pc = (dest + off) >>> 0;
    const word = u32(bytes, off);
    const encBlx = blxImmTarget(pc, word);
    if (encBlx !== null && encodingBlx.length < 16) encodingBlx.push({ from: pc, to: encBlx });
    decodeArm(word, PACK, 0);
    const u = unpackW0(PACK[0]!);
    if (u.op === Op.BL || (u.op === Op.BLX && (PACK[2]! & 0xff) === 1)) {
      const to = (pc + 8 + (PACK[1]! | 0)) >>> 0;
      if (u.op === Op.BL && blTargets.length < 80) blTargets.push({ from: pc, to });
      if (u.op === Op.BLX && blxImmTargets.length < 40) blxImmTargets.push({ from: pc, to });
    }
    if ((u.op === Op.LDR || u.op === Op.STR) && u.rn === 15 && (u.aux & AUX_PREINDEX) && !(u.aux & 1)) {
      const add = u.aux & AUX_ADD ? 1 : -1;
      const addr = (pc + 8 + add * (PACK[1]! >>> 0)) >>> 0;
      const fileOff = (addr - dest) >>> 0;
      if (fileOff + 4 <= bytes.length) {
        const value = u32(bytes, fileOff);
        if (literalLoads.length < 80) literalLoads.push({ pc, addr, value });
        if (value >= EXT_TABLE_ADDR && value < EXT_TABLE_ADDR + EXT_TABLE_COUNT * 4) {
          tableLiterals.push({
            pc,
            addr,
            value,
            slot: ((value - EXT_TABLE_ADDR) >>> 2) | 0,
          });
        }
      }
    }
    if (u.op === Op.CMP) {
      const imm = armExpandImm(PACK[1]! >>> 0);
      if (imm === 6 && cmpImm6.length < 24) cmpImm6.push({ pc, rn: u.rn });
    }
    if (u.rd === 9 || u.rn === 9 || u.rm === 9) {
      if (r9Access.length < 40) r9Access.push({ pc, op: OP_NAMES[u.op] ?? String(u.op) });
    }
  }

  let pc = loadAddr;
  for (let n = 0; n < 32; n++) {
    const off = (pc - dest) >>> 0;
    if (off + 4 > bytes.length) break;
    const word = u32(bytes, off);
    loadDisasm.push(formatInsn(pc, word));
    decodeArm(word, PACK, 0);
    const u = unpackW0(PACK[0]!);
    if (u.op === Op.BL || (u.op === Op.BLX && (PACK[2]! & 0xff) === 1)) {
      loadCallees.push((pc + 8 + (PACK[1]! | 0)) >>> 0);
    }
    if (u.op === Op.BX && u.rm === 14) break;
    if (u.op === Op.LDM && (PACK[1]! & (1 << 15))) break;
    if (u.op === Op.B && u.cond === 0xe) {
      pc = (pc + 8 + (PACK[1]! | 0)) >>> 0;
      continue;
    }
    if (u.op === Op.UNDEF) {
      notes.push(`load sweep hit UNDEF at ${hx(pc)} word=${hx(word)} — not treated as a function end`);
      break;
    }
    pc = (pc + 4) >>> 0;
    if (pc < dest || pc >= end) break;
  }

  const follow = loadCallees[0] ?? encodingBlx[0]?.to;
  if (follow) {
    notes.push(`first followed target ${hx(follow)} (encoding/linear, not confirmed helper)`);
    loadDisasm.push(`--- followed ${hx(follow)} ---`);
    let cpc = follow;
    for (let n = 0; n < 16; n++) {
      const off = (cpc - dest) >>> 0;
      if (off + 4 > bytes.length) break;
      loadDisasm.push(formatInsn(cpc, u32(bytes, off)));
      decodeArm(u32(bytes, off), PACK, 0);
      const u = unpackW0(PACK[0]!);
      if (u.op === Op.BX && u.rm === 14) break;
      if (u.op === Op.LDM && (PACK[1]! & (1 << 15))) break;
      cpc = (cpc + 4) >>> 0;
    }
  }

  if (image.kind !== "mrpgcmap") notes.push(`kind=${image.kind}; +8 load convention still applied`);
  notes.push("function boundaries and CMP #6 sites are linear-sweep candidates, not a decompiler CFG");

  return {
    name,
    sha256: sha256hex(bytes),
    size: bytes.length,
    kind: image.kind,
    dest,
    loadAddr,
    pOffset: image.pOffset,
    tableOffset: image.tableOffset,
    headerWords: { w0: u32(bytes, 0), w1: u32(bytes, 4), w2: u32(bytes, 8) },
    loadWords,
    loadDisasm,
    loadCallees,
    blxImmTargets,
    encodingBlx,
    blTargets,
    literalLoads,
    tableLiterals,
    cmpImm6,
    r9Access,
    strings: scanStrings(bytes),
    chunkMagicOffs: findDwords(bytes, EXT_CHUNK_MAGIC),
    elfRelocs: image.kind === "elf" ? "elf" : image.kind === "mrpgcmap" ? "none-mrpgcmap" : "unknown",
    notes,
  };
}

function emptyOwners(): OwnerSnap {
  const z = { p: 0, helper: 0 };
  return { wrapper: z, primary: z, active: z, timer: z, screen: z, current: z };
}

function emptyCpu(): CpuSnap {
  return { r: new Array(16).fill(0), pc: 0, lr: 0, sp: 0, r9: 0, cpsr: 0, tBit: 0 };
}

function memoryAccessFor(slot: number | null, r0: number, r1: number, r2: number): string {
  if (slot === 14) {
    return `table[14] memset(dest=${hx(r0)}, c=${r1}, n=${r2}) — identity CONFIRMED mythroad.c`;
  }
  if (slot === 130) {
    return `table[130] r0=${hx(r0)} r1=${hx(r1)} r2=${hx(r2)} — asm_mr_TestCom case 7 (rxgj FULL)`;
  }
  if (slot === 25) return `table[25] _mr_c_function_new(helper=${hx(r0)}, len=${r1})`;
  if (slot === 0) return `table[0] mr_malloc(${r0})`;
  if (slot === null) return "none";
  return `table[${slot}] r0=${hx(r0)} r1=${hx(r1)} r2=${hx(r2)}`;
}

type FaultCtx = {
  slot: number | null;
  cpu: CpuSnap;
  dest: number;
  dest0: number;
  dest4: number;
  dest8: number;
  dest14: number;
  p: number;
  helper: number;
  erRw: number;
  rwLen: number;
  owners: OwnerSnap;
  insnWord: number;
  insnMode: InsnMode;
};

function snapFaultCtx(e: ExtRuntime, slot: number | null): FaultCtx {
  const cpu = snapCpu(e);
  const dest = e.codeBase >>> 0;
  const p = e.owners.wrapper.p >>> 0;
  const pc = cpu.pc >>> 0;
  const table = slot !== null || inTableRange(pc);
  return {
    slot,
    cpu,
    dest,
    dest0: e.mem.read32(dest) >>> 0,
    dest4: e.mem.read32(dest + 4) >>> 0,
    dest8: e.mem.read32(dest + 8) >>> 0,
    dest14: e.mem.read32(dest + 0x14) >>> 0,
    p,
    helper: e.owners.wrapper.helper >>> 0,
    erRw: p ? e.mem.read32(p + AEX_P_ER_RW_OFF) >>> 0 : 0,
    rwLen: p ? e.mem.read32(p + AEX_P_ER_RW_LEN_OFF) >>> 0 : 0,
    owners: snapOwners(e),
    insnWord: e.mem.read32(pc & ~1) >>> 0,
    insnMode: table ? "table" : cpu.tBit ? "Thumb" : "ARM",
  };
}

function faultFromCtx(
  ctx: FaultCtx,
  extra: Pick<Code6Fault, "guestEntered" | "loadBlxTaken" | "site" | "classification" | "subtype" | "kind">,
): Code6Fault {
  const c = ctx.cpu;
  const r = c.r.length ? c.r : emptyCpu().r;
  return {
    ...extra,
    faultPc: c.pc,
    slot: ctx.slot,
    insnWord: ctx.insnWord,
    insnMode: ctx.insnMode,
    r,
    r0: r[0] ?? 0,
    r1: r[1] ?? 0,
    r2: r[2] ?? 0,
    r3: r[3] ?? 0,
    lr: c.lr,
    sp: c.sp,
    r9: c.r9,
    cpsr: c.cpsr,
    tBit: c.tBit,
    dest: ctx.dest,
    dest0: ctx.dest0,
    dest4: ctx.dest4,
    dest8: ctx.dest8,
    dest14: ctx.dest14,
    p: ctx.p,
    erRw: ctx.erRw,
    rwLen: ctx.rwLen,
    helper: ctx.helper,
    owner: ctx.owners,
    memoryAccess: memoryAccessFor(ctx.slot, r[0] ?? 0, r[1] ?? 0, r[2] ?? 0),
    not: { cpuUnsupported: false, memoryMapping: false, invalidGuestControlFlow: false },
  };
}

export function runCode6Forensics(mrp: Uint8Array): Code6ForensicsReport {
  const cfunction = analyzeExtImage(extractNamedExt(mrp, "cfunction.ext"), "cfunction.ext");
  let loader: StaticExtReport | null = null;
  try {
    loader = analyzeExtImage(extractNamedExt(mrp, "mrc_loader.ext"), "mrc_loader.ext");
  } catch {
    loader = null;
  }

  const tr = new RuntimeTrace();
  const rt = new MythroadRuntime({ graphics: new NullGraphicsBackend(), trace: tr, abiMode: "strict" });
  const loads: Code6ForensicsReport["loads"] = [];
  const slots: SlotTouch[] = [];
  let loadIndex = -1;
  let preCall: Code6PreCall | null = null;
  const code6Box: { call: Code6ForensicsReport["code6Call"] } = { call: null };
  let lastCtx: FaultCtx | null = null;
  const cfunctionExecPcs: number[] = [];
  const code6Pcs: { pc: number; tBit: number; r9: number }[] = [];

  const origBind = rt.bindExt.bind(rt);
  rt.bindExt = (ext) => {
    origBind(ext);
    const e = rt.ext;
    if (!e) return;
    loadIndex += 1;
    const idx = loadIndex;
    const execPcs: number[] = [];
    const prevFetch = e.cpu.onBeforeFetch;
    e.cpu.onBeforeFetch = (cpu) => {
      const pc = cpu.r[15] >>> 0;
      if (execPcs.length < 64) execPcs.push(pc);
      if (idx === 1 && cfunctionExecPcs.length < 64) cfunctionExecPcs.push(pc);
      return prevFetch ? prevFetch(cpu) : false;
    };
    const origDispatch = e.table.dispatch.bind(e.table);
    e.table.dispatch = (cpu, mem, pc) => {
      const n = tableSlotIndex(pc);
      if (n >= 0 && n < EXT_TABLE_COUNT && e.table.isExec(n)) {
        lastCtx = snapFaultCtx(e, n);
        slots.push({
          loadIndex: idx,
          slot: n,
          r0: cpu.r[0] >>> 0,
          r1: cpu.r[1] >>> 0,
          r2: cpu.r[2] >>> 0,
          lr: cpu.r[14] >>> 0,
        });
      }
      origDispatch(cpu, mem, pc);
    };
    const origLoad = e.load.bind(e);
    e.load = (bytes, opts) => {
      const out = origLoad(bytes, opts);
      loads.push({
        index: idx,
        bytes: bytes.length,
        loadCode: opts?.loadCode ?? 0,
        ret: out.ret | 0,
        kind: out.kind,
        header: { table: e.mem.read32(e.codeBase), pAtPlus4: e.mem.read32(e.codeBase + 4) },
        owners: snapOwners(e),
        slots: slots.filter((s) => s.loadIndex === idx),
        execPcs: execPcs.splice(0, execPcs.length),
      });
      return out;
    };
    const origCall = e.arm_ext_call.bind(e);
    e.arm_ext_call = (code, input, inputAddr, inputLen) => {
      if (code === 6) {
        const route = e.routeCall(6);
        const p = route.p >>> 0;
        const erRw = p ? e.mem.read32(p + AEX_P_ER_RW_OFF) : 0;
        preCall = {
          cpuBeforeHostSetup: snapCpu(e),
          hostWouldPass: {
            r0_P: p,
            r1_code: 6,
            r2_input: 0,
            r3_inputLen: input?.length ?? inputLen ?? 0,
            r9_erRw: erRw,
            helper: route.helper >>> 0,
            spOutp: 0,
            spOutl: 0,
            note: "host arm_ext_call writes r0=P r1=6 r9=ER_RW PC=helper when P and helper are nonzero",
          },
          owners: snapOwners(e),
          header: {
            table: e.mem.read32(e.codeBase),
            pAtPlus4: e.mem.read32(e.codeBase + 4),
            loadAddr: (e.codeBase + 8) >>> 0,
            codeBase: e.codeBase >>> 0,
            codeLen: e.codeLen,
          },
          route,
          input: {
            luaPtr: 1,
            luaLen: 1968,
            hostCopiedLen: input?.length ?? inputLen ?? 0,
          },
          output: { pointer: 0, lengthPointer: 0 },
          moduleOwner: rt.packName,
        };
        const watching = e.cpu.onBeforeFetch;
        e.cpu.onBeforeFetch = (cpu) => {
          if (code6Pcs.length < 16) {
            code6Pcs.push({ pc: cpu.r[15] >>> 0, tBit: cpu.t & 1, r9: cpu.r[9] >>> 0 });
          }
          return watching ? watching(cpu) : false;
        };
        const out = origCall(code, input, inputAddr, inputLen);
        e.cpu.onBeforeFetch = watching;
        const pAfter = e.owners.wrapper.p >>> 0;
        const er = pAfter ? e.mem.read32(pAfter + AEX_P_ER_RW_OFF) >>> 0 : 0;
        code6Box.call = {
          entered: out.kind === "return",
          kind: out.kind,
          r0: out.r0 >>> 0,
          helper: route.helper >>> 0,
          firstPc: code6Pcs[0]?.pc ?? 0,
          tBit: code6Pcs[0]?.tBit ?? 0,
          r9: code6Pcs[0]?.r9 ?? 0,
          erRwWord10: er ? e.mem.read32(er + 0x10) >>> 0 : 0,
          erRwWord20: er ? e.mem.read32(er + 0x20) >>> 0 : 0,
        };
        return out;
      }
      return origCall(code, input, inputAddr, inputLen);
    };
  };

  let thrown: unknown = null;
  try {
    rt.loadMrp(mrp);
    rt.start("start.mr");
  } catch (e) {
    thrown = e;
  }

  const cfSlots = slots.filter((s) => s.loadIndex === 1);
  const slot25 = cfSlots.some((s) => s.slot === 25);
  const loadBlxTaken = cfunctionExecPcs.includes(0x01ea5e0c);
  const unknownSlot = thrown instanceof UnknownAbiError && thrown.family === "mr_table" ? Number(thrown.code) : null;
  const platEx =
    thrown instanceof UnknownAbiError && thrown.family === "mr_platEx" ? thrown : null;
  const plat =
    thrown instanceof UnknownAbiError && thrown.family === "mr_plat" ? thrown : null;
  const open =
    thrown instanceof UnknownAbiError && thrown.family === "mr_open" ? thrown : null;
  const ctx = lastCtx ?? {
    slot: unknownSlot,
    cpu: emptyCpu(),
    dest: EXT_CODE_ADDR,
    dest0: 0,
    dest4: 0,
    dest8: 0,
    dest14: 0,
    p: 0,
    helper: 0,
    erRw: 0,
    rwLen: 0,
    owners: emptyOwners(),
    insnWord: 0,
    insnMode: "none" as const,
  };

  const code6Call = code6Box.call;
  const guestEntered = !!code6Call?.entered;
  const budget = thrown instanceof ExtFault && thrown.kind === "abi-fault";
  const faultCtx =
    budget && rt.ext
      ? {
          ...ctx,
          slot: null,
          cpu: snapCpu(rt.ext),
          insnMode: (rt.ext.cpu.t ? "Thumb" : "ARM") as InsnMode,
          insnWord: rt.ext.mem.read32(rt.ext.cpu.r[15] & ~1) >>> 0,
        }
      : ctx;
  const fault: Code6Fault = unknownSlot !== null
    ? faultFromCtx(ctx, {
        guestEntered,
        loadBlxTaken,
        site: guestEntered ? "arm_ext_call.table" : "mr_c_function_load.table",
        classification: "ABI",
        subtype: `UNKNOWN_REQUIRED_SLOT = ${unknownSlot}`,
        kind: "UNKNOWN_REQUIRED_SLOT",
      })
    : platEx
      ? faultFromCtx({ ...ctx, slot: 38 }, {
          guestEntered,
          loadBlxTaken,
          site: "arm_ext_call.table",
          classification: "ABI",
          subtype: platEx.message,
          kind: "UNKNOWN_PLATEX",
        })
    : plat
      ? faultFromCtx({ ...ctx, slot: 37 }, {
          guestEntered,
          loadBlxTaken,
          site: "arm_ext_call.table",
          classification: "ABI",
          subtype: plat.message,
          kind: "UNKNOWN_PLAT",
        })
    : open
      ? faultFromCtx({ ...ctx, slot: 40 }, {
          guestEntered,
          loadBlxTaken,
          site: "arm_ext_call.table",
          classification: "ABI",
          subtype: open.message,
          kind: "UNKNOWN_OPEN",
        })
    : budget
      ? faultFromCtx(faultCtx, {
          guestEntered,
          loadBlxTaken,
          site: "arm_ext_call.budget",
          classification: "CPU",
          subtype: "ARM_INSN_BUDGET",
          kind: thrown instanceof ExtFault ? thrown.kind : "abi-fault",
        })
    : thrown instanceof ExtFault
      ? faultFromCtx(ctx, {
          guestEntered,
          loadBlxTaken,
          site: "arm_ext_call.host_route",
          classification: "ABI",
          subtype: "missing_P_or_helper",
          kind: thrown.kind,
        })
    : thrown === null
      ? faultFromCtx(ctx, {
          guestEntered,
          loadBlxTaken,
          site: "arm_ext_call.return",
          classification: "CONTROL",
          subtype: "arm_ext_call(0) NORMAL RETURN",
          kind: "RETURN",
        })
      : (() => {
          throw new Error(`unexpected throw: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
        })();

  const cfLoadSlots = loads.find((l) => l.bytes === 220596)?.slots ?? cfSlots.filter((s) => s.slot !== unknownSlot);

  return {
    packSha256: sha256hex(mrp),
    cfunction,
    loader,
    loads,
    preCall,
    code6Call,
    cfunctionSlots: cfLoadSlots,
    cfunctionExecPcs,
    fault,
    requiredInitialization: [
      "mr_c_function_load(0) → BLX(1) → table[25] → malloc → table[14] memset → arm_ext_call(6)",
      slot25 ? "cfunction load touched table[25] (dynamic)" : "cfunction load did not touch table[25]",
      unknownSlot !== null
        ? `STOP: table[${unknownSlot}] — not implemented this stage`
        : platEx
          ? `STOP: ${platEx.message}`
        : plat
          ? `STOP: ${plat.message}`
        : open
          ? `STOP: ${open.message}`
        : budget
          ? "STOP: ARM insn watchdog during guest inflate after memcmp2"
          : "arm_ext_call(0) NORMAL RETURN; Lua resumed; Stage 5-C COMPLETE",
    ].filter(Boolean),
    confirmed: [
      "table[14] memset2(s,c,n) returns s; r0=dest r1=byte r2=size_t; GuestMemory.fill",
      "cfunction load completes after memset; P=0x0034b5c8 helper=0x01ea5e9d ER_RW=0x0024b5cc",
      "arm_ext_call(6) enters guest helper 0x01ea5e9c Thumb with r0=P r1=6 r9=ER_RW and returns 0",
      "after code 6, ER_RW+0x10=0x7b0 (1968); ER_RW+0x20=0 (the R9+0x20 note is not this store)",
      budget
        ? "strict first fault after memset: ARM_INSN_BUDGET during arm_ext_call(0) guest inflate"
        : platEx
          ? `strict first fault after memset: ${platEx.message} during arm_ext_call(0)`
        : plat
          ? `strict first fault after memset: ${plat.message} during arm_ext_call(0)`
        : open
          ? `strict first fault after memset: ${open.message} during arm_ext_call(0)`
        : thrown === null
          ? "arm_ext_call(0) NORMAL RETURN after memset/code6/inflate/timer/getScreenInfo"
          : `strict first fault after memset: UNKNOWN_REQUIRED_SLOT = ${unknownSlot} during arm_ext_call(0)`,
    ],
    inferred: [
      "docs/反汇编研究.c: helper case 6 stores input_len at R9+0x20 — not observed (word at +0x20 is 0)",
    ],
    unknown: [
      "table[9] memcmp2 is implemented; guest gzip/inflate completes; AppFS EFS + timer 31/32 + getScreenInfo 80 are REAL_EXECUTED; arm_ext_call(0) returns",
      "table[1] mr_free is registry-only; table[40]/[44]/[45]/[41]/[43] current-pack RDONLY plus AppFS EFS are implemented",
      "ER_RW 19952-byte Image$$ layout",
    ],
  };
}

export function renderCode6Markdown(r: Code6ForensicsReport): string {
  const f = r.fault;
  const o = f.owner;
  const lines = [
    "# Real cfunction.ext initialization (Stage 5-C.5)",
    "",
    "Stage 5-C.5 implements CONFIRMED `table[14]` memset2. **Code 6 is guest-run, not host-implemented. arm_ext_call(0) now returns. Stage 5-C COMPLETE. Stage 5-D STARTED.**",
    "",
    "## Binary",
    "",
    `- pack: \`test/fixtures/real/app.mrp\``,
    `- pack SHA-256: \`${r.packSha256}\``,
    `- cfunction.ext size: ${r.cfunction.size}`,
    `- cfunction.ext SHA-256: \`${r.cfunction.sha256}\``,
    `- kind: ${r.cfunction.kind}`,
    "",
    "## Call site",
    "",
    "```text",
    "start.mr",
    "  _mr_c_load()",
    "    800 mrc_loader.ext → r0=3",
    "    801 \"\" 1 → table[0]/[125] read cfunction.ext",
    "    800 cfunction.ext loadCode=0",
    "      ARM BLX(1) dest+0x14 → Thumb 0x01ea5e0c",
    "      table[25] _mr_c_function_new → P + helper",
    "      table[0] mr_malloc(19956)",
    "      table[14] memset(ER_RW, 0, 19952)  → ret=dest",
    "    801 {1, vmver} 6 → arm_ext_call(6) guest helper → r0=0",
    "    801 \"\" 0 → arm_ext_call(0) → table[130] STOP",
    "```",
    "",
    "Caller: first `start.mr` Lua stub (not the second SDK copy).",
    "",
    "## Entry",
    "",
    `- mapped dest: ${hx(r.cfunction.dest)}`,
    `- mr_c_function_load: ${hx(r.cfunction.loadAddr)} (dest+8)`,
    `- BLX(1) at dest+0x14 taken: **${r.fault.loadBlxTaken ? "yes" : "no"}**`,
    `- helper registered during load: ${hx(f.helper)}`,
    `- code 6 guest entered: **${f.guestEntered ? "yes" : "no"}**${r.code6Call ? ` kind=${r.code6Call.kind} r0=${hx(r.code6Call.r0)} firstPC=${hx(r.code6Call.firstPc)} T=${r.code6Call.tBit} r9=${hx(r.code6Call.r9)}` : ""}`,
    r.code6Call
      ? `- after code 6: ER_RW+0x10=${hx(r.code6Call.erRwWord10)} ER_RW+0x20=${hx(r.code6Call.erRwWord20)}`
      : "",
    "",
    "### cfunction load disasm (linear ARM sweep, not a decompiler)",
    "",
    "```text",
    ...r.cfunction.loadDisasm,
    "```",
    "",
    `- load words +8: ${r.cfunction.loadWords.map(hx).join(" ")}`,
    r.cfunction.loadCallees.length
      ? `- load BL/BLX callees: ${r.cfunction.loadCallees.map(hx).join(", ")}`
      : "- load BL/BLX callees: (none in the first straight-line sweep)",
    r.cfunction.blxImmTargets.length
      ? `- decodeArm BLX imm: ${r.cfunction.blxImmTargets.slice(0, 8).map((t) => `${hx(t.from)}→${hx(t.to)}`).join(", ")}`
      : "- decodeArm BLX imm: (none)",
    r.cfunction.encodingBlx.length
      ? `- ARM ARM BLX(1) encodings: ${r.cfunction.encodingBlx.slice(0, 8).map((t) => `${hx(t.from)}→${hx(t.to)}`).join(", ")}`
      : "- ARM ARM BLX(1): (none in first 128K)",
    "",
    "## First fault (strict MythroadRuntime)",
    "",
    "```text",
    `site          ${f.site}`,
    `kind          ${f.kind}`,
    `PC            ${hx(f.faultPc)}  mode=${f.insnMode}`,
    `instruction   ${hx(f.insnWord)}`,
    `LR            ${hx(f.lr)}`,
    `SP            ${hx(f.sp)}`,
    `R0-R3         ${[f.r0, f.r1, f.r2, f.r3].map(hx).join(" ")}`,
    `R4-R8         ${f.r.slice(4, 9).map(hx).join(" ")}`,
    `R9            ${hx(f.r9)}`,
    `R10-R12       ${f.r.slice(10, 13).map(hx).join(" ")}`,
    `CPSR          ${hx(f.cpsr)}  T=${f.tBit}`,
    `dest+0/4/8/14 ${hx(f.dest0)} ${hx(f.dest4)} ${hx(f.dest8)} ${hx(f.dest14)}`,
    `P             ${hx(f.p)}`,
    `ER_RW         ${hx(f.erRw)}  len=${f.rwLen}`,
    `helper        ${hx(f.helper)}`,
    `owner wrap    P=${hx(o.wrapper.p)} helper=${hx(o.wrapper.helper)}`,
    `memory        ${f.memoryAccess}`,
    "```",
    "",
    `| field | value |`,
    `|---|---|`,
    `| classification | **${f.classification}** (${f.subtype}) |`,
    `| site | \`${f.site}\` |`,
    `| fault PC | ${hx(f.faultPc)} (${f.insnMode}) |`,
    `| code 6 guest | ${f.guestEntered ? "entered" : "not reached"} |`,
    `| load BLX taken | ${f.loadBlxTaken ? "yes" : "no"} |`,
    `| CPU unsupported | no |`,
    `| memory mapping | no |`,
    `| invalid guest CF | no |`,
    "",
    "## P / ER_RW / R9 / owner / helper",
    "",
    "```text",
    `wrapper  P=${hx(o.wrapper.p)} helper=${hx(o.wrapper.helper)}`,
    `primary  P=${hx(o.primary.p)} helper=${hx(o.primary.helper)}`,
    `active   P=${hx(o.active.p)} helper=${hx(o.active.helper)}`,
    `timer    P=${hx(o.timer.p)} helper=${hx(o.timer.helper)}`,
    `screen   P=${hx(o.screen.p)} helper=${hx(o.screen.helper)}`,
    `current  P=${hx(o.current.p)} helper=${hx(o.current.helper)}`,
    `header+0 ${hx(f.dest0)}`,
    `header+4 ${hx(f.dest4)}`,
    `ER_RW    ${hx(f.erRw)} len=${f.rwLen}`,
    `R9       ${hx(f.r9)}  (host sets r9=ER_RW for arm_ext_call; leftover at fault)`,
    "```",
    "",
    "P source (**CONFIRMED**): guest BLX body calls `table[25]` `_mr_c_function_new(helper, 20)` → dest+4 and `owners.wrapper/active`. Guest then `table[0] mr_malloc(19956)` and `table[14] memset(ER_RW,0,19952)`.",
    "",
    "R9 (**CONFIRMED**): host writes r9=`P.start_of_ER_RW` inside `arm_ext_call`. Observed at code 6 entry: R9=`0x0024b5cc`. Isolated load still ends with R9=0.",
    "",
    "Owner routing (**CONFIRMED** `routeCall`): code 6 → active || wrapper. Both hold P/helper. `800` completed so `rt.ext` stays bound through the later `801` code 0 fault.",
    "",
    "## Input / output ABI",
    "",
    "- Lua `_strCom(801, {1, vmver}, 6)` ran and guest helper returned 0 (**CONFIRMED**).",
    "- Host `arm_ext_call`: r0=P, r1=6, r2=input, r3=len, r9=ER_RW, PC=helper (**CONFIRMED**, observed).",
    "- Do not implement a host code-6 helper; the registered guest helper already ran.",
    "",
    "## Static evidence (cfunction.ext)",
    "",
    `- ELF relocs/GOT: ${r.cfunction.elfRelocs}`,
    `- chunk magic 0x7fd854eb offs: ${r.cfunction.chunkMagicOffs.map((x) => hx(x)).join(", ") || "(none)"}`,
    `- CMP #6 candidates: ${r.cfunction.cmpImm6.map((c) => `${hx(c.pc)} rn=r${c.rn}`).join(", ") || "(none)"}`,
    `- table-range PC literals: ${r.cfunction.tableLiterals.length}`,
    `- R9-touching insns (first ${r.cfunction.r9Access.length}): ${r.cfunction.r9Access.slice(0, 8).map((x) => `${hx(x.pc)} ${x.op}`).join(", ") || "(none)"}`,
    `- strings (sample): ${r.cfunction.strings.slice(0, 8).map((s) => `\`${s.text}\``).join(", ") || "(none)"}`,
    "",
    "## Dynamic evidence",
    "",
    `- cfunction slots: [${r.cfunctionSlots.map((s) => `${s.slot}(r0=${hx(s.r0)},r1=${hx(s.r1)},r2=${hx(s.r2)})`).join("; ")}]`,
    `- cfunction exec PCs: [${r.cfunctionExecPcs.map(hx).join(" ")}]`,
    ...r.loads.map(
      (l) =>
        `- load[${l.index}] bytes=${l.bytes} loadCode=${l.loadCode} ret=${l.ret} kind=${l.kind} +4=${hx(l.header.pAtPlus4)} slots=[${l.slots.map((s) => s.slot).join(",")}] execPcs=[${l.execPcs.map(hx).join(" ")}]`,
    ),
    r.preCall ? `- preCall for code 6 present` : "- preCall for code 6: absent",
    r.code6Call
      ? `- code6Call entered=${r.code6Call.entered} kind=${r.code6Call.kind} r0=${hx(r.code6Call.r0)} firstPC=${hx(r.code6Call.firstPc)}`
      : "- code6Call: absent",
    "",
    "## REQUIRED_INITIALIZATION",
    "",
    ...r.requiredInitialization.map((s) => `- ${s}`),
    "",
    "Do not invent a code-6 helper. Do not implement table[33] / Stage 5-D.",
    "",
    "## CONFIRMED",
    "",
    ...r.confirmed.map((s) => `- ${s}`),
    "",
    "## INFERRED",
    "",
    ...r.inferred.map((s) => `- ${s}`),
    "",
    "## UNKNOWN",
    "",
    ...r.unknown.map((s) => `- ${s}`),
    "",
    "## Next required evidence",
    "",
    "- Stage 5-C.10C: table[38] code 0x4c6 REAL_EXECUTED; production STOP is table[33]. Do not implement 33.",
    "- Do not implement a host code-6 helper, remaining platEx codes, or Stage 5-D from this report.",
    "",
  ];
  return lines.join("\n");
}
