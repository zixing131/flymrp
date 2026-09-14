import { add64, smul64, umul64 } from "../abi/u64.ts";
import { ARMCPU, CpuTrap, UnsupportedInsn } from "./cpu.ts";
import { MemoryFault } from './memory.ts';
import { decodeAt, insnSize } from "./decode.ts";
import { addFlags, conditionPassed, nz, subFlags } from "./flags.ts";
import {
  AUX_ADD,
  AUX_LDM_P,
  AUX_LDM_S,
  AUX_LDM_U,
  AUX_LDM_W,
  AUX_PREINDEX,
  AUX_REG_OFFSET,
  AUX_SHIFT_REG,
  AUX_WRITEBACK,
  Op,
  unpackW0,
} from "./opcodes.ts";
import { armExpandImm, shiftImm, shiftReg, thumbExpandImm } from "./shifter.ts";

const tmp = new Uint32Array(3);

function readReg(cpu: ARMCPU, n: number, instPC: number, plus12 = false): number {
  if (n !== 15) return cpu.r[n] >>> 0;
  if (cpu.t) return (instPC + 4) >>> 0;
  return (instPC + (plus12 ? 12 : 8)) >>> 0;
}

function readBase(cpu: ARMCPU, n: number, instPC: number): number {
  if (n !== 15) return cpu.r[n] >>> 0;
  if (cpu.t) return ((instPC + 4) & ~3) >>> 0;
  return (instPC + 8) >>> 0;
}

function writeReg(cpu: ARMCPU, n: number, val: number, instPC: number, interwork: boolean): void {
  if (n !== 15) {
    cpu.r[n] = val >>> 0;
    return;
  }
  cpu.branched = 1;
  const v = val >>> 0;
  if (interwork) {
    cpu.t = v & 1;
    cpu.r[15] = (v & ~1) >>> 0;
    if (!cpu.t) cpu.r[15] &= ~3;
  } else {
    cpu.r[15] = (cpu.t ? v & ~1 : v & ~3) >>> 0;
  }
}

function shifterOp(
  cpu: ARMCPU,
  instPC: number,
  rm: number,
  shiftType: number,
  aux: number,
  w1: number,
  w2: number,
): { val: number; c: number } {
  const kind = w2 & 0xff;
  if (aux & AUX_SHIFT_REG) {
    const rs = kind & 0xf;
    const rmVal = readReg(cpu, rm, instPC, rm === 15);
    const rsVal = readReg(cpu, rs, instPC, false);
    return shiftReg(rmVal, shiftType, rsVal & 0xff, cpu.c);
  }
  if (kind === 1) return armExpandImm(w1, cpu.c);
  if (kind === 2) return thumbExpandImm(w1, cpu.c);
  if (kind === 3) {
    const t = thumbExpandImm(w1, cpu.c);
    return { val: ~t.val >>> 0, c: t.c };
  }
  if (kind === 4) return { val: w1 >>> 0, c: cpu.c };
  const rmVal = readReg(cpu, rm, instPC, false);
  return shiftImm(rmVal, shiftType, w1, cpu.c);
}

function setNZ(cpu: ARMCPU, result: number): void {
  const f = nz(result);
  cpu.n = f.n;
  cpu.z = f.z;
}

