import { getStore } from '@edgeone/pages-blob';
import chunks from '../../blob-config/chunks.js';

export function imageContentType(bytes) {
  const b = new Uint8Array(bytes);
  if ([137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)) return 'image/png';
  if (b[0]===66 && b[1]===77 && b.length>=54) return 'image/bmp';
  if (b[0]===255 && b[1]===216 && b[2]===255) return 'image/jpeg';
  const text = new TextDecoder().decode(b.slice(0,12));
  if (text.startsWith('GIF87a') || text.startsWith('GIF89a')) return 'image/gif';
  if (text.startsWith('RIFF') && text.slice(8)==='WEBP') return 'image/webp';
  return null;
}

// Deployment supplies project credentials. The browser has read access only.
export async function onRequest({ request }) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  let key;
  try { key = decodeURIComponent(new URL(request.url).pathname.slice('/blob/'.length)); }
  catch { return new Response('Invalid path', { status: 400 }); }
  if (!/^(mrp-files|mrp-icon|api|mythroad_res|runtime|chunks)\//.test(key) || key.split('/').some(p => !p || p === '.' || p === '..')) return new Response('Not found', { status: 404 });
  if (Object.hasOwn(chunks, key)) {
    const manifest = chunks[key];
    const headers = { 'Content-Type': 'application/vnd.flymrp.chunks+json', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    return new Response(request.method === 'HEAD' ? null : JSON.stringify(manifest), { headers });
  }
  const store = getStore('my-store');
  const metadata = await store.getMetadata(key);
  if (!metadata) return new Response('Not found', { status: 404 });
  // The original store names some BMP/JPEG icons .png. Preserve their bytes and
  // return the actual format instead of guessing from the filename.
  const icon = key.startsWith('mrp-icon/') ? await store.get(key, { type: 'arrayBuffer' }) : null;
  const type = icon ? imageContentType(icon) || 'application/octet-stream' : key.endsWith('.json') ? 'application/json; charset=utf-8' : key.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
  const headers = new Headers({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': key.startsWith('api/') ? 'no-cache' : 'public, max-age=86400' });
  if (metadata.etag) {
    headers.set('ETag', metadata.etag);
    if (request.headers.get('If-None-Match') === metadata.etag) return new Response(null, { status: 304, headers });
  }
  if (request.method === 'HEAD') return new Response(null, { headers });
  const body = icon || await store.get(key, { type: 'stream' });
  return body ? new Response(body, { headers }) : new Response('Not found', { status: 404 });
}
