import { describe, expect, it } from 'vitest';
import { BlockCache } from '../src/hot/cache.ts';
import { compileBlock } from '../src/hot/compile-block.ts';
import { step } from '../src/hot/interp.ts';
import { GuestMemory } from '../src/hot/memory.ts';
import { makeCpu, putArm, putThumb } from './helpers/cpu.ts';
import { MythroadRuntime } from '../src/mythroad/runtime.ts';
import { buildMrp } from '../src/mrp/index.ts';
import { armReturnConst, buildArmLoadImage } from './helpers/ext-asm.ts';
import { playerWordLoadMode } from '../web/player-options.ts';

describe('packed-resource LDR compatibility', () => {
  for (const thumb of [0, 1]) for (const compiled of [false, true]) for (const mode of ['armv5', 'bytewise'] as const) {
    it(`${thumb ? 'Thumb' : 'ARM'} ${compiled ? 'compiled' : 'interpreted'} uses ${mode} loads`, () => {
      for (const alignment of [0, 1, 2, 3]) {
        const { cpu, mem } = makeCpu(0x1000, thumb);
        mem.wordLoadMode = mode;
        // Real sushi resource: width=28 at an odd address, preceding byte=7.
        mem.load(0x3000, [7, 7, 7, 7, 7, 7, 7, 7]);
        mem.write32(0x3000 + alignment, 28);
        cpu.r[1] = 0x3000 + alignment;
        if (thumb) putThumb(mem, 0x1000, [0x6808, 0xe7fe]);
        else putArm(mem, 0x1000, [0xe5910000, 0xeafffffe]);
        const expected = mode === 'bytewise' ? 28 : alignment === 0 ? 28 : alignment === 1 ? 0x0700001c : alignment === 2 ? 0x0707001c : 0x0707071c;
        if (compiled) {
          const cache = new BlockCache(); cache.addRegion(0x1000, 8);
          const block = cache.getOrDecode(cpu);
          compileBlock(block)(cpu, 1, block);
        } else step(cpu);
        expect(cpu.r[0]).toBe(expected);
        expect(cpu.r[1]).toBe(0x3000 + alignment);
      }
    });
  }
  it('preserves bounds, read watches, and the explicit legacy rotate helper', () => {
    const mem = new GuestMemory(0, 16); mem.wordLoadMode = 'bytewise';
    mem.load(0, [7, 28, 0, 0, 0]);
    const reads: number[] = []; mem.onBeforeRead = a => reads.push(a);
    expect(mem.read32Ldr(1)).toBe(28);
    expect(reads).toEqual([1]);
    expect(mem.read32Armv5(1)).toBe(0x0700001c);
    expect(() => mem.read32Ldr(15)).toThrow('map32');
  });
  it('keeps the selected mode across native entry restarts and isolates runtimes', () => {
    const rt = new MythroadRuntime({ profile: { wordLoadMode: 'bytewise' } });
    rt.loadMrp(buildMrp([{ name: 'cfunction.ext', data: buildArmLoadImage({ helperWords: armReturnConst(0) }) }]));
    rt.start(); expect(rt.ext!.mem.wordLoadMode).toBe('bytewise');
    const first = rt.ext;
    rt.requestRunFile(rt.packName, 'cfunction.ext', ''); rt.advance(100); rt.step();
    expect(rt.ext).not.toBe(first); expect(rt.ext!.mem.wordLoadMode).toBe('bytewise');
    expect(new MythroadRuntime().profile.wordLoadMode).toBe('armv5');
  });
  it('rejects invalid profiles and bounds stored preference values', () => {
    expect(() => new MythroadRuntime({ profile: { wordLoadMode: 'invalid' as any } })).toThrow('wordLoadMode');
    expect(playerWordLoadMode('bytewise')).toBe('bytewise');
    for (const value of [null, '', 'armv5', 'invalid']) expect(playerWordLoadMode(value)).toBe('armv5');
  });
});
