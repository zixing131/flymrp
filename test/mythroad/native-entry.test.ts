import { expect, it } from 'vitest';
import { buildMrp } from '../../src/mrp/index.ts';
import { MythroadRuntime } from '../../src/mythroad/runtime.ts';
import { armReturnConst, buildArmLoadImage } from '../helpers/ext-asm.ts';

const image = () => buildArmLoadImage({ helperWords: armReturnConst(0) });

it('starts a native-only package and forwards input, timer, pause and resume', () => {
  const calls: number[] = [];
  const rt = new MythroadRuntime({ onExtCall: code => calls.push(code) });
  rt.loadMrp(buildMrp([{ name: 'cfunction.ext', data: image() }]));
  rt.start();
  expect(calls).toEqual([6, 8, 0]);
  rt.input.press('FIRE'); rt.step();
  rt.mrTable!.timerStart(100); rt.advance(100); rt.step();
  rt.pause(); rt.resume();
  expect(calls).toEqual([6, 8, 0, 1, 2, 4, 5]);
});

it('restarts at an explicitly requested native entry without loading it as Lua', () => {
  const calls: number[] = [];
  const rt = new MythroadRuntime({ onExtCall: code => calls.push(code) });
  rt.loadMrp(buildMrp([{ name: 'module.ext', data: image() }]));
  rt.state = 1;
  rt.requestRunFile(rt.packName, 'module.ext', 'argument');
  rt.advance(100); rt.step();
  expect(calls).toEqual([6, 8, 0]);
  expect(rt.param).toBe('argument');
  expect(rt.state).toBe(1);
});

it('preserves missing or malformed explicit Lua entry errors', () => {
  const rt = new MythroadRuntime();
  rt.loadMrp(buildMrp([{ name: 'cfunction.ext', data: image() }, { name: 'bad.mr', data: new Uint8Array([1, 2, 3]) }]));
  expect(() => rt.start('missing.mr')).toThrow('cannot read missing.mr');
  expect(() => rt.start('bad.mr')).toThrow();
  expect(rt.ext).toBeNull();
});
