import { expect, it } from 'vitest';
import { ExtRuntime } from '../../src/abi/runtime.ts';
import { tableSlotAddr } from '../../src/abi/layout.ts';
import { MythroadRuntime } from '../../src/mythroad/runtime.ts';

function setup() {
  const rt = new MythroadRuntime(), ext = new ExtRuntime();
  rt.state = 1; rt.bindExt(ext);
  const internal = ext.mem.read32(tableSlotAddr(23));
  const cell = (index: number) => ext.mem.read32(internal + index * 4);
  return { rt, ext, cell };
}

it('consumes native restart globals without rearming or losing the platform timer', () => {
  const { rt, ext, cell } = setup();
  rt.mrTable!.timerStart(100); ext.onGuestBoundary!();
  for (const [slot, text] of [[100, 'child.mrp'], [101, 'entry.mr']] as const) {
    ext.mem.load(ext.mem.read32(tableSlotAddr(slot)), new TextEncoder().encode(text + '\0'));
  }
  ext.mem.write32(cell(5), 1); ext.mem.write32(cell(2), 3);
  ext.onHostBoundary!();
  expect(rt.state).toBe(3);
  expect(rt.pendingPack).toBe('child.mrp');
  expect(rt.pendingStartFile).toBe('entry.mr');
  expect(rt.timers.starts).toBe(1);
  rt.advance(100);
  expect(rt.timers.fires).toBe(1);
  expect(rt.pollEvent()).not.toBeNull();
});

it('publishes host timer expiry before guest execution and accepts paused timers', () => {
  const { rt, ext, cell } = setup();
  rt.mrTable!.timerStart(20); ext.onGuestBoundary!();
  rt.advance(20); ext.onGuestBoundary!(); ext.onHostBoundary!();
  expect(ext.mem.read32(cell(5))).toBe(0);
  expect(rt.timers.state).toBe(0);
  ext.mem.write32(cell(6), 1); ext.mem.write32(cell(2), 2); ext.onHostBoundary!();
  rt.mrTable!.timerStart(40); ext.onGuestBoundary!();
  expect(rt.timers.state).toBe(1);
  expect(rt.timers.runWithoutPause).toBe(1);
  expect(ext.mem.read32(cell(5))).toBe(1);
});
