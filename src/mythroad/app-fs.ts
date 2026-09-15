/**
 * In-memory writable Mythroad EFS.
 *
 * Separate from:
 *   - current-pack RDONLY alias (`CurrentPackFileBackend`)
 *   - MRP archive resource namespace (`MythroadVfs` / `MRPArchive`)
 *
 * Host persistence is optional via `onPersist`; this object stays in-memory.
 */
import { MR_FAILED, MR_IS_DIR, MR_IS_FILE, MR_SUCCESS } from "./constants.ts";

export type AppFsNode =
  | { kind: "dir" }
  | { kind: "file"; bytes: Uint8Array };

export class AppFileSystem {
  readonly nodes = new Map<string, AppFsNode>();
  /** Cataloged remote paths. info()/list() see them; file() downloads once. */
  readonly remotes = new Set<string>();
  readMissing?: (normalizedName: string) => Uint8Array | null;
  onPersist?: (normalizedName: string, bytes: Uint8Array | null) => void;

  normalize(name: string): string {
    // Handset EFS uses FAT-style case-insensitive filenames. Archive resource
    // names remain in the separate, case-sensitive MythroadVfs namespace.
    // ABI filenames arrive as byte strings. Decode before folding case or
    // separators: a GBK trailing byte can itself be ASCII A-Z or backslash.
    if (/[\x80-\xff]/.test(name) && !/[^\x00-\xff]/.test(name)) {
      name = new TextDecoder('gbk').decode(Uint8Array.from(name, c => c.charCodeAt(0)));
    }
    const path = name.replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase()
      .replace(/^(?:c:)?\/?mythroad(?:\/|$)/, '').replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');
    const parts: string[] = [];
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (parts.length && !/^[a-z]:$/.test(parts[parts.length - 1]!)) parts.pop();
      } else parts.push(part);
    }
    return parts.join('/');
  }

  clear(): void {
    this.nodes.clear();
    this.remotes.clear();
  }

  watch(name: string): void {
    const key = this.normalize(name);
    if (!key || this.nodes.get(key)?.kind === "file") return;
    this.remotes.add(key);
    this.ensureParents(key);
  }

  list(name: string, extraPaths: string[] = []): string[] | null {
    const key = this.normalize(name).replace(/^c:\//i, '');
    const prefix = key ? key + '/' : '';
    const children = new Set<string>();
    for (const path of [...this.nodes.keys(), ...this.remotes, ...extraPaths.map(p => this.normalize(p))]) {
      if (!path.startsWith(prefix)) continue;
      const child = path.slice(prefix.length).split('/')[0];
      if (child) children.add(child);
    }
    if (key && this.info(key) !== MR_IS_DIR && !children.size) return null;
    return [...children].sort();
  }

  /** Native opendir/readdir exposes dot entries, including in an empty directory.
   * Keep the plain child list separate for host resource catalogs and pickers.
   */
  findEntries(name: string, extraPaths: string[] = []): string[] | null {
    const children = this.list(name, extraPaths);
    return children === null ? null : ['.', '..', ...children];
  }

  info(name: string): number | null {
    const key = this.normalize(name);
    if (!key) return MR_IS_DIR;
    const node = this.nodes.get(key);
    if (node) return node.kind === "dir" ? MR_IS_DIR : MR_IS_FILE;
    return this.remotes.has(key) ? MR_IS_FILE : null;
  }

  /**
   * rxgj `my_mkDir`: existing path (file or dir) returns `MR_SUCCESS`.
   * Missing path becomes a directory.
   */
  mkdir(name: string): number {
    const key = this.normalize(name);
    if (!key) return MR_FAILED;
    if (this.nodes.has(key)) return MR_SUCCESS;
    this.nodes.set(key, { kind: "dir" });
    return MR_SUCCESS;
  }

  file(name: string): Uint8Array | null {
    const key = this.normalize(name);
    if (!key) return null;
    const node = this.nodes.get(key);
    if (node?.kind === "file") return node.bytes;
    if (node?.kind === "dir") return null;
    const bytes = this.readMissing?.(key) ?? null;
    if (!bytes) return null;
    this.replace(key, bytes);
    this.remotes.delete(key);
    return bytes;
  }

  remove(name: string): number {
    const key = this.normalize(name);
    if (this.nodes.get(key)?.kind !== "file") return MR_FAILED;
    this.nodes.delete(key);
    this.onPersist?.(key, null);
    return MR_SUCCESS;
  }

  rename(from: string, to: string): number {
    const source = this.normalize(from), target = this.normalize(to), node = this.nodes.get(source);
    if (!source || !target || node?.kind !== "file" || this.nodes.get(target)?.kind === "dir") return MR_FAILED;
    if (source === target) return MR_SUCCESS;
    this.nodes.delete(source);
    this.ensureParents(target);
    this.nodes.set(target, node);
    this.remotes.delete(target);
    this.onPersist?.(source, null);
    this.onPersist?.(target, node.bytes);
    return MR_SUCCESS;
  }

  /** Native rmdir removes an existing empty directory, never its children. */
  rmdir(name: string): number {
    const key = this.normalize(name);
    if (!key || this.nodes.get(key)?.kind !== "dir") return MR_FAILED;
    for (const child of this.nodes.keys()) if (child.startsWith(key + "/")) return MR_FAILED;
    this.nodes.delete(key);
    return MR_SUCCESS;
  }

  /**
   * CREATE/RECREATE: parent dirs are created in-memory.
   * Existing dir at `name` cannot become a file.
   */
  createFile(name: string, recreate: boolean): Uint8Array | null {
    const key = this.normalize(name);
    if (!key) return null;
    const existing = this.nodes.get(key);
    if (existing?.kind === "dir") return null;
    if (existing?.kind === "file" && !recreate) return existing.bytes;
    this.ensureParents(key);
    this.remotes.delete(key);
    const bytes = new Uint8Array(0);
    this.nodes.set(key, { kind: "file", bytes });
    return bytes;
  }

  replace(name: string, bytes: Uint8Array, persist = false): void {
    const key = this.normalize(name);
    if (!key) return;
    this.nodes.set(key, { kind: "file", bytes });
    if (persist) this.onPersist?.(key, bytes);
  }

  private ensureParents(key: string): void {
    const parts = key.split("/");
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i]!;
      if (!this.nodes.has(acc)) this.nodes.set(acc, { kind: "dir" });
    }
  }
}
