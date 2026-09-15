import { expect, it } from 'vitest';
import { ExtRuntime } from '../../src/abi/runtime.ts';
import { tableSlotAddr } from '../../src/abi/layout.ts';
import { MrTableBridge, readGuestCString, writeFixedCString } from '../../src/mythroad/mr-table.ts';
import { MythroadVfs } from '../../src/mythroad/vfs.ts';
import { MR_FAILED, MR_SUCCESS, MR_IS_DIR } from '../../src/mythroad/constants.ts';
import { AppFileSystem } from '../../src/mythroad/app-fs.ts';

it('compares strings in the fixed C locale through strcoll', () => {
  const ext = new ExtRuntime(), bridge = new MrTableBridge(ext, new MythroadVfs(), 'strcoll'); bridge.install();
  const a = ext.alloc(16), b = ext.alloc(16);
  writeFixedCString(ext.mem, a, 'abc\0z', 16); writeFixedCString(ext.mem, b, 'abc\0a', 16);
  expect(ext.runGuest(tableSlotAddr(12), { r0: a, r1: b }).r0).toBe(0);
  ext.mem.write8(b, 0xff);
  expect(ext.runGuest(tableSlotAddr(12), { r0: a, r1: b }).r0 | 0).toBeLessThan(0);
});

it('memchr respects the count, unsigned byte value and embedded zero bytes', () => {
  const ext = new ExtRuntime(), bridge = new MrTableBridge(ext, new MythroadVfs(), 'memchr'); bridge.install();
  const data = ext.alloc(4); ext.mem.load(data, new Uint8Array([1, 0, 255, 1]));
  const find = (value: number, count: number) => ext.runGuest(tableSlotAddr(13), { r0: data, r1: value, r2: count }).r0;
  expect(find(0, 4)).toBe(data + 1); expect(find(-1, 4)).toBe(data + 2);
  expect(find(1, 4)).toBe(data); expect(find(255, 2)).toBe(0);
  expect(ext.runGuest(tableSlotAddr(13), { r0: 0xffffffff, r2: 0 }).r0).toBe(0);
});

it('enumerates immediate EFS children with independent search handles and bounded output', () => {
  const ext = new ExtRuntime(), bridge = new MrTableBridge(ext, new MythroadVfs(), 'find'); bridge.install();
  bridge.appFs.replace('games/a.bin', new Uint8Array());
  bridge.appFs.replace('games/sub/b.bin', new Uint8Array());
  bridge.appFs.mkdir('empty'); bridge.appFs.mkdir('mythroadfoo');
  const buf = ext.alloc(64);
  const handle = bridge.findStart('c:\\mythroad\\games\\', buf, 64);
  expect(readGuestCString(ext.mem, buf)).toBe('.');
  expect(bridge.findNext(handle, buf, 64)).toBe(MR_SUCCESS);
  expect(readGuestCString(ext.mem, buf)).toBe('..');
  expect(bridge.findNext(handle, buf, 64)).toBe(MR_SUCCESS);
  expect(readGuestCString(ext.mem, buf)).toBe('a.bin');
  expect(bridge.findNext(handle, buf, 64)).toBe(MR_SUCCESS);
  expect(readGuestCString(ext.mem, buf)).toBe('sub');
  expect(bridge.findNext(handle, buf, 64)).toBe(MR_FAILED);
  expect(ext.mem.read8(buf)).toBe(0);
  expect(bridge.findStart('missing', buf, 64)).toBe(MR_FAILED);
  expect(bridge.findStart('mythroadfoo', buf, 64)).toBeGreaterThan(0);
  const empty = bridge.findStart('empty', buf, 64);
  expect(empty).toBeGreaterThan(0); expect(readGuestCString(ext.mem, buf)).toBe('.');
  expect(bridge.findNext(empty, buf, 64)).toBe(MR_SUCCESS);
  expect(readGuestCString(ext.mem, buf)).toBe('..');
  expect(bridge.findNext(empty, buf, 64)).toBe(MR_FAILED);
  expect(ext.mem.read8(buf)).toBe(0);
  expect(ext.runGuest(tableSlotAddr(53), { r0: handle }).r0).toBe(0);
  expect(bridge.findNext(handle, buf, 64)).toBe(MR_FAILED);
});

it('opens parent and current directory entries without creating duplicate file identities', () => {
  const fs = new AppFileSystem();
  fs.createFile('games/sub/save', true);
  fs.replace('games/sub/save', new Uint8Array([7]));
  expect(fs.info('games/sub/.')).toBe(MR_IS_DIR);
  expect(fs.info('games/sub/..')).toBe(MR_IS_DIR);
  expect(fs.info('games/..')).toBe(MR_IS_DIR);
  expect(fs.file('c:\\mythroad\\games\\sub\\..\\sub\\save')).toEqual(new Uint8Array([7]));
  expect(fs.findEntries('games/sub/..')).toEqual(['.', '..', 'sub']);
  fs.mkdir('.hidden');
  expect(fs.findEntries('.hidden')).toEqual(['.', '..']);
  expect(fs.rename('games/./sub/save', 'games/sub/../save')).toBe(MR_SUCCESS);
  expect(fs.file('games/save')).toEqual(new Uint8Array([7]));
  expect(fs.file('games/sub/save')).toBeNull();
  expect(fs.file('../../')).toBeNull();
});

it('presents a guest-selected logical canvas at its real stride and restores LCD orientation', () => {
  const ext = new ExtRuntime(), bridge = new MrTableBridge(ext, new MythroadVfs(), 'rotate'); bridge.install();
  const ptr = ext.mem.read32(ext.mem.read32(tableSlotAddr(91)));
  expect(bridge.plat(101, 3)).toBe(0);
  expect([bridge.screen.width, bridge.screen.height]).toEqual([320, 240]);
  ext.mem.write32(ext.mem.read32(tableSlotAddr(92)), 480);
  ext.mem.write32(ext.mem.read32(tableSlotAddr(93)), 320);
  ext.mem.write16(ptr + (480 + 1) * 2, 0x07e0);
  bridge.drawBitmap(ext.mem, new Uint32Array([ptr, 0, 0, 480, 320]));
  expect([bridge.screen.width, bridge.screen.height]).toEqual([480, 320]);
  expect(bridge.screen.pixels[bridge.screen.width + 1]).toBe(0x07e0);
  expect(bridge.plat(101, 0)).toBe(0);
  expect([bridge.screen.width, bridge.screen.height]).toEqual([240, 320]);
});

it('queues the virtual SMS completion only when requested and respects paused flushes', () => {
  const events: number[][] = []; let frames = 0, state = 2;
  const ext = new ExtRuntime(), bridge = new MrTableBridge(ext, new MythroadVfs(), 'services', {
    onPlatformEvent: (type, value) => events.push([type, value]), getMrState: () => state, onFlush: () => { frames++; },
  }); bridge.install();
  expect(ext.runGuest(tableSlotAddr(59), { r2: 0 }).r0).toBe(0);
  expect(events).toEqual([]);
  expect(ext.runGuest(tableSlotAddr(59), { r2: 16 }).r0).toBe(0);
  expect(events).toEqual([[9, 0]]);
  ext.runGuest(tableSlotAddr(118), { r2: 240, r3: 320 }); expect(frames).toBe(0);
  state = 1; ext.runGuest(tableSlotAddr(118), { r2: 240, r3: 320 }); expect(frames).toBe(1);
});
