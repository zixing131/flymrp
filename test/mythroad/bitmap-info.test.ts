import { expect, it } from 'vitest';
import { MythroadRuntime } from '../../src/mythroad/runtime.ts';
import { tableSlotAddr } from '../../src/abi/layout.ts';
import { call } from '../../src/lua/index.ts';

function invoke(rt: MythroadRuntime, name: string, args: number[]) {
  const L=rt.lua.L;L.top=0;L.base=1;L.pushSlot(L.getGlobal(name));
  args.forEach(n=>L.pushInteger(n));call(L,0,-1);return Array.from(L.nums.slice(0,L.top));
}
it('returns the actual shared framebuffer pointer and dimensions',()=>{
  const rt=new MythroadRuntime({profile:{width:176,height:220}});
  const [address,size,w,h]=invoke(rt,'_bmpInfo',[30]);
  expect([size,w,h]).toEqual([176*220*2,176,220]);
  expect(address).toBe(rt.ext!.mem.read32(rt.ext!.mem.read32(tableSlotAddr(91))));
  rt.ext!.mem.write16(address,0xf800);expect(rt.screen.pixels[0]).toBe(0xf800);
  rt.screen.pixels[1]=0x07e0;expect(rt.ext!.mem.read16(address+2)).toBe(0x07e0);
});
it('shares Lua bitmap pixels with guest memory without stale copies',()=>{
  const rt=new MythroadRuntime();invoke(rt,'BitmapNew',[2,2,2]);
  const [address,size,w,h,type]=invoke(rt,'_bmpInfo',[2]);expect([size,w,h,type]).toEqual([8,2,2,0]);
  rt.ext!.mem.write16(address,0xf800);invoke(rt,'BitmapShow',[2,0,0]);expect(rt.screen.pixels[0]).toBe(0xf800);
  rt.bitmaps[2]!.pixels![1]=0x07e0;expect(rt.ext!.mem.read16(address+2)).toBe(0x07e0);
  expect(invoke(rt,'_bmpInfo',[2])[0]).toBe(address);
  const record=rt.ext!.mem.read32(tableSlotAddr(95))+32;
  expect(rt.ext!.mem.read32(record+12)).toBe(address);
});
it('preserves byte length independently of declared dimensions and rejects invalid slots',()=>{
  const rt=new MythroadRuntime();rt.bitmaps[1]={w:2,h:3,loaded:true,name:'short',pixels:new Uint16Array([1,2])};
  expect(invoke(rt,'_bmpInfo',[1]).slice(1)).toEqual([4,2,3,0]);
  expect(invoke(rt,'_bmpInfo',[3])).toEqual([0,0,0,0,0]);
  expect(()=>invoke(rt,'_bmpInfo',[-1])).toThrow('invalid');
});

it('reports optional platform probes as ignored without inventing output data',()=>{
  const rt=new MythroadRuntime();
  for(const code of [1210,1221,2200]) {
    const result=invoke(rt,'_platEx',[code]);expect(result.length).toBe(2);
    expect(rt.lua.L.strings[result[0]]).toBe('');expect(result[1]).toBe(1);
  }
});
