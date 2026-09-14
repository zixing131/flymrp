import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { renderIcon } from "./png.ts";

/**
 * PWA 构建插件（closeBundle 收尾执行）：
 *   - 生成每次构建都不同的版本号（buildId），写入 build-version.json
 *   - 生成应用图标（icons/icon-192/512、maskable-192/512）
 *   - 生成 manifest.json（含版本号与图标声明）
 *   - 扫描 dist 生成预缓存列表，生成版本化缓存的 sw.js：
 *       导航请求 network-first（保证线上更新及时生效），
 *       静态资源 cache-first（vite 产物带内容哈希，安全），
 *       activate 时清理旧版本缓存。
 *   - 大型运行时资源（games/*.mrp、mythroad_res/**）不预缓存，按需请求时缓存。
 */
export function pwaBuild(): Plugin {
  let output = "";
  return {
    name: "pwa-build",
    apply: "build",
    configResolved(config) {
      output = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const buildId = `b${Date.now().toString(36)}`;
      const iconsDir = join(output, "icons");
      await mkdir(iconsDir, { recursive: true });

      // 1) 图标
      await Promise.all([
        writeFile(join(iconsDir, "icon-192.png"), renderIcon(192, false)),
        writeFile(join(iconsDir, "icon-512.png"), renderIcon(512, false)),
        writeFile(join(iconsDir, "maskable-192.png"), renderIcon(192, true)),
        writeFile(join(iconsDir, "maskable-512.png"), renderIcon(512, true)),
      ]);

      // 2) manifest
      const manifest = {
        name: "flymrp · 经典掌上游戏",
        short_name: "flymrp",
        description: "浏览器原生 Mythroad MRP 游戏运行器，经典掌上游戏即点即玩。",
        lang: "zh-CN",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#131420",
        theme_color: "#131420",
        categories: ["games", "entertainment"],
        version: buildId,
        icons: [
          { src: "./icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "./icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "./icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "./icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      };
      await writeFile(join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
      await writeFile(join(output, "build-version.json"), JSON.stringify({ version: buildId, builtAt: new Date().toISOString() }, null, 2));

      // 3) 预缓存列表：仅核心壳 + vite 产物 + 图标 + 游戏索引。
      //    系统组件（system/gwy/plugins/app240400 等）与 games/*.mrp、
      //    mythroad_res/** 按需请求时缓存，避免安装时一次性下载大量资源。
      const precache = ["./", "./index.html", "./main.html", "./about.html", "./manifest.json", "./build-version.json", "./games/index.json"];
      const shellFiles: string[] = [];
      await walk(output, "", (rel, isDir) => {
        if (isDir) return;
        if (rel.startsWith("assets/") || rel.startsWith("icons/")) shellFiles.push(`./${rel}`);
      });
      shellFiles.sort();
      precache.push(...shellFiles);

      // 4) sw.js
      const sw = `const VERSION = ${JSON.stringify(buildId)};
const CACHE = 'flymrp-' + VERSION;
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(request);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const hit = await caches.match(request);
    if (hit) return hit;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      return caches.match(request);
    }
  })());
});
`;
      await writeFile(join(output, "sw.js"), sw);
      console.log(`PWA：版本 ${buildId}，预缓存 ${precache.length} 项（游戏/资源按需缓存），已生成 manifest.json / sw.js / build-version.json / icons。`);
    },
  };
}

/** 递归扫描输出目录，回调每个文件/目录的相对路径（正斜杠）。 */
async function walk(root: string, rel: string, onEntry: (rel: string, isDir: boolean) => void): Promise<void> {
  const entries = await readdir(join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(root, child, onEntry);
    else onEntry(child, false);
  }
}
