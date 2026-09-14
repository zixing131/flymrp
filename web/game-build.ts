import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { publishGames, type SelectedGame } from "../tools/static-files.ts";
import classics from "../config/classic-games.json";

export function gameBuild(directory: string | undefined, selection?: readonly SelectedGame[]): Plugin {
  const games = selection ?? classics.games;
  let output = "";
  return {
    name: "static-mrp-library", apply: "build",
    configResolved(config) { output = resolve(config.root, config.build.outDir, "games"); },
    async closeBundle() {
      if (!directory) return;
      if (!selection && !classics.games.length) throw new Error("精选游戏清单不能为空。");
      if (selection && !selection.length) throw new Error("游戏清单不能为空。");
      const { games: published, copied, skipped, removed } = await publishGames(directory, output, games);
      await mkdir(output, { recursive: true });
      await writeFile(join(output, "index.json"), JSON.stringify(published));
      console.log(`MRP 游戏库：${published.length} 个，复制 ${copied}，未变化跳过 ${skipped}，清理旧文件 ${removed}。`);
    },
  };
}
