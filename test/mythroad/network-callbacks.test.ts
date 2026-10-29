import { expect, it } from 'vitest';
import { ExtRuntime } from '../../src/abi/runtime.ts';
import { tableSlotAddr } from '../../src/abi/layout.ts';
import { MythroadRuntime } from '../../src/mythroad/runtime.ts';
import { MR_STATE_RUN } from '../../src/mythroad/constants.ts';

function setup() {
  const rt = new MythroadRuntime(), ext = new ExtRuntime(); rt.bindExt(ext); rt.state = MR_STATE_RUN;
  const host = ext.alloc(64), output = ext.alloc(4), callback = ext.alloc(8);
  ext.mem.load(host, new TextEncoder().encode('missing.invalid\0'));
  ext.mem.write32(callback, 0xe5890000); // str r0, [r9]
  ext.mem.write32(callback + 4, 0xe12fff1e); // bx lr
  return { rt, ext, host, output, callback };
}

it('returns WAITING, then delivers the real DNS failure with the captured R9', () => {
  const { rt, ext, host, output, callback } = setup();
  const result = ext.runGuest(tableSlotAddr(83), { r0: host, r1: callback, r9: output });
  expect(result.r0).toBe(2); expect(ext.mem.read32(output)).toBe(0);
  rt.advance(80); expect(ext.mem.read32(output)).toBe(0xffffffff);
  ext.mem.write32(output, 123); rt.advance(80); expect(ext.mem.read32(output)).toBe(123);
});

it('keeps synchronous lookups for callers without callbacks and for cached addresses', () => {
  const { rt, ext, host, output, callback } = setup();
  expect(ext.runGuest(tableSlotAddr(83), { r0: host }).r0 | 0).toBe(-1);
  ext.mem.load(host, new TextEncoder().encode('rop.skymobiapp.com\0'));
  expect(ext.runGuest(tableSlotAddr(83), { r0: host, r1: callback, r9: output }).r0 >>> 0)
    .toBe(rt.mrTable!.offlineNetwork.resolve('rop.skymobiapp.com'));
  rt.advance(80); expect(ext.mem.read32(output)).toBe(0);
});

it('cancels pending callbacks when the network closes', () => {
  const { rt, ext, host, output, callback } = setup();
  ext.runGuest(tableSlotAddr(83), { r0: host, r1: callback, r9: output });
  ext.runGuest(tableSlotAddr(82)); rt.advance(80);
  expect(ext.mem.read32(output)).toBe(0);
});