function execAlu(
  cpu: ARMCPU,
  instPC: number,
  op: number,
  rd: number,
  rn: number,
  rm: number,
  shiftType: number,
  s: number,
  aux: number,
  w1: number,
  w2: number,
): void {
  const sh = shifterOp(cpu, instPC, rm, shiftType, aux, w1, w2);
  const a =
    cpu.t && rn === 15 && (w2 & 0xff) === 4
      ? readBase(cpu, 15, instPC)
      : readReg(cpu, rn, instPC, false);
  const b = sh.val;
  let result = 0;
  let write = 1;
  let arith = 0;
  let add = 0;
  let cin = 0;

  switch (op) {
    case Op.AND:
      result = (a & b) >>> 0;
      break;
    case Op.EOR:
      result = (a ^ b) >>> 0;
      break;
    case Op.ORR:
      result = (a | b) >>> 0;
      break;
    case Op.BIC:
      result = (a & ~b) >>> 0;
      break;
    case Op.MOV:
      result = b >>> 0;
      break;
    case Op.MVN:
      result = ~b >>> 0;
      break;
    case Op.TST:
      result = (a & b) >>> 0;
      write = 0;
      break;
    case Op.TEQ:
      result = (a ^ b) >>> 0;
      write = 0;
      break;
    case Op.ADD:
      arith = 1;
      add = 1;
      cin = 0;
      break;
    case Op.CMN:
      arith = 1;
      add = 1;
      cin = 0;
      write = 0;
      break;
    case Op.ADC:
      arith = 1;
      add = 1;
      cin = cpu.c;
      break;
    case Op.SUB:
      arith = 1;
      add = 0;
      cin = 1;
      break;
    case Op.CMP:
      arith = 1;
      add = 0;
      cin = 1;
      write = 0;
      break;
    case Op.SBC:
      arith = 1;
      add = 0;
      cin = cpu.c;
      break;
    case Op.RSB:
      arith = 1;
      add = 0;
      cin = 1;
      {
        const f = subFlags(b, a, 1);
        result = f.result;
        if (s) {
          setNZ(cpu, result);
          cpu.c = f.c;
          cpu.v = f.v;
        }
        if (write) writeReg(cpu, rd, result, instPC, false);
      }
      return;
    case Op.RSC: {
      const f = subFlags(b, a, cpu.c);
      result = f.result;
      if (s) {
        setNZ(cpu, result);
        cpu.c = f.c;
        cpu.v = f.v;
      }
      writeReg(cpu, rd, result, instPC, false);
      return;
    }
    default:
      throw new UnsupportedInsn(instPC, op, cpu.t, "alu");
  }

  if (arith) {
    const f = add ? addFlags(a, b, cin) : subFlags(a, b, cin);
    result = f.result;
    if (s) {
      setNZ(cpu, result);
      cpu.c = f.c;
      cpu.v = f.v;
    }
  } else if (s) {
    setNZ(cpu, result);
    cpu.c = sh.c;
  }
  if (write) writeReg(cpu, rd, result, instPC, false);
}

function loadStore(
  cpu: ARMCPU,
  instPC: number,
  op: number,
  rd: number,
  rn: number,
  rm: number,
  shiftType: number,
  aux: number,
  w1: number,
): void {
  const pre = (aux & AUX_PREINDEX) !== 0;
  const add = (aux & AUX_ADD) !== 0;
  const wb = (aux & AUX_WRITEBACK) !== 0;
  const base = readBase(cpu, rn, instPC);
  let off: number;
  if (aux & AUX_REG_OFFSET) {
    off = shiftImm(readReg(cpu, rm, instPC, false), shiftType, w1, cpu.c).val;
  } else {
    off = w1 >>> 0;
  }
  const sum = add ? (base + off) >>> 0 : (base - off) >>> 0;
  const addr = pre ? sum : base;
  const wbAddr = sum;

  switch (op) {
    case Op.LDRD:
    case Op.STRD: {
      // Select the permitted word-aligned implementation. Unlike LDR, these
      // accesses must never use ARMv5's unaligned rotated-word semantics.
      if (addr & 3) throw new MemoryFault(addr, 'alignment', 8);
      if (op === Op.LDRD) {
        const low = cpu.mem.read32(addr), high = cpu.mem.read32((addr + 4) >>> 0);
        cpu.r[rd] = low; cpu.r[rd + 1] = high;
      } else {
        cpu.mem.write32(addr, cpu.r[rd]);
        cpu.mem.write32((addr + 4) >>> 0, cpu.r[rd + 1]);
      }
      break;
    }
    case Op.LDR:
      writeReg(cpu, rd, cpu.mem.read32Armv5(addr), instPC, rd === 15);
      break;
    case Op.STR: {
      const val = rd === 15 ? (instPC + (cpu.t ? 4 : 12)) >>> 0 : cpu.r[rd] >>> 0;
      cpu.mem.write32(addr & ~3, val);
      break;
    }
    case Op.LDRB:
      cpu.r[rd] = cpu.mem.read8(addr);
      break;
    case Op.STRB:
      cpu.mem.write8(addr, cpu.r[rd]);
      break;
    case Op.LDRH:
      cpu.r[rd] = cpu.mem.read16(addr);
      break;
    case Op.STRH:
      cpu.mem.write16(addr & ~1, cpu.r[rd]);
      break;
    case Op.LDRSB:
      cpu.r[rd] = (cpu.mem.read8(addr) << 24) >> 24 >>> 0;
      break;
    case Op.LDRSH:
      cpu.r[rd] = (cpu.mem.read16(addr) << 16) >> 16 >>> 0;
      break;
    default:
      throw new UnsupportedInsn(instPC, op, cpu.t, "ls");
  }

  if (wb && rn !== 15 && !(op === Op.LDR && rd === rn)) {
    cpu.r[rn] = wbAddr;
  }
}

