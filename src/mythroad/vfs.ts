import { VfsError } from "../err/errors.ts";
import { MRPArchive } from "../mrp/archive.ts";
import {
  MR_FAILED,
  MR_FILE_CREATE,
  MR_FILE_RDONLY,
  MR_FILE_RDWR,
  MR_FILE_RECREATE,
  MR_FILE_WRONLY,
  MR_IS_FILE,
  MR_SEEK_CUR,
  MR_SEEK_END,
  MR_SEEK_SET,
} from "./constants.ts";

const MAX_FD = 32;

/**
 * ROM (MRPArchive) + RAM overlay. FD table is typed slots, not Map on the lookup path.
 */
export class MythroadVfs {
  archive: MRPArchive | null = null;
  readExternal?: (name: string) => Uint8Array | null;
  existsExternal?: (name: string) => boolean;
  onWrite?: (name: string, bytes: Uint8Array) => void;
  readonly ramNames: (string | null)[] = [];
  readonly ramData: (Uint8Array | null)[] = [];
  readonly fdOpen = new Uint8Array(MAX_FD + 1);
  readonly fdMode = new Uint8Array(MAX_FD + 1);
  readonly fdPos = new Int32Array(MAX_FD + 1);
  readonly fdSize = new Int32Array(MAX_FD + 1);
  readonly fdRam = new Int32Array(MAX_FD + 1);
  readonly fdName: (string | null)[] = new Array(MAX_FD + 1).fill(null);
  lastErrno = 0;
  reads = 0;

  reset(): void {
    this.ramNames.length = 0; this.ramData.length = 0;
    this.fdOpen.fill(0); this.fdName.fill(null); this.fdRam.fill(-1);
  }

  attach(archive: MRPArchive | null): void {
    this.archive = archive;
  }

  removeRam(name: string): boolean {
    const index = this.ramIndex(name);
    if (index < 0) return false;
    this.ramNames[index] = null;
    this.ramData[index] = null;
    return true;
  }

  renameRam(from: string, to: string): void {
    if (from === to) return;
    const source = this.ramIndex(from), target = this.ramIndex(to);
    if (target >= 0) this.ramNames[target] = null;
    if (source < 0) return;
    this.ramNames[source] = to;
    for (let fd = 1; fd <= MAX_FD; fd++) {
      if (this.fdOpen[fd] && this.fdRam[fd] === source) this.fdName[fd] = to;
    }
  }

  exists(name: string): boolean {
    if (this.ramIndex(name) >= 0) return true;
    if (this.archive?.hasFile(name) ?? false) return true;
    if (this.existsExternal) return this.existsExternal(name);
    return this.readExternal?.(name) != null;
  }

  size(name: string): number {
    const ri = this.ramIndex(name);
    if (ri >= 0) return this.ramData[ri]!.length;
    if (!this.archive?.hasFile(name)) return this.readExternal?.(name)?.length ?? MR_FAILED;
    return this.archive.readFile(name).length;
  }

  info(name: string): number {
    return this.exists(name) ? MR_IS_FILE : MR_FAILED;
  }

  readFile(name: string): Uint8Array | null {
    this.reads++;
    const ri = this.ramIndex(name);
    if (ri >= 0) return this.ramData[ri]!;
    if (!this.archive?.hasFile(name)) return this.readExternal?.(name) ?? null;
    return this.archive.readFile(name);
  }

  open(name: string, mode: number): number {
    const create = (mode & MR_FILE_CREATE) !== 0;
    const recreate = (mode & MR_FILE_RECREATE) !== 0;
    const write = (mode & (MR_FILE_WRONLY | MR_FILE_RDWR)) !== 0;
    let ri = this.ramIndex(name);
    const inRom = this.archive?.hasFile(name) ?? false;

    if (recreate) {
      ri = this.ensureRam(name, new Uint8Array(0));
    } else if (!this.exists(name)) {
      if (!create) {
        this.lastErrno = 2;
        return 0;
      }
      ri = this.ensureRam(name, new Uint8Array(0));
    } else if (write && ri < 0 && inRom) {
      ri = this.ensureRam(name, this.archive!.readFile(name));
    }

    const fd = this.allocFd();
    if (fd === 0) throw new VfsError("VFD table full");
    this.fdOpen[fd] = 1;
    this.fdMode[fd] = mode & 0xff;
    this.fdPos[fd] = 0;
    this.fdName[fd] = name;
    this.fdRam[fd] = ri;
    const data = this.fileBytes(name, ri);
    this.fdSize[fd] = data.length;
    this.lastErrno = 0;
    return fd;
  }

