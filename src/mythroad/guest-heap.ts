import type { ExtRuntime } from "../abi/runtime.ts";
import { tableSlotAddr } from "../abi/layout.ts";

/** Mythroad mem.c's address-ordered first-fit heap. Links are pool offsets.
 * The list lives in guest memory because vendor allocators also manipulate it.
 */
export class GuestHeap {
  readonly initialBase: number;
  get head(): number { return this.ext.mem.read32(tableSlotAddr(146)); }
  get base(): number { return this.get(108); }
  get end(): number { return this.get(110); }
  // Keep unpacking buffers in the guest-visible, reusable allocator. A 1 MiB
  // arena forces larger titles into the separate EXT bump allocation region,
  // whose blocks cannot participate in a vendor's temporary arena splice.
  constructor(readonly ext: ExtRuntime, readonly size = 8 * 1024 * 1024) {
    this.initialBase = ext.alloc(size);
    this.set(108, this.initialBase);
    this.set(110, this.initialBase + size);
    ext.mem.write32(this.head, 0);
    ext.mem.write32(this.head + 4, 0);
    ext.mem.write32(this.base, size);
    ext.mem.write32(this.base + 4, size);
    for (const [slot, value] of [[108, this.base], [109, size], [110, this.base + size],
      [111, size], [135, size], [136, 0]]) this.set(slot, value);
  }
  private get(slot: number): number { return this.ext.mem.read32(this.ext.mem.read32(tableSlotAddr(slot))); }
  private set(slot: number, value: number): void { this.ext.mem.write32(this.ext.mem.read32(tableSlotAddr(slot)), value); }
  contains(ptr: number): boolean { return ptr >= this.base && ptr < this.end; }
  private *nodes(): Generator<{ address: number; offset: number; size: number }> {
    const mem = this.ext.mem, visited = new Set<number>();
    let offset = mem.read32(this.head), end = 0;
    const sentinel = (this.end - this.base) >>> 0;
    while (offset !== sentinel) {
      const address = (this.base + offset) >>> 0;
      if (visited.has(address) || address % 4 || address + 8 > this.end) throw new Error(`corrupt guest heap free list: base=${this.base.toString(16)} end=${this.end.toString(16)} head=${this.head.toString(16)} node=${address.toString(16)} previousEnd=${end.toString(16)}`);
      const size = mem.read32(address + 4);
      if (size < 8 || size % 8 || address + size > this.end) throw new Error(`corrupt guest heap free block: address=0x${address.toString(16)} size=0x${size.toString(16)} base=0x${this.base.toString(16)} end=0x${this.end.toString(16)}`);
      if (!mem.regions.some(r => address >= r.base && address + size <= r.base + r.size)) throw new Error("unmapped guest heap free block");
      visited.add(address);
      yield { address, offset, size };
      end = address + size;
      offset = mem.read32(address);
    }
  }
  malloc(size: number): number {
    const mem = this.ext.mem;
    let previous = this.head;
    for (const block of this.nodes()) {
      if (block.size >= size) {
        const next = mem.read32(block.address);
        if (block.size === size) mem.write32(previous, next);
        else {
          mem.write32(block.address + size, next);
          mem.write32(block.address + size + 4, block.size - size);
          mem.write32(previous, block.offset + size);
        }
        const left = Math.max(0, this.get(111) - size);
        this.set(111, left);
        this.set(135, Math.min(this.get(135), left));
        this.set(136, Math.max(this.get(136), block.offset + size));
        return block.address;
      }
      previous = block.address;
    }
    return 0;
  }
  free(ptr: number, size: number): void {
    if (!this.contains(ptr) || ptr % 4 || !size || size % 8 || ptr + size > this.end) return;
    const blocks = [...this.nodes()];
    if (blocks.some(b => ptr < b.address + b.size && b.address < ptr + size)) return;
    blocks.push({ address: ptr, offset: (ptr - this.base) >>> 0, size });
    blocks.sort((a, b) => a.address - b.address);
    const merged: typeof blocks = [];
    for (const block of blocks) {
      const last = merged[merged.length - 1];
      if (last && last.address + last.size === block.address) last.size += block.size;
      else merged.push(block);
    }
    const mem = this.ext.mem;
    mem.write32(this.head, merged[0]?.offset ?? ((this.end - this.base) >>> 0));
    merged.forEach((b, i) => {
      mem.write32(b.address, merged[i + 1]?.offset ?? ((this.end - this.base) >>> 0));
      mem.write32(b.address + 4, b.size);
    });
    this.set(111, this.get(111) + size);
  }
}
