import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { bundleClassicScript, rewriteHtml, writeClassicShell } from "../../tools/es5-bundle.ts";

it("moves the classic entry to the end of body and can keep ads", () => {
  const html = `<head>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1" crossorigin="anonymous"></script>
<link rel="modulepreload" href="./assets/a.js">
<script type="module" crossorigin src="./assets/a.js"></script>
</head><body><div id="app"></div></body>`;
  const kept = rewriteHtml(html, "catalog.js");
  expect(kept).toContain("pagead2.googlesyndication.com");
  expect(kept).not.toContain("type=\"module\"");
  expect(kept).not.toContain("modulepreload");
  expect(kept).toMatch(/<div id="app"><\/div>\s*<script src="\.\/catalog\.js"><\/script>\s*<\/body>/);
  const stripped = rewriteHtml(html, "catalog.js", { stripAds: true });
  expect(stripped).not.toContain("pagead2");
  expect(stripped).not.toContain("crossorigin");
});

it("downlevels optional chaining and nullish coalescing for Firefox 48", async () => {
  const dir = await mkdtemp(join(tmpdir(), "flymrp-es5-"));
  await writeFile(join(dir, "in.js"), "export const n = globalThis.a?.b ?? 1;\n");
  await bundleClassicScript(join(dir, "in.js"), join(dir, "out.js"), {
    "import.meta.env.PROD": "true",
    "import.meta.env.DEV": "false",
  });
  const js = await readFile(join(dir, "out.js"), "utf8");
  expect(js).not.toMatch(/\?\./);
  expect(js).not.toMatch(/\?\?/);
  expect(js).toContain("getOwnPropertyDescriptors");
});

it("rewrites Vite module pages into classic catalog/player/worker scripts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "flymrp-shell-"));
  await mkdir(join(dir, "assets"));
  await writeFile(join(dir, "assets", "index-abc.js"), "console.log('catalog');\n");
  await writeFile(join(dir, "assets", "main-def.js"), "console.log('player');\n");
  await writeFile(join(dir, "assets", "player.worker-ghi.js"), "console.log('worker');\n");
  await writeFile(join(dir, "index.html"), `<body><script type="module" src="./assets/index-abc.js"></script></body>`);
  await writeFile(join(dir, "main.html"), `<body><script type="module" src="./assets/main-def.js"></script></body>`);
  await writeClassicShell(dir, { define: { "import.meta.env.PROD": "true", "import.meta.env.DEV": "false" } });
  const index = await readFile(join(dir, "index.html"), "utf8");
  const main = await readFile(join(dir, "main.html"), "utf8");
  expect(index).toContain('src="./catalog.js"');
  expect(main).toContain('src="./player.js"');
  expect(index).not.toContain("type=\"module\"");
  await readFile(join(dir, "catalog.js"), "utf8");
  await readFile(join(dir, "player.js"), "utf8");
  await readFile(join(dir, "player.worker.js"), "utf8");
  await expect(readFile(join(dir, "assets", "index-abc.js"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});
