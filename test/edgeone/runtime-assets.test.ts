import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
// @ts-expect-error Node deployment tools are JavaScript modules.
import { runtimeAssets, isRuntimeAsset } from '../../tools/edgeone/runtime-assets.mjs';
it('retains the browser shell and sends handset files and their indexes to Blob', () => {
  for (const name of ['index.html','main.html','about.html','manifest.json','build-version.json','sw.js','catalog.js','player.js','player.worker.js','assets/app.js','icons/icon-192.png','licenses/audio.txt']) expect(isRuntimeAsset(name)).toBe(false);
  for (const name of ['system/gb16.uc2','mythroad_res/index.json','mythroad_res/groups/game.json','games/index.json','games/test.mrp','mythroad-manifest.json','network-rules.json','plugins/msbase.mrp']) expect(isRuntimeAsset(name)).toBe(true);
});
it('collects relative resource paths while excluding hidden files and shell assets', async () => {
  const root=await mkdtemp(join(tmpdir(),'flymrp-runtime-assets-'));
  try {
    for(const name of ['index.html','assets/app.js','.env','system/font.uc2','system/.DS_Store','games/index.json','mythroad_res/test/file.dat']) {
      await mkdir(dirname(join(root,name)),{recursive:true});await writeFile(join(root,name),'test');
    }
    expect(await runtimeAssets(root)).toEqual(['games/index.json','mythroad_res/test/file.dat','system/font.uc2']);
  } finally { await rm(root,{recursive:true,force:true}); }
});
