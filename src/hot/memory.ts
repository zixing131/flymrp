/**
 * GuestMemory — Stage 3 standalone guest RAM.
 *
 * [HOT]  aligned 32-bit access in the primary window is a TypedArray index.
 * [COLD] unaligned, out-of-window, and multi-region maps go through helpers.
 *
 * Stage 3 does not implement MRP address spaces (table / screen / platform).
 */

export class MemoryFault extends Error {
  readonly addr: number;
  readonly op: string;
  readonly size: number;

  constructor(addr: number, op: string, size: number) {
    super(
      `GuestMemory ${op}${size * 8} fault at 0x${(addr >>> 0).toString(16)}`,
    );
    this.name = "MemoryFault";
    this.addr = addr >>> 0;
    this.op = op;
    this.size = size;
    if (typeof Object.setPrototypeOf === "function") Object.setPrototypeOf(this, MemoryFault.prototype);
  }
}

export type MapRegion = {
  base: number;
  size: number;
  buf: ArrayBuffer;
  u8: Uint8Array;
  u16: Uint16Array;
  u32: Uint32Array;
};

const MAX_MAP = 64 * 1024 * 1024;

export class GuestMemory {
  /** Optional LDR compatibility for ports with packed, unaligned word data. */
  wordLoadMode: "armv5" | "bytewise" = "armv5";
  /** Primary window used by the interpreter fast path. */
  readonly ramBase: number;
  readonly ramSize: number;
  readonly ram8: Uint8Array;
  readonly ram16: Uint16Array;
  readonly ram32: Uint32Array;

  /** Extra maps (cold). Primary is also at extra[0]. */
  readonly regions: MapRegion[] = [];

  /** Optional write watch (code-cache invalidation). Not on the Stage 3 hot path. */
  onWrite: ((addr: number, size: number) => void) | null = null;
  /** Resolve pending host writes before a guest observes their memory. */
  onBeforeRead: ((addr: number, size: number) => void) | null = null;

  constructor(ramBase = 0x0001_0000, ramSize = 0x0010_0000) {
    if (ramBase !== (ramBase >>> 0) || (ramBase & 3) !== 0) {
      throw new RangeError("ramBase must be a 4-byte-aligned uint32");
    }
    if (ramSize < 4 || (ramSize & 3) !== 0 || ramSize > MAX_MAP) {
      throw new RangeError("ramSize must be a 4-byte-aligned size in (4, 64MiB]");
    }
    const buf = new ArrayBuffer(ramSize);
    this.ramBase = ramBase >>> 0;
    this.ramSize = ramSize >>> 0;
    this.ram8 = new Uint8Array(buf);
    this.ram16 = new Uint16Array(buf);
    this.ram32 = new Uint32Array(buf);
    this.regions.push({
      base: this.ramBase,
      size: this.ramSize,
      buf,
      u8: this.ram8,
      u16: this.ram16,
      u32: this.ram32,
    });
  }

  /** [COLD] extra executable/data window. Must not overlap existing maps. */
  map(base: number, size: number): MapRegion {
    base >>>= 0;
    size >>>= 0;
    if ((base & 3) !== 0 || (size & 3) !== 0 || size < 4 || size > MAX_MAP) {
      throw new RangeError("map() requires 4-byte-aligned base/size");
    }
    const end = (base + size) >>> 0;
    if (end !== 0 && end < base) {
      throw new RangeError("map() wraps the address space");
    }
    for (const r of this.regions) {
      const rEnd = (r.base + r.size) >>> 0;
      if (base < rEnd && r.base < end) {
        throw new RangeError("map() overlaps an existing region");
      }
    }
    const buf = new ArrayBuffer(size);
    const region: MapRegion = {
      base,
      size,
      buf,
      u8: new Uint8Array(buf),
      u16: new Uint16Array(buf),
      u32: new Uint32Array(buf),
    };
    this.regions.push(region);
    return region;
  }

  /** [HOT] primary window, inclusive start, exclusive end, `bytes` span. */
  inRam(addr: number, bytes = 1): boolean {
    const a = addr >>> 0;
    const off = (a - this.ramBase) >>> 0;
    return off < this.ramSize && bytes <= this.ramSize - off;
  }

  /** [HOT] aligned word in the primary window. */
  inRamAligned32(addr: number): boolean {
    const a = addr >>> 0;
    if ((a & 3) !== 0) return false;
    const off = (a - this.ramBase) >>> 0;
    return off < this.ramSize;
  }

  private find(addr: number, bytes: number): { region: MapRegion; off: number } {
    const a = addr >>> 0;
    for (let i = 0; i < this.regions.length; i++) {
      const region = this.regions[i]!;
      const off = (a - region.base) >>> 0;
      if (off < region.size && bytes <= region.size - off) {
        return { region, off };
      }
    }
    throw new MemoryFault(a, "map", bytes);
  }

  read8(addr: number): number {
    const a = addr >>> 0;
    this.onBeforeRead?.(a, 1);
    const off = (a - this.ramBase) >>> 0;
    if (off < this.ramSize) return this.ram8[off]!;
    const hit = this.find(a, 1);
    return hit.region.u8[hit.off]!;
  }

  write8(addr: number, value: number): void {
    const a = addr >>> 0;
    const off = (a - this.ramBase) >>> 0;
    if (off < this.ramSize) {
      this.ram8[off] = value;
      this.onWrite?.(a, 1);
      return;
    }
    const { region, off: o } = this.find(a, 1);
    region.u8[o] = value;
    this.onWrite?.(a, 1);
  }