function popcount16(list: number): number {
  let n = 0;
  let x = list & 0xffff;
  while (x) {
    n += x & 1;
    x >>>= 1;
  }
  return n;
}

function blockXfer(
  cpu: ARMCPU,
  instPC: number,
  op: number,
  rn: number,
  aux: number,
  list: number,
): void {
  if (aux & AUX_LDM_S) {
    throw new UnsupportedInsn(instPC, list, cpu.t, "LDM/STM S bit");
  }
  const p = (aux & AUX_LDM_P) !== 0;
  const u = (aux & AUX_LDM_U) !== 0;
  const w = (aux & AUX_LDM_W) !== 0;
  const n = popcount16(list);
  let addr = cpu.r[rn] >>> 0;
  if (!u) addr = (addr - n * 4) >>> 0;
  if (p === u) addr = (addr + 4) >>> 0;
  const wb = u ? (cpu.r[rn] + n * 4) >>> 0 : (cpu.r[rn] - n * 4) >>> 0;
  const load = op === Op.LDM;

  for (let i = 0; i < 16; i++) {
    if (((list >>> i) & 1) === 0) continue;
    if (load) {
      const val = cpu.mem.read32(addr);
      if (i === 15) writeReg(cpu, 15, val, instPC, true);
      else cpu.r[i] = val;
    } else {
      let val = cpu.r[i] >>> 0;
      if (i === 15) val = (instPC + (cpu.t ? 4 : 12)) >>> 0;
      cpu.mem.write32(addr, val);
    }
    addr = (addr + 4) >>> 0;
  }
  if (w && rn !== 15 && !(load && ((list >>> rn) & 1))) {
    cpu.r[rn] = wb;
  }
}

function execMul(
  cpu: ARMCPU,
  instPC: number,
  op: number,
  rd: number,
  rn: number,
  rm: number,
  s: number,
  rs: number,
): void {
  const a = cpu.r[rm] >>> 0;
  const b = cpu.r[rs] >>> 0;
  if (op === Op.MUL || op === Op.MLA) {
    let r = Math.imul(a, b) >>> 0;
    if (op === Op.MLA) r = (r + (cpu.r[rn] >>> 0)) >>> 0;
    cpu.r[rd] = r;
    if (s) setNZ(cpu, r);
    return;
  }
  const unsigned = op === Op.UMULL || op === Op.UMLAL;
  const prod = unsigned ? umul64(a, b) : smul64(a << 0, b << 0);
  let plo = prod[0], phi = prod[1];
  if (op === Op.UMLAL || op === Op.SMLAL) {
    const sLo = (plo + (cpu.r[rn] >>> 0)) >>> 0;
    const carry = sLo < plo ? 1 : 0;
    phi = (phi + (cpu.r[rd] >>> 0) + carry) >>> 0;
    plo = sLo;
  }
  cpu.r[rn] = plo;
  cpu.r[rd] = phi;
  if (s) {
    cpu.n = phi >>> 31;
    cpu.z = phi === 0 && plo === 0 ? 1 : 0;
  }
}

function clz(val: number): number {
  const v = val >>> 0;
  if (v === 0) return 32;
  return Math.clz32(v);
}

function advanceIT(cpu: ARMCPU): void {
  const bits = cpu.itState;
  if (bits === 0) return;
  if (bits & 7) cpu.itState = (bits & 0xe0) | ((bits << 1) & 0x1f);
  else cpu.itState = 0;
}

