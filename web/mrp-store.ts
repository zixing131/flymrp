/**
 * 在线商店（mrpstore.gddhy.net）数据访问。
 *
 * 列表来源：https://mrpstore.gddhy.net/api/list.json.gz —— 一个 gzip 压缩的 JSON 数组。
 * 缓存：IndexedDB（数据库 flymrp-store）。首次打开先读本地缓存快速展示，再后台
 * 请求网络列表并写回缓存；网络不可用时仍可使用上次缓存的列表。
 */

import { fileBaseName, sdPath } from "./sd-card.ts";
import { gunzip } from "../src/mrp/gzip.ts";

export const STORE_ORIGIN = ((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_MRP_STORE_ORIGIN || "https://mrpstore.gddhy.net").replace(/\/$/, "");
/** 在线商店列表地址（gzip 压缩的 JSON 数组）。 */
export const STORE_LIST_URL = `${STORE_ORIGIN}/api/list.json.gz`;
/** 已下载商店游戏保存在 SD 卡 games/ 下的子目录。 */
export const STORE_DIR = "games/store";

/** 列表 JSON 中的一个应用（映射自商店 API 字段）。 */
export interface StoreApp {
  /** 软件 AppID（唯一）。 */
  id: number;
  /** 软件名称（label）。 */
  label: string;
  /** 软件内部文件名（name），如 mynes.mrp。 */
  name: string;
  /** 作者 / 厂商（vendor）。 */
  vendor: string;
  /** 版本号（version）。 */
  version: number;
  /** 人类可读大小（size），如 "51.55KB"。 */
  size: string;
  /** 精确字节数（len）。 */
  len: number;
  /** 软件分辨率（scr），如 240x320。 */
  scr: string;
  /** 软件介绍（detail）。 */
  detail: string;
  /** 图标相对路径（icon）。 */
  icon: string;
  /** 下载相对路径（down）。 */
  down: string;
  /** 内容 MD5（如提供）。 */
  md5?: string;
  /** 完整图标地址：https://mrpstore.gddhy.net + icon。 */
  iconUrl: string;
  /** 完整下载地址：https://mrpstore.gddhy.net + down。 */
  downUrl: string;
}

export type StoreListCache = { savedAt: number; apps: StoreApp[] };

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function absolute(path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${STORE_ORIGIN}${path}`;
}

/** 网页壳用自带 gunzip 解压商店列表；KaiOS 包内存太小，不拉 2000+ 商店条目。 */
export function isStoreSupported(): boolean {
  return !import.meta.env.KAIOS;
}

function parseApp(raw: unknown): StoreApp | null {
  if (!raw || typeof raw !== "object") return null;
  const it = raw as Record<string, unknown>;
  const id = num(it.id);
  const label = str(it.label).trim();
  const down = str(it.down).trim();
  if (!id || !label || !/\.mrp$/i.test(down)) return null;
  const filename = fileBaseName(down);
  if (filename.includes("..") || filename.includes(":")) return null;
  const icon = str(it.icon).trim();
  return {
    id,
    label,
    name: str(it.name).trim() || filename,
    vendor: str(it.vendor).trim(),
    version: num(it.version),
    size: str(it.size).trim(),
    len: num(it.len),
    scr: str(it.scr).trim(),
    detail: str(it.detail).trim(),
    icon,
    down,
    md5: str(it.md5).trim() || undefined,
    iconUrl: icon ? absolute(icon) : "",
    downUrl: absolute(down),
  };
}

/** 解压商店 gzip 列表。Chrome 60 没有 DecompressionStream，走自带 inflate。 */
export function decodeStoreList(bytes: Uint8Array): StoreApp[] {
  const text = new TextDecoder("utf-8").decode(gunzip(bytes));
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("在线商店返回的数据格式不正确");
  const apps: StoreApp[] = [];
  for (const item of data) {
    const app = parseApp(item);
    if (app) apps.push(app);
  }
  if (!apps.length) throw new Error("在线商店返回了空列表");
  return apps;
}

/** 请求并解压在线商店列表。失败时抛错，由调用方决定展示策略。 */
export async function fetchStoreList(): Promise<StoreApp[]> {
  const response = await fetch(STORE_LIST_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`在线商店请求失败（HTTP ${response.status}）`);
  return decodeStoreList(new Uint8Array(await response.arrayBuffer()));
}

/* ---- IndexedDB 本地缓存（key-value） ---- */

const DB_NAME = "flymrp-store";
const DB_VERSION = 1;
const OBJECT_STORE = "kv";
const LIST_KEY = "store-list";

let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OBJECT_STORE)) db.createObjectStore(OBJECT_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error("在线商店缓存被占用")); };
  });
  return database;
}

async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(OBJECT_STORE, "readonly");
    const request = tx.objectStore(OBJECT_STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function kvPut(key: string, value: Record<string, unknown>): Promise<void> {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OBJECT_STORE, "readwrite");
    tx.objectStore(OBJECT_STORE).put(Object.assign({ key }, value));
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("缓存写入失败"));
    tx.onerror = () => reject(tx.error ?? new Error("缓存写入失败"));
  });
}

/** 通用 KV 缓存读取（同一本地库），失败返回 undefined。 */
export async function readKvEntry<T>(key: string): Promise<T | undefined> {
  try {
    return await kvGet<T>(key);
  } catch {
    return undefined;
  }
}

/** 通用 KV 缓存写入（同一本地库），失败忽略。 */
export async function writeKvEntry(key: string, value: Record<string, unknown>): Promise<void> {
  try {
    await kvPut(key, value);
  } catch {
    /* 缓存失败不影响使用 */
  }
}

/** 读取缓存的列表；无缓存或读取失败返回 null（调用方按无缓存处理）。 */
export async function readCachedStoreList(): Promise<StoreListCache | null> {
  try {
    const record = await kvGet<StoreListCache>(LIST_KEY);
    if (!record || !Array.isArray(record.apps) || !record.apps.length) return null;
    return { savedAt: typeof record.savedAt === "number" ? record.savedAt : 0, apps: record.apps.map(app => ({ ...app, iconUrl: app.icon ? absolute(app.icon) : "", downUrl: absolute(app.down) })) };
  } catch {
    return null;
  }
}

/** 保存列表到本地缓存；失败不影响使用。 */
export async function saveCachedStoreList(cache: StoreListCache): Promise<void> {
  try {
    await kvPut(LIST_KEY, { savedAt: cache.savedAt, apps: cache.apps });
  } catch {
    /* 缓存失败不影响本次会话 */
  }
}

/** 该商店应用下载后保存在 SD 卡中的路径（如 games/store/mynes.mrp）。 */
export function storeSdPath(app: Pick<StoreApp, "down">): string {
  return sdPath(STORE_DIR, fileBaseName(app.down));
}
