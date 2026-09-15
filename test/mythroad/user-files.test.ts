import { expect, it } from 'vitest';
import { MythroadRuntime } from '../../src/mythroad/runtime.ts';
import { ExtRuntime } from '../../src/abi/runtime.ts';
import { MR_FILE_RDONLY, MR_IS_DIR } from '../../src/mythroad/constants.ts';
import { ucs2ToGbk } from '../../src/mythroad/font.ts';

it('exposes uploaded files to ARM and Lua readers, directory scans, and new EXT instances', () => {
  const bytes = new Uint8Array([0x49,0x44,0x33,7]);
  const rt = new MythroadRuntime({ userFiles: { 'music/测试.mp3': bytes } });
  bytes[0] = 0; rt.bindExt(new ExtRuntime());
  const bridge = rt.mrTable!, mem = rt.ext!.mem;
  const guestName = String.fromCharCode(...ucs2ToGbk(Array.from('c:\\mythroad\\music\\测试.mp3', c => c.charCodeAt(0))));
  expect(bridge.appFs.file(guestName)).toEqual(new Uint8Array([0x49,0x44,0x33,7]));
  expect(bridge.appFs.info('c:/mythroad/music')).toBe(MR_IS_DIR);
  const fd = bridge.files.open(guestName, MR_FILE_RDONLY);
  expect(fd).toBeGreaterThan(0);
  const dest = rt.ext!.alloc(32); expect(bridge.files.read(mem, fd, dest, 4)).toBe(4);
  expect(mem.slice(dest,4)).toEqual(new Uint8Array([0x49,0x44,0x33,7]));
  const search = bridge.findStart('c:/mythroad/music',dest,32);
  expect(search).toBeGreaterThanOrEqual(0);
  bridge.findNext(search,dest,32); bridge.findNext(search,dest,32);
  expect(new TextDecoder('gbk').decode(mem.slice(dest,8))).toBe('测试.mp3');
  const luaFd = rt.vfs.open(guestName, MR_FILE_RDONLY);
  expect(rt.vfs.read(luaFd,4)[0]).toBe(0x49);
  rt.bindExt(new ExtRuntime());
  expect(rt.mrTable!.appFs.file(guestName)?.[0]).toBe(0x49);
  rt.setUserFile('music/测试.mp3',new Uint8Array([8]));
  expect(rt.vfs.readFile(guestName)).toEqual(new Uint8Array([8]));
  rt.setUserFile('music/测试.mp3',null);
  expect(rt.vfs.readFile(guestName)).toBeNull();
  rt.bindExt(new ExtRuntime()); expect(rt.mrTable!.appFs.file(guestName)).toBeNull();
});

it('does not fold an ASCII-looking GBK trailing byte into a different filename', () => {
  const rt = new MythroadRuntime(); rt.setUserFile('music/表.mp3',new Uint8Array([1])); rt.bindExt(new ExtRuntime());
  const name=String.fromCharCode(...ucs2ToGbk(Array.from('music/表.mp3',c=>c.charCodeAt(0))));
  expect(rt.mrTable!.appFs.file(name)).toEqual(new Uint8Array([1]));
});
