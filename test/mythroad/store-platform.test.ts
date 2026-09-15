import { expect, it } from 'vitest';
import { ExtRuntime } from '../../src/abi/runtime.ts';
import { EXT_STOP_ADDR, stackTop, tableSlotAddr } from '../../src/abi/layout.ts';
import { ExtStopKind } from '../../src/abi/fault.ts';
import { MrTableBridge, MythroadVfs, MR_IGNORE } from '../../src/mythroad/index.ts';
function wire() {const ext=new ExtRuntime();const bridge=new MrTableBridge(ext,new MythroadVfs(),'store');bridge.install();return {ext,bridge};}
it('reseeds MR_GET_RAND from handset time and shares the resulting state with mr_rand', () => {
  const {ext,bridge}=wire();
  const rand=()=>ext.runGuest(tableSlotAddr(20),{lr:EXT_STOP_ADDR}).r0;
  bridge.clock=1234;
  const first=bridge.plat(1211,10000), next=rand();
  rand();
  expect(bridge.plat(1211,10000)).toBe(first);
  expect(rand()).toBe(next);
  bridge.clock=5678;
  const later=bridge.plat(1211,10000);
  expect(later).not.toBe(first);
  expect(later).toBeGreaterThanOrEqual(1000);
  expect(later).toBeLessThan(11000);
  bridge.clock=1234;
  expect(bridge.plat(1211,10000)).toBe(first);
});
it('returns MR_IGNORE for observed optional platform probes without fabricating output', () => {
  const {ext,bridge}=wire();const out=ext.alloc(8);ext.mem.fill(out,0x55,8);
  for(const code of [106,1004,1112,1401,1402,1404,2600,4200,458753,458755]) expect(bridge.platEx(ext.mem,Uint32Array.from([code,0,0,out,out+4,0]))).toBe(MR_IGNORE);
  for(const code of [1006,2500,2506,3012]) expect(bridge.plat(code,0)).toBe(MR_IGNORE);
  expect([...ext.mem.slice(out,8)]).toEqual(Array(8).fill(0x55));
  expect(()=>bridge.platEx(ext.mem,Uint32Array.from([0x12345678,0,0,0,0,0]))).toThrow('unsupported');
});
it('accepts the legacy WAP notification without making host network requests', () => {
  const {ext,bridge}=wire();const p=ext.alloc(40);ext.mem.load(p,new TextEncoder().encode('http://example.invalid/\0'));
  const result=ext.runGuest(tableSlotAddr(62),{r0:p,lr:EXT_STOP_ADDR});
  expect(result.kind).toBe(ExtStopKind.Return);expect(bridge.offlineNetwork.requests).toHaveLength(0);
});
it('implements the seven-argument RGB565 contrast ABI, clipping and independent offscreen targets', () => {
  const {ext,bridge}=wire();bridge.screen.pixels.fill(0xffff);
  const sp=stackTop()-32;ext.mem.write32(sp,128);ext.mem.write32(sp+4,256);ext.mem.write32(sp+8,0);
  const run=()=>ext.runGuest(tableSlotAddr(129),{r0:0xffff,r1:0,r2:3,r3:1,sp,lr:EXT_STOP_ADDR});
  expect(run().kind).toBe(ExtStopKind.Return);
  expect([...bridge.screen.pixels.slice(0,3)]).toEqual([0x7fe0,0x7fe0,0xffff]);
  const off=ext.alloc(12);ext.mem.fill(off,0xff,12);
  for(const [slot,value] of [[91,off],[92,3],[93,2]])ext.mem.write32(ext.mem.read32(tableSlotAddr(slot)),value);
  expect(run().r0).toBe(0);expect([...ext.mem.slice(off,6)]).toEqual([0xe0,0x7f,0xe0,0x7f,0xff,0xff]);
  expect(bridge.screen.pixels[2]).toBe(0xffff);
});
