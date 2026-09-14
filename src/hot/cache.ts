import type { ARMCPU } from "./cpu.ts";
import { decodeAt, insnSize } from "./decode.ts";
import { execPacked, step } from "./interp.ts";
import { Op } from "./opcodes.ts";
import { compileBlock, type CompiledBlock } from './compile-block.ts';

const MAX_INSNS = 16;
const POOL_CAP = 4096;

export type BasicBlock = {
  guestPC: number;
  endPC: number;
  count: number;
  packed: Uint32Array;
  thumb: number;
  /** Copied from the region at decode time; stale if region.generation differs. */
  generation: number;
  valid: boolean;
  region: ExecRegion | null;
  runs: number;
  compiled: CompiledBlock | null;
};

export type ExecRegion = {
  base: number;
  len: number;
  generation: number;
  /** ARM: index = (pc-base) >>> 2 */
  blockIdArm: Uint32Array;
  /** Thumb: index = (pc-base) >>> 1  — 2-byte slots, separate from ARM */
  blockIdThumb: Uint32Array;
};

const TERMINATORS = new Set<number>([
  Op.B,
  Op.BL,
  Op.BX,
  Op.BLX,
  Op.CBZ,
  Op.CBNZ,
  Op.SVC,
  Op.BKPT,
  Op.UNDEF,
]);

function endsBlock(w0: number): boolean {
  const op = w0 & 0xff;
  if (TERMINATORS.has(op)) return true;
  const rd = (w0 >>> 12) & 0xf;
  if (
    rd === 15 &&
    (op <= Op.MVN ||
      op === Op.LDR ||
      op === Op.LDRB ||
      op === Op.LDRH ||
      op === Op.LDRSB ||
      op === Op.LDRSH)
  ) {
    return true;
  }
  return false;
}

export class BlockCache {
  compileBlocks = true;
  /** Enable only when all guest/host writes invalidate this cache. */
  cacheUnregisteredCode = false;
  readonly regions: ExecRegion[] = [];
  lastRegion: ExecRegion | null = null;
  readonly pool: Array<BasicBlock | null> = [null];
  hits = 0;
  misses = 0;
  private readonly freeIds: number[] = [];
  private nextVictim = 1;
  /** Index only pages containing decoded code; ordinary data writes are O(1). */
  private readonly codePages = new Map<number, Set<number>>();
  /** Region metadata is indexed too: stack/data writes must not scan every module. */
  private readonly regionPages = new Map<number, ExecRegion[]>();

  addRegion(base: number, len: number): ExecRegion {
    base >>>= 0;
    len >>>= 0;
    if ((base & 1) !== 0 || (len & 1) !== 0) {
      throw new RangeError("ExecRegion must be 2-byte aligned");
    }
    const region: ExecRegion = {
      base,
      len,
      generation: 1,
      blockIdArm: new Uint32Array(len >>> 2),
      blockIdThumb: new Uint32Array(len >>> 1),
    };
    this.regions.push(region);
    for (let page = base >>> 12; page <= Math.floor((base + len - 1) / 4096); page++) {
      let regions = this.regionPages.get(page);
      if (!regions) this.regionPages.set(page, regions = []);
      regions.push(region);
    }
    this.lastRegion = region;
    return region;
  }

  findRegion(pc: number): ExecRegion | null {
    const a = pc >>> 0;
    const last = this.lastRegion;
    if (last && (a - last.base) >>> 0 < last.len) return last;
    for (let i = 0; i < this.regions.length; i++) {
      const r = this.regions[i]!;
      if ((a - r.base) >>> 0 < r.len) {
        this.lastRegion = r;
        return r;
      }
    }
    return null;
  }

  private slot(region: ExecRegion, pc: number, thumb: number): Uint32Array | null {
    const off = (pc - region.base) >>> 0;
    if (thumb) {
      if (off >= region.len || (pc & 1) !== 0) return null;
      return region.blockIdThumb;
    }
    if (off >= region.len || (pc & 3) !== 0) return null;
    return region.blockIdArm;
  }

  private index(pc: number, base: number, thumb: number): number {
    return thumb ? (pc - base) >>> 1 : (pc - base) >>> 2;
  }

  lookupId(pc: number, thumb: number): number {
    const region = this.findRegion(pc);
    if (!region) return 0;
    const table = this.slot(region, pc, thumb);
    if (!table) return 0;
    return table[this.index(pc, region.base, thumb)] ?? 0;
  }

  getOrDecode(cpu: ARMCPU): BasicBlock {
    const pc = cpu.r[15] >>> 0;
    const thumb = cpu.t;
    const id = this.lookupId(pc, thumb);
    if (id !== 0) {
      const b = this.pool[id];
      if (
        b &&
        b.guestPC === pc &&
        b.thumb === thumb &&
        b.valid
      ) {
        this.hits++;
        return b;
      }
    }
    this.misses++;
    return this.decodeFill(cpu, pc, thumb);
  }

