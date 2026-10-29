import { ExtRuntime } from '../abi/runtime.ts';
import { EXT_STACK_ADDR } from '../abi/layout.ts';
import { NativeAbiError } from '../err/errors.ts';
import { binToBytes } from '../mrp/archive.ts';
import type { MythroadRuntime } from './runtime.ts';

/** string.subV exposes the Lua string's bytes to native EXT code. */
export function installLuaStringPointers(rt: MythroadRuntime): void {
  const L = rt.lua.L;
  type Buffer = { address: number; length: number; value: string };
  const spaces = new WeakMap<ExtRuntime, Map<number, Buffer>>();
  L.setTableFn(L.getGlobal('string').num, 'subV', state => {
    const { s, id } = state.checkLString(1);
    if (!rt.ext) rt.bindExt(new ExtRuntime());
    const ext = rt.ext!;
    let buffers = spaces.get(ext);
    if (!buffers) {
      buffers = new Map();
      spaces.set(ext, buffers);
      const owned = buffers;
      const publish = ext.onGuestBoundary, consume = ext.onHostBoundary;
      ext.onGuestBoundary = () => {
        publish?.();
        for (const [key, buffer] of owned) {
          const value = L.strings[key];
          if (value === buffer.value) continue;
          if (value.length !== buffer.length) throw new NativeAbiError('cannot resize an exposed Lua string');
          ext.mem.load(buffer.address, binToBytes(value));
          buffer.value = value;
        }
      };
      ext.onHostBoundary = () => {
        consume?.();
        for (const [key, buffer] of owned) {
          if (!L.isMutableString(key)) continue;
          let value = '';
          for (const byte of ext.mem.slice(buffer.address, buffer.length)) value += String.fromCharCode(byte);
          if (value !== buffer.value) {
            L.replaceString(key, value);
            buffer.value = value;
          }
        }
      };
    }
    let buffer = buffers.get(id);
    if (!buffer) {
      const size = Math.ceil((s.length + 1) / 8) * 8;
      if (ext.heapTop + size > EXT_STACK_ADDR) throw new NativeAbiError('Lua string pointer arena exhausted');
      buffer = { address: ext.alloc(size), length: s.length, value: s };
      ext.mem.load(buffer.address, binToBytes(s));
      ext.mem.write8(buffer.address + s.length, 0);
      buffers.set(id, buffer);
    }
    state.pushInteger(buffer.address);
    state.pushInteger(s.length);
    return 2;
  });
}
