import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildMrp } from '../../src/mrp/index.ts';
import { ExtRuntime } from '../../src/abi/runtime.ts';
import { MythroadRuntime } from '../../src/mythroad/runtime.ts';
import { playerWordLoadMode } from '../../web/player-options.ts';
import { installPackageGuestFix, packageGuestFix, type GuestFix } from '../../src/mythroad/package-compat.ts';

it('limits the NULL free repair to the matching helper, pointer and package', () => {
  const e = new ExtRuntime(), c = e.cpu, pc = 0x24c6dc;
  let fix: GuestFix = 'null-free'; installPackageGuestFix(e, () => fix);
  e.mem.write32(pc, 0x43c92103); e.mem.write32(pc + 4, 0x5809b508); e.mem.write16(pc + 16, 0xbd08);
  c.r[15] = pc; c.t = 1; c.r[0] = 0; c.r[14] = 0x250001;
  expect(c.onBeforeFetch!(c)).toBe(true); expect(c.r[15]).toBe(0x250000); expect(c.t).toBe(1);
  c.r[15] = pc; c.r[0] = 123; expect(c.onBeforeFetch!(c)).toBe(false); expect(c.r[15]).toBe(pc);
  c.r[0] = 0; fix = null; expect(c.onBeforeFetch!(c)).toBe(false);
  fix = 'null-free'; e.mem.write16(pc + 16, 0); expect(c.onBeforeFetch!(c)).toBe(false);
});

it('initializes only the verified extraction helper output local', () => {
  const e = new ExtRuntime(), c = e.cpu, pc = 0x1e867c0, sp = 0x1e7ff00;
  installPackageGuestFix(e, () => 'resource-output');
  e.mem.write32(pc, 0xe92d4030); e.mem.write32(pc + 4, 0xe24dd00c); e.mem.write32(pc + 0x28, 0xeb003540);
  c.r[15] = pc; c.r[13] = sp; c.t = 0; e.mem.load(sp - 24, new Uint8Array(24).fill(0xaa));
  c.onBeforeFetch!(c);
  expect(e.mem.read32(sp - 16)).toBe(0); expect(e.mem.read32(sp - 20)).toBe(0xaaaaaaaa); expect(e.mem.read32(sp - 12)).toBe(0xaaaaaaaa);
  e.mem.write32(sp - 16, 123); e.mem.write32(pc + 0x28, 0); c.onBeforeFetch!(c);
  expect(e.mem.read32(sp - 16)).toBe(123);
});

it('preserves Unicode measurement only for the Unicode multiline caller', () => {
  const e = new ExtRuntime(), c = e.cpu;
  installPackageGuestFix(e, () => 'unicode-measure');
  e.mem.write32(0x1e975f0, 0xe92d4dff); e.mem.write32(0x1e9c364, 0xe3a01000);
  e.mem.write32(0x1e9c36c, 0xebffec9f); e.mem.write32(0x1e9c3f4, 0xe3a02003);
  c.r[15] = 0x1e975f0; c.r[14] = 0x1e9c370; c.t = 0; c.r[1] = 0;
  c.onBeforeFetch!(c); expect(c.r[1]).toBe(1);
  c.r[14] = 0x1e9c480; c.r[1] = 0; c.onBeforeFetch!(c); expect(c.r[1]).toBe(0);
});

it('ignores only the verified empty launch-parameter event, retaining keyboard and nonempty events', () => {
  const e = new ExtRuntime(), c = e.cpu, pc = 0x267398;
  installPackageGuestFix(e, () => 'empty-launch-param');
  e.mem.write32(pc, 0x1c03b508); e.mem.write32(pc + 4, 0x1c111c08); e.mem.write32(pc + 0x28, 0xf9daf7ff);
  c.r[15] = pc; c.r[14] = 0x267aff; c.t = 1; c.r[0] = 5001; c.r[2] = 0;
  expect(c.onBeforeFetch!(c)).toBe(true); expect(c.r[0]).toBe(0); expect(c.r[15]).toBe(0x267afe);
  c.r[15] = pc; c.r[0] = 5001; c.r[2] = 1; expect(c.onBeforeFetch!(c)).toBe(false);
  c.r[0] = 0; c.r[2] = 0; expect(c.onBeforeFetch!(c)).toBe(false);
  c.r[0] = 5001; e.mem.write32(pc, 0); expect(c.onBeforeFetch!(c)).toBe(false);
});

for (const [digest, filename, fix] of [
  ['c311486367124b5559ea3186e6b2f748', 'yhds.mrp', 'resource-output'],
  ['101797ab163609eb298d559fc1e949c8', 'gsgyxz.mrp', 'null-free'],
  ['cf3cae04628e37cdd32bd9b7d0718362', 'gmxmj.mrp', 'unicode-measure'],
  ['3726f59c3310467b087f424b8e330987', 'optsxm.mrp', 'empty-launch-param'],
] as const) {
  const path = [`artifacts/compat-20261029/packages/${digest}.mrp`, `artifacts/compat-20260914/packages/${digest}.mrp`].find(existsSync);
  it.skipIf(!path)(`requires whole package content for ${fix}`, () => {
    const bytes = new Uint8Array(readFileSync(path!));
    expect(packageGuestFix(bytes, filename)).toBe(fix);
    expect(packageGuestFix(bytes, 'other.mrp')).toBe(null);
    bytes[128] ^= 1; expect(packageGuestFix(bytes, filename)).toBe(null);
  });
}

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
