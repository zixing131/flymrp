import { describe, expect, it } from 'vitest';
import { decodeArm } from '../../src/hot/decode-arm.ts';
import { step } from '../../src/hot/interp.ts';
import { compileBlock } from '../../src/hot/compile-block.ts';
import { Op } from '../../src/hot/opcodes.ts';
import { makeCpu, putArm } from '../helpers/cpu.ts';
import { hexBytes, unicornStep } from './oracle.ts';
import { le32 } from '../helpers/asm.ts';

describe('ARM doubleword transfers used by store games', () => {
  it('matches Unicorn for immediate/register offsets, indexing, writeback and conditions in both execution paths', async () => {
    for (const load of [false, true]) for (const immediate of [false, true]) for (const add of [false, true]) for (const mode of ['offset', 'pre', 'post']) for (const execute of [false, true]) {
      const p = mode === 'post' ? 0 : 1, w = mode === 'pre' ? 1 : 0;
      const word = ((execute ? 0xe : 0x0) * 0x10000000 | p << 24 | Number(add) << 23 | Number(immediate) << 22 | w << 21 | 3 << 16 | (load ? 0xd0 : 0xf0) | (immediate ? 8 : 4)) >>> 0;
      const regs = Array(16).fill(0); regs[0] = 0x89abcdef; regs[1] = 0x76543210; regs[3] = 0x3008; regs[4] = 8; regs[15] = 0x1000;
      const memory = Uint8Array.from({length:32}, (_, i) => i * 7 & 255);
      const oracle = await unicornStep({ code: hexBytes(le32(word)), pc: 0x1000, thumb: 0, regs, cpsr: 0x80000010, count: 1, mem: [{addr:0x3000,hex:hexBytes(memory)}], dump: [{addr:0x3000,len:32}] });
      expect(oracle.error).toBeNull();
      for (const compiled of [false, true]) {
        const {cpu, mem} = makeCpu(); putArm(mem,0x1000,[word]); mem.load(0x3000,memory);cpu.r.set(regs);cpu.cpsr=0x80000010;
        if (compiled) {
          const packed = new Uint32Array(3); decodeArm(word,packed,0);
          const block = {guestPC:0x1000,endPC:0x1004,count:1,packed,thumb:0,generation:1,valid:true,region:null,runs:32,compiled:null};
          compileBlock(block)(cpu,1,block);
        } else step(cpu);
        expect([...cpu.r],word.toString(16)).toEqual(oracle.regs);
        expect(cpu.cpsr).toBe(oracle.cpsr);
        expect(hexBytes(mem.slice(0x3000,32))).toBe(oracle.mem[0].hex);
      }
    }
  });
  it('decodes the exact observed STRD and LDRD instructions without changing signed loads', () => {
    for (const [word, op] of [[0xe1c300f0,Op.STRD],[0xe1c320d0,Op.LDRD],[0xe1d300d0,Op.LDRSB],[0xe1d300f0,Op.LDRSH]]) {
      const packed=new Uint32Array(3);decodeArm(word,packed,0);expect(packed[0]&255).toBe(op);
    }
  });
  it('rejects invalid register pairs and base writeback overlaps', () => {
    for (const word of [0xe1c310f0,0xe1c3e0d0,0xe1e000d8,0xe0e300d8,0xe18300df]) {
      const packed=new Uint32Array(3);decodeArm(word,packed,0);expect(packed[0]&255,word.toString(16)).toBe(Op.UNDEF);
    }
  });
  it('supports word alignment but never rotates a misaligned doubleword or writes back after a memory fault', () => {
    const {cpu,mem}=makeCpu();putArm(mem,0x1000,[0xe1e300d8]);cpu.r[3]=0x2ffc;mem.write32(0x3004,0x12345678);mem.write32(0x3008,0xabcdef12);step(cpu);
    expect([...cpu.r.slice(0,2)]).toEqual([0x12345678,0xabcdef12]);expect(cpu.r[3]).toBe(0x3004);
    cpu.r[15]=0x1000;cpu.r[3]=0x3001;expect(()=>step(cpu)).toThrow('alignment');expect(cpu.r[3]).toBe(0x3001);
    cpu.r[15]=0x1000;cpu.r[3]=0xfff4;expect(()=>step(cpu)).toThrow('fault');expect(cpu.r[3]).toBe(0xfff4);
  });
});
