import { describe, expect, it } from 'vitest';
import { buildMrp, bytesToBin } from '../../src/mrp/index.ts';
import { legacyDownloadRequest, legacyDownloadResponse } from '../../src/mythroad/legacy-download.ts';
import { MythroadRuntime } from '../../src/mythroad/runtime.ts';
import { OfflineNetwork } from '../../src/mythroad/offline-network.ts';
import { CREATE_ABC as abc, CREATE_ABx as abx, OP_GETGLOBAL, OP_GETTABLE, OP_LOADK, OP_CALL, OP_RETURN, TAG_TABLE, TAG_FUNCTION, TAG_NIL, Kst, dumpChunk, proto } from '../../src/lua/index.ts';
import { ks, kn, invoke } from '../helpers/lua.ts';

const pack = () => buildMrp([{ name: 'bytes', data: Uint8Array.from({ length: 40000 }, (_, i) => i & 255) }], { filename: 'game.mrp', appid: 316015 });
function request() {
  const bytes = new Uint8Array(48), view = new DataView(bytes.buffer);
  for (let i = 1; i < 16; i += 2) bytes[i] = 255;
  view.setUint32(16, 42); view.setUint32(24, 258); view.setUint32(28, 12);
  view.setUint32(36, 0x10021); view.setUint32(40, 4); view.setUint32(44, 316015);
  return bytes;
}
function commands(response: Uint8Array) {
  const out: { name: string; bytes: Uint8Array }[] = [];
  for (let p = 36; p < response.length;) {
    const length = new DataView(response.buffer, response.byteOffset + p, 2).getUint16(0);
    const end = p + 2 + length, space = response.indexOf(32, p + 2);
    expect(end).toBeLessThanOrEqual(response.length);
    expect(space).toBeLessThan(end);
    out.push({ name: bytesToBin(response.subarray(p + 2, space)), bytes: response.subarray(space + 1, end) });
    p = end;
  }
  return out;
}
describe('legacy collection downloads', () => {
  it('validates framing, command, lengths and duplicate app IDs', () => {
    expect(legacyDownloadRequest(request())).toEqual({ sequence: 42, appid: 316015 });
    for (const offset of [0, 20, 24, 28, 32, 40]) {
      const bad = request(); bad[offset] ^= 1;
      expect(legacyDownloadRequest(bad)).toBeNull();
    }
    const duplicate = new Uint8Array(60); duplicate.set(request()); duplicate.set(request().subarray(36), 48);
    new DataView(duplicate.buffer).setUint32(28, 24);
    expect(legacyDownloadRequest(duplicate)).toBeNull();
    expect(legacyDownloadResponse(pack().subarray(0, 300), 316015, 42)).toBeNull();
    expect(legacyDownloadResponse(pack(), 99, 42)).toBeNull();
    expect(legacyDownloadResponse(buildMrp([], { filename: '../bad.mrp', appid: 316015 }), 316015, 42)).toBeNull();
  });
  it('executes transmitted bytecode and publishes exactly the full package at fileend', () => {
    const rt = new MythroadRuntime(), bytes = pack(), response = legacyDownloadResponse(bytes, 316015, 42)!;
    const view = new DataView(response.buffer);
    expect(view.getUint32(16)).toBe(42); expect(view.getUint32(28)).toBe(response.length - 36);
    const L = rt.lua.L, state = L.newTable(), info = L.newTable();
    L.setGlobal('cmd', TAG_TABLE, L.newTable());
    L.setTableStr(state, 'downdir', 'collection/');
    L.setTableField(state, 'data_info', TAG_TABLE, info);
    L.setGlobal('downloadState', TAG_TABLE, state);
    const cmds = commands(response);
    for (const command of cmds) {
      if (command.name === 'code') {
        invoke(rt.lua, '_loads', [bytesToBin(command.bytes)]);
        expect(L.tags[0]).toBe(TAG_FUNCTION);
        rt.lua.runBytes(command.bytes, 0);
      } else {
        rt.lua.runCold(proto({ k: [ks('cmd'), ks(command.name), ks(bytesToBin(command.bytes)), ks('downloadState')], code: [
          abx(OP_GETGLOBAL, 0, 0), abc(OP_GETTABLE, 0, 0, Kst(1)), abx(OP_LOADK, 1, 2), abx(OP_GETGLOBAL, 2, 3), abc(OP_CALL, 0, 3, 2), abc(OP_RETURN, 0, 2, 0),
        ] }), 1);
        expect(L.nums[0]).toBe(1);
      }
      if (command.name !== 'fileend') expect(rt.appFs.file('collection/game.mrp')).toBeNull();
    }
    expect(rt.appFs.file('collection/game.mrp')).toEqual(bytes);
    expect(rt.appFs.file('collection/game.mrp.part')).toBeNull();
  });
  it('loads nested chunks without running them early, and returns nil/error for invalid bytecode', () => {
    const rt = new MythroadRuntime();
    const inner = dumpChunk(proto({ k: [kn(123)], code: [abx(OP_LOADK, 0, 0), abc(OP_RETURN, 0, 2, 0)] }));
    rt.lua.runCold(proto({ k: [ks('_loads'), ks(bytesToBin(inner))], code: [abx(OP_GETGLOBAL, 0, 0), abx(OP_LOADK, 1, 1), abc(OP_CALL, 0, 2, 2), abc(OP_CALL, 0, 1, 2), abc(OP_RETURN, 0, 2, 0)] }), 1);
    expect(rt.lua.L.nums[0]).toBe(123);
    invoke(rt.lua, '_loads', ['broken'], 2); expect(rt.lua.L.tags[0]).toBe(TAG_NIL);
    expect(rt.lua.L.strings[rt.lua.L.nums[1]]).toBeTruthy();
    invoke(rt.lua, '_loadBuf', [bytesToBin(inner)]); expect(rt.lua.L.tags[0]).toBe(TAG_FUNCTION);
  });
  it('resolves only requested packages and returns 404 for unavailable or unsupported operations', () => {
    const bytes = pack(), net = new OfflineNetwork({ readPackage: id => id === 316015 ? bytes : null });
    const id = net.socket(0, 0); expect(net.connect(id, 0x0a0000ac, 80)).toBe(0);
    const body = request(), header = new TextEncoder().encode(`POST http://www.sky-mobi.com:8080/ HTTP/1.1\r\nHost: www.sky-mobi.com:8080\r\nContent-Length: ${body.length}\r\n\r\n`);
    expect(net.send(id, header)).toBe(header.length);
    expect(net.send(id, body)).toBe(body.length);
    expect(bytesToBin(net.receive(id, 1024) as Uint8Array)).toContain('200 OK');
    expect(net.interceptions.at(-1)?.result).toBe('legacy-local-package');
    const missing = new OfflineNetwork(), handle = missing.socket(0, 0); missing.connect(handle, 0x0a0000ac, 80);
    missing.send(handle, header); missing.send(handle, body);
    expect(bytesToBin(missing.receive(handle, 1024) as Uint8Array)).toContain('404 Not Found');
  });
});
