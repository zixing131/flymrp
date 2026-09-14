import type { ARMCPU } from "../hot/cpu.ts";
import type { GuestMemory } from "../hot/memory.ts";
import { ExtFault, ExtStopKind } from "./fault.ts";
import {
  EXT_TABLE_ADDR,
  EXT_TABLE_COUNT,
  MR_IGNORE,
  MR_MAX_FILENAME_SIZE,
  PACK_FILENAME_SLOT,
  tableSlotAddr,
} from "./layout.ts";

/** Data slots are pointers, not executable functions. */
export const DATA_SLOTS = new Set<number>([
  23, 24,
  ...range(91, 112),
  135, 136, 138, 139, 140, 142, 143, 146,
]);

function range(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

/** Native arrays must not alias adjacent globals when guests write them. */
export function dataSlotAllocSize(n: number): number {
  if (n === 23) return 78 * 4; // _mr_c_internal_table
  if (n === 24) return 4 * 4; // mr_c_port_table
  if ([PACK_FILENAME_SLOT, 101, 102, 103, 138].includes(n)) return MR_MAX_FILENAME_SIZE;
  if (n === 95) return 31 * 16; // mr_bitmapSt, including screen bitmap
  if (n === 96) return 3 * 20; // mr_tileSt
  if (n === 97) return 3 * 4; // map pointers
  if (n === 98) return 5 * 12; // mr_soundSt
  if (n === 99) return 10 * 2; // mr_spriteSt
  if (n === 146) return 8; // LG_mem_free_t
  return 4;
}

export type TableHandler = (cpu: ARMCPU, mem: GuestMemory, args: Uint32Array) => number;

export class MrTable {
  readonly execMask = new Uint8Array(EXT_TABLE_COUNT);
  readonly handlers: Array<TableHandler | null> = new Array(EXT_TABLE_COUNT).fill(null);

  constructor() {
    for (let n = 0; n < EXT_TABLE_COUNT; n++) {
      this.execMask[n] = DATA_SLOTS.has(n) ? 0 : 1;
    }
  }

  setHandler(n: number, handler: TableHandler): void {
    if (n < 0 || n >= EXT_TABLE_COUNT) throw new RangeError(`table slot ${n}`);
    this.handlers[n] = handler;
    if (!DATA_SLOTS.has(n)) this.execMask[n] = 1;
  }

  isExec(n: number): boolean {
    return n >= 0 && n < EXT_TABLE_COUNT && this.execMask[n] === 1;
  }

  /** [HOT] PC → slot. Unaligned or data-slot execute is InvalidSlot. */
  dispatch(cpu: ARMCPU, mem: GuestMemory, pc: number): void {
    const a = pc >>> 0;
    if ((a & 3) !== 0) {
      throw new ExtFault(ExtStopKind.InvalidSlot, a, "unaligned table pc");
    }
    const n = (a - EXT_TABLE_ADDR) >>> 2;
    if (n >= EXT_TABLE_COUNT) {
      throw new ExtFault(ExtStopKind.InvalidSlot, a, "slot out of range");
    }
    if (!this.execMask[n]) {
      throw new ExtFault(ExtStopKind.InvalidSlot, a, `data slot ${n}`);
    }
    fillSpDeadZone(mem, cpu.r[13] >>> 0, cpu.r[14] >>> 0);
    const args = readAapcs(cpu, mem);
    const handler = this.handlers[n];
    const ret = handler ? handler(cpu, mem, args) >>> 0 : MR_IGNORE;
    cbRet(cpu, ret);
  }
}

export function initTableMemory(mem: GuestMemory, allocData: (n: number) => number): void {
  for (let n = 0; n < EXT_TABLE_COUNT; n++) {
    mem.write32(tableSlotAddr(n), tableSlotAddr(n));
  }
  for (const n of DATA_SLOTS) {
    mem.write32(tableSlotAddr(n), allocData(n));
  }
}

function readAapcs(cpu: ARMCPU, mem: GuestMemory): Uint32Array {
  const args = new Uint32Array(8);
  args[0] = cpu.r[0] >>> 0;
  args[1] = cpu.r[1] >>> 0;
  args[2] = cpu.r[2] >>> 0;
  args[3] = cpu.r[3] >>> 0;
  const sp = cpu.r[13] >>> 0;
  for (let i = 0; i < 4; i++) {
    args[4 + i] = mem.read32((sp + i * 4) >>> 0);
  }
  return args;
}

/** AAPCS callee dead zone: SP-64 filled with alternating LR / SP residue. */
export function fillSpDeadZone(mem: GuestMemory, sp: number, lr: number): void {
  if (sp < 64) return;
  const base = (sp - 64) >>> 0;
  for (let i = 0; i < 16; i++) {
    mem.write32(base + i * 4, (i & 1) === 0 ? lr : sp);
  }
}

export function cbRet(cpu: ARMCPU, ret: number): void {
  const lr = cpu.r[14] >>> 0;
  cpu.r[0] = ret >>> 0;
  cpu.t = lr & 1;
  let pc = (lr & ~1) >>> 0;
  if (!cpu.t) pc &= ~3;
  cpu.r[15] = pc;
  cpu.branched = 1;
}
