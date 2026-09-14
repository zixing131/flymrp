/** Exercise the real Blob route locally against uploaded objects, without deploying the site. */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fetchFileBytes } from '../../web/chunk-download.ts';
process.env.PAGES_PROJECT_ID='makers-gciglthrse9a';
process.env.PAGES_BLOB_DEPLOY_CREDENTIAL=(await readFile(process.env.EDGEONE_TOKEN_FILE!,'utf8')).trim();
// @ts-expect-error EdgeOne function is JavaScript.
const {onRequest}=await import('../../edge-functions/blob/[[path]].js');
const map=JSON.parse(await readFile('artifacts/edgeone/chunks-summary.json','utf8')).filesByKey;
let maxResponseBytes=0;const requests:{path:string;bytes:number;status:number}[]=[];
const server=createServer(async(req,res)=>{
 try{
  const response=await onRequest({request:new Request(`http://127.0.0.1${req.url}`,{method:req.method})});
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
  const bytes=await fetchFileBytes(`http://127.0.0.1:${port}/blob/${key}`);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==expected.size||sha256!==expected.sha256)throw new Error(`Reassembly failed: ${key}`);
  verified.push({key,bytes:bytes.length,sha256});console.log('Verified reassembly',key,bytes.length);
 }
 if(maxResponseBytes>2000000)throw new Error('A response exceeded 2 MB');
 await writeFile('artifacts/edgeone/download-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),verified,maxResponseBytes,requests},null,2)+'\n');
 console.log(JSON.stringify({files:verified.length,maxResponseBytes,requests:requests.length}));
}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
