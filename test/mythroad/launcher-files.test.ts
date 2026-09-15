import { describe, expect, it } from 'vitest';
import { MythroadRuntime } from '../../src/mythroad/runtime.ts';
import { MR_SUCCESS, MR_FAILED, MR_IS_DIR } from '../../src/mythroad/constants.ts';
import { TAG_NIL, TAG_BOOL } from '../../src/lua/index.ts';
import { invoke, invokeField } from '../helpers/lua.ts';

describe('Lua launcher storage', () => {
  it('shares directories, GBK filenames and removal with the native SD filesystem', () => {
    const rt = new MythroadRuntime();
    invokeField(rt.lua, 'sys', 'mkDir', ['games']); expect(rt.lua.L.tags[0]).toBe(TAG_BOOL);
    invokeField(rt.lua, 'sys', 'getfileinfo', ['games']); expect(rt.lua.L.nums[0]).toBe(MR_IS_DIR);
    rt.setUserFile('games/a.mrp', new Uint8Array([1]));
    invokeField(rt.lua, 'sys', 'findstart', ['games'], 2);
    const handle = rt.lua.L.nums[0]; expect(handle).toBeGreaterThan(0);
    expect(rt.lua.L.strings[rt.lua.L.nums[1]]).toBe('.');
    invokeField(rt.lua, 'sys', 'findnext', [handle]);
    expect(rt.lua.L.strings[rt.lua.L.nums[0]]).toBe('..');
    invokeField(rt.lua, 'sys', 'findnext', [handle]);
    expect(rt.lua.L.strings[rt.lua.L.nums[0]]).toBe('a.mrp');
    invokeField(rt.lua, 'sys', 'findnext', [handle]); expect(rt.lua.L.tags[0]).toBe(TAG_NIL);
    invokeField(rt.lua, 'sys', 'findstop', [handle]); expect(rt.lua.L.nums[0]).toBe(MR_SUCCESS);
    invokeField(rt.lua, 'sys', 'rmDir', ['games'], 3); expect(rt.lua.L.tags[0]).toBe(TAG_NIL);
    invokeField(rt.lua, 'sys', 'rm', ['games/a.mrp']); expect(rt.appFs.file('games/a.mrp')).toBeNull();
    invokeField(rt.lua, 'sys', 'rmDir', ['games']); expect(rt.lua.L.tags[0]).toBe(TAG_BOOL);
    invokeField(rt.lua, 'sys', 'findstart', ['missing'], 2); expect(rt.lua.L.nums[0]).toBe(MR_FAILED);
  });
  it('returns UCS2 big-endian text including the terminating character', () => {
    const rt = new MythroadRuntime(); invoke(rt.lua, 'c2u', ['A\0ignored']);
    expect(rt.lua.L.strings[rt.lua.L.nums[0]]).toBe('\0A\0\0');
  });
  it('accepts the return entry string and shares the drive query with EXT', () => {
    const rt = new MythroadRuntime(); invoke(rt.lua, '_strCom', [3, 'parent.mrp', 'return.mr']);
    invoke(rt.lua, '_platEx', [1204, 'B:/games'], 2);
    expect(rt.workPath.value).toBe('mythroad/disk/b/games/');
    invoke(rt.lua, '_platEx', [1204, 'y'], 2);
    expect(rt.lua.L.strings[rt.lua.L.nums[0]]).toBe('b:/games/\0');
    invoke(rt.lua, '_platEx', [1305, 'c'], 2); expect(rt.lua.L.nums[1]).toBe(MR_SUCCESS);
    expect(rt.lua.L.strings[rt.lua.L.nums[0]].length).toBe(16);
  });
});
