import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { binToBytes, MRPArchive } from "../src/mrp/archive.ts";

/**
 * 动态生成 config/classic-games.json：
 * 扫描 MRP_GAME_DIR（游戏目录）中的全部 .mrp 文件，计算 SHA-256，
 * 并读取每个 MRP 包内的 appname（应用名称，GBK/UTF-8）作为显示标题，
 * 写出与文件一一对应的精选清单，供构建流程校验与发布。
 *
 * 用法：
 *   MRP_GAME_DIR="C:/Users/Administrator/Downloads/mrp" npm run games:generate
 *   （build.sh 已自动调用，无需手动执行）
 *
 * 规则：
 *   - 跳过 mythroad / mythroad_res 系统目录与隐藏项（其中的 MRP 是系统组件，不作为游戏发布）
 *   - 子目录中的文件以第一层子目录名作为分类，根目录文件归类为"我的游戏"
 *   - 标题优先取 MRP 包内 appname（与播放器 web/player.worker.ts 相同的 GBK→UTF-8 解码）；
 *     解析失败、名称为空或非 MRP 文件时回退为文件名（去掉 .mrp 后缀）
 *   - 游戏数量为 0 时报错退出，阻止无游戏库的构建
 */

/** 系统/资源目录名：其中的 MRP 组件不加入精选游戏列表。 */
const SYSTEM_DIRS = new Set(["mythroad", "mythroad_res"]);

/** 递归扫描目录中的 .mrp 文件，返回相对路径（正斜杠），已排序。 */
async function scanMrpFiles(directory: string, root: string): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SYSTEM_DIRS.has(entry.name)) continue;
      found.push(...(await scanMrpFiles(path, root)));
    } else if (entry.isFile() && /\.mrp$/i.test(entry.name)) {
      found.push(relative(root, path).replace(/\\/g, "/"));
    }
  }
  return found;
}

/**
 * 读取 MRP 包内 appname 作为显示标题；解析失败或名称为空时回退文件名。
 * 解码链路与播放器 web/player.worker.ts 一致：先按 GBK，失败再按 UTF-8。
 */
function readAppTitle(bytes: Uint8Array, fallback: string): string {
  try {
    const archive = MRPArchive.parse(bytes);
    const raw = archive.header.appname;
    if (raw) {
      const u8 = binToBytes(raw);
      let title = "";
      try {
        title = new TextDecoder("gbk").decode(u8);
      } catch {
        try {
          title = new TextDecoder().decode(u8);
        } catch {
          title = "";
        }
      }
      title = title.replace(/\u0000/g, "").trim();
      if (title) return title;
    }
  } catch {
    // 非 MRP 包或损坏文件：回退文件名
  }
  return fallback;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gameDir = process.env.MRP_GAME_DIR ?? process.argv[2];
if (!gameDir) {
  console.error("错误：请设置 MRP_GAME_DIR 环境变量指定游戏目录（例如 C:\\Users\\Administrator\\Downloads\\mrp）。");
  process.exit(1);
}

const resolvedDir = resolve(gameDir);
const configPath = join(root, "config", "classic-games.json");
const files = (await scanMrpFiles(resolvedDir, resolvedDir)).sort();
if (!files.length) {
  console.error(`错误：游戏目录 ${resolvedDir} 中没有找到任何 .mrp 游戏文件（已排除 mythroad/mythroad_res 系统目录）。`);
  process.exit(1);
}

const games = [];
for (const rel of files) {
  const parts = rel.split("/");
  const filename = parts[parts.length - 1]!;
  const bytes = new Uint8Array(await readFile(join(resolvedDir, rel)));
  const hash = createHash("sha256").update(bytes).digest("hex");
  games.push({
    path: rel,
    title: readAppTitle(bytes, filename.replace(/\.mrp$/i, "")),
    category: parts.length > 1 ? parts[0]! : "我的游戏",
    sha256: hash,
  });
}

const manifest = {
  version: 1,
  description: `由 tools/generate-classic-games.ts 自动生成：扫描 ${resolvedDir}，共 ${games.length} 个游戏（标题取自 MRP 包内 appname，mythroad/mythroad_res 系统组件已排除）。`,
  games,
};
await writeFile(configPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`已动态生成 config/classic-games.json：${games.length} 个游戏（来源：${resolvedDir}）。`);
