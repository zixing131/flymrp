import type { ARMCPU } from './cpu.ts';
import type { BasicBlock } from './cache.ts';
import { execPacked } from './interp.ts';
import { insnSize } from './decode.ts';
import { armExpandImm, thumbExpandImm } from './shifter.ts';
import { Op, unpackW0 } from './opcodes.ts';

export type CompiledBlock = (cpu: ARMCPU, budget: number, block: BasicBlock) => void;
const conditions = ['c.z===1','c.z===0','c.c===1','c.c===0','c.n===1','c.n===0','c.v===1','c.v===0',
  'c.c===1&&c.z===0','c.c===0||c.z===1','c.n===c.v','c.n!==c.v','c.z===0&&c.n===c.v','c.z===1||c.n!==c.v','true','false'];

/** Specialize decoded numeric IR, never guest text or a host address. Each
 * instruction retains budget, memory-watch, fault and self-modification checks.
 * Instructions outside this small fast path use the reference interpreter. */
export function compileBlock(block: BasicBlock): CompiledBlock {
  let pc = block.guestPC;
  const lines = ['const r=c.r,m=c.mem;let a,b,v,raw,sc;'];
  for (let i = 0; i < block.count; i++) {
    const [w0, w1, w2] = block.packed.subarray(i * 3, i * 3 + 3), u = unpackW0(w0);
    const next = (pc + insnSize(w2)) >>> 0;
    let body: string | null = null;
    if (u.op <= Op.MVN && u.rd !== 15 && u.rn !== 15 && u.rm !== 15 && !(u.aux & 1)) {
      let operand: string | null = null, carry = 'c.c';
      const kind = w2 & 255;
      if (kind >= 1 && kind <= 4) {
        const expander = kind === 1 ? armExpandImm : thumbExpandImm;
        const x = kind === 4 ? { val: w1, c: 0 } : expander(w1, 0);
        const y = kind === 4 ? { val: w1, c: 1 } : expander(w1, 1);
        operand = String(kind === 3 ? (~x.val >>> 0) : x.val >>> 0);
        if (x.c === y.c) carry = String(x.c);
      } else if (kind === 0 && u.shiftType === 0 && (w1 & 31) === 0) operand = `r[${u.rm}]`;
      // Constant LSL is common in array indexing and software division.
      else if (kind === 0 && u.shiftType === 0) {
        const shift = w1 & 31; operand = `(r[${u.rm}]<<${shift})>>>0`; carry = `(r[${u.rm}]>>>${32 - shift})&1`;
      }
      else if (kind === 0) {
        const shift = w1 & 31, reg = `r[${u.rm}]`;
        if (u.shiftType === 1) operand = shift ? `${reg}>>>${shift}` : '0';
        else if (u.shiftType === 2) operand = `(${reg}>>${shift || 31})>>>0`;
        else operand = shift ? `((${reg}>>>${shift})|(${reg}<<${32-shift}))>>>0` : `((c.c<<31)|(${reg}>>>1))>>>0`;
        carry = u.shiftType === 3 && shift === 0 ? `${reg}&1` : `(${reg}>>>${shift ? shift-1 : 31})&1`;
      }
      if (operand !== null) {
        const ops: Record<number, string> = { [Op.AND]:'a&b', [Op.EOR]:'a^b', [Op.ORR]:'a|b', [Op.BIC]:'a&~b',
          [Op.MOV]:'b', [Op.MVN]:'~b', [Op.TST]:'a&b', [Op.TEQ]:'a^b' };
        const arithmetic = u.op >= Op.SUB && u.op <= Op.RSC || u.op === Op.CMP || u.op === Op.CMN;
        const addition = u.op === Op.ADD || u.op === Op.ADC || u.op === Op.CMN;
        const reverse = u.op === Op.RSB || u.op === Op.RSC;
        const expression = arithmetic ? (addition ? `a+b${u.op === Op.ADC ? '+c.c' : ''}` : `${reverse ? 'b-a' : 'a-b'}${u.op === Op.SBC || u.op === Op.RSC ? '-(1-c.c)' : ''}`) : ops[u.op];
        if (expression) {
          body = `a=r[${u.rn}];b=${operand};sc=${carry};raw=${expression};v=raw>>>0;`;
          if (u.s) {
            body += 'c.n=v>>>31;c.z=+(v===0);';
            if (arithmetic) {
              body += addition ? 'c.c=+(raw>4294967295);c.v=+((~(a^b)&(a^v))<0);'
                : `c.c=+(raw>=0);c.v=+(((a^b)&(${reverse ? 'b' : 'a'}^v))<0);`;
            } else body += 'c.c=sc;';
          }
          if (![Op.TST, Op.TEQ, Op.CMP, Op.CMN].includes(u.op)) body += `r[${u.rd}]=v;`;
        }
      }
    } else if (u.op >= Op.LDR && u.op <= Op.LDRSH && u.rd !== 15 && u.rn !== 15 && (!(u.aux & 1) || (u.rm !== 15 && u.shiftType === 0))) {
      const pre = Boolean(u.aux & 8), add = Boolean(u.aux & 16), wb = Boolean(u.aux & 4);
      const offset = u.aux & 1 ? `((r[${u.rm}]<<${w1 & 31})>>>0)` : String(w1 >>> 0);
      body = `a=r[${u.rn}];b=(a${add ? '+' : '-'}${offset})>>>0;v=${pre ? 'b' : 'a'};`;
      const access: Record<number, string> = {
        [Op.LDR]:`r[${u.rd}]=m.read32Ldr(v);`, [Op.STR]:`m.write32(v&~3,r[${u.rd}]);`,
        [Op.LDRB]:`r[${u.rd}]=m.read8(v);`, [Op.STRB]:`m.write8(v,r[${u.rd}]);`,
        [Op.LDRH]:`r[${u.rd}]=m.read16(v);`, [Op.STRH]:`m.write16(v&~1,r[${u.rd}]);`,
        [Op.LDRSB]:`r[${u.rd}]=(m.read8(v)<<24)>>24;`, [Op.LDRSH]:`r[${u.rd}]=(m.read16(v)<<16)>>16;`,
      };
      body += access[u.op];
      if (wb && !(u.op === Op.LDR && u.rd === u.rn)) body += `r[${u.rn}]=b;`;
    }
    if (u.op === Op.B || u.op === Op.BL) {
      const dest = ((pc + (block.thumb ? 4 : 8) + (w1 | 0)) & (block.thumb ? ~1 : ~3)) >>> 0;
      body = `${u.op === Op.BL ? `r[14]=${next | block.thumb};` : ''}r[15]=${dest};c.branched=1;`;
    } else if ((u.op === Op.BX || u.op === Op.BLX) && u.rm !== 15 && !(w2 & 1)) {
      // Read the branch target before replacing LR (BLX LR is legal).
      body = `v=r[${u.rm}];${u.op === Op.BLX ? `r[14]=${next | block.thumb};` : ''}c.t=v&1;r[15]=(v&(c.t?~1:~3))>>>0;c.branched=1;`;
    }
    lines.push('if(budget--<=0)return;');
    if (body !== null) lines.push(`c.branched=0;if(${conditions[u.cond]}){${body}}if(!c.branched)r[15]=${next};`);
    else lines.push(`f(c,${pc},${w0},${w1},${w2});`);
    lines.push(`c.insnCount++;if(!block.valid||c.itState)return;
      if(c.branched){
        if(budget>0&&r[15]===${block.guestPC}&&c.t===${block.thumb}){
          if(c.onBeforeFetch&&c.onBeforeFetch(c))return;
          continue loop;
        }
        return;
      }`);
    pc = next;
  }
  // CSP may disallow dynamic compilation. The cache catches that once and
  // retains the interpreter, so static sites do not need unsafe-eval enabled.
  return new Function('f', `return function(c,budget,block){loop:while(true){${lines.join('\n')}return;}}`)(execPacked) as CompiledBlock;
}
