import {
  AUX_ADD,
  AUX_LDM_P,
  AUX_LDM_S,
  AUX_LDM_U,
  AUX_LDM_W,
  AUX_MSR_IMM,
  AUX_PREINDEX,
  AUX_REG_OFFSET,
  AUX_RRX,
  AUX_SHIFT_REG,
  AUX_WRITEBACK,
  Op,
  packW0,
} from "./opcodes.ts";

export const ARM_DP_OPS = [
  Op.AND,
  Op.EOR,
  Op.SUB,
  Op.RSB,
  Op.ADD,
  Op.ADC,
  Op.SBC,
  Op.RSC,
  Op.TST,
  Op.TEQ,
  Op.CMP,
  Op.CMN,
  Op.ORR,
  Op.MOV,
  Op.BIC,
  Op.MVN,
] as const;

function emit(
  out: Uint32Array,
  idx: number,
  op: number,
  cond: number,
  rd: number,
  rn: number,
  rm: number,
  shiftType: number,
  s: number,
  aux: number,
  w1: number,
  w2 = 0,
): void {
  out[idx] = packW0(op, cond, rd, rn, rm, shiftType, s, aux);
  out[idx + 1] = w1 >>> 0;
  out[idx + 2] = w2 >>> 0;
}

function undef(out: Uint32Array, idx: number, cond: number, word: number): void {
  emit(out, idx, Op.UNDEF, cond, 0, 0, 0, 0, 0, 0, word >>> 0, 0);
}

function signExt24(imm24: number): number {
  return (imm24 << 8) >> 8;
}

/** Decode one ARM word into packed [w0,w1,w2] at out[idx]. */
export function decodeArm(word: number, out: Uint32Array, idx: number): void {
  word >>>= 0;
  const cond = word >>> 28;
  const op1 = (word >>> 25) & 7;

  if (cond === 0xf) {
    // BLX(1): 1111 101 H imm24. Do not use `(word & 0xfe000000) === 0xfa000000`:
    // JS `&` is signed Int32, so 0xfa000000 !== 4194304000 and the insn
    // became UNDEF / NV-skip (Stage 5-C.3 cfunction.ext dest+0x14).
    if (word >>> 25 === 0x7d) {
      const h = (word >>> 24) & 1;
      const off = (signExt24(word & 0xff_ffff) << 2) + (h << 1);
      emit(out, idx, Op.BLX, 0xe, 0, 0, 0, 0, 0, 0, off >>> 0, 1);
      return;
    }
    undef(out, idx, cond, word);
    return;
  }

  if ((word & 0x0f00_0000) === 0x0f00_0000) {
    emit(out, idx, Op.SVC, cond, 0, 0, 0, 0, 0, 0, word & 0xff_ffff, 0);
    return;
  }

  if ((word & 0x0fff_fff0) === 0x012f_ff10) {
    emit(out, idx, Op.BX, cond, 0, 0, word & 0xf, 0, 0, 0, 0, 0);
    return;
  }
  if ((word & 0x0fff_fff0) === 0x012f_ff30) {
    emit(out, idx, Op.BLX, cond, 0, 0, word & 0xf, 0, 0, 0, 0, 0);
    return;
  }
  if ((word & 0x0fff_0ff0) === 0x016f_0f10) {
    emit(out, idx, Op.CLZ, cond, (word >>> 12) & 0xf, 0, word & 0xf, 0, 0, 0, 0, 0);
    return;
  }

  if ((word & 0x0fbf_0fff) === 0x010f_0000) {
    if ((word >>> 22) & 1) {
      undef(out, idx, cond, word);
      return;
    }
    emit(out, idx, Op.MRS, cond, (word >>> 12) & 0xf, 0, 0, 0, 0, 0, 0, 0);
    return;
  }
  if ((word & 0x0db0_f000) === 0x0120_f000) {
    const imm = (word >>> 25) & 1;
    const mask = (word >>> 16) & 0xf;
    const rm = word & 0xf;
    const w1 = imm ? word & 0xfff : 0;
    emit(
      out,
      idx,
      Op.MSR,
      cond,
      0,
      mask,
      rm,
      0,
      0,
      imm ? AUX_MSR_IMM : 0,
      w1,
      (word >>> 22) & 1,
    );
    return;
  }

  if ((word & 0x0f00_00f0) === 0x0000_0090) {
    decodeMul(word, cond, out, idx);
    return;
  }

  // ARMv5TE signed halfword multiply family. Bits 6/5 select top/bottom
  // halves; kind=1 uses a full signed word and takes product[47:16].
  if ((word & 0x0f90_0090) === 0x0100_0080) {
    const kind = (word >>> 21) & 3;
    const rd = (word >>> 16) & 15, rn = (word >>> 12) & 15;
    const rs = (word >>> 8) & 15, rm = word & 15;
    const xy = (word >>> 5) & 3;
    if ([rd, rs, rm].includes(15) ||
        ((kind === 3 || (kind === 1 && (xy & 1))) ? rn !== 0 : rn === 15) ||
        (kind === 2 && rd === rn)) {
      undef(out, idx, cond, word);
    } else emit(out, idx, Op.DSP_MUL, cond, rd, rn, rm, xy, 0, kind, rs);
    return;
  }

  if ((word & 0x0e00_0090) === 0x0000_0090) {
    const sh = (word >>> 5) & 3;
    if (sh !== 0) {
      decodeExtraLs(word, cond, out, idx);
      return;
    }
  }

  if ((word & 0x0fb0_0ff0) === 0x0100_0090) {
    const b = (word >>> 22) & 1;
    emit(
      out,
      idx,
      b ? Op.SWPB : Op.SWP,
      cond,
      (word >>> 12) & 0xf,
      (word >>> 16) & 0xf,
      word & 0xf,
      0,
      0,
      0,
      0,
      0,
    );
    return;
  }

  if ((word & 0xfff0_00f0) === 0xe120_0070) {
    emit(out, idx, Op.BKPT, cond, 0, 0, 0, 0, 0, 0, ((word >>> 4) & 0xfff0) | (word & 0xf), 0);
    return;
  }

  if (op1 === 5) {
    const link = (word >>> 24) & 1;
    const off = signExt24(word & 0xff_ffff) << 2;
    emit(out, idx, link ? Op.BL : Op.B, cond, 0, 0, 0, 0, 0, 0, off >>> 0, 0);
    return;
  }

  if (op1 === 4) {
    decodeBlockXfer(word, cond, out, idx);
    return;
  }

  if (op1 === 2 || op1 === 3) {
    if (op1 === 3 && (word & 0x10) !== 0) {
      undef(out, idx, cond, word);
      return;
    }
    decodeLs(word, cond, out, idx);
    return;
  }

  if (op1 === 0 || op1 === 1) {
    if ((word & 0x0f90_0010) === 0x0100_0000) {
      undef(out, idx, cond, word);
      return;
    }
    decodeDp(word, cond, out, idx);
    return;
  }

  undef(out, idx, cond, word);
}

