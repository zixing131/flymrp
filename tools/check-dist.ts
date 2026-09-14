import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import classics from "../config/classic-games.json";
import { fileSha256, listMrpFiles, type PublishedGame } from "./static-files.ts";

const output = resolve("dist");
const games: PublishedGame[] = JSON.parse(await readFile(join(output, "games/index.json"), "utf8"));
const files = await listMrpFiles(join(output, "games"));
if (games.length !== classics.games.length || files.length !== classics.games.length) throw new Error(`发布目录必须恰好包含 ${classics.games.length} 个精选游戏（当前 ${games.length} 个，目录文件 ${files.length} 个），不能残留旧游戏。`);
for (const [index, expected] of classics.games.entries()) {
  const game = games[index];
  if (!game || game.name !== expected.path || game.sha256 !== expected.sha256 ||
      await fileSha256(join(output, "games", expected.path)) !== expected.sha256)
    throw new Error(`发布游戏与精选清单不一致：${expected.path}`);
}
let bytes = 0;
async function measure(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`静态发布目录不能包含符号链接：${path}`);
    if (entry.isDirectory()) await measure(path);
    else if (entry.isFile()) bytes += (await stat(path)).size;
  }
}
await measure(output);
// Leave headroom below GitHub Pages' 1 GB published-site limit.
if (bytes > 900_000_000) throw new Error(`发布目录 ${(bytes / 1e6).toFixed(1)} MB，超过项目的 900 MB 发布预算。请精简资源或清理旧构建。`);
console.log(`静态发布检查通过：${games.length} 个精选游戏，dist 共 ${(bytes / 1e6).toFixed(1)} MB（预算 900 MB）。`);