  private decodeFill(cpu: ARMCPU, pc: number, thumb: number): BasicBlock {
    const words: number[] = [];
    let cur = pc;
    let count = 0;
    const tmp = new Uint32Array(3);
    while (count < MAX_INSNS) {
      const size = decodeAt(cpu.mem, cur, thumb, tmp, 0);
      words.push(tmp[0]!, tmp[1]!, tmp[2]!);
      count++;
      const op = tmp[0]! & 0xff;
      const rd = (tmp[0]! >>> 12) & 0xf;
      const list = tmp[1]!;
      const stop =
        endsBlock(tmp[0]!) ||
        (op === Op.LDM && (list & (1 << 15)) !== 0) ||
        (rd === 15 && op === Op.LDR);
      cur = (cur + size) >>> 0;
      if (stop) break;
    }
    // Handset loaders relocate executable code with ordinary malloc/memcpy.
    // Register a small page only after instruction fetch/decode has succeeded.
    const region = this.findRegion(pc) ?? (this.cacheUnregisteredCode ? this.addRegion((pc & ~4095) >>> 0, 4096) : null);
    const block: BasicBlock = {
      guestPC: pc,
      endPC: cur,
      count,
      packed: Uint32Array.from(words),
      thumb,
      generation: region ? region.generation : 0,
      valid: true,
      region,
      runs: 0,
      compiled: null,
    };
    if (region) {
      let id = this.freeIds.pop();
      if (id === undefined) {
        if (this.pool.length < POOL_CAP) id = this.pool.length;
        else { id = this.nextVictim; this.nextVictim = this.nextVictim % (POOL_CAP - 1) + 1; this.drop(id, false); }
      }
      this.pool[id] = block;
      for (let page = block.guestPC >>> 12; page <= (block.endPC - 1) >>> 12; page++) {
        let ids = this.codePages.get(page);
        if (!ids) this.codePages.set(page, ids = new Set());
        ids.add(id);
      }
      const table = this.slot(region, pc, thumb);
      if (table) table[this.index(pc, region.base, thumb)] = id;
    }
    return block;
  }

  runBlock(cpu: ARMCPU, budget: number): void {
    if (cpu.onBeforeFetch && cpu.onBeforeFetch(cpu)) return;
    if (cpu.itState !== 0 || budget <= 0) {
      step(cpu);
      return;
    }
    const block = this.getOrDecode(cpu);
    let instPC = cpu.r[15] >>> 0;
    if (instPC !== block.guestPC || cpu.t !== block.thumb) {
      step(cpu);
      return;
    }
    const packed = block.packed;
    if (this.compileBlocks && ++block.runs === 32) {
      try { block.compiled = compileBlock(block); } catch { this.compileBlocks = false; }
    }
    if (this.compileBlocks && block.compiled) { block.compiled(cpu, budget, block); return; }
    for (let i = 0; i < block.count && budget > 0; i++) {
      const o = i * 3;
      execPacked(cpu, instPC, packed[o]!, packed[o + 1]!, packed[o + 2]!);
      cpu.insnCount++;
      budget--;
      if (cpu.branched || !block.valid) return;
      instPC = (instPC + insnSize(packed[o + 2]!)) >>> 0;
    }
  }

  private drop(id: number, recycle: boolean): void {
    const block = this.pool[id];
    if (!block) return;
    block.valid = false;
    for (let page = block.guestPC >>> 12; page <= (block.endPC - 1) >>> 12; page++) {
      const ids = this.codePages.get(page);
      ids?.delete(id);
      if (!ids?.size) this.codePages.delete(page);
    }
    if (block.region) {
      const table = this.slot(block.region, block.guestPC, block.thumb);
      const index = this.index(block.guestPC, block.region.base, block.thumb);
      if (table?.[index] === id) table[index] = 0;
    }
    this.pool[id] = null;
    if (recycle) this.freeIds.push(id);
  }

  invalidate(base: number, len: number): void {
    if (len <= 0) return;
    const end = base + len;
    const firstPage = base >>> 12, lastPage = Math.floor((end - 1) / 4096);
    // A multi-page write can encounter the same region more than once.
    const changed = firstPage === lastPage ? null : new Set<ExecRegion>();
    for (let page = firstPage; page <= lastPage; page++) {
      const regions = this.regionPages.get(page);
      if (regions) for (const region of regions) {
        if (region.base < end && region.base + region.len > base && !changed?.has(region)) {
          region.generation = (region.generation + 1) >>> 0 || 1;
          changed?.add(region);
        }
      }
      const ids = this.codePages.get(page);
      if (!ids) continue;
      for (const id of ids) {
        const block = this.pool[id];
        if (block && block.guestPC < end && block.endPC > base) this.drop(id, true);
      }
    }
  }
}
