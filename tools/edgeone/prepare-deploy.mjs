/** Prepare a direct-upload folder; remove only large files verified in Blob. */
import { readFile, writeFile, cp, rm, open, mkdtemp, rename, stat, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname } from 'node:path';
import chunks from '../../blob-config/chunks.js';
import { runtimeAssets, isRuntimeAsset } from './runtime-assets.mjs';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
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
const names = await runtimeAssets();
const ruleMap = new Map();
for (const name of names) {
 const key = `runtime/${name}`, record = records.get(key);
 const bytes = await readFile(`dist/${name}`);
 if (!record || record.projectId !== summary.projectId || createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new Error(`Upload runtime asset first: ${name}`);
 const prefix = name.includes('/') ? name.split('/')[0] : name;
 ruleMap.set(prefix, name.includes('/')
  ? {source:`/${prefix}/*`,destination:`/blob/runtime/${prefix}/:splat`}
  : {source:`/${name}`,destination:`/blob/runtime/${name}`});
}
const rewrites = [...ruleMap.values()];
if(rewrites.length>100) throw new Error('EdgeOne supports at most 100 rewrites');
// Copy only the app shell; never copy handset data just to delete it afterward.
const output = await mkdtemp(`${destination}-staging-`);
await cp('dist',output,{recursive:true,filter:source=>{
 const name=relative('dist',source).replaceAll('\\','/');
 if (!name) return true;
 if (name.split('/').some(p=>p.startsWith('.')) || name==='README.md') return false;
 if (['assets','icons','licenses'].includes(name.split('/')[0])) return true;
 return !isRuntimeAsset(name);
}});
await mkdir(`${output}/edge-functions/blob`,{recursive:true});
// Console direct uploads do not run npm install. Bundle all imports locally,
// retaining the SDK's platform deploy-credential placeholder/environment fallback.
const bundled = await build({metafile:true,entryPoints:['edge-functions/blob/[[path]].js'],outfile:`${output}/edge-functions/blob/[[path]].js`,bundle:true,platform:'browser',format:'esm',target:'es2022'});
if(Object.values(bundled.metafile.outputs).some(file=>file.imports.length)) throw new Error('Deployment function has unresolved imports');
// Physical function routes also support old URLs when console rewrites are ignored.
for (const rule of rewrites) {
 const alias = rule.source.endsWith('/*') ? `${rule.source.slice(1,-2)}/[[path]].js` : `${rule.source.slice(1)}.js`;
 const file = `${output}/edge-functions/${alias}`;
 await mkdir(dirname(file),{recursive:true});
 await writeFile(file, `export function onRequest({request}) {
  if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
  const url=new URL(request.url);
  url.pathname='/blob/runtime'+url.pathname;
  return Response.redirect(url.href,307);
}
`);
}
await writeFile(`${output}/edgeone.json`,JSON.stringify({rewrites},null,2)+'\n');
await writeFile(`${output}/package.json`,JSON.stringify({private:true,type:'module'})+'\n');
const zipTemporary=`${output}.zip`;
execFileSync('zip',['-q','-r',zipTemporary,'.','-x','*.DS_Store'],{cwd:output});
const zipBytes=(await stat(zipTemporary)).size;
if(zipBytes>=25000000) { await rm(zipTemporary); throw new Error(`Deployment ZIP exceeds 25 MB: ${zipBytes}`); }
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
const zipPath=resolve(dirname(destination),'flymrp-edgeone.zip');
await rename(zipTemporary,zipPath);
await writeFile(resolve(dirname(destination),'package-summary.json'),JSON.stringify({output:destination,zipPath,zipBytes,runtimeFiles:names.length,blobRewrites:rewrites.length},null,2)+'\n');
console.log(JSON.stringify({output:destination,zipPath,zipBytes,runtimeFiles:names.length,blobRewrites:rewrites.length}));

} finally {
 await lock.close();
 await rm('artifacts/edgeone/prepare.lock', { force: true });
}
