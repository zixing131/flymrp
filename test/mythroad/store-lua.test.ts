import { expect, it } from 'vitest';
import { CREATE_ABC, CREATE_ABx, OP_CALL, OP_GETGLOBAL, OP_LOADK, proto, dumpChunk, call as luaCall, TAG_FUNCTION, TAG_NIL } from '../../src/lua/index.ts';
import { buildMrp } from '../../src/mrp/index.ts';
import { MythroadRuntime } from '../../src/mythroad/runtime.ts';
import { kn, ks } from '../helpers/lua.ts';
function call(rt: MythroadRuntime, name: string, args: (string | number)[]) {
  const k = [ks(name), ...args.map(a => typeof a === 'string' ? ks(a) : kn(a))];
  rt.lua.runCold(proto({ maxstack: args.length + 3, k, code: [CREATE_ABx(OP_GETGLOBAL, 0, 0), ...args.map((_, i) => CREATE_ABx(OP_LOADK, i + 1, i + 1)), CREATE_ABC(OP_CALL, 0, args.length + 1, 1)] }));
}
function invoke(rt: MythroadRuntime, name: string, args: (string | number)[]) {
  const L=rt.lua.L;L.top=0;L.base=1;L.pushSlot(L.getGlobal(name));
  for(const arg of args) typeof arg==='string'?L.pushString(arg):L.pushInteger(arg);
  luaCall(L,0,-1);return L;
}

it('loadfile returns a deferred closure and nil/error for absent or malformed chunks', () => {
  const child=dumpChunk(proto({maxstack:2,k:[ks('mark')],code:[CREATE_ABx(OP_GETGLOBAL,0,0),CREATE_ABC(OP_CALL,0,1,1)]}));
  const rt=new MythroadRuntime();rt.loadMrp(buildMrp([{name:'child.mr',data:child},{name:'bad.mr',data:new Uint8Array([1,2,3])}]));
  let calls=0;rt.lua.register('mark',()=>{calls++;return 0;});
  const L=invoke(rt,'loadfile',['child.mr']);expect(L.slot(0).tag).toBe(TAG_FUNCTION);expect(calls).toBe(0);
  luaCall(L,0,0);expect(calls).toBe(1);
  for(const file of ['absent.mr','bad.mr']){invoke(rt,'loadfile',[file]);expect(L.slot(0).tag).toBe(TAG_NIL);expect(L.strings[L.nums[1]]).not.toBe('');}
});

it('SpriteCheck counts visible collisions without drawing and respects transparency and frame offsets', () => {
  const rt=new MythroadRuntime({profile:{width:64,height:64}});
  rt.bitmaps[0]={w:2,h:2,loaded:true,name:'',pixels:new Uint16Array([0,0xffff,0xffff,0xffff])};rt.sprites[0]={h:1};
  rt.screen.pixels[0]=0xffff;const before=rt.screen.pixels.slice();
  expect(invoke(rt,'SpriteCheck',[0,0,0,0,0]).nums[0]).toBe(0);
  expect(invoke(rt,'SpriteCheck',[0,1,0,0,0]).nums[0]).toBe(1);
  expect(invoke(rt,'SpriteCheck',[0,1,-1,0,0]).nums[0]).toBe(1);
  expect(rt.screen.pixels).toEqual(before);
  expect(()=>invoke(rt,'SpriteCheck',[0,2,0,0,0])).toThrow('bounds');
});
it('makes loaded package headers readable to Lua file handles across app switches', () => {
  const rt = new MythroadRuntime();
  const a = buildMrp([{name:'x',data:new Uint8Array([1])}], {filename:'a.mrp'});
  const b = buildMrp([{name:'x',data:new Uint8Array([2])}], {filename:'b.mrp'});
  rt.loadMrp(a); const fd = rt.vfs.open('a.mrp', 1);
  expect(fd).toBeGreaterThan(0); expect(rt.vfs.size('a.mrp')).toBe(a.length);
  rt.loadMrp(b); expect(rt.vfs.read(fd,16)).toEqual(a.subarray(0,16));
  expect(rt.vfs.readFile('b.mrp')).toEqual(b);
  expect(rt.vfs.open('missing.mrp', 1)).toBe(0);
});
it('draws extended text with wrapping and clipping, including Unicode byte input', () => {
  const rt = new MythroadRuntime({profile:{width:64,height:64}});
  call(rt,'_drawTextEx',['ABC',2,2,40,40,8,40,255,255,255,2,0]);
  expect(rt.screen.pixels.some(p=>p!==0)).toBe(true);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(x<2||x>=10||y<2||y>=42)expect(rt.screen.pixels[y*64+x]).toBe(0);
  const normal = new MythroadRuntime({profile:{width:64,height:64}});
  call(normal,'_drawTextEx',['\0A\0B\0C',2,2,0,0,8,40,255,255,255,3,0]);
  expect(normal.screen.pixels).toEqual(rt.screen.pixels);
});

it('switches reader resources without discarding caller Lua globals, timers or open files', () => {
  const reader=buildMrp([{name:'page',data:new Uint8Array([2])}],{filename:'reader.mrp'});
  const shadow=buildMrp([{name:'page',data:new Uint8Array([9])}],{filename:'reader.mrp'});
  const book=buildMrp([{name:'page',data:new Uint8Array([1])},{name:'reader.mrp',data:shadow}],{filename:'book.mrp'});
  const rt=new MythroadRuntime({systemFiles:{'reader.mrp':reader}});rt.loadMrp(book);
  const lua=rt.lua,fd=rt.vfs.open('book.mrp',1);
  expect(rt.selectReadPack('reader.mrp')).toBe('book.mrp');
  expect(rt.vfs.readFile('page')).toEqual(new Uint8Array([2]));
  expect(rt.lua).toBe(lua);expect(rt.vfs.read(fd,4)).toEqual(book.subarray(0,4));
  expect(rt.selectReadPack('book.mrp')).toBe('reader.mrp');
  expect(rt.vfs.readFile('page')).toEqual(new Uint8Array([1]));
  expect(()=>rt.selectReadPack('absent.mrp')).toThrow('cannot load package');
  expect(rt.packName).toBe('book.mrp');
});

it('captures independent screen bitmaps through both handset names', () => {
  const rt = new MythroadRuntime({profile:{width:64,height:64}});
  rt.screen.pixels[17] = 0xabcd;
  call(rt, '_bmpGetScr', [0]); call(rt, 'BmGetScr', [1]);
  expect(rt.bitmaps[0]?.pixels).toEqual(rt.screen.pixels);
  expect(rt.bitmaps[1]?.w).toBe(64);
  rt.screen.pixels[17] = 0;
  expect(rt.bitmaps[0]?.pixels?.[17]).toBe(0xabcd);
  expect(()=>call(rt, '_bmpGetScr', [-1])).toThrow('invalid');
});
