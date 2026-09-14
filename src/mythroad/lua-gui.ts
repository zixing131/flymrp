import { ExtRuntime } from '../abi/runtime.ts';
import type { LuaState } from '../lua/state.ts';
import { TAG_TABLE, type NativeFunction } from '../lua/types.ts';
import { MR_SUCCESS } from './constants.ts';
import type { MythroadRuntime } from './runtime.ts';

/** mr_iolib_target.c guilib: strings are UCS2-BE (MR_AUTO_UNICODE is disabled). */
export function installLuaGui(rt: MythroadRuntime): void {
  const L = rt.lua.L, id = L.newTable();
  const put = (name: string, fn: NativeFunction) => L.setTableFn(id, name, fn);
  const bridge = () => {
    if (!rt.ext) rt.bindExt(new ExtRuntime());
    return rt.mrTable!;
  };
  const ui = () => bridge().nativeUi;
  const text = (state: LuaState, arg: number) => {
    const bytes = state.checkString(arg).s; let value = '';
    for (let i=0;i+1<bytes.length;i+=2) {
      const ch=(bytes.charCodeAt(i)<<8)|bytes.charCodeAt(i+1);
      if (!ch) break; value += String.fromCharCode(ch);
    }
    return value;
  };
  const result = (state: LuaState, value: number, handle = false) => {
    if (handle ? value > 0 : value === MR_SUCCESS) state.pushInteger(value);
    else state.pushNil();
    return 1;
  };
  put('m_create', s => result(s, ui().create('menu', text(s,1)), true));
  put('m_setItem', s => result(s, ui().setItem(s.optNumber(1,0), text(s,2), s.optNumber(3,0))));
  put('m_setitem', s => result(s, ui().setItem(s.optNumber(1,0), text(s,2), s.optNumber(3,0))));
  for (const name of ['m_show','m_update']) put(name,s=>result(s,ui().show(s.optNumber(1,0))));
  put('m_focus',s=>result(s,ui().focus(s.optNumber(1,0),s.optNumber(2,0))));
  for (const name of ['m_release','d_release','t_release']) put(name,s=>result(s,ui().release(s.optNumber(1,0))));
  for (const [name,kind] of [['d_create','dialog'],['t_create','text']] as const)
    put(name,s=>result(s,ui().create(kind,text(s,1),text(s,2),s.optNumber(3,0)),true));
  // Reference refresh wrappers return nil for MR_SUCCESS (zero), not a handle.
  put('d_update',s=>result(s,ui().refresh(s.optNumber(1,0),text(s,2),text(s,3),s.optNumber(4,-1)),true));
  put('t_update',s=>result(s,ui().refresh(s.optNumber(1,0),text(s,2),text(s,3)),true));
  put('e_create',s=>result(s,bridge().editor.create(text(s,1),text(s,2),s.optNumber(3,0),s.optNumber(4,68)),true));
  put('e_release',s=>result(s,bridge().editor.release(s.optNumber(1,0))));
  for (const name of ['e_getText','e_gettext']) put(name,s=>{
    const b=bridge(), p=b.editor.getText(s.optNumber(1,0));
    if (!p) { s.pushNil(); return 1; }
    let value='';
    for(let i=0;i<=4096;i++) {
      const hi=rt.ext!.mem.read8(p+i*2),lo=rt.ext!.mem.read8(p+i*2+1);
      value+=String.fromCharCode(hi,lo); if (!hi&&!lo) break;
    }
    s.pushString(value);return 1;
  });
  put('w_create',s=>result(s,bridge().winCreate(),true));
  put('w_release',s=>result(s,bridge().winRelease(s.optNumber(1,0))));
  L.setGlobal('gui',TAG_TABLE,id);
}