  close(fd: number): number {
    if (!this.valid(fd)) {
      this.lastErrno = 9;
      return MR_FAILED;
    }
    this.fdOpen[fd] = 0;
    this.fdName[fd] = null;
    this.fdRam[fd] = -1;
    return 0;
  }

  read(fd: number, n: number): Uint8Array {
    this.checkOpen(fd);
    const name = this.fdName[fd]!;
    const buf = this.fileBytes(name, this.fdRam[fd]!);
    const pos = this.fdPos[fd]!;
    const take = Math.max(0, Math.min(n, buf.length - pos));
    this.fdPos[fd] = pos + take;
    this.reads++;
    return buf.subarray(pos, pos + take);
  }

  write(fd: number, bytes: Uint8Array): number {
    this.checkOpen(fd);
    const mode = this.fdMode[fd]!;
    if ((mode & (MR_FILE_WRONLY | MR_FILE_RDWR | MR_FILE_CREATE | MR_FILE_RECREATE)) === 0 && (mode & MR_FILE_RDONLY) !== 0 && (mode & MR_FILE_RDWR) === 0) {
      throw new VfsError("write on read-only FD");
    }
    const name = this.fdName[fd]!;
    let ri = this.fdRam[fd]!;
    if (ri < 0) {
      ri = this.ensureRam(name, this.fileBytes(name, -1));
      this.fdRam[fd] = ri;
    }
    const pos = this.fdPos[fd]!;
    const need = pos + bytes.length;
    let cur = this.ramData[ri]!;
    if (need > cur.length) {
      const n = new Uint8Array(need);
      n.set(cur);
      cur = n;
      this.ramData[ri] = cur;
    }
    cur.set(bytes, pos);
    this.fdPos[fd] = need;
    this.fdSize[fd] = cur.length;
    this.onWrite?.(name, cur);
    return bytes.length;
  }

  seek(fd: number, offset: number, whence: number): number {
    this.checkOpen(fd);
    const size = this.fdSize[fd]!;
    let pos = this.fdPos[fd]!;
    if (whence === MR_SEEK_SET) pos = offset;
    else if (whence === MR_SEEK_CUR) pos = pos + offset;
    else if (whence === MR_SEEK_END) pos = size + offset;
    else throw new VfsError(`invalid seek whence ${whence}`);
    if (pos < 0) {
      this.lastErrno = 22;
      return MR_FAILED;
    }
    this.fdPos[fd] = pos;
    return 0;
  }

  private ramIndex(name: string): number {
    for (let i = 0; i < this.ramNames.length; i++) if (this.ramNames[i] === name) return i;
    return -1;
  }

  private ensureRam(name: string, data: Uint8Array): number {
    const hit = this.ramIndex(name);
    if (hit >= 0) {
      this.ramData[hit] = data;
      return hit;
    }
    this.ramNames.push(name);
    this.ramData.push(data);
    return this.ramNames.length - 1;
  }

  private fileBytes(name: string, ri: number): Uint8Array {
    if (ri >= 0) return this.ramData[ri]!;
    if (this.archive?.hasFile(name)) return this.archive.readFile(name);
    return this.readExternal?.(name) ?? new Uint8Array(0);
  }

  private allocFd(): number {
    for (let i = 1; i <= MAX_FD; i++) if (!this.fdOpen[i]) return i;
    return 0;
  }

  private valid(fd: number): boolean {
    return fd >= 1 && fd <= MAX_FD && this.fdOpen[fd] === 1;
  }

  private checkOpen(fd: number): void {
    if (!this.valid(fd)) throw new VfsError(`invalid or closed FD ${fd}`);
  }
}
