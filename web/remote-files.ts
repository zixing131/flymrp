import { runtimeAssetUrl } from './runtime-asset-url.ts';
import { CHUNK_TYPE, parseChunkManifest, chunkUrl, checkChunk } from './chunk-download.ts';
/** Handset files required before the guest starts. Everything else is fetched on first read. */
export const PRELOAD_SYSTEM_FILES = ["system/gb16.uc2"] as const;

export function isSafeAssetPath(name: string): boolean {
  if (!name || name.length > 512 || name.includes("\0") || name.includes("\\")) return false;
  const parts = name.split("/");
  return parts.length > 0 && parts.length <= 24 && parts.every(part => part.length > 0 && part !== "." && part !== ".." && !part.includes(":"));
}

export function encodeAssetPath(name: string): string {
  return name.split("/").map(encodeURIComponent).join("/");
}

export function assetUrlFrom(base: string, path: string): string {
  return runtimeAssetUrl(encodeAssetPath(path), base);
}

export function resourceAssetUrl(base: string, path: string): string {
  return runtimeAssetUrl(`mythroad_res/${encodeAssetPath(path)}`, base);
}

export function isBundledGameResource(path: string): boolean {
  const name = path.split("/").at(-1)!;
  return !/\.(sav|sms|sid)$/i.test(name) && !/^fsarpg\d/i.test(name) && name.toUpperCase() !== "HERO_BAG";
}

export function fetchAssetBytes(url: string): Uint8Array | null {
  try {
    const request = (target: string): { bytes: Uint8Array; chunked: boolean } => {
    const xhr = new (XMLHttpRequest as { new (opts?: { mozSystem?: boolean }): XMLHttpRequest })({ mozSystem: true });
    xhr.open("GET", target, false);
    xhr.responseType = "arraybuffer";
    xhr.send();
    if (xhr.status !== 200 || !(xhr.response instanceof ArrayBuffer)) throw new Error('Asset download failed');
    return { bytes: new Uint8Array(xhr.response), chunked: xhr.getResponseHeader?.('Content-Type')?.split(';')[0] === CHUNK_TYPE };
    };
    const first = request(url);
    if (!first.chunked) return first.bytes;
    const manifest = parseChunkManifest(JSON.parse(new TextDecoder().decode(first.bytes)));
    const out = new Uint8Array(manifest.size); let offset = 0;
    for (const part of manifest.parts) {
      let bytes: Uint8Array | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { bytes = request(chunkUrl(part.key, url)).bytes; checkChunk(bytes, part); break; }
        catch (e) { if (attempt === 2) throw e; }
      }
      out.set(bytes!, offset); offset += bytes!.length;
    }
    checkChunk(out, manifest);
    return out;
  } catch {
    return null;
  }
}

export type PlayerFileSource = {
  base: string;
  system: string[];
  resources: string[];
  packName: string;
  localSystem?: boolean;
  localResources?: boolean;
};

export function createRemoteFileLoaders(source: PlayerFileSource, normalize: (name: string) => string): {
  loadSystemFile: (name: string) => Uint8Array | null;
  loadResourceFile: (name: string) => Uint8Array | null;
} {
  const systemByKey = new Map<string, string>();
  for (const name of source.system) {
    if (!isSafeAssetPath(name)) continue;
    systemByKey.set(normalize(name), name);
  }
  const resourceByKey = new Map<string, string>();
  for (const name of source.resources) {
    if (!isSafeAssetPath(name) || !isBundledGameResource(name)) continue;
    resourceByKey.set(normalize(name), name);
  }
  const packStem = source.packName.replace(/\.mrp$/i, "").toLowerCase();
  const missing = new Set<string>();
  const cache = new Map<string, Uint8Array>();
  const firstHit = (cacheKey: string, urls: string[]): Uint8Array | null => {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    if (missing.has(cacheKey)) return null;
    for (const url of urls) {
      const bytes = fetchAssetBytes(url);
      if (bytes) { cache.set(cacheKey, bytes); return bytes; }
    }
    missing.add(cacheKey);
    return null;
  };
  return {
    loadSystemFile(name) {
      const original = systemByKey.get(name);
      if (!original) return null;
      const urls = source.localSystem ? [`/__system/file/${encodeAssetPath(original)}`] : [];
      urls.push(assetUrlFrom(source.base, original));
      return firstHit(`s:${name}`, urls);
    },
    loadResourceFile(name) {
      if (!isSafeAssetPath(name) || !isBundledGameResource(name)) return null;
      const original = resourceByKey.get(name) ?? ((packStem && name.startsWith(`${packStem}/`)) ? name : null);
      if (!original) return null;
      const urls = source.localResources ? [`/__resources/file/${encodeAssetPath(original)}?game=${encodeURIComponent(source.packName)}`] : [];
      urls.push(resourceAssetUrl(source.base, original));
      return firstHit(`r:${name}`, urls);
    },
  };
}
