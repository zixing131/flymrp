import { expect, it } from 'vitest';
import { call } from '../../src/lua/vm.ts';
import { TAG_NIL, TAG_TABLE } from '../../src/lua/types.ts';
import { MythroadRuntime } from '../../src/mythroad/runtime.ts';
import { invoke, invokeField } from '../helpers/lua.ts';

it('implements the legacy Lua TCP lifecycle, binary response and error triples', () => {
  const rt = new MythroadRuntime({ resourceFiles: { 'test.bin': new Uint8Array([0, 255, 65]) }, networkRules: {
    hosts: ['fixture.invalid'], ips: [], packages: {},
    routes: [{ host: 'fixture.invalid', path: '/test', file: 'test.bin' }],
  } });
  invoke(rt.lua, '_com', [402, 'cmnet']);
  invokeField(rt.lua, 'socket', 'getHost', ['fixture.invalid']); const ip = rt.lua.L.nums[0];
  invokeField(rt.lua, 'socket', 'tcp'); const L = rt.lua.L, object = L.nums[0];
  expect(L.tags[0]).toBe(TAG_TABLE);
  const method = (name: string, args: (string | number)[] = [], results = 1) => {
    const fn = L.tables[object].getStr(L.internStr(name));
    L.base = 1; L.top = 1; L.setFn(0, fn.num); L.tags[L.top] = TAG_TABLE; L.nums[L.top++] = object;
    for (const a of args) { if (typeof a === 'string') L.pushString(a); else L.pushInteger(a); }
    call(L, 0, results);
  };
  method('getstate'); expect(L.nums[0]).toBe(0);
  method('connect', [ip, 80]); expect(L.nums[0]).toBe(0);
  method('getstate'); expect(L.nums[0]).toBe(2);
  method('receive', [100], 3); expect(L.strings[L.nums[0]]).toBe(''); expect(L.tags[1]).toBe(TAG_NIL);
  const request = 'GET /test HTTP/1.1\r\nHost: fixture.invalid\r\n\r\n';
  method('send', [request], 3); expect(L.nums[0]).toBe(request.length); expect(L.tags[1]).toBe(TAG_NIL);
  method('receive', [1500], 3); expect(L.strings[L.nums[0]]).toContain('\r\n\r\n\0ÿA');
  method('close', [], 0); method('getstate'); expect(L.nums[0]).toBe(3);
  method('send', ['x'], 3); expect(L.tags[0]).toBe(TAG_NIL); expect(L.nums[2]).toBe(-1);
  invokeField(rt.lua, 'socket', 'getHost', ['unknown.invalid']); expect(L.nums[0]).toBe(-1);
  invoke(rt.lua, '_com', [405]); method('getstate'); expect(L.nums[0]).toBe(5);
});
