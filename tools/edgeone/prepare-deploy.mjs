/** Prepare a direct-upload folder; remove only large files verified in Blob. */
import { readFile, writeFile, cp, rm, open, mkdtemp, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import chunks from '../../blob-config/chunks.js';
const lock = await open('artifacts/edgeone/prepare.lock', 'wx');
try {
const destination = resolve('artifacts/edgeone/deploy');
const summary = JSON.parse(await readFile('artifacts/edgeone/summary.json','utf8'));
if(summary.failures.length || summary.missing.length || summary.verified !== 3926) throw new Error('Finish and verify all MRP/icon uploads first');
const records = new Map((await readFile('artifacts/edgeone/uploaded.jsonl','utf8')).trim().split('\n').map(line=>{const r=JSON.parse(line);return [r.key,r];}));
const verifiedChunks = new Map((await readFile('artifacts/edgeone/chunks-verified.jsonl','utf8')).trim().split('\n').map(line=>{const r=JSON.parse(line);return [r.key,r];}));
for (const [key, record] of records) {
 if (record.projectId !== summary.projectId || record.bytes <= 2000000) continue;
 const manifest = chunks[key];
 if (!manifest || manifest.sha256 !== record.sha256) throw new Error(`Generate chunks before deployment: ${key}`);
 for (const part of manifest.parts) {
  const verified = verifiedChunks.get(part.key);
  if (!verified || verified.sha256 !== part.sha256 || verified.bytes !== part.size || part.size > 1900000) throw new Error(`Unverified chunk: ${part.key}`);
 }
}
// Complete a new tree before replacing the visible deployment directory.
// This also avoids Finder recreating .DS_Store while an open folder is deleted.
const output = await mkdtemp(`${destination}-staging-`);
await cp('dist',output,{recursive:true,filter:source=>!source.endsWith('/.DS_Store')});
await cp('edge-functions',`${output}/edge-functions`,{recursive:true});
await cp('blob-config',`${output}/blob-config`,{recursive:true});
const rewrites=[];
for(const [key,record] of records) {
 if(record.projectId !== summary.projectId || record.kind !== 'large' || !key.startsWith('runtime/')) continue;
 const name=key.slice('runtime/'.length);
 if(name.split('/').some(p=>!p||p==='.'||p==='..')) throw new Error('Invalid upload journal path');
 const local=await readFile(`dist/${name}`);
 if(createHash('sha256').update(local).digest('hex') !== record.sha256) throw new Error(`Re-upload changed large file: ${name}`);
 rewrites.push({source:`/${name}`,destination:`/blob/${key}`});
 await rm(`${output}/${name}`);
}
if(rewrites.length>100) throw new Error('EdgeOne supports at most 100 rewrites');
await writeFile(`${output}/edgeone.json`,JSON.stringify({name:'flymrp',rewrites},null,2)+'\n');
await writeFile(`${output}/package.json`,JSON.stringify({private:true,type:'module',dependencies:{'@edgeone/pages-blob':'0.0.16'}},null,2)+'\n');
const previous = `${destination}-previous-${Date.now()}`;
let hadPrevious = false;
try { await rename(destination, previous); hadPrevious = true; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
try { await rename(output, destination); }
catch (error) { if (hadPrevious) await rename(previous, destination); throw error; }
if (hadPrevious) {
 try { await rm(previous, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
 catch { console.warn(`New deployment is ready; old generated folder retained: ${previous}`); }
}
console.log(JSON.stringify({output:destination,blobRewrites:rewrites.length}));

} finally {
 await lock.close();
 await rm('artifacts/edgeone/prepare.lock', { force: true });
}