function decodeDp(word: number, cond: number, out: Uint32Array, idx: number): void {
  const opcode = (word >>> 21) & 0xf;
  const s = (word >>> 20) & 1;
  const rn = (word >>> 16) & 0xf;
  const rd = (word >>> 12) & 0xf;
  const op = ARM_DP_OPS[opcode]!;
  const imm = (word >>> 25) & 1;
  if (imm) {
    emit(out, idx, op, cond, rd, rn, 0, 0, s, 0, word & 0xfff, 1);
    return;
  }
  const rm = word & 0xf;
  const shiftType = (word >>> 5) & 3;
  if ((word & 0x10) === 0) {
    const amt = (word >>> 7) & 0x1f;
    const aux = amt === 0 && shiftType === 3 ? AUX_RRX : 0;
    emit(out, idx, op, cond, rd, rn, rm, shiftType, s, aux, amt, 0);
    return;
  }
  if ((word & 0x80) !== 0) {
    undef(out, idx, cond, word);
    return;
  }
  const rs = (word >>> 8) & 0xf;
  emit(out, idx, op, cond, rd, rn, rm, shiftType, s, AUX_SHIFT_REG, 0, rs);
}

function decodeMul(word: number, cond: number, out: Uint32Array, idx: number): void {
  const kind = (word >>> 21) & 0xf;
  const s = (word >>> 20) & 1;
  const rd = (word >>> 16) & 0xf;
  const rn = (word >>> 12) & 0xf;
  const rs = (word >>> 8) & 0xf;
  const rm = word & 0xf;
  let op = Op.UNDEF;
  if (kind === 0) op = Op.MUL;
  else if (kind === 1) op = Op.MLA;
  else if (kind === 4) op = Op.UMULL;
  else if (kind === 5) op = Op.UMLAL;
  else if (kind === 6) op = Op.SMULL;
  else if (kind === 7) op = Op.SMLAL;
  else {
    undef(out, idx, cond, word);
    return;
  }
  emit(out, idx, op, cond, rd, rn, rm, 0, s, 0, rs, 0);
}

