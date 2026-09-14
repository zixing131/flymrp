import type { GuestMemory } from "../hot/memory.ts";
import { MR_FAILED, MR_SUCCESS, MR_KEY_PRESS, MR_KEY_RELEASE, MR_KEY_SOFTLEFT, MR_KEY_SOFTRIGHT, MR_KEY_FIRE, MR_KEY_BACK } from "./constants.ts";
export type EditState = { handle: number; title: string; text: string; type: number; maxLength: number };

/** Native mr_editCreate/GetText/Release lifecycle; guest strings are UCS2-BE. */
export class NativeEditor {
  active: EditState | null = null;
  private nextHandle = 1;
  private entries = new Map<number, EditState & { pointer: number }>();
  private swallowRelease: number | null = null;
  constructor(private readonly mem: GuestMemory, private readonly alloc: (size: number) => number,
    private readonly changed: (state: EditState | null) => void = () => {},
    private readonly completed: (accepted: boolean) => void = () => {}) {}
  create(title: number | string, text: number | string, type: number, maxLength: number): number {
    if (this.entries.size >= 16 || ![0,1,2,3].includes(type) || !Number.isInteger(maxLength) || maxLength < 1 || maxLength > 4096) return MR_FAILED;
    const state = { handle: this.nextHandle++, title: this.read(title,256), text: this.read(text,maxLength), type, maxLength, pointer: this.alloc((maxLength+1)*2) };
    if (!state.pointer) return MR_FAILED;
    this.entries.set(state.handle,state); this.active=state; this.write(state); this.notify(); return state.handle;
  }
  getText(handle: number): number { return this.entries.get(handle)?.pointer ?? 0; }
  release(handle: number): number {
    if (!this.entries.delete(handle)) return MR_FAILED;
    if (this.active?.handle===handle) { this.active=null;this.changed(null); }
    return MR_SUCCESS;
  }
  finish(text: string, accepted: boolean): boolean {
    const active=this.active;if(!active)return false;
    const state=this.entries.get(active.handle)!;
    if(accepted){state.text=text.replace(/\0/g,'').slice(0,state.maxLength);if(state.type===1)state.text=state.text.replace(/[^0-9]/g,'');this.write(state);}
    this.active=null;this.changed(null);this.completed(accepted);return true;
  }
  /** Modal keys are consumed; the confirming key release cannot leak to a game. */
  key(type: number, key: number): boolean {
    if(type===MR_KEY_RELEASE&&key===this.swallowRelease){this.swallowRelease=null;return true;}
    if(!this.active)return false;
    if(type===MR_KEY_PRESS){
      if([MR_KEY_SOFTLEFT,MR_KEY_FIRE].includes(key)){this.swallowRelease=key;this.finish(this.active.text,true);}
      else if([MR_KEY_SOFTRIGHT,MR_KEY_BACK].includes(key)){this.swallowRelease=key;this.finish(this.active.text,false);}
      else if(key>=0&&key<=9){this.active.text=(this.active.text+String(key)).slice(0,this.active.maxLength);this.write(this.entries.get(this.active.handle)!);this.notify();}
    }
    return true;
  }
  private notify(): void { this.changed(this.active ? { ...this.active } : null); }
  private read(p: number | string,max: number): string {
    if(typeof p === 'string') return p.split('\0',1)[0].slice(0,max);
    if(!p)return '';let s='';for(let i=0;i<max;i++){const n=(this.mem.read8(p+i*2)<<8)|this.mem.read8(p+i*2+1);if(!n)break;s+=String.fromCharCode(n);}return s;
  }
  private write(state: EditState & {pointer:number}): void {
    for(let i=0;i<state.text.length;i++){const n=state.text.charCodeAt(i);this.mem.write8(state.pointer+i*2,n>>>8);this.mem.write8(state.pointer+i*2+1,n&255);}
    this.mem.write16(state.pointer+state.text.length*2,0);
  }
}
