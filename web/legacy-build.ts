import { resolve } from "node:path";
import type { Plugin } from "vite";
import { writeClassicShell } from "../tools/es5-bundle.ts";

/** After Vite emits ES modules, rebundle catalog/player/worker as Firefox 48 IIFE + ES5 shims. */
export function legacyBuild(): Plugin {
  let output = "";
  return {
    name: "legacy-browser-shell",
    apply: "build",
    configResolved(config) {
      output = resolve(config.root, config.build.outDir);
    },
    closeBundle: {
      sequential: true,
      order: "pre",
      handler: async () => {
        await writeClassicShell(output, {
          define: {
            "import.meta.env.KAIOS": "false",
            "import.meta.env.PROD": "true",
            "import.meta.env.DEV": "false",
          },
        });
        console.log("旧版浏览器：已将入口与 Worker 转译为 Firefox 48 IIFE，并注入 ES5 shim。");
      },
    },
  };
}