function decodeExtraLs(word: number, cond: number, out: Uint32Array, idx: number): void {
  const p = (word >>> 24) & 1;
  const u = (word >>> 23) & 1;
  const i = (word >>> 22) & 1;
  const w = (word >>> 21) & 1;
  const l = (word >>> 20) & 1;
  const rn = (word >>> 16) & 0xf;
  const rd = (word >>> 12) & 0xf;
  const sh = (word >>> 5) & 3;
  let op = Op.UNDEF;
  if (sh === 1) op = l ? Op.LDRH : Op.STRH;
  else if (!l && (sh === 2 || sh === 3)) {
    // ARMv5TE doubleword transfers use L=0; L=1 remains LDRSB/LDRSH.
    const rm = word & 15;
    const writeback = w || !p;
    if ((rd & 1) || rd >= 14 || (!p && w) ||
        (writeback && (rn === 15 || rn === rd || rn === rd + 1)) ||
        (!i && (rm === 15 || (word & 0xf00) !== 0 || (sh === 2 && (rm === rd || rm === rd + 1)))) ||
        (sh === 3 && rn === 15)) {
      undef(out, idx, cond, word);
      return;
    }
    op = sh === 2 ? Op.LDRD : Op.STRD;
  }
  else if (sh === 2 && l) op = Op.LDRSB;
  else if (sh === 3 && l) op = Op.LDRSH;
  else {
    undef(out, idx, cond, word);
    return;
  }
  let aux = 0;
  if (p) aux |= AUX_PREINDEX;
  if (u) aux |= AUX_ADD;
  if (w || !p) aux |= AUX_WRITEBACK;
  if (!p) {
    /* post-index always writeback */
  }
  if (!i) {
    aux |= AUX_REG_OFFSET;
    emit(out, idx, op, cond, rd, rn, word & 0xf, 0, 0, aux, 0, 0);
    return;
  }
  const imm = ((word >>> 4) & 0xf0) | (word & 0xf);
  emit(out, idx, op, cond, rd, rn, 0, 0, 0, aux, imm, 0);
}

function decodeLs(word: number, cond: number, out: Uint32Array, idx: number): void {
  const i = (word >>> 25) & 1;
  const p = (word >>> 24) & 1;
  const u = (word >>> 23) & 1;
  const b = (word >>> 22) & 1;
  const w = (word >>> 21) & 1;
  const l = (word >>> 20) & 1;
  const rn = (word >>> 16) & 0xf;
  const rd = (word >>> 12) & 0xf;
  const op = l ? (b ? Op.LDRB : Op.LDR) : b ? Op.STRB : Op.STR;
  let aux = 0;
  if (p) aux |= AUX_PREINDEX;
  if (u) aux |= AUX_ADD;
  if (w || !p) aux |= AUX_WRITEBACK;
  if (i) {
    aux |= AUX_REG_OFFSET;
    const rm = word & 0xf;
    const shiftType = (word >>> 5) & 3;
    const amt = (word >>> 7) & 0x1f;
    const rrx = amt === 0 && shiftType === 3 ? AUX_RRX : 0;
    emit(out, idx, op, cond, rd, rn, rm, shiftType, 0, aux | rrx, amt, 0);
    return;
  }
  emit(out, idx, op, cond, rd, rn, 0, 0, 0, aux, word & 0xfff, 0);
}

function decodeBlockXfer(word: number, cond: number, out: Uint32Array, idx: number): void {
  const p = (word >>> 24) & 1;
  const u = (word >>> 23) & 1;
  const s = (word >>> 22) & 1;
  const w = (word >>> 21) & 1;
  const l = (word >>> 20) & 1;
  const rn = (word >>> 16) & 0xf;
  const list = word & 0xffff;
  let aux = 0;
  if (p) aux |= AUX_LDM_P;
  if (u) aux |= AUX_LDM_U;
  if (w) aux |= AUX_LDM_W;
  if (s) aux |= AUX_LDM_S;
  emit(out, idx, l ? Op.LDM : Op.STM, cond, 0, rn, 0, 0, 0, aux, list, 0);
}

export function isArmUndef(w0: number): boolean {
  return (w0 & 0xff) === Op.UNDEF;
}
