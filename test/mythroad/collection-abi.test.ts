import { describe, expect, it } from "vitest";
import { ExtRuntime } from "../../src/abi/runtime.ts";
import { tableSlotAddr } from "../../src/abi/layout.ts";
import { MrTableBridge, readGuestCString, guestStrtoul } from "../../src/mythroad/mr-table.ts";
import { MythroadVfs } from "../../src/mythroad/vfs.ts";
import { ucs2ToGbk } from "../../src/mythroad/font.ts";

function setup() {
  const ext=new ExtRuntime(), bridge=new MrTableBridge(ext,new MythroadVfs(),"abi");bridge.install();
  const str=(s: string)=>{const p=ext.alloc(s.length+1);ext.mem.load(p,new TextEncoder().encode(s+"\0"));return p;};
  const call=(slot:number,r0:number,r1:number,r2:number)=>ext.runGuest(tableSlotAddr(slot),{r0,r1,r2}).r0|0;
  return {ext,bridge,str,call};
}
describe("collection string and platform ABI",()=>{
  it("rmdir refuses files, missing paths and nonempty directories through the guest ABI",()=>{
    const {bridge,str,call}=setup();
    bridge.appFs.createFile("cache/entry",true);
    expect(call(50,str("cache"),0,0)).toBe(-1);
    expect(call(50,str("cache/entry"),0,0)).toBe(-1);
    expect(bridge.appFs.remove("cache/entry")).toBe(0);
    expect(call(50,str("cache/"),0,0)).toBe(0);
    expect(call(50,str("cache"),0,0)).toBe(-1);
  });
  it("strtoul supports prefixes, signs, overflow and partial input on a 32-bit guest",()=>{
    expect(guestStrtoul("  -0x10x",0)).toBe(0xfffffff0);
    expect(guestStrtoul("0778",0)).toBe(63);
    expect(guestStrtoul("4294967296",10)).toBe(0xffffffff);
    expect(guestStrtoul("z!",36)).toBe(35);
    expect(guestStrtoul("123",1)).toBe(0);
    const {str,call}=setup();expect(call(19,str("0xff"),16,0)).toBe(255);
  });
  it("initializes a virtual network, reports unavailable transport, and rejects unknown platform extensions",()=>{
    const {ext,bridge,str,call}=setup();expect(call(81,0,str("CMNET"),0)).toBe(0);
    expect(bridge.networkMode).toBe("CMNET");expect(call(83,str("example.invalid"),0,0)).toBe(-1);
    const socket=call(84,0,0,0);expect(socket).toBeGreaterThan(0);
    expect(call(85,socket,0x08080808,80)).toBe(-1);
    expect(call(82,0,0,0)).toBe(0);expect(bridge.networkMode).toBeNull();
    expect(call(87,socket,0,1)).toBe(-1);
    expect(bridge.platEx(ext.mem,new Uint32Array([2221,0,0,0,0]))).toBe(-1);
    expect(()=>bridge.platEx(ext.mem,new Uint32Array([999999,0,0,0,0]))).toThrow();
  });
  it("renames EFS files while preserving the source's open handle and rejects missing sources",()=>{
    const {ext,bridge,str,call}=setup();const from=str("save.tmp"),to=str("save.dat"),bytes=ext.alloc(3);ext.mem.load(bytes,[1,2,3]);
    const f=call(40,from,4|8,0);expect(call(43,f,bytes,2)).toBe(2);
    expect(call(48,from,to,0)).toBe(0);expect(bridge.appFs.file("save.tmp")).toBeNull();
    expect(call(43,f,bytes+2,1)).toBe(1);expect([...bridge.appFs.file("save.dat")!]).toEqual([1,2,3]);
    expect(call(48,from,to,0)).toBe(-1);
  });
  it("strncat terminates at count and strncmp honors unsigned bytes and zero length",()=>{
    const {ext,str,call}=setup();const dst=ext.alloc(32),src=str("abcd");ext.mem.load(dst,[120,0]);
    expect(call(8,dst,src,2)).toBe(dst);expect(readGuestCString(ext.mem,dst)).toBe("xab");
    expect(call(11,src,str("abef"),2)).toBe(0);expect(call(11,src,str("abef"),3)).toBeLessThan(0);
    expect(call(11,0xffffffff,0xffffffff,0)).toBe(0);
    const hi=ext.alloc(2);ext.mem.load(hi,[255,0]);expect(call(11,hi,str("x"),1)).toBe(135);
  });
  it("converts UCS2BE into GBK, allocates output or fills a supplied buffer without changing its length",()=>{
    const {ext,bridge}=setup();const input=ext.alloc(8),out=ext.alloc(4),len=ext.alloc(4);
    ext.mem.load(input,[0x4e,0x2d,0x65,0x87,0,65,0,0]);
    expect([...ucs2ToGbk([0x4e2d,0x6587,65])]).toEqual([0xd6,0xd0,0xce,0xc4,65]);
    expect([...ucs2ToGbk([0xd800])]).toEqual([0xa1,0xf4]);
    expect(bridge.platEx(ext.mem,new Uint32Array([1207,input,6,out,len]))).toBe(0);
    const p=ext.mem.read32(out);expect(ext.mem.read32(len)).toBe(6);
    expect([...ext.mem.slice(p,6)]).toEqual([0xd6,0xd0,0xce,0xc4,65,0]);
    ext.mem.write32(len,99);bridge.platEx(ext.mem,new Uint32Array([1207,input,6,out,len]));
    expect(ext.mem.read32(out)).toBe(p);expect(ext.mem.read32(len)).toBe(99);
  });
  it("returns the native disk-info structure and preserves output for unknown drives",()=>{
    const {ext,bridge,str}=setup();const out=ext.alloc(4),len=ext.alloc(4);
    expect(bridge.platEx(ext.mem,new Uint32Array([1305,str("b:"),2,out,len]))).toBe(0);
    expect(ext.mem.read32(len)).toBe(16);const p=ext.mem.read32(out);
    expect([0,4,8,12].map(o=>ext.mem.read32(p+o))).toEqual([1874,1048576,1873,1048576]);
    expect(bridge.platEx(ext.mem,new Uint32Array([1305,str("z:"),2,out,len]))).toBe(1);
    expect(ext.mem.read32(out)).toBe(p);
  });
  it("exposes key-release support and declines optional platform billing takeover", () => {
    const {ext,bridge}=setup();
    expect(bridge.plat(1214,1)).toBe(0);
    expect(bridge.plat(1101,2)).toBe(1); expect(bridge.plat(1011,0)).toBe(1);
    expect(bridge.platEx(ext.mem,new Uint32Array([0x90004,0,48,0,0]))).toBe(1);
  });

});