  /** Little-endian. Unaligned is byte-assembled (no rotate). */
  read16(addr: number): number {
    const a = addr >>> 0;
    this.onBeforeRead?.(a, 2);
    const off = (a - this.ramBase) >>> 0;
    if (off < this.ramSize - 1) {
      if ((a & 1) === 0) return this.ram16[off >>> 1]!;
      return this.ram8[off]! | (this.ram8[off + 1]! << 8);
    }
    const { region, off: o } = this.find(a, 2);
    if ((a & 1) === 0 && (o & 1) === 0) return region.u16[o >>> 1]!;
    return region.u8[o]! | (region.u8[o + 1]! << 8);
  }

  write16(addr: number, value: number): void {
    const a = addr >>> 0;
    const v = value & 0xffff;
    const off = (a - this.ramBase) >>> 0;
    if (off < this.ramSize - 1) {
      if ((a & 1) === 0) {
        this.ram16[off >>> 1] = v;
        this.onWrite?.(a, 2);
        return;
      }
      this.ram8[off] = v;
      this.ram8[off + 1] = v >>> 8;
      this.onWrite?.(a, 2);
      return;
    }
    const { region, off: o } = this.find(a, 2);
    if ((a & 1) === 0 && (o & 1) === 0) {
      region.u16[o >>> 1] = v;
      this.onWrite?.(a, 2);
      return;
    }
    region.u8[o] = v;
    region.u8[o + 1] = v >>> 8;
    this.onWrite?.(a, 2);
  }

  /** Little-endian. Unaligned is byte-assembled (no ARMv5 LDR rotate). */
  read32(addr: number): number {
    const a = addr >>> 0;
    this.onBeforeRead?.(a, 4);
    const off = (a - this.ramBase) >>> 0;
    if (off < this.ramSize - 3) {
      if ((a & 3) === 0) return this.ram32[off >>> 2]!;
      return (
        this.ram8[off]! |
        (this.ram8[off + 1]! << 8) |
        (this.ram8[off + 2]! << 16) |
        (this.ram8[off + 3]! << 24)
      ) >>> 0;
    }
    const { region, off: o } = this.find(a, 4);
    if ((a & 3) === 0 && (o & 3) === 0) return region.u32[o >>> 2]!;
    return (
      region.u8[o]! |
      (region.u8[o + 1]! << 8) |
      (region.u8[o + 2]! << 16) |
      (region.u8[o + 3]! << 24)
    ) >>> 0;
  }

  write32(addr: number, value: number): void {
    const a = addr >>> 0;
    const v = value >>> 0;
    const off = (a - this.ramBase) >>> 0;
    if (off < this.ramSize - 3) {
      if ((a & 3) === 0) {
        this.ram32[off >>> 2] = v;
        this.onWrite?.(a, 4);
        return;
      }
      this.ram8[off] = v;
      this.ram8[off + 1] = v >>> 8;
      this.ram8[off + 2] = v >>> 16;
      this.ram8[off + 3] = v >>> 24;
      this.onWrite?.(a, 4);
      return;
    }
    const { region, off: o } = this.find(a, 4);
    if ((a & 3) === 0 && (o & 3) === 0) {
      region.u32[o >>> 2] = v;
      this.onWrite?.(a, 4);
      return;
    }
    region.u8[o] = v;
    region.u8[o + 1] = v >>> 8;
    region.u8[o + 2] = v >>> 16;
    region.u8[o + 3] = v >>> 24;
    this.onWrite?.(a, 4);
  }

  /**
   * ARMv5 LDR from a possibly unaligned address: load aligned word, ROR by 8*(addr&3).
   * [HOT] aligned primary-window case is a single TypedArray read.
   */
  read32Armv5(addr: number): number {
    const a = addr >>> 0;
    const align = a & ~3;
    const rot = (a & 3) << 3;
    const word = this.read32(align);
    if (rot === 0) return word;
    return ((word >>> rot) | (word << (32 - rot))) >>> 0;
  }

  /** LDR policy only; ABI memory reads and legacy SWP retain their own semantics. */
  read32Ldr(addr: number): number {
    return this.wordLoadMode === "bytewise" ? this.read32(addr) : this.read32Armv5(addr);
  }

  /** Fill a range. Used by tests and later memset. */
  fill(addr: number, value: number, length: number): void {
    const hook = this.onWrite;
    this.onWrite = null;
    try {
      for (let i = 0; i < length; i++) this.write8(addr + i, value);
    } finally {
      this.onWrite = hook;
    }
    hook?.(addr >>> 0, length);
  }

  load(addr: number, data: ArrayLike<number>): void {
    const hook = this.onWrite;
    this.onWrite = null;
    try {
      for (let i = 0; i < data.length; i++) this.write8(addr + i, data[i]!);
    } finally {
      this.onWrite = hook;
    }
    hook?.(addr >>> 0, data.length);
  }

  slice(addr: number, length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) out[i] = this.read8(addr + i);
    return out;
  }

  /** Compare a guest range to a host buffer. Returns first mismatch offset or -1. */
  compare(addr: number, data: ArrayLike<number>): number {
    for (let i = 0; i < data.length; i++) {
      if (this.read8(addr + i) !== (data[i]! & 0xff)) return i;
    }
    return -1;
  }
}
