import { expect, it } from "vitest";
import { ExtRuntime } from "../../src/abi/runtime.ts";
import { tableSlotAddr } from "../../src/abi/layout.ts";
import { MrTableBridge } from "../../src/mythroad/mr-table.ts";
import { MythroadVfs } from "../../src/mythroad/vfs.ts";
import { ExtStopKind } from "../../src/abi/fault.ts";

it("lets a synchronous ARM millisecond delay finish without host ticks", () => {
  const ext = new ExtRuntime(), bridge = new MrTableBridge(ext,new MythroadVfs(),"poll"); bridge.install();
  const code = ext.alloc(64);
  // Load table[33], save caller LR, and poll until the clock reaches 2 ms.
  ext.mem.write32(code, 0xe59f5018); // ldr r5, [pc,#24] = code+32
  ext.mem.write32(code+4,0xe1a0400e);
  ext.mem.write32(code+8,0xe1a0e00f);
  ext.mem.write32(code+12,0xe12fff15);
  ext.mem.write32(code+16,0xe3500002);
  ext.mem.write32(code+20,0x3afffffb); // bcc code+8
  ext.mem.write32(code+24,0xe12fff14);
  ext.mem.write32(code+32,tableSlotAddr(33));
  ext.insnBudget=100_000;
  expect(ext.runGuest(code).kind).toBe(ExtStopKind.Return);
  expect(bridge.clock).toBe(2);
  expect(ext.runGuest(tableSlotAddr(33)).r0).toBe(2);
  // A true endless branch still reaches the instruction watchdog.
  ext.mem.write32(code,0xeafffffe); ext.cache.invalidate(code,4); ext.insnBudget=32;
  expect(ext.runGuest(code).kind).toBe(ExtStopKind.AbiFault);
});

it('advances timed allocation loops without discarding time at malloc/free calls', () => {
  let clock = 100;
  const ext = new ExtRuntime(), bridge = new MrTableBridge(ext, new MythroadVfs(), 'memory-benchmark', {
    getClock: () => clock, onSleep: ms => { clock += ms; },
  });
  bridge.install();
  const code = ext.alloc(128);
  const words = [
    0xe92d41f0, // push {r4-r8,lr}
    0xe59f5044, // ldr r5, [pc,#68] => getTime literal at +80
    0xe59f6044, // malloc literal +84
    0xe59f7044, // free literal +88
    0xe1a0e00f, 0xe12fff15, // getTime()
    0xe1a08000, // r8 = start time
    0xe3a00008, 0xe1a0e00f, 0xe12fff16, // malloc(8)
    0xe3a01008, 0xe1a0e00f, 0xe12fff17, // free(pointer,8)
    0xe1a0e00f, 0xe12fff15, // getTime()
    0xe0400008, 0xe3500002, // elapsed >= 2?
    0x3afffff4, // bcc loop at +28
    0xe8bd81f0, 0xe1a00000,
    tableSlotAddr(33), tableSlotAddr(0), tableSlotAddr(1),
  ];
  words.forEach((word, i) => ext.mem.write32(code + i * 4, word));
  ext.insnBudget = 100_000;
  expect(ext.runGuest(code).kind).toBe(ExtStopKind.Return);
  expect(clock).toBe(102);
  expect(bridge.liveAllocs()).toHaveLength(0);
  // Calls separated by host events must not inherit another call's counters.
  clock += 80;
  expect(ext.runGuest(tableSlotAddr(33)).r0).toBe(182);
});

it('uses actual elapsed time for synchronous calls and keeps host-event gaps separate', () => {
  let now = 1000;
  const ext = new ExtRuntime(), bridge = new MrTableBridge(ext, new MythroadVfs(), 'real-clock');
  ext.monotonicTime = () => now; bridge.install();
  const poll = () => { ext.bridgeCalls++; return (bridge as any).pollTime(); };
  expect(poll()).toBe(0);
  now += 1.75; expect(poll()).toBe(1);
  now += 0.5; expect(poll()).toBe(2);
  now -= 0.75; expect(poll()).toBe(2); // backward samples cannot reverse guest time
  ext.guestCallSerial++; now += 300; expect(poll()).toBe(2);
  now += 10; expect(poll()).toBe(12);
  expect(ext.synchronousClockProgress).toBe(12);
});

it('retains explicit instruction budgets and a wall-clock deadline for endless code', () => {
  const ext = new ExtRuntime(); ext.guestSliceTracing = true; const code = ext.alloc(64); ext.mem.write32(code,0xeafffffe);
  ext.insnBudget=32; ext.monotonicTime=()=>0;
  const bounded=ext.runGuest(code); expect(bounded.detail).toBe('budget exceeded'); expect(bounded.insnCount).toBe(32);
  expect(ext.guestSlices).toHaveLength(1);
  expect(ext.guestSlices[0]).toMatchObject({insnCount:32,pc:code,clockProgress:0});
  let now=0; ext.monotonicTime=()=>now+=30001;
  expect(ext.runGuest(code).detail).toBe('execution deadline exceeded');
  expect(ext.guestSlices).toHaveLength(1);
});
