import { afterEach, expect, it, vi } from 'vitest';
import { runtimeAssetUrl } from '../../web/runtime-asset-url.ts';
import { assetUrlFrom, resourceAssetUrl } from '../../web/remote-files.ts';
afterEach(()=>vi.unstubAllEnvs());
it('requests Blob directly for fonts, game indexes and worker resources on EdgeOne',()=>{
 vi.stubEnv('VITE_MRP_STORE_ORIGIN','/blob');
 const base='https://flymrp.zixing.fun/main.html';
 expect(runtimeAssetUrl('system/gb16.uc2',base)).toBe('https://flymrp.zixing.fun/blob/runtime/system/gb16.uc2');
 expect(runtimeAssetUrl('games/index.json',base)).toBe('https://flymrp.zixing.fun/blob/runtime/games/index.json');
 expect(assetUrlFrom(base,'plugins/msbase.mrp')).toBe('https://flymrp.zixing.fun/blob/runtime/plugins/msbase.mrp');
 expect(resourceAssetUrl(base,'game/a b.dat')).toBe('https://flymrp.zixing.fun/blob/runtime/mythroad_res/game/a%20b.dat');
});
it('preserves subdirectory deployment paths outside EdgeOne',()=>{
 vi.stubEnv('VITE_MRP_STORE_ORIGIN','');
 expect(runtimeAssetUrl('system/gb16.uc2','https://example.com/flymrp/main.html')).toBe('https://example.com/flymrp/system/gb16.uc2');
});
