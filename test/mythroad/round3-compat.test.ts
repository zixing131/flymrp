import { expect, it } from 'vitest';
import { ExtRuntime } from '../../src/abi/runtime.ts';
import { EXT_PLATFORM_IO_MEM_ADDR, EXT_PLATFORM_IO_MEM_SIZE, EXT_PLATFORM_MEM_ADDR, EXT_PLATFORM_MEM_SIZE } from '../../src/abi/layout.ts';
import { MythroadRuntime } from '../../src/mythroad/runtime.ts';
import { LegacyConfig } from '../../src/mythroad/legacy-config.ts';
import { call, TAG_NIL, TAG_NUMBER, CREATE_ABx, CREATE_ABC, OP_LOADK, OP_RETURN, dumpChunk, proto } from '../../src/lua/index.ts';
import { buildMrp } from '../../src/mrp/index.ts';
import { MR_KEY_DOWN, MR_KEY_FIRE, MR_MENU_SELECT } from '../../src/mythroad/constants.ts';
import { kn } from '../helpers/lua.ts';

function invoke(rt: MythroadRuntime, name: string, args: (number|string)[], field?:string) {
  const L=rt.lua.L;L.top=0;L.base=1;
  L.pushSlot(field?L.tables[L.getGlobal(name).num].getStr(L.internStr(field)):L.getGlobal(name));
  for(const arg of args) typeof arg==='string'?L.pushString(arg):L.pushInteger(arg);
  call(L,0,-1);return L;
}
const unicode=(s:string)=>Array.from(s,ch=>String.fromCharCode(ch.charCodeAt(0)>>>8,ch.charCodeAt(0)&255)).join('')+'\0\0';

it('maps independent zero-initialized platform state with bounded access',()=>{
  const rt=new ExtRuntime();
  for(const [base,size] of [[EXT_PLATFORM_MEM_ADDR,EXT_PLATFORM_MEM_SIZE],[EXT_PLATFORM_IO_MEM_ADDR,EXT_PLATFORM_IO_MEM_SIZE]]) {
    expect(rt.mem.read32(base+4)).toBe(0);rt.mem.write16(base+4,0xabcd);expect(rt.mem.read16(base+4)).toBe(0xabcd);
    expect(rt.mem.read8(base+size-1)).toBe(0);expect(()=>rt.mem.read8(base+size)).toThrow('fault');
  }
  expect(new ExtRuntime().mem.read16(0x80110004)).toBe(0);
});

it('exposes real Lua GUI menu state and selection events, including lowercase SDK alias',()=>{
  const rt=new MythroadRuntime();
  const handle=invoke(rt,'gui',[unicode('菜单'),2],'m_create').nums[0];
  invoke(rt,'gui',[handle,unicode('第一项'),0],'m_setItem');invoke(rt,'gui',[handle,unicode('第二项'),1],'m_setitem');
  invoke(rt,'gui',[handle],'m_show');const ui=rt.mrTable!.nativeUi;
  expect(ui.active?.title).toBe('菜单');expect(ui.active?.items).toEqual(['第一项','第二项']);
  ui.key(0,MR_KEY_DOWN);ui.key(1,MR_KEY_DOWN);ui.key(0,MR_KEY_FIRE);ui.key(1,MR_KEY_FIRE);
  const event=rt.events.poll();expect(event?.type).toBe(MR_MENU_SELECT);expect(event?.p1).toBe(1);expect(rt.events.poll()).toBeNull();
  expect(invoke(rt,'gui',[999],'m_show').tags[0]).toBe(TAG_NIL);
});

it('updates Lua dialogs while preserving omitted button type and pause timer flag',()=>{
  const rt=new MythroadRuntime();const handle=invoke(rt,'gui',[unicode('标题'),unicode('内容'),2],'d_create').nums[0];
  invoke(rt,'gui',[handle,unicode('新标题'),unicode('新内容')],'d_update');
  expect(rt.mrTable!.nativeUi.active?.buttons).toBe(2);expect(rt.mrTable!.nativeUi.active?.text).toBe('新内容');
  invoke(rt,'_com',[407,1]);expect(rt.timers.runWithoutPause).toBe(1);
  const L=invoke(rt,'_platEx',[1221,'']);expect(L.strings[L.nums[0]]).toBe('');expect(L.nums[1]).toBe(1);
});

