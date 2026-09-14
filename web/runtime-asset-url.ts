/** EdgeOne runtime data lives in Blob; static builds keep ordinary asset URLs. */
export function runtimeAssetUrl(path: string, base: string): string {
  const origin = import.meta.env.VITE_MRP_STORE_ORIGIN;
  return new URL(origin === '/blob' ? `/blob/runtime/${path.replace(/^\/+/, '')}` : path, base).href;
}
