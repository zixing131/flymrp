/** Exercise the real Blob route locally against uploaded objects, without deploying the site. */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { fetchFileBytes } from '../../web/chunk-download.ts';
process.env.PAGES_PROJECT_ID='makers-gciglthrse9a';
process.env.PAGES_BLOB_DEPLOY_CREDENTIAL=(await readFile(process.env.EDGEONE_TOKEN_FILE!,'utf8')).trim();
const functionPath=process.env.EDGEONE_FUNCTION_PATH || 'edge-functions/blob/[[path]].js';
const {onRequest}=await import(pathToFileURL(resolve(functionPath)).href);
const rewrites: {source:string;destination:string}[]=process.env.EDGEONE_FUNCTION_PATH ? JSON.parse(await readFile('artifacts/edgeone/deploy/edgeone.json','utf8')).rewrites : [];
const map=JSON.parse(await readFile('artifacts/edgeone/chunks-summary.json','utf8')).filesByKey;
let maxResponseBytes=0;const requests:{path:string;bytes:number;status:number}[]=[];
const server=createServer(async(req,res)=>{
 try{
  let route=decodeURIComponent(req.url!);
  for(const rule of rewrites) {
   if(rule.source.endsWith('*') && route.startsWith(rule.source.slice(0,-1))) { route=rule.destination.replace(':splat',route.slice(rule.source.length-1)); break; }
   if(route===rule.source) { route=rule.destination; break; }
  }
  const response=await onRequest({request:new Request(`http://127.0.0.1${route}`,{method:req.method})});
  const bytes=Buffer.from(await response.arrayBuffer());maxResponseBytes=Math.max(maxResponseBytes,bytes.length);
  requests.push({path:req.url!,bytes:bytes.length,status:response.status});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(bytes);
 }catch{res.writeHead(500);res.end('Blob read failed');}
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const port=(server.address() as {port:number}).port;
const verified=[];
try{
 for(const [key,raw] of Object.entries(map)){
  const expected=raw as {size:number;sha256:string};
  const route=rewrites.length && key.startsWith('runtime/') ? key.slice('runtime/'.length) : `blob/${key}`;
  const bytes=await fetchFileBytes(`http://127.0.0.1:${port}/${route}`);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==expected.size||sha256!==expected.sha256)throw new Error(`Reassembly failed: ${key}`);
  verified.push({key,bytes:bytes.length,sha256});console.log('Verified reassembly',key,bytes.length);
 }
 if(rewrites.length) {
  for(const name of ['games/index.json','mythroad_res/index.json','mythroad_res/groups/gjjfy.json','network-rules.json','plugins/msbase.mrp','mythroad-manifest.json']) {
   const expected=await readFile(`dist/${name}`);
   const bytes=await fetchFileBytes(`http://127.0.0.1:${port}/${name}`);
   const sha256=createHash('sha256').update(bytes).digest('hex');
   if(sha256!==createHash('sha256').update(expected).digest('hex'))throw new Error(`Runtime route differs: ${name}`);
   verified.push({key:`runtime/${name}`,bytes:bytes.length,sha256});
  }
 }
 if(maxResponseBytes>2000000)throw new Error('A response exceeded 2 MB');
 await writeFile(process.env.EDGEONE_FUNCTION_PATH ? 'artifacts/edgeone/packaged-download-verification.json' : 'artifacts/edgeone/download-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),verified,maxResponseBytes,requests},null,2)+'\n');
 console.log(JSON.stringify({files:verified.length,maxResponseBytes,requests:requests.length}));
}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
