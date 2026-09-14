import { describe, expect, it } from "vitest";
import { ExtRuntime } from "../../src/abi/runtime.ts";
import { tableSlotAddr } from "../../src/abi/layout.ts";
import { defaultProfile } from "../../src/mythroad/profile.ts";
import { GuestHeap } from "../../src/mythroad/guest-heap.ts";
import { MrTableBridge } from "../../src/mythroad/mr-table.ts";
import { MythroadVfs } from "../../src/mythroad/vfs.ts";

describe("shared Mythroad heap and framebuffer", () => {
  it('advertises the explicitly selected handset heap through native globals', () => {
    const ext = new ExtRuntime(), profile = defaultProfile({ guestHeapSize: 512 * 1024 });
    const bridge = new MrTableBridge(ext, new MythroadVfs(), 'small-handset', { getProfile: () => profile });
    bridge.install();
    const read = (slot: number) => ext.mem.read32(ext.mem.read32(tableSlotAddr(slot)));
    expect(read(109)).toBe(512 * 1024);
    expect(read(110) - read(108)).toBe(512 * 1024);
    const p = bridge.malloc(32768);
    expect(p).toBe(read(108));
    expect(read(111)).toBe(480 * 1024);
    bridge.free(p, 32768);
    expect(read(111)).toBe(512 * 1024);
    for (const size of [-1, 0, 524289, Infinity, 16 * 1024 * 1024]) {
      expect(() => defaultProfile({ guestHeapSize: size })).toThrow(RangeError);
    }
  });
  it('keeps large unpacking buffers inside the advertised heap and reuses them after release', () => {
    const ext = new ExtRuntime(), bridge = new MrTableBridge(ext, new MythroadVfs(), 'large-buffer');
    bridge.install();
    const get = (slot: number) => ext.mem.read32(ext.mem.read32(tableSlotAddr(slot)));
    const base = get(108), end = get(110), bump = ext.heapTop;
    expect(get(109)).toBe(8 * 1024 * 1024);
    expect(end - base).toBe(get(109));
    const size = 2 * 1024 * 1024;
    for (let i = 0; i < 8; i++) {
      const pointer = bridge.malloc(size);
      expect(pointer).toBe(base);
      expect(pointer + size).toBeLessThanOrEqual(end);
      ext.mem.write32(pointer + size - 4, i);
      expect(get(111)).toBe(get(109) - size);
      bridge.free(pointer, size);
      expect(get(111)).toBe(get(109));
    }
    expect(ext.heapTop).toBe(bump);
    expect(bridge.liveAllocs()).toHaveLength(0);
  });
  it('allows SDK destructor cleanup after free and reuses the block at the next ABI call', () => {
    const ext = new ExtRuntime(), bridge = new MrTableBridge(ext, new MythroadVfs(), 'destructor'); bridge.install();
    const pointer = bridge.malloc(16), code = ext.alloc(64);
    // free(r0,16); r0[1]=0; return malloc(16). The SDK zero belongs to its
    // retired object, not to the allocator's next free-list header.
    [0xe92d4030, 0xe1a04000, 0xe59f5024, 0xe1a0e00f, 0xe12fff15,
      0xe3a00000, 0xe5840004, 0xe3a00010, 0xe59f5010, 0xe1a0e00f,
      0xe12fff15, 0xe8bd8030, 0, tableSlotAddr(1), tableSlotAddr(0)]
      .forEach((word, i) => ext.mem.write32(code + i * 4, word));
    const result = ext.runGuest(code, { r0: pointer, r1: 16 });
    expect(result.kind).toBe('return'); expect(result.r0).toBe(pointer);
    ext.runGuest(tableSlotAddr(1), { r0: pointer, r1: 16 });
    expect(bridge.liveAllocs()).toHaveLength(0);
    expect(bridge.malloc(16)).toBe(pointer);
    // Invalid free-list sizes still fail instead of being repaired or skipped.
    const head = ext.mem.read32(tableSlotAddr(146)), base = ext.mem.read32(ext.mem.read32(tableSlotAddr(108)));
    ext.mem.write32(base + ext.mem.read32(head) + 4, 0);
    expect(() => bridge.malloc(16)).toThrow('corrupt guest heap free block');
  });
  it("publishes capacity, reuses freed blocks, coalesces adjacent regions and tracks the low-water mark", () => {
    const ext = new ExtRuntime(), heap = new GuestHeap(ext, 128);
    const get = (slot: number) => ext.mem.read32(ext.mem.read32(tableSlotAddr(slot)));
    expect([get(108), get(109), get(110), get(111), get(135), get(136)]).toEqual([heap.base,128,heap.base+128,128,128,0]);
    const a=heap.malloc(16), b=heap.malloc(24), c=heap.malloc(32);
    ext.mem.write32(c, 0x12345678);
    heap.free(b,24); heap.free(a,16);
    expect(heap.malloc(40)).toBe(a);
    expect(ext.mem.read32(c)).toBe(0x12345678);
    expect(get(111)).toBe(56); expect(get(135)).toBe(56);
    heap.free(a,40); heap.free(c,32);
    expect(get(111)).toBe(128); expect(get(135)).toBe(56);
    expect(heap.malloc(128)).toBe(a); expect(heap.malloc(8)).toBe(0);
  });
  it("honors guest changes to the free list and a rebased arena with wrapped links", () => {
    const ext = new ExtRuntime(), heap = new GuestHeap(ext,128), old=heap.base;
    // Vendor wrapper rebases LG_mem_base while preserving a lower free region.
    ext.mem.write32(ext.mem.read32(tableSlotAddr(108)),old+64);
    ext.mem.write32(heap.head,(-64)>>>0);
    ext.mem.write32(old,64); ext.mem.write32(old+4,128);
    expect(heap.malloc(16)).toBe(old);
    expect(ext.mem.read32(heap.head)).toBe((-48)>>>0);
  });
  it("guest pixel stores and bridge drawing use the same memory without changing function slots", () => {
    const ext=new ExtRuntime(), bridge=new MrTableBridge(ext,new MythroadVfs(),"screen"); bridge.install();
    const screen=ext.mem.read32(ext.mem.read32(tableSlotAddr(91)));
    const slot0=ext.mem.read32(tableSlotAddr(0));
    ext.mem.write16(screen+2,0xf800);
    expect(bridge.screen.pixels[1]).toBe(0xf800);
    bridge.screen.drawPoint565(0,1,0x07e0);
    expect(ext.mem.read16(screen+240*2)).toBe(0x07e0);
    expect(ext.mem.read32(tableSlotAddr(0))).toBe(slot0);
    const bitmap=ext.mem.read32(tableSlotAddr(95))+30*16;
    expect(ext.mem.read32(bitmap+12)).toBe(screen);
    expect(ext.mem.read32(bitmap+4)).toBe(240*320*2);
  });
  it("full filename arrays and the final bitmap descriptor cannot overwrite neighboring globals", () => {
    const ext=new ExtRuntime();
    const next=ext.mem.read32(tableSlotAddr(104)); ext.mem.write32(next,0x12345678);
    for(const slot of [100,101,102,103]) ext.mem.fill(ext.mem.read32(tableSlotAddr(slot)),65,128);
    expect(ext.mem.read32(next)).toBe(0x12345678);
    const tile=ext.mem.read32(tableSlotAddr(96)); ext.mem.write32(tile,0xabcdef);
    ext.mem.fill(ext.mem.read32(tableSlotAddr(95)),0,31*16);
    expect(ext.mem.read32(tile)).toBe(0xabcdef);
  });
});

it('publishes freed headers before an SDK reads them inside the same guest call', () => {
  const ext=new ExtRuntime(), bridge=new MrTableBridge(ext,new MythroadVfs(),'arena-splice');bridge.install();
  const pointer=bridge.malloc(16); bridge.malloc(16); // keep the next node allocated
  ext.mem.fill(pointer,0x38,16);
  const code=ext.alloc(64);
  // Save pointer and return address; free(pointer,16); return pointer[1].
  [0xe92d4030,0xe1a04000,0xe59f5010,0xe1a0e00f,0xe12fff15,
    0xe5940004,0xe8bd8030,0,tableSlotAddr(1)]
    .forEach((word,i)=>ext.mem.write32(code+i*4,word));
  const result=ext.runGuest(code,{r0:pointer,r1:16});
  expect(result.kind).toBe('return');expect(result.r0).toBe(16);
  expect(ext.mem.onBeforeRead).toBeNull();expect(bridge.malloc(16)).toBe(pointer);
});
