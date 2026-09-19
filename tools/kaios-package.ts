import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import kaiosGames from "../config/kaios-games.json";
import { writeClassicShell } from "./es5-bundle.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist-kaios");

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const name = Buffer.from(type);
  const body = Buffer.concat([name, Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, body, crc]);
}

function writePng(size: number, paint: (x: number, y: number) => [number, number, number, number]): Buffer {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const pixel = paint(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = pixel[0]; raw[o + 1] = pixel[1]; raw[o + 2] = pixel[2]; raw[o + 3] = pixel[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ]);
}

function iconPng(size: number): Buffer {
  return writePng(size, (x, y) => {
    const u = (x + 0.5) / size, v = (y + 0.5) / size;
    if (u < 0.08 || u > 0.92 || v < 0.08 || v > 0.92) return [11, 18, 32, 255];
    if (u > 0.22 && u < 0.42 && v > 0.22 && v < 0.78) return [212, 160, 23, 255];
    if (u > 0.22 && u < 0.72 && v > 0.22 && v < 0.40) return [212, 160, 23, 255];
    if (u > 0.22 && u < 0.62 && v > 0.46 && v < 0.60) return [212, 160, 23, 255];
    return [21, 34, 56, 255];
  });
}

await writeClassicShell(out, {
  label: "KaiOS 构建",
  stripAds: true,
  define: { "import.meta.env.KAIOS": "true", "import.meta.env.PROD": "true", "import.meta.env.DEV": "false" },
});
await writeFile(join(out, "icon-56.png"), iconPng(56));
await writeFile(join(out, "icon-128.png"), iconPng(128));
await writeFile(join(out, "manifest.webapp"), `${JSON.stringify({
  name: "flymrp",
  description: "经典 MRP 掌上游戏",
  launch_path: "/index.html",
  version: "0.0.3",
  type: "web",
  fullscreen: true,
  cursor: false,
  orientation: ["portrait"],
  icons: { "56": "/icon-56.png", "128": "/icon-128.png" },
  developer: { name: "zixing", url: "https://github.com/zixing131/flymrp" },
  default_locale: "zh-CN",
  permissions: {
    "device-storage:sdcard": { description: "打开本地 MRP 或存档", access: "readwrite" },
    systemXHR: { description: "加载游戏文件" },
    storage: { description: "保存游戏进度" },
    "audio-channel-content": { description: "游戏声音" },
  },
}, null, 2)}\n`);

const games = JSON.parse(await readFile(join(out, "games/index.json"), "utf8")) as { name: string; sha256: string }[];
if (games.length !== kaiosGames.games.length) throw new Error(`KaiOS 包必须恰好包含 ${kaiosGames.games.length} 个游戏，当前 ${games.length}。`);
for (const [index, expected] of kaiosGames.games.entries()) {
  if (games[index]?.name !== expected.path) throw new Error(`KaiOS 游戏顺序或路径不一致：${expected.path}`);
  const bytes = await readFile(join(out, "games", expected.path));
  if (createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new Error(`KaiOS 游戏内容与清单不一致：${expected.path}`);
}

const zip = join(root, "flymrp-kaios.zip");
const packed = spawnSync("zip", ["-r", "-q", zip, ".", "-x", "*.map"], { cwd: out, stdio: "inherit" });
if (packed.status !== 0) throw new Error("打包 flymrp-kaios.zip 失败，请确认本机有 zip 命令。");
console.log(`KaiOS 2.x 包已生成：dist-kaios/ 与 flymrp-kaios.zip（${games.length} 个经典游戏，无触摸，仅硬件按键）。`);
