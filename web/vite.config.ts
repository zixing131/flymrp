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
  // EdgeOne keeps games and handset resources in Blob.  Its static deployment is
  // deliberately just the browser shell, so it must not inherit public runtime
  // files or the build-time resource copy steps.
  const remoteAssets = env.MRP_REMOTE_ASSETS === "1";
  const gameDir = remoteAssets ? undefined : env.MRP_GAME_DIR ?? (command === "build" ? "/Users/zixing/Downloads/mrp游戏大集结" : undefined);
  const systemDir = env.MRP_SYSTEM_DIR ?? (gameDir ? resolve(gameDir, "mythroad") : undefined);
  const resourceDir = env.MRP_RESOURCE_DIR ?? (gameDir ? resolve(gameDir, "mythroad_res") : undefined);
  const outputDir = resolve(root, "..", env.MRP_DIST_DIR ?? (remoteAssets ? "dist-edgeone" : "dist"));
  return {
    root, base: "./", build: { outDir: outputDir, emptyOutDir: remoteAssets,
      rollupOptions: { input: { index: resolve(root, "index.html"), main: resolve(root, "main.html"), about: resolve(root, "about.html") } } },
    publicDir: remoteAssets ? false : resolve(root, "../assets"),
    plugins: remoteAssets
      ? [pwaBuild()]
      : [localGames(gameDir), localSystem(systemDir), localSystem(resourceDir, true), resourceBuild(resourceDir), gameBuild(gameDir), pwaBuild()],
    server: { host: "127.0.0.1", port: 5173, strictPort: false, open: "/", fs: { allow: [resolve(root, "..")] } },
  };
});
