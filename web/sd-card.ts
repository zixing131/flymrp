/** Uploaded SD files stay on this browser; no upload endpoint is involved. */
export type SdFile = { path: string; bytes: Uint8Array; modified: number; resolution?: string };
export function sdPath(directory: string, filename: string): string {
  const parts = `${directory}/${filename}`.replace(/\\/g, '/').split('/').filter(p => p && p !== '.');
  if (!parts.length || parts.some(p => p === '..' || /[:\x00-\x1f]/.test(p))) throw new Error('请使用 SD 卡内的相对目录，例如 music；不能包含 .. 或盘符');
  return parts.join('/').toLowerCase();
}
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('flymrp-sd', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'path' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', mode), request = run(tx.objectStore('files'));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? request.error ?? new Error('文件保存失败'));
    tx.onerror = () => reject(tx.error ?? request.error);
  });
}
export const listSdFiles = () => transaction<SdFile[]>('readonly', store => store.getAll());
export const saveSdFile = (file: SdFile) => transaction('readwrite', store => store.put(file));
export const removeSdFile = (path: string) => transaction('readwrite', store => store.delete(path));

export const readSdFile = (path: string) => transaction<SdFile | undefined>('readonly', store => store.get(path));

/** Firefox 48 / KaiOS has FileReader, but not `Blob.arrayBuffer()`. */
export function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer().then(buf => new Uint8Array(buf));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
    reader.readAsArrayBuffer(blob);
  });
}

export function fileBaseName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}
