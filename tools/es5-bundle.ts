import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { parenthesizeYields } from "./kaios-yield.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Gecko 48 already has these. esbuild cannot rewrite them, so keep the rest of the firefox48 table (no BigInt, no object rest, no ??). */
export const FIREFOX48_TARGET = "firefox48" as const;
export const FIREFOX48_SUPPORTED = {
  "const-and-let": true,
  "for-of": true,
  "default-argument": true,
  destructuring: true,
  "rest-argument": true,
  "array-spread": true,
  "template-literal": true,
  arrow: true,
  class: true,
  generator: true,
} as const;

let prelude: string | undefined;

async function es5Prelude(): Promise<string> {
  if (prelude === undefined) prelude = `${await readFile(join(root, "web/kaios-es5-shims.js"), "utf8")}\n`;
  return prelude;
}

function resolveOutput(outDir: string, src: string): string {
  return join(outDir, src.replace(/^[./]+/, ""));
}

export function moduleScriptSrc(html: string): string | undefined {
  return html.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1];
}

export function rewriteHtml(html: string, script: string, options?: { stripAds?: boolean }): string {
  // Vite leaves type=module in <head> (deferred). A classic script there
  // runs before <body> and catalog/player querySelector returns null.
  let out = html;
  if (options?.stripAds) {
    out = out.replace(/<script[^>]*pagead2[^>]*>\s*<\/script>/gi, "");
    out = out.replace(/\s+crossorigin(="[^"]*")?/g, "");
  }
  return out
    .replace(/<link rel="modulepreload"[^>]*>/g, "")
    .replace(/<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/g, "")
    .replace(/<\/body>/i, `<script src="./${script}"></script>\n</body>`);
}

export async function bundleClassicScript(entry: string, outfile: string, define: Record<string, string>): Promise<void> {
  await build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    target: FIREFOX48_TARGET,
    supported: { ...FIREFOX48_SUPPORTED },
    platform: "browser",
    outfile,
    minify: true,
    sourcemap: false,
    banner: { js: await es5Prelude() },
    logOverride: { "empty-import-meta": "silent" },
    define,
  });
  const js = await readFile(outfile, "utf8");
  await writeFile(outfile, parenthesizeYields(js));
}

export async function writeClassicShell(outDir: string, options: {
  define: Record<string, string>;
  stripAds?: boolean;
  label?: string;
}): Promise<void> {
  const label = options.label ?? "构建";
  const indexHtml = await readFile(join(outDir, "index.html"), "utf8");
  const mainHtml = await readFile(join(outDir, "main.html"), "utf8");
  const indexEntry = moduleScriptSrc(indexHtml);
  const mainEntry = moduleScriptSrc(mainHtml);
  if (!indexEntry || !mainEntry) throw new Error(`${label}结果里找不到入口脚本。`);
  await bundleClassicScript(resolveOutput(outDir, indexEntry), join(outDir, "catalog.js"), options.define);
  await bundleClassicScript(resolveOutput(outDir, mainEntry), join(outDir, "player.js"), options.define);
  const assets = await readdir(join(outDir, "assets"));
  const worker = assets.find(name => name.startsWith("player.worker") && name.endsWith(".js"));
  if (!worker) throw new Error(`${label}结果里找不到 player.worker。`);
  await bundleClassicScript(join(outDir, "assets", worker), join(outDir, "player.worker.js"), options.define);
  await writeFile(join(outDir, "index.html"), rewriteHtml(indexHtml, "catalog.js", { stripAds: options.stripAds }));
  await writeFile(join(outDir, "main.html"), rewriteHtml(mainHtml, "player.js", { stripAds: options.stripAds }));
  for (const name of assets) {
    if (name.endsWith(".js") || name.endsWith(".js.map")) await unlink(join(outDir, "assets", name));
  }
}
