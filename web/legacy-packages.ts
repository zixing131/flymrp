import { legacyPackageName } from '../src/mythroad/legacy-download.ts';
import { md5Bytes } from '../src/mythroad/guest-md5.ts';
import { decodeStoreList, STORE_LIST_URL, STORE_ORIGIN, type StoreApp } from './mrp-store.ts';
import { fetchAssetBytes } from './remote-files.ts';

export function legacyPackageUrl(path: string, origin = STORE_ORIGIN, base = globalThis.location?.href): string | null {
  try {
    const catalog = new URL(origin + '/', base);
    const url = new URL(path, catalog);
    return url.origin === catalog.origin && url.pathname.startsWith(catalog.pathname + 'mrp-files/') && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}

/** Worker-only: the guest supplies an app ID, never a host URL. */
export function createLegacyPackageLoader(width: number, height: number, fetchBytes = fetchAssetBytes): (appid: number) => Uint8Array | null {
  let apps: StoreApp[] | undefined;
  const cache = new Map<number, Uint8Array | null>();
  return appid => {
    if (!Number.isInteger(appid) || appid < 1 || appid > 0xffffffff) return null;
    if (cache.has(appid)) return cache.get(appid)!;
    if (!apps) {
      const list = fetchBytes(STORE_LIST_URL);
      if (!list) return null;
      try { apps = decodeStoreList(list); } catch { return null; }
    }
    const candidates = apps.filter(app => app.id === appid).sort((a, b) =>
      Number(b.scr === `${width}x${height}`) - Number(a.scr === `${width}x${height}`) || b.version - a.version);
    for (const app of candidates) {
      const url = legacyPackageUrl(app.downUrl);
      if (!url) continue;
      const bytes = fetchBytes(url);
      if (!bytes || bytes.length > 32 * 1024 * 1024 || (app.len && bytes.length !== app.len)) continue;
      if (app.md5 && Array.from(md5Bytes(bytes), b => b.toString(16).padStart(2, '0')).join('') !== app.md5.toLowerCase()) continue;
      if (!legacyPackageName(bytes, appid)) continue;
      cache.set(appid, bytes); return bytes;
    }
    // An unavailable transfer may recover when the user retries. Only a
    // catalog miss is stable for the lifetime of this catalog snapshot.
    if (!candidates.length) cache.set(appid, null);
    return null;
  };
}
