import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { gameBuild } from "./game-build.ts";
import kaiosGames from "../config/kaios-games.json";
import { FIREFOX48_SUPPORTED, FIREFOX48_TARGET } from "../tools/es5-bundle.ts";

const root = dirname(fileURLToPath(import.meta.url));
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, resolve(root, ".."), "MRP_"), ...process.env };
  const gameDir = env.MRP_GAME_DIR ?? "/Users/zixing/Downloads/mrp游戏大集结";
  return {
    root,
    base: "./",
    publicDir: resolve(root, "../assets"),
    define: { "import.meta.env.KAIOS": "true" },
    resolve: {
      alias: { "webaudio-tinysynth": resolve(root, "tinysynth-stub.ts") },
    },
    worker: { format: "iife" },
    esbuild: { supported: { ...FIREFOX48_SUPPORTED } },
    build: {
      outDir: resolve(root, "../dist-kaios"),
      emptyOutDir: true,
      target: FIREFOX48_TARGET,
      cssTarget: FIREFOX48_TARGET,
      modulePreload: false,
      sourcemap: false,
      assetsInlineLimit: 0,
      rollupOptions: { input: { index: resolve(root, "index.html"), main: resolve(root, "main.html") } },
    },
    plugins: [gameBuild(gameDir, kaiosGames.games)],
  };
});
