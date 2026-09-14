import { fetchFileBytes } from './chunk-download.ts';
export type Game = { id: number; name: string; sha256?: string; title?: string; category?: string; size?: number; local?: boolean; resolution?: string };
export const assetUrl = (path: string): string => new URL(path, document.baseURI).href;
export function isMrpFilename(name: string): boolean {
  const base = name.replace(/\\/g, "/").split("/");
  return /\.mrp$/i.test(base[base.length - 1] || name);
}
export function installedGamesFromSd(files: { path: string; bytes: { length: number }; resolution?: string }[]): Game[] {
  const out: Game[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    if (file.path.indexOf("games/") !== 0 || !isMrpFilename(file.path)) continue;
    const parts = file.path.split("/");
    const filename = parts[parts.length - 1] || file.path;
    out.push({
      id: 10000 + out.length,
      name: file.path,
      title: filename.replace(/\.mrp$/i, ""),
      category: "我的游戏",
      size: file.bytes.length,
      local: true,
      ...(file.resolution ? { resolution: file.resolution } : {}),
    });
  }
  return out;
}
export function playerHref(game: Game, base?: string): string {
  const url = new URL("main.html", base ?? (typeof document !== "undefined" ? document.baseURI : "http://localhost/"));
  if (game.local) url.searchParams.set("local", game.name);
  else url.searchParams.set("game", game.name);
  if (game.resolution) url.searchParams.set("scr", game.resolution);
  return url.href;
}
/** Player → catalog. Drops `?game=` so KaiOS packaged apps land on the list page. */
export function catalogHref(base: string): string {
  const url = new URL("index.html", base);
  url.search = "";
  url.hash = "";
  return url.href;
}
export async function readLibrary(): Promise<Game[]> {
  const response = await fetch(import.meta.env.PROD ? assetUrl('games/index.json') : '/__games', { cache: 'no-cache' });
  if (!response.ok) throw new Error('无法读取精选游戏库，请刷新重试。');
  return response.json();
}
export async function readGame(game: Game): Promise<ArrayBuffer> {
  const bytes = await fetchFileBytes(import.meta.env.PROD
    ? assetUrl(`games/${game.name.split('/').map(encodeURIComponent).join('/')}${game.sha256 ? `?v=${encodeURIComponent(game.sha256)}` : ''}`)
    : `/__games/${game.id}`);
  return bytes.buffer as ArrayBuffer;
}
export const gameTitle = (game: Game): string => game.title ?? game.name.split('/').at(-1)!.replace(/\.mrp$/i, '');
