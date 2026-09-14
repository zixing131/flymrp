import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { localSystem } from "./local-system.ts";
import { localGames } from "./local-games.ts";
import { gameBuild } from "./game-build.ts";
import { resourceBuild } from "./resource-build.ts";
import { pwaBuild } from "./pwa-build.ts";

const root = dirname(fileURLToPath(import.meta.url));
export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, resolve(root, ".."), "MRP_"), ...process.env };
  const gameDir = env.MRP_GAME_DIR ?? (command === "build" ? "/Users/zixing/Downloads/mrp游戏大集结" : undefined);
  const systemDir = env.MRP_SYSTEM_DIR ?? (gameDir ? resolve(gameDir, "mythroad") : undefined);
  const resourceDir = env.MRP_RESOURCE_DIR ?? (gameDir ? resolve(gameDir, "mythroad_res") : undefined);
  return {
    root, base: "./", build: { outDir: resolve(root, "../dist"), emptyOutDir: false,
      rollupOptions: { input: { index: resolve(root, "index.html"), main: resolve(root, "main.html"), about: resolve(root, "about.html") } } }, publicDir: resolve(root, "../assets"),
    plugins: [localGames(gameDir), localSystem(systemDir), localSystem(resourceDir, true), resourceBuild(resourceDir), gameBuild(gameDir), pwaBuild()],
    server: { host: "127.0.0.1", port: 5173, strictPort: false, open: "/", fs: { allow: [resolve(root, "..")] } },
  };
});
