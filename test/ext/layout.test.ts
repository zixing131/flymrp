import { describe, expect, it } from "vitest";
import {
  EXT_BASE_ADDR,
  EXT_CODE_ADDR,
  EXT_HEAP_ADDR,
  EXT_LOW_TABLE_SIZE,
  EXT_MEM_SIZE,
  EXT_STACK_ADDR,
  EXT_STOP_ADDR,
  EXT_TABLE_ADDR,
} from "../../src/abi/layout.ts";
import { createExtMemory, ExtRuntime } from "../../src/abi/runtime.ts";
import { MemoryFault } from "../../src/hot/memory.ts";

describe("4-B EXT guest memory layout", () => {
  it("fixture: maps low 64KB + 32MB main window used by fixtures", () => {
    const mem = createExtMemory();
    expect(mem.ramBase).toBe(EXT_BASE_ADDR);
    expect(mem.ramSize).toBe(EXT_MEM_SIZE);
    mem.write32(EXT_TABLE_ADDR, 0x11111111);
    expect(mem.read32(EXT_TABLE_ADDR)).toBe(0x11111111);
    mem.write32(EXT_STOP_ADDR, 0xe12fff1e);
    expect(mem.read32(EXT_STOP_ADDR)).toBe(0xe12fff1e);
    mem.write32(EXT_HEAP_ADDR, 1);
    mem.write32(EXT_STACK_ADDR, 2);
    mem.write32(EXT_CODE_ADDR, 3);
    expect(mem.read32(EXT_HEAP_ADDR)).toBe(1);
    expect(mem.read32(EXT_STACK_ADDR)).toBe(2);
    expect(mem.read32(EXT_CODE_ADDR)).toBe(3);
    expect(mem.inRam(EXT_CODE_ADDR, 4)).toBe(true);
    expect(() => mem.read32(0x4020_0000)).toThrow(MemoryFault);
    expect(EXT_LOW_TABLE_SIZE).toBe(0x1_0000);
  });

  it("fixture: guest addresses stay behind GuestMemory", () => {
    const rt = new ExtRuntime();
    const p = rt.alloc(16);
    rt.mem.write32(p, 0xaabbccdd);
    expect(rt.mem.read32(p)).toBe(0xaabbccdd);
    expect(p).toBeGreaterThanOrEqual(EXT_HEAP_ADDR);
    expect(p).not.toBe(0xaabbccdd);
  });
});
