import { readdir } from 'node:fs/promises';
// Only the app shell belongs in the deployment ZIP. All handset/game data is remote.
export function isRuntimeAsset(name) {
  if(name.split('/').some(part=>part.startsWith('.'))) return false;
  if(name.startsWith('assets/') || name.startsWith('icons/') || name.startsWith('licenses/')) return false;
  return !['index.html','main.html','about.html','manifest.json','sw.js','build-version.json','README.md'].includes(name);
}
export async function runtimeAssets(root='dist') {
 const files=[];
 async function walk(dir, prefix='') {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
   if(entry.name.startsWith('.'))continue;
   const name=prefix+entry.name;
   if(entry.isDirectory()) await walk(`${dir}/${entry.name}`,`${name}/`);
   else if(entry.isFile() && isRuntimeAsset(name)) files.push(name);
  }
 }
 await walk(root);return files.sort();
}
