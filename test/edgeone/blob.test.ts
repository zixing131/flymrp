import { beforeEach, describe, expect, it, vi } from 'vitest';
const store = vi.hoisted(() => ({getMetadata:vi.fn(),get:vi.fn()}));
vi.mock('@edgeone/pages-blob',()=>({getStore:()=>store}));
// @ts-expect-error EdgeOne deploys this JavaScript function directly.
import { onRequest } from '../../edge-functions/blob/[[path]].js';
const request=(path: string,options?: RequestInit)=>onRequest({request:new Request(`https://example.com/blob/${path}`,options)});
beforeEach(()=>vi.resetAllMocks());
describe('EdgeOne Blob read route',()=>{
 it('preserves binary bytes and MIME type',async()=>{
  store.getMetadata.mockResolvedValue({etag:'"abc"'});
  const png = new Uint8Array([137,80,78,71,13,10,26,10,0,255,128,1]);
  store.get.mockResolvedValue(png.buffer);
  const res=await request('mrp-icon/a.png');
  expect(res.headers.get('Content-Type')).toBe('image/png');
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(png);
  expect(store.get).toHaveBeenCalledWith('mrp-icon/a.png',{type:'arrayBuffer'});
 });
 it('serves BMP icons under original png filenames with their real MIME type',async()=>{
  const bmp=new Uint8Array(54);bmp.set([66,77]);
  store.getMetadata.mockResolvedValue({});store.get.mockResolvedValue(bmp.buffer);
  expect((await request('mrp-icon/bmp.png')).headers.get('Content-Type')).toBe('image/bmp');
 });
 it('returns a small descriptor instead of a large object',async()=>{
  const res=await request('mrp-files/tommao.mrp');
  expect(res.headers.get('Content-Type')).toBe('application/vnd.flymrp.chunks+json');
  const manifest=await res.json();expect(manifest.parts.length).toBe(3);
  expect(manifest.parts.every((p: {size:number})=>p.size<=1900000)).toBe(true);
  expect(store.get).not.toHaveBeenCalled();
 });
 it('does not download bytes for HEAD or a matching ETag',async()=>{
  store.getMetadata.mockResolvedValue({etag:'"abc"'});
  expect((await request('mrp-files/a.mrp',{method:'HEAD'})).status).toBe(200);
  expect((await request('mrp-files/a.mrp',{headers:{'If-None-Match':'"abc"'}})).status).toBe(304);
  expect(store.get).not.toHaveBeenCalled();
 });
 it('rejects writes, unlisted prefixes and invalid paths',async()=>{
  expect((await request('mrp-files/a.mrp',{method:'PUT',body:'x'})).status).toBe(405);
  expect((await request('private/a')).status).toBe(404);
  expect((await request('mrp-files/%2e%2e%2fsecret')).status).toBe(404);
  expect((await request('mrp-files/%FF')).status).toBe(400);
  expect(store.getMetadata).not.toHaveBeenCalled();
 });
 it('returns 404 for missing objects',async()=>{
  store.getMetadata.mockResolvedValue(null);
  expect((await request('mrp-files/missing.mrp')).status).toBe(404);
 });
});
