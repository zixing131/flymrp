/**
 * 本地 MRP 包的元信息：通过 src/mrp/archive.ts 读取包内 appid / appname，
 * 并把 appid 转为 32 进制大写后拼接 mrpstore 的图标地址（与商店图标规则一致），
 * 结果缓存在本地 IndexedDB，避免每次打开重复读取整个 MRP 文件。
 */

import { MRPArchive, binToBytes } from "../src/mrp/index.ts";
import { readGame, type Game } from "./library.ts";
import { STORE_ORIGIN, readKvEntry, writeKvEntry } from "./mrp-store.ts";
import { readSdFile } from "./sd-card.ts";

export type MrpPackageInfo = { appid: number; appname: string };

// v2：appname 按 MRP 包内编码（GB2312/GBK，个别为 UTF-8）解码后再缓存
const CACHE_PREFIX = "pkg2:";

/**
 * 十进制整数 → 32 进制字符串（0-9、a-v），再转大写。
 * 等价于 Java：`new BigInteger(num, 10).toString(32).toUpperCase()`。
 */
export function appIdToBase32(appid: number): string {
  const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUV"; // 0..31 → 0-9 A-V
  let n = Math.trunc(appid);
  if (n <= 0) return "0";
  let out = "";
  while (n > 0) {
    out = DIGITS[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

/** appid → https://mrpstore.gddhy.net/mrp-icon/<32进制大写>.png */
export function appIdIconUrl(appid: number): string {
  return appid ? `${STORE_ORIGIN}/mrp-icon/${appIdToBase32(appid)}.png` : "";
}

/**
 * archive.ts 用 Latin-1（逐字节）读出 MRP 头部字符串，而包内实际编码是
 * GB2312/GBK（个别作者用 UTF-8）。这里先把 Latin-1 字符串还原成字节，
 * 再按 “UTF-8 → GB18030” 顺序解码；两种都失败则保留原样。
 */
export function decodeMrpText(raw: string): string {
  if (!raw) return raw;
  const bytes = binToBytes(raw);
  if (!bytes.some(byte => byte >= 0x80)) return raw; // 纯 ASCII 无需解码
  try {
    const utf8 = new TextDecoder("utf-8").decode(bytes);
    if (!utf8.includes("\uFFFD")) return utf8;
  } catch { /* 继续尝试 GB18030 */ }
  try {
    const gbk = new TextDecoder("gb18030").decode(bytes);
    if (!gbk.includes("\uFFFD")) return gbk;
  } catch { /* 当前环境不支持 GBK 解码时保留原样 */ }
  return raw;
}

/** 解析 MRP 包头；失败（非 MRP/损坏）返回 null，由调用方回退原标题。 */
export function parsePackageInfo(bytes: Uint8Array): MrpPackageInfo | null {
  try {
    const header = MRPArchive.parse(bytes).header;
    if (!header.appid && !header.appname) return null;
    return { appid: header.appid >>> 0, appname: decodeMrpText(header.appname) };
  } catch {
    return null;
  }
}

async function readGameBytes(game: Game): Promise<Uint8Array | null> {
  try {
    if (game.local) {
      const file = await readSdFile(game.name);
      return file ? file.bytes : null;
    }
    const buffer = await readGame(game);
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/**
 * 读取某游戏包内的 appid / appname：优先命中本地缓存；
 * 缓存未命中时读取整个 MRP 文件头部并解析，成功后写缓存。
 */
export async function loadPackageInfo(game: Game): Promise<MrpPackageInfo | null> {
  const key = CACHE_PREFIX + game.name;
  const cached = await readKvEntry<MrpPackageInfo>(key);
  if (cached && cached.appid) return cached;
  const bytes = await readGameBytes(game);
  if (!bytes || !bytes.length) return null;
  const info = parsePackageInfo(bytes);
  if (info && info.appid) {
    await writeKvEntry(key, { appid: info.appid, appname: info.appname });
  }
  return info;
}
