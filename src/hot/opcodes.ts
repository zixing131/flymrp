/**
 * Packed instruction format [HOT]
 *
 * w0:
 *   0-7   op
 *   8-11  cond
 *   12-15 rd
 *   16-19 rn
 *   20-23 rm
 *   24-25 shiftType  0=LSL 1=LSR 2=ASR 3=ROR
 *   26    s
 *   27-31 aux
 *
 * w1: imm / offset / shiftAmount / reglist
 * w2: extra (Rs, ra, flags) — always present, stride = 3
 */

export const PACK_STRIDE = 3;

export const enum Op {
  AND = 0,
  EOR,
  SUB,
  RSB,
  ADD,
  ADC,
  SBC,
  RSC,
  TST,
  TEQ,
  CMP,
  CMN,
  ORR,
  MOV,
  BIC,
  MVN,
  MUL,
  MLA,
  UMULL,
  UMLAL,
  SMULL,
  SMLAL,
  LDR,
  STR,
  LDRB,
  STRB,
  LDRH,
  STRH,
  LDRSB,
  LDRSH,
  LDM,
  STM,
  B,
  BL,
  BX,
  BLX,
  MRS,
  MSR,
  CLZ,
  SWP,
  SWPB,
  BKPT,
  SVC,
  UXTB,
  UXTH,
  SXTB,
  SXTH,
  REV,
  REV16,
  REVSH,
  CBZ,
  CBNZ,
  IT,
  MOVW,
  MOVT,
  NOP,
  DSP_MUL,
  LDRD,
  STRD,
  UNDEF = 255,
}

export const enum ShiftType {
  LSL = 0,
  LSR = 1,
  ASR = 2,
  ROR = 3,
}

/** aux bits shared by several ops */
export const AUX_SHIFT_REG = 1 << 0;
export const AUX_RRX = 1 << 1;
export const AUX_WRITEBACK = 1 << 2;
export const AUX_PREINDEX = 1 << 3;
export const AUX_ADD = 1 << 4;
export const AUX_REG_OFFSET = 1 << 0; // load/store: overlaps SHIFT_REG unused there
export const AUX_MSR_IMM = 1 << 0;
export const AUX_LDM_P = 1 << 0;
export const AUX_LDM_U = 1 << 1;
export const AUX_LDM_W = 1 << 2;
export const AUX_LDM_S = 1 << 3;
export const AUX_THUMB32 = 1 << 4;
export const AUX_LINK = 1 << 0; // BLX link already in op

export const COND_EQ = 0;
export const COND_NE = 1;
export const COND_CS = 2;
export const COND_CC = 3;
export const COND_MI = 4;
export const COND_PL = 5;
export const COND_VS = 6;
export const COND_VC = 7;
export const COND_HI = 8;
export const COND_LS = 9;
export const COND_GE = 10;
export const COND_LT = 11;
export const COND_GT = 12;
export const COND_LE = 13;
export const COND_AL = 14;
export const COND_NV = 15;

export function packW0(
  op: number,
  cond: number,
  rd: number,
  rn: number,
  rm: number,
  shiftType: number,
  s: number,
  aux: number,
): number {
  return (
    (op & 0xff) |
    ((cond & 0xf) << 8) |
    ((rd & 0xf) << 12) |
    ((rn & 0xf) << 16) |
    ((rm & 0xf) << 20) |
    ((shiftType & 3) << 24) |
    ((s & 1) << 26) |
    ((aux & 0x1f) << 27)
  ) >>> 0;
}

export function unpackW0(w0: number) {
  return {
    op: w0 & 0xff,
    cond: (w0 >>> 8) & 0xf,
    rd: (w0 >>> 12) & 0xf,
    rn: (w0 >>> 16) & 0xf,
    rm: (w0 >>> 20) & 0xf,
    shiftType: (w0 >>> 24) & 3,
    s: (w0 >>> 26) & 1,
    aux: (w0 >>> 27) & 0x1f,
  };
}

export const OP_NAMES: string[] = [];
OP_NAMES[Op.AND] = "AND";
OP_NAMES[Op.EOR] = "EOR";
OP_NAMES[Op.SUB] = "SUB";
OP_NAMES[Op.RSB] = "RSB";
OP_NAMES[Op.ADD] = "ADD";
OP_NAMES[Op.ADC] = "ADC";
OP_NAMES[Op.SBC] = "SBC";
OP_NAMES[Op.RSC] = "RSC";
OP_NAMES[Op.TST] = "TST";
OP_NAMES[Op.TEQ] = "TEQ";
OP_NAMES[Op.CMP] = "CMP";
OP_NAMES[Op.CMN] = "CMN";
OP_NAMES[Op.ORR] = "ORR";
OP_NAMES[Op.MOV] = "MOV";
OP_NAMES[Op.BIC] = "BIC";
OP_NAMES[Op.MVN] = "MVN";
OP_NAMES[Op.MUL] = "MUL";
OP_NAMES[Op.DSP_MUL] = "DSP_MUL";
OP_NAMES[Op.MLA] = "MLA";
OP_NAMES[Op.UMULL] = "UMULL";
OP_NAMES[Op.UMLAL] = "UMLAL";
OP_NAMES[Op.SMULL] = "SMULL";
OP_NAMES[Op.SMLAL] = "SMLAL";
OP_NAMES[Op.LDR] = "LDR";
OP_NAMES[Op.STR] = "STR";
OP_NAMES[Op.LDRD] = "LDRD";
OP_NAMES[Op.STRD] = "STRD";
OP_NAMES[Op.LDRB] = "LDRB";
OP_NAMES[Op.STRB] = "STRB";
OP_NAMES[Op.LDRH] = "LDRH";
OP_NAMES[Op.STRH] = "STRH";
OP_NAMES[Op.LDRSB] = "LDRSB";
OP_NAMES[Op.LDRSH] = "LDRSH";
OP_NAMES[Op.LDM] = "LDM";
OP_NAMES[Op.STM] = "STM";
OP_NAMES[Op.B] = "B";
OP_NAMES[Op.BL] = "BL";
OP_NAMES[Op.BX] = "BX";
OP_NAMES[Op.BLX] = "BLX";
OP_NAMES[Op.MRS] = "MRS";
OP_NAMES[Op.MSR] = "MSR";
OP_NAMES[Op.CLZ] = "CLZ";
OP_NAMES[Op.SWP] = "SWP";
OP_NAMES[Op.SWPB] = "SWPB";
OP_NAMES[Op.BKPT] = "BKPT";
OP_NAMES[Op.SVC] = "SVC";
OP_NAMES[Op.UXTB] = "UXTB";
OP_NAMES[Op.UXTH] = "UXTH";
OP_NAMES[Op.SXTB] = "SXTB";
OP_NAMES[Op.SXTH] = "SXTH";
OP_NAMES[Op.REV] = "REV";
OP_NAMES[Op.REV16] = "REV16";
OP_NAMES[Op.REVSH] = "REVSH";
OP_NAMES[Op.CBZ] = "CBZ";
OP_NAMES[Op.CBNZ] = "CBNZ";
OP_NAMES[Op.IT] = "IT";
OP_NAMES[Op.MOVW] = "MOVW";
OP_NAMES[Op.MOVT] = "MOVT";
OP_NAMES[Op.NOP] = "NOP";
OP_NAMES[Op.UNDEF] = "UNDEF";