export function execPacked(
  cpu: ARMCPU,
  instPC: number,
  w0: number,
  w1: number,
  w2: number,
): void {
  const u = unpackW0(w0);
  const size = insnSize(w2);
  cpu.branched = 0;

  let cond = u.cond;
  if (cpu.itState && u.op !== Op.IT) {
    cond = (cpu.itState >>> 4) & 0xf;
  }

  if (!conditionPassed(cond, cpu.n, cpu.z, cpu.c, cpu.v)) {
    advanceIT(cpu);
    cpu.r[15] = (instPC + size) >>> 0;
    return;
  }

  switch (u.op) {
    case Op.AND:
    case Op.EOR:
    case Op.SUB:
    case Op.RSB:
    case Op.ADD:
    case Op.ADC:
    case Op.SBC:
    case Op.RSC:
    case Op.TST:
    case Op.TEQ:
    case Op.CMP:
    case Op.CMN:
    case Op.ORR:
    case Op.MOV:
    case Op.BIC:
    case Op.MVN:
      execAlu(cpu, instPC, u.op, u.rd, u.rn, u.rm, u.shiftType, u.s, u.aux, w1, w2);
      break;
    case Op.MUL:
    case Op.MLA:
    case Op.UMULL:
    case Op.UMLAL:
    case Op.SMULL:
    case Op.SMLAL:
      execMul(cpu, instPC, u.op, u.rd, u.rn, u.rm, u.s, w1 & 0xf);
      break;
    case Op.DSP_MUL: {
      const a = cpu.r[u.rm], b = cpu.r[w1 & 15];
      const halfA = u.shiftType & 1 ? a >> 16 : (a << 16) >> 16;
      const halfB = u.shiftType & 2 ? b >> 16 : (b << 16) >> 16;
      // 32x16 fits exactly in JavaScript's 53-bit integer precision. Floor
      // matches arithmetic >>16 for negative products as well.
      const product = u.aux === 1 ? Math.floor((a | 0) * halfB / 65536) : halfA * halfB;
      if (u.aux === 2) {
        const sum = add64(cpu.r[u.rn], cpu.r[u.rd], product >>> 0, product < 0 ? 0xffffffff : 0);
        cpu.r[u.rn] = sum[0];
        cpu.r[u.rd] = sum[1];
      } else {
        const accumulate = u.aux === 0 || (u.aux === 1 && !(u.shiftType & 1));
        const result = product + (accumulate ? cpu.r[u.rn] | 0 : 0);
        if (accumulate && (result > 0x7fffffff || result < -0x80000000)) cpu.cpsrExtra |= 0x08000000;
        cpu.r[u.rd] = result >>> 0;
      }
      break;
    }
    case Op.LDR:
    case Op.STR:
    case Op.LDRB:
    case Op.STRB:
    case Op.LDRH:
    case Op.STRH:
    case Op.LDRSB:
    case Op.LDRSH:
    case Op.LDRD:
    case Op.STRD:
      loadStore(cpu, instPC, u.op, u.rd, u.rn, u.rm, u.shiftType, u.aux, w1);
      break;
    case Op.LDM:
    case Op.STM:
      blockXfer(cpu, instPC, u.op, u.rn, u.aux, w1);
      break;
    case Op.B: {
      const base = (instPC + (cpu.t ? 4 : 8)) >>> 0;
      writeReg(cpu, 15, (base + (w1 | 0)) >>> 0, instPC, false);
      break;
    }
    case Op.BL: {
      cpu.r[14] = ((instPC + size) | (cpu.t ? 1 : 0)) >>> 0;
      const base = (instPC + (cpu.t ? 4 : 8)) >>> 0;
      writeReg(cpu, 15, (base + (w1 | 0)) >>> 0, instPC, false);
      break;
    }
    case Op.BX: {
      const dest = readReg(cpu, u.rm, instPC, false);
      writeReg(cpu, 15, dest, instPC, true);
      break;
    }
    case Op.BLX: {
      const target = readReg(cpu, u.rm, instPC, false);
      cpu.r[14] = ((instPC + size) | (cpu.t ? 1 : 0)) >>> 0;
      if ((w2 & 0xff) === 1) {
        if (cpu.t) {
          cpu.t = 0;
          cpu.branched = 1;
          cpu.r[15] = (((instPC + 4) & ~3) + (w1 | 0)) >>> 0;
        } else {
          writeReg(cpu, 15, ((((instPC + 8) & ~3) + (w1 | 0)) | 1) >>> 0, instPC, true);
        }
      } else {
        writeReg(cpu, 15, target, instPC, true);
      }
      break;
    }
    case Op.MRS:
      cpu.r[u.rd] = cpu.cpsr;
      break;
    case Op.MSR: {
      const mask = u.rn;
      let val: number;
      if (u.aux & 1) val = armExpandImm(w1, cpu.c).val;
      else val = cpu.r[u.rm] >>> 0;
      if (mask & 8) {
        cpu.n = (val >>> 31) & 1;
        cpu.z = (val >>> 30) & 1;
        cpu.c = (val >>> 29) & 1;
        cpu.v = (val >>> 28) & 1;
        cpu.cpsrExtra = (cpu.cpsrExtra & ~0x08000000) | (val & 0x08000000);
      }
      break;
    }
    case Op.CLZ:
      cpu.r[u.rd] = clz(readReg(cpu, u.rm, instPC, false));
      break;
    case Op.SWP:
    case Op.SWPB: {
      const addr = cpu.r[u.rn] >>> 0;
      if (u.op === Op.SWP) {
        const old = cpu.mem.read32Armv5(addr);
        cpu.mem.write32(addr & ~3, cpu.r[u.rm] >>> 0);
        cpu.r[u.rd] = old;
      } else {
        const old = cpu.mem.read8(addr);
        cpu.mem.write8(addr, cpu.r[u.rm]);
        cpu.r[u.rd] = old;
      }
      break;
    }
    case Op.UXTB:
      cpu.r[u.rd] = cpu.r[u.rm] & 0xff;
      break;
    case Op.UXTH:
      cpu.r[u.rd] = cpu.r[u.rm] & 0xffff;
      break;
    case Op.SXTB:
      cpu.r[u.rd] = (cpu.r[u.rm] << 24) >> 24 >>> 0;
      break;
    case Op.SXTH:
      cpu.r[u.rd] = (cpu.r[u.rm] << 16) >> 16 >>> 0;
      break;
    case Op.REV: {
      const x = cpu.r[u.rm] >>> 0;
      cpu.r[u.rd] =
        ((x & 0xff) << 24) | ((x & 0xff00) << 8) | ((x >>> 8) & 0xff00) | (x >>> 24);
      break;
    }
    case Op.REV16: {
      const x = cpu.r[u.rm] >>> 0;
      cpu.r[u.rd] =
        ((x & 0xff) << 8) | ((x >>> 8) & 0xff) | ((x & 0xff0000) << 8) | ((x >>> 8) & 0xff0000);
      break;
    }
    case Op.REVSH: {
      const x = cpu.r[u.rm] >>> 0;
      const lo = ((x & 0xff) << 8) | ((x >>> 8) & 0xff);
      cpu.r[u.rd] = (lo << 16) >> 16 >>> 0;
      break;
    }
    case Op.CBZ:
    case Op.CBNZ: {
      const z = (cpu.r[u.rn] >>> 0) === 0;
      if ((u.op === Op.CBZ && z) || (u.op === Op.CBNZ && !z)) {
        writeReg(cpu, 15, (instPC + 4 + (w1 | 0)) >>> 0, instPC, false);
      }
      break;
    }
    case Op.IT:
      cpu.itState = w1 & 0xff;
      break;
    case Op.MOVW:
      cpu.r[u.rd] = w1 & 0xffff;
      break;
    case Op.MOVT:
      cpu.r[u.rd] = ((w1 & 0xffff) << 16) | (cpu.r[u.rd] & 0xffff);
      break;
    case Op.NOP:
      break;
    case Op.BKPT:
      throw new CpuTrap("BKPT", instPC, w1);
    case Op.SVC:
      if (cpu.onSvc?.(cpu, w1)) break;
      throw new CpuTrap("SVC", instPC, w1);
    case Op.UNDEF:
      throw new UnsupportedInsn(instPC, w1, cpu.t);
    default:
      throw new UnsupportedInsn(instPC, u.op, cpu.t, "op");
  }

  if (u.op !== Op.IT) advanceIT(cpu);
  if (!cpu.branched) cpu.r[15] = (instPC + size) >>> 0;
}

export function step(cpu: ARMCPU): void {
  if (cpu.onBeforeFetch && cpu.onBeforeFetch(cpu)) return;
  const pc = cpu.r[15] >>> 0;
  decodeAt(cpu.mem, pc, cpu.t, tmp, 0);
  execPacked(cpu, pc, tmp[0]!, tmp[1]!, tmp[2]!);
  cpu.insnCount++;
}

export function run(cpu: ARMCPU, maxInsns: number): number {
  const start = cpu.insnCount;
  const limit = start + maxInsns;
  if (cpu.cache && cpu.itState === 0) {
    while (cpu.insnCount < limit && !cpu.halted) {
      cpu.cache.runBlock(cpu, limit - cpu.insnCount);
    }
  } else {
    while (cpu.insnCount < limit && !cpu.halted) step(cpu);
  }
  return cpu.insnCount - start;
}
