import { getStore } from '@edgeone/pages-blob';
import { readFile, appendFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runtimeAssets } from './runtime-assets.mjs';
const projectId='makers-gciglthrse9a';
const token=process.env.EDGEONE_PAGES_API_TOKEN || (await readFile(process.env.EDGEONE_TOKEN_FILE,'utf8')).trim();
const store=getStore({name:'my-store',projectId,token,consistency:'strong'});
const journal='artifacts/edgeone/uploaded.jsonl';
const previous=new Map((await readFile(journal,'utf8')).trim().split('\n').map(line=>{const r=JSON.parse(line);return [r.key,r];}));
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=await runtimeAssets();let cursor=0,done=0,uploaded=0,stop=false;const failures=[];
await Promise.all(Array.from({length:24},async()=>{
 while(cursor<files.length&&!stop){const name=files[cursor++],key=`runtime/${name}`;let error;
  for(let attempt=0;attempt<4;attempt++){
   try{
    const b=await readFile(`dist/${name}`),sha256=hash(b);
    if(previous.get(key)?.projectId===projectId&&previous.get(key)?.sha256===sha256){error=null;break;}
    try{await store.set(key,new Blob([b]),{onlyIfNew:true,cacheControl:'public, max-age=86400'});}catch(e){if(e.code!=='PRECONDITION_FAILED')throw e;}
    let remote=await store.get(key,{type:'arrayBuffer',consistency:'strong'});
    if(remote && hash(Buffer.from(remote))!==sha256) {
     // This project namespace is populated from the authoritative local build.
     await store.set(key,new Blob([b]),{cacheControl:'public, max-age=86400'});
     remote=await store.get(key,{type:'arrayBuffer',consistency:'strong'});
    }
    if(!remote||hash(Buffer.from(remote))!==sha256)throw new Error('Remote verification failed');
    const record={projectId,key,kind:'runtime',bytes:b.length,sha256,verifiedAt:new Date().toISOString()};
    await appendFile(journal,JSON.stringify(record)+'\n');previous.set(key,record);uploaded++;error=null;break;
   }catch(e){error=e;if(e.code==='QUOTA_EXCEEDED'){stop=true;break;}await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
  }
  if(error){failures.push({key,code:error.code||'ERROR',message:error.message});console.log('FAILED',key,error.code||error.message);}
  done++;if(done%200===0)console.log(`Verified ${done-failures.length}/${files.length}, newly uploaded ${uploaded}, failed ${failures.length}`);
 }
}));
const keys=new Set((await store.list({consistency:'strong'})).blobs.map(b=>b.key));
const missing=files.filter(n=>!keys.has(`runtime/${n}`));
const summary={projectId,expected:files.length,completed:done,uploaded,missing,failures,finishedAt:new Date().toISOString()};
await writeFile('artifacts/edgeone/runtime-summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({...summary,missing:missing.length,failures:failures.length}));
if(failures.length||missing.length||done!==files.length)process.exitCode=1;
