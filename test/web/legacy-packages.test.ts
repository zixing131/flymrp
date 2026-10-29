import { describe, expect, it } from 'vitest';
import { createLegacyPackageLoader, legacyPackageUrl } from '../../web/legacy-packages.ts';
import { STORE_LIST_URL, STORE_ORIGIN } from '../../web/mrp-store.ts';
import { buildMrp, gzipStore } from '../../src/mrp/index.ts';
import { md5Bytes } from '../../src/mythroad/guest-md5.ts';

const bytes = buildMrp([], { filename: 'game.mrp', appid: 77 });
const checksum = Array.from(md5Bytes(bytes), b => b.toString(16).padStart(2, '0')).join('');
const item = { id: 77, label: 'Game', name: 'game.mrp', down: '/mrp-files/game.mrp', len: bytes.length, md5: checksum, scr: '240x320', version: 1 };
const listBytes = (list: unknown[]) => gzipStore(new TextEncoder().encode(JSON.stringify(list)));
describe('legacy package catalog resolver', () => {
  it('supports the deployed /blob catalog without escaping its package directory', () => {
    expect(legacyPackageUrl('/blob/mrp-files/a.mrp', '/blob', 'https://game.test/')).toBe('https://game.test/blob/mrp-files/a.mrp');
    expect(legacyPackageUrl('/mrp-files/a.mrp', '/blob', 'https://game.test/')).toBeNull();
    expect(legacyPackageUrl('/blob/mrp-files/../private.mrp', '/blob', 'https://game.test/')).toBeNull();
    expect(legacyPackageUrl('https://other.test/blob/mrp-files/a.mrp', '/blob', 'https://game.test/')).toBeNull();
  });
  it('selects the screen match, verifies content and caches successful reads', () => {
    const calls: string[] = [], loader = createLegacyPackageLoader(240, 320, url => {
      calls.push(url);
      return url === STORE_LIST_URL ? listBytes([{ ...item, down: '/mrp-files/wrong-screen.mrp', scr: '176x220', version: 999 }, item]) : bytes;
    });
    expect(loader(77)).toEqual(bytes); expect(loader(77)).toEqual(bytes);
    expect(calls).toEqual([STORE_LIST_URL, `${STORE_ORIGIN}/mrp-files/game.mrp`]);
    expect(loader(78)).toBeNull(); expect(calls).toHaveLength(2);
  });
  it('rejects other origins, wrong MD5, wrong app IDs and truncated package payloads', () => {
    for (const [app, data] of [
      [{ ...item, down: 'https://elsewhere.test/game.mrp' }, bytes],
      [{ ...item, down: 'http://[broken/game.mrp' }, bytes],
      [{ ...item, md5: '0'.repeat(32) }, bytes],
      [{ ...item, md5: '', len: 0 }, buildMrp([], { filename: 'game.mrp', appid: 78 })],
      [{ ...item, md5: '', len: 0 }, bytes.subarray(0, 100)],
    ] as const) {
      const loader = createLegacyPackageLoader(240, 320, url => url === STORE_LIST_URL ? listBytes([app]) : data);
      expect(loader(77)).toBeNull();
    }
  });
  it('retries a failed transfer without fetching the catalog again', () => {
    let transfers = 0, catalogs = 0;
    const loader = createLegacyPackageLoader(240, 320, url => {
      if (url === STORE_LIST_URL) { catalogs++; return listBytes([item]); }
      return ++transfers === 1 ? null : bytes;
    });
    expect(loader(77)).toBeNull(); expect(loader(77)).toEqual(bytes);
    expect(catalogs).toBe(1); expect(transfers).toBe(2);
  });
});
