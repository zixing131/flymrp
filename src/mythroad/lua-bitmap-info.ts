import { ExtRuntime } from '../abi/runtime.ts';
import { tableSlotAddr } from '../abi/layout.ts';
import { LuaRuntimeError } from '../err/errors.ts';
import type { NativeFunction } from '../lua/types.ts';
import { BITMAPMAX } from './constants.ts';
import type { MythroadRuntime } from './runtime.ts';

/** MRF_BitmapInfo exposes guest addresses, including the shared framebuffer. */
export function makeBitmapInfo(rt: MythroadRuntime): NativeFunction {
  return L => {
    const index = L.optNumber(1, 0) & 0xffff;
    if (index > BITMAPMAX) throw new LuaRuntimeError(`MRF_BitmapInfo:index ${index} invalid!`);
    if (!rt.ext) rt.bindExt(new ExtRuntime());
    const ext = rt.ext!, mem = ext.mem;
    const record = mem.read32(tableSlotAddr(95)) + index * 16;
    const bitmap = rt.bitmaps[index];
    if (bitmap?.pixels) {
      let pixels = bitmap.pixels;
      // Share storage in both directions: a guest write through the returned
      // pointer must be visible to BitmapShow/Draw, without a stale mirror.
      if (pixels.buffer !== mem.ram8.buffer) {
        const address = ext.alloc(pixels.byteLength);
        const shared = new Uint16Array(mem.ram8.buffer, address - mem.ramBase, pixels.length);
        shared.set(pixels); bitmap.pixels = pixels = shared;
      }
      mem.write16(record, bitmap.w); mem.write16(record + 2, bitmap.h);
      mem.write32(record + 4, pixels.byteLength); mem.write32(record + 8, 0);
      mem.write32(record + 12, mem.ramBase + pixels.byteOffset);
    }
    L.pushInteger(mem.read32(record + 12));
    L.pushInteger(mem.read32(record + 4));
    L.pushInteger(mem.read16(record));
    L.pushInteger(mem.read16(record + 2));
    L.pushInteger(mem.read32(record + 8));
    return 5;
  };
}
