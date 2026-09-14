/** Upload the frozen store, preserving URLs. Credentials are read only from environment/a private file. */
import { getStore } from '@edgeone/pages-blob';
import { readFile, writeFile, mkdir, appendFile, stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { imageContentType } from '../../edge-functions/blob/[[path]].js';
const root = resolve(process.env.EDGEONE_UPLOAD_DIR || 'artifacts/edgeone');
await mkdir(root, { recursive: true });
const token = process.env.EDGEONE_PAGES_API_TOKEN || (process.env.EDGEONE_TOKEN_FILE ? (await readFile(process.env.EDGEONE_TOKEN_FILE, 'utf8')).trim() : '');
if (!token) throw new Error('Set EDGEONE_PAGES_API_TOKEN or EDGEONE_TOKEN_FILE');
const projectId = process.env.EDGEONE_PROJECT_ID || 'makers-gciglthrse9a';
const store = getStore({ name: 'my-store', projectId, token, consistency: 'strong' });
const games = JSON.parse(await readFile(process.env.EDGEONE_MANIFEST || 'artifacts/compat-20260914/store-manifest.json', 'utf8')).games;
const hash = (b, algorithm = 'sha256') => createHash(algorithm).update(b).digest('hex');
const journal = `${root}/uploaded.jsonl`;
const completed = new Map();
try { for (const line of (await readFile(journal, 'utf8')).trim().split('\n')) { const r = JSON.parse(line); if (r.projectId === projectId) completed.set(r.key, r); } } catch (e) { if (e.code !== 'ENOENT') throw e; }
const jobs = games.map(g => ({key:g.down.replace(/^\//,''), path:g.localPath || `artifacts/compat-20260914/packages/${g.md5}.mrp`, md5:g.md5, kind:'mrp'}));
for (const icon of new Set(games.map(g=>g.icon).filter(Boolean))) jobs.push({key:icon.replace(/^\//,''), url:`https://mrpstore.gddhy.net${icon}`,kind:'icon'});
if (process.argv.includes('--resources')) for (const res of new Set(games.map(g=>g.res).filter(Boolean))) jobs.push({key:res.replace(/^\//,''),url:`https://mrpstore.gddhy.net${res}`,kind:'resource'});
if (process.argv.includes('--large')) {
 async function walk(dir) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
   const path=`${dir}/${entry.name}`;
   if(entry.isDirectory()) await walk(path);
   else if(entry.isFile() && (await stat(path)).size>=1000000) jobs.push({key:`runtime/${path.slice('dist/'.length)}`,path,kind:'large'});
  }
 }
 await walk('dist');
}
if (process.argv.includes('--extras-only')) jobs.splice(0,jobs.findIndex(j=>!['mrp','icon'].includes(j.kind)) < 0 ? jobs.length : jobs.findIndex(j=>!['mrp','icon'].includes(j.kind)));
let cursor = 0, done = 0; const failures = [];
async function bytesFor(job) {
 if (job.path) return readFile(job.path);
 const path = `${root}/downloads/${job.key}`;
 try { return await readFile(path); } catch(e) { if(e.code !== 'ENOENT') throw e; }
 const res = await fetch(job.url, {signal:AbortSignal.timeout(90000)});
 if (!res.ok) throw new Error(`Source HTTP ${res.status}`);
 const b = Buffer.from(await res.arrayBuffer());
 if (job.kind === 'icon' && !imageContentType(b)) throw new Error('Source is not a recognized image');
 await mkdir(dirname(path), {recursive:true}); await writeFile(path,b); return b;
}
async function upload(job) {
 const b = await bytesFor(job); if(job.md5 && hash(b,'md5') !== job.md5) throw new Error('Local MRP MD5 mismatch');
 const sha256=hash(b), previous=completed.get(job.key);
 if(previous?.sha256 === sha256) return;
 try { await store.set(job.key, new Blob([b]), {onlyIfNew:true,cacheControl:'public, max-age=86400'}); }
 catch(e) { if(e.code !== 'PRECONDITION_FAILED') throw e; }
 const remote = await store.get(job.key,{type:'arrayBuffer',consistency:'strong'});
 if(!remote || hash(Buffer.from(remote)) !== sha256) throw new Error('Remote SHA256 mismatch; existing object was not overwritten');
 const record={projectId,key:job.key,kind:job.kind,bytes:b.length,sha256,verifiedAt:new Date().toISOString()};
 await appendFile(journal, JSON.stringify(record)+'\n'); completed.set(job.key,record);
}
await Promise.all(Array.from({length:8},async()=>{
 while(cursor<jobs.length){const job=jobs[cursor++]; let error;
 for(let attempt=0;attempt<4;attempt++) {try {await upload(job);error=null;break;}catch(e){error=e;if(e.code==='QUOTA_EXCEEDED') break;await new Promise(r=>setTimeout(r,1000*(attempt+1)));}}
 if(error){failures.push({key:job.key,kind:job.kind,code:error.code||'ERROR',message:error.message});console.log('FAILED',job.key,error.code||error.message);}
 done++;if(done%50===0) console.log(`Verified ${done-failures.length}/${jobs.length}; failures ${failures.length}`);
 }
}));
// Publish a catalog containing no local filesystem paths.
if (games.every(g=>completed.has(g.down.replace(/^\//,'')) && (!g.icon || completed.has(g.icon.replace(/^\//,''))))) {
 const catalog=games.map(({localPath,caseId,...g})=>g);
 await store.set('api/list.json.gz',new Blob([gzipSync(JSON.stringify(catalog))]),{cacheControl:'no-cache'});
}
const remote=await store.list({consistency:'strong'});const keys=new Set(remote.blobs.map(b=>b.key));
const summary={projectId,store:'my-store',domain:'flymrp-bgoitpfz.edgeone.cool',finishedAt:new Date().toISOString(),expected:jobs.length,verified:jobs.filter(j=>completed.has(j.key)).length,remoteObjects:keys.size,missing:jobs.filter(j=>!keys.has(j.key)).map(j=>j.key),failures};
await writeFile(`${root}/summary${process.argv.includes('--extras-only') ? '-extras' : ''}.json`,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({...summary,missing:summary.missing.length,failures:failures.length}));
if(failures.length||summary.missing.length) process.exitCode=1;
