import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { CHUNK_TYPE, fetchFileBytes, parseChunkManifest } from '../../web/chunk-download.ts';
import { fetchAssetBytes } from '../../web/remote-files.ts';
const md5=(b:Uint8Array)=>createHash('md5').update(b).digest('hex');
const parts=[new Uint8Array([0,255,128]),new Uint8Array([1,2,3,4])];
const all=new Uint8Array([...parts[0],...parts[1]]);
const manifest={version:1,size:all.length,md5:md5(all),parts:parts.map((b,i)=>({key:`chunks/${'a'.repeat(64)}/${i}`,size:b.length,md5:md5(b)}))};
afterEach(()=>vi.unstubAllGlobals());
describe('chunk downloads',()=>{
 it('assembles exact bytes, reports progress, and retries a corrupt part',async()=>{
  let calls=0;
  const fetch=vi.fn(async(url:string)=>{
   if(url.endsWith('.mrp'))return new Response(JSON.stringify(manifest),{headers:{'Content-Type':CHUNK_TYPE}});
   if(url.endsWith('/0') && calls++===0)return new Response(new Uint8Array([9,9,9]));
   return new Response(parts[url.endsWith('/0')?0:1]);
  });vi.stubGlobal('fetch',fetch);const progress=vi.fn();
  expect(await fetchFileBytes('https://example.com/blob/mrp-files/test.mrp',progress)).toEqual(all);
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(progress).toHaveBeenLastCalledWith(all.length,all.length);
 });
 it('rejects oversized pieces and foreign paths',()=>{
  expect(()=>parseChunkManifest({...manifest,parts:[{...manifest.parts[0],size:2000001}]})).toThrow();
  expect(()=>parseChunkManifest({...manifest,parts:[{...manifest.parts[0],key:'https://other.com/file'}]})).toThrow();
 });
 it('fails after three corrupt downloads',async()=>{
  const fetch=vi.fn(async(url:string)=>url.endsWith('.mrp')?new Response(JSON.stringify(manifest),{headers:{'Content-Type':CHUNK_TYPE}}):new Response(new Uint8Array([9])));
  vi.stubGlobal('fetch',fetch);
  await expect(fetchFileBytes('https://example.com/blob/test.mrp')).rejects.toThrow('checksum');
  expect(fetch).toHaveBeenCalledTimes(4);
 });
 it('assembles synchronous worker resources with the same checks',()=>{
  const requests:string[]=[];
  class XHR {
   status=200;responseType='';response:ArrayBuffer=new ArrayBuffer(0);url='';
   open(_method:string,url:string,async:boolean){expect(async).toBe(false);this.url=url;requests.push(url);}
   send(){this.response=this.url.endsWith('.uc2')?new TextEncoder().encode(JSON.stringify(manifest)).buffer:parts[this.url.endsWith('/0')?0:1].buffer as ArrayBuffer;}
   getResponseHeader(){return this.url.endsWith('.uc2')?CHUNK_TYPE:'application/octet-stream';}
  }
  vi.stubGlobal('XMLHttpRequest',XHR);
  expect(fetchAssetBytes('https://example.com/system/font.uc2')).toEqual(all);
  expect(requests).toHaveLength(3);
 });
});
