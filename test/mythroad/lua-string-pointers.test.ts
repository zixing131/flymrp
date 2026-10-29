import { expect, it } from 'vitest';
import { ExtRuntime } from '../../src/abi/runtime.ts';
import { tableSlotAddr } from '../../src/abi/layout.ts';
import { call } from '../../src/lua/vm.ts';
import { MythroadRuntime } from '../../src/mythroad/runtime.ts';
import { invoke, invokeField } from '../helpers/lua.ts';

function pointer(rt: MythroadRuntime, id: number): number {
  const L = rt.lua.L;
  const fn = L.tables[L.getGlobal('string').num].getStr(L.internStr('subV'));
  L.base = 1; L.top = 1; L.setFn(0, fn.num); L.setStr(L.top++, id);
  call(L, 0, 2);
  return L.nums[0] >>> 0;
}

it('exposes stable NUL-terminated binary strings to EXT, including embedded NULs', () => {
  const rt = new MythroadRuntime();
  invokeField(rt.lua, 'string', 'subV', ['A\0B'], 2);
  const address = rt.lua.L.nums[0] >>> 0;
  expect(address).toBeGreaterThan(0);
  expect(rt.lua.L.nums[1]).toBe(3);
  expect([...rt.ext!.mem.slice(address, 4)]).toEqual([65, 0, 66, 0]);
  invokeField(rt.lua, 'string', 'subV', ['A\0B'], 2);
  expect(rt.lua.L.nums[0] >>> 0).toBe(address);
  const output = rt.ext!.alloc(3);
  expect(rt.ext!.runGuest(tableSlotAddr(3), { r0: output, r1: address, r2: 3 }).kind).toBe('return');
  expect([...rt.ext!.mem.slice(output, 3)]).toEqual([65, 0, 66]);
});

it('shares mutable buffers in both directions across native calls', () => {
  const rt = new MythroadRuntime(), L = rt.lua.L;
  const id = L.newMutableString('abc'), address = pointer(rt, id), ext = rt.ext!;
  L.replaceString(id, 'xyz');
  const output = ext.alloc(3);
  ext.runGuest(tableSlotAddr(3), { r0: output, r1: address, r2: 3 });
  expect([...ext.mem.slice(output, 3)]).toEqual([120, 121, 122]);
  ext.runGuest(tableSlotAddr(14), { r0: address, r1: 65, r2: 3 });
  expect(L.strings[id]).toBe('AAA');
  expect(pointer(rt, id)).toBe(address);
});

it('copies strings again after replacing the EXT address space', () => {
  const rt = new MythroadRuntime();
  invokeField(rt.lua, 'string', 'subV', ['text'], 2);
  const first = rt.ext!;
  rt.bindExt(new ExtRuntime());
  invokeField(rt.lua, 'string', 'subV', ['text'], 2);
  expect(rt.ext).not.toBe(first);
  expect([...rt.ext!.mem.slice(rt.lua.L.nums[0] >>> 0, 5)]).toEqual([116, 101, 120, 116, 0]);
});

it('returns the same 15-digit default identity through Lua and native user info', () => {
  const rt = new MythroadRuntime(), ext = new ExtRuntime(); rt.bindExt(ext);
  invoke(rt.lua, 'GetSysInfo');
  const info = rt.lua.L.tables[rt.lua.L.nums[0]];
  const address = ext.alloc(64);
  ext.runGuest(tableSlotAddr(35), { r0: address });
  for (const [field, offset] of [['IMEI', 0], ['IMSI', 16]] as const) {
    const value = rt.lua.L.strings[info.getStr(rt.lua.L.internStr(field)).num];
    expect(value).toHaveLength(15);
    expect([...ext.mem.slice(address + offset, 16)]).toEqual([...new TextEncoder().encode(value), 0]);
  }
});