it('persists bounded DSM configuration bytes and initializes reference defaults',()=>{
  let file:Uint8Array|null=null;let writes=0;
  const cfg=new LegacyConfig(()=>file,b=>{file=b;writes++;});
  expect(cfg.load()).toBe(0);expect(cfg.get(120,32)?.some(b=>b!==0)).toBe(true);
  expect(cfg.set(5,new Uint8Array([7]))).toBe(0);cfg.save();expect(writes).toBe(1);
  cfg.save();expect(writes).toBe(1);cfg.bytes[5]=0;cfg.load();expect(cfg.bytes[5]).toBe(7);
  expect(cfg.get(4319,1)).toBeNull();expect(cfg.set(-1,new Uint8Array([1]))).toBe(-1);
  const rt=new MythroadRuntime();invoke(rt,'_com',[500,0]);invoke(rt,'_com',[502,5,1,'\x03']);invoke(rt,'_com',[504,0]);
  expect(rt.appFs.file('dsm.cfg')?.[5]).toBe(3);expect(invoke(rt,'_com',[503,0]).nums[0]).toBe(3);
});

it('uses the underscored entry only when the default entry is absent and unspecified',()=>{
  const chunk=(n:number)=>dumpChunk(proto({maxstack:2,k:[kn(n)],code:[CREATE_ABx(OP_LOADK,0,0),CREATE_ABC(OP_RETURN,0,2,0)]}));
  const rt=new MythroadRuntime();rt.loadMrp(buildMrp([{name:'_start.mr',data:chunk(7)}]));rt.start();
  expect(rt.lua.L.slot(0)).toEqual({tag:TAG_NUMBER,num:7});expect(()=>rt.start('start.mr')).toThrow('cannot read start.mr');
  rt.loadMrp(buildMrp([{name:'_start.mr',data:chunk(7)},{name:'start.mr',data:chunk(9)}]));rt.start();expect(rt.lua.L.nums[0]).toBe(9);
});

it('retains short whole-image resources but rejects out-of-bounds crops',()=>{
  const rt=new MythroadRuntime();rt.bi=1;
  rt.loadMrp(buildMrp([{name:'short.bmp',data:new Uint8Array([0,248,224,7])}]));
  invoke(rt,'BitmapLoad',[0,'short.bmp',0,0,2,3,2]);
  expect(rt.bitmaps[0]?.h).toBe(3);expect([...rt.bitmaps[0]!.pixels!]).toEqual([0xf800,0x07e0]);
  invoke(rt,'BitmapShow',[0,0,0]);
  expect([...rt.screen.pixels.slice(0,2)]).toEqual([0xf800,0x07e0]);expect(rt.screen.pixels[240]).toBe(0);
  expect(()=>invoke(rt,'BitmapLoad',[1,'short.bmp',1,0,1,3,2])).toThrow('bounds');
});

it('shares Lua editor lifecycle with the native host and returns terminated UCS2 bytes',()=>{
  const rt=new MythroadRuntime();const h=invoke(rt,'gui',[unicode('输入'),unicode('初值'),0,10],'e_create').nums[0];
  expect(rt.mrTable!.editor.active?.text).toBe('初值');
  rt.mrTable!.editor.finish('中文',true);
  const L=invoke(rt,'gui',[h],'e_gettext');expect(L.strings[L.nums[0]]).toBe(unicode('中文'));
  invoke(rt,'gui',[h],'e_release');expect(invoke(rt,'gui',[h],'e_getText').tags[0]).toBe(TAG_NIL);
  expect(invoke(rt,'gui',[],'w_create').nums[0]).toBe(1);expect(invoke(rt,'gui',[1],'w_release').tags[0]).toBe(TAG_NIL);
});
