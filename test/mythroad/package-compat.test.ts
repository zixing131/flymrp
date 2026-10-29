import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildMrp } from '../../src/mrp/index.ts';
import { ExtRuntime } from '../../src/abi/runtime.ts';
import { MythroadRuntime } from '../../src/mythroad/runtime.ts';
import { playerWordLoadMode } from '../../web/player-options.ts';

it('preserves explicit memory settings and does not trust a matching filename', () => {
  const bytes = buildMrp([], { filename: 'gmsushi.mrp' });
  const automatic = new MythroadRuntime(); automatic.loadMrp(bytes);
  expect(automatic.profile.wordLoadMode).toBe('armv5');
  const explicit = new MythroadRuntime({ profile: { wordLoadMode: 'bytewise' } });
  explicit.loadMrp(bytes); explicit.bindExt(new ExtRuntime());
  expect(explicit.ext!.mem.wordLoadMode).toBe('bytewise');
  expect(playerWordLoadMode('auto')).toBeUndefined();
  expect(playerWordLoadMode('armv5')).toBe('armv5');
  expect(playerWordLoadMode('bytewise')).toBe('bytewise');
});

for (const hash of ['8cffb31c17c42bc55f9f3a839bcdf009', 'eaa4ecb7de09a9230cca74c41b41d390']) {
  const path = [`artifacts/compat-20261029/packages/${hash}.mrp`, `artifacts/compat-20260914/packages/${hash}.mrp`].find(existsSync);
  it.skipIf(!path)(`selects bytewise only for the verified package ${hash}`, () => {
    const bytes = new Uint8Array(readFileSync(path!));
    const rt = new MythroadRuntime(); rt.loadMrp(bytes); rt.bindExt(new ExtRuntime());
    expect(rt.ext!.mem.wordLoadMode).toBe('bytewise');
    // A different pack must not inherit the previous package's workaround.
    rt.loadMrp(buildMrp([], { filename: 'other.mrp' }));
    expect(rt.ext!.mem.wordLoadMode).toBe('armv5');
    const explicit = new MythroadRuntime({ profile: { wordLoadMode: 'armv5' } });
    explicit.loadMrp(bytes); expect(explicit.profile.wordLoadMode).toBe('armv5');
    const changed = bytes.slice(); changed[128] ^= 1;
    rt.loadMrp(changed); expect(rt.profile.wordLoadMode).toBe('armv5');
  });
}
