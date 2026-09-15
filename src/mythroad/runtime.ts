import { WorkPath } from './work-path.ts';
import { AppFileSystem } from "./app-fs.ts";
import type { EditState } from "./native-editor.ts";
import type { NetworkRules } from "./network-rules.ts";
import { ExtFault, type ExtCallResult } from "../abi/fault.ts";
import { DEFAULT_INSN_BUDGET, ExtRuntime, MAX_INSN_BUDGET } from "../abi/runtime.ts";
import { LuaRuntimeError, UnknownAbiError } from "../err/errors.ts";
import { TAG_NUMBER, TAG_STRING } from "../lua/types.ts";
import { LuaVM } from "../lua/vm.ts";
import { MRPArchive } from "../mrp/archive.ts";
import {
  MR_IGNORE,
  MR_IS_FILE,
  MR_MOTION_EVENT,
  MR_START_FILE,
  MR_STATE_IDLE,
  MR_STATE_PAUSE,
  MR_STATE_RESTART,
  MR_STATE_RUN,
  MR_STATE_STOP,
  MR_SUCCESS,
  MR_TIMER_STATE_IDLE,
  type RuntimeAction,
} from "./constants.ts";
import { EV_CUSTOM, EV_KEY, EV_SYSTEM, EV_TIMER, EventQueue, type RuntimeEvent } from "./events.ts";
import { NullGraphicsBackend, ScreenBuffer, type BitmapSlot, type GraphicsBackend, type SpriteSlot, type TileSlot } from "./graphics.ts";
import { InputBackend } from "./input.ts";
import { installNatives } from "./native.ts";
import {
  RuntimeTrace,
  attachTrace,
  raiseUnknown,
  stackPreview,
  wrapExtInstance,
  wrapGraphics,
  wrapNatives,
  wrapLua as rewrapLua,
  type AbiMode,
  type ApprovedBehavior,
  type UnknownAbiEvent,
} from "./probe.ts";
import { defaultProfile, type DeviceProfile } from "./profile.ts";
import { MrTableBridge, type AllocRecord, type ReadFileRecord } from "./mr-table.ts";
import { createStrCom } from "./strcom.ts";
import { MythroadTimer } from "./timer.ts";
import { MythroadVfs } from "./vfs.ts";

export type MythroadRuntimeOptions = {
  profile?: Partial<DeviceProfile>;
  networkRules?: NetworkRules;
  onEditChange?: (state: EditState | null) => void;
  /** Bundled handset files, copied into each runtime’s virtual filesystem. */
  systemFiles?: Readonly<Record<string, Uint8Array>>;
  /** Names that exist as installed handset files; bytes load through `loadSystemFile`. */
  systemCatalog?: readonly string[];
  loadSystemFile?: (normalizedName: string) => Uint8Array | null;
  /** Offline download sources, separate from installed game files and unpacking markers. */
  resourceFiles?: Readonly<Record<string, Uint8Array>>;
  /** Downloadable resource names; bytes load through `loadResourceFile`. */
  resourceCatalog?: readonly string[];
  loadResourceFile?: (normalizedName: string) => Uint8Array | null;
  /** Explicit user uploads, installed into the writable virtual SD card. */
  userFiles?: Readonly<Record<string, Uint8Array>>;
  /** Guest-created EFS writes. Host may persist these across sessions. */
  onPersistFile?: (name: string, bytes: Uint8Array | null) => void;
  graphics?: GraphicsBackend;
  entry?: string;
  param?: string;
  /** Optional. Default off. Does not change ABI when omitted. */
  trace?: RuntimeTrace | boolean;
  /** Default `strict`: unknown ABI stops. */
  abiMode?: AbiMode;
  /** Permissive-only. Keys like `_com:700`. Not an ABI guess. */
  approvedUnknown?: Record<string, ApprovedBehavior>;
  /**
   * ARM/Thumb instruction watchdog for `arm_ext_call` / `runGuest`.
   * Not an execution slice. Omitted → `DEFAULT_INSN_BUDGET`. Clamped to `MAX_INSN_BUDGET`.
   */
  armInstructionBudget?: number;
  /** Real synchronous timing in interactive hosts; omit for reproducible tests. */
  monotonicTime?: () => number;
  /** Observes each `arm_ext_call`. Does not change ABI. */
  onExtCall?: (code: number, out: ExtCallResult) => void;
  /** Host audio sink. Node tests omit this; the web player supplies Web Audio. */
  onVibrate?: (milliseconds: number) => void;
  onPlaySound?: (type: number, data: Uint8Array | null, loop: number, positionMs?: number) => void;
  onStopSound?: (type: number) => void;
};

/**
 * Lua VM → native ABI → Mythroad → (VFS / timer / events / gfx) → mr_table → EXT → CPU.
 * State lives here, not inside LuaVM.
 */
class AppReturn extends Error {}

export class MythroadRuntime {
  lua = new LuaVM();
  readonly vfs = new MythroadVfs();
  private readonly networkRules?: NetworkRules;
  private readonly onEditChange?: (state: EditState | null) => void;
  private readonly systemFiles: Readonly<Record<string, Uint8Array>>;
  private readonly resourceFiles = new AppFileSystem();
  readonly workPath = new WorkPath();
  readonly appFs = new AppFileSystem();
  private readonly knownPacks = new Map<string, Uint8Array>();
  private nativeEntry = false;
  private returnApp: { pack: string; entry: string } | null = null;
  private ramPack: Uint8Array | null = null;
  readonly userFiles = new AppFileSystem();
  readonly timers = new MythroadTimer();
  readonly events = new EventQueue();
  readonly gfx: GraphicsBackend;
  readonly input: InputBackend;
  readonly profile: DeviceProfile;
  readonly strCom: ReturnType<typeof createStrCom>;

  archive: MRPArchive | null = null;
  ext: ExtRuntime | null = null;
  mrTable: MrTableBridge | null = null;
  readonly mrAllocs: AllocRecord[] = [];
  readonly mrReads: ReadFileRecord[] = [];
  unknownRequiredSlot: number | null = null;

  state = MR_STATE_IDLE;
  /** Elapsed monotonic milliseconds since runtime start. `mr_getTime` exposes `clock >>> 0`. */
  clock = 0;
  packName = "";
  entry = "_dsm";
  param = "";
  bi = 0;
  screenW: number;
  screenH: number;
  screen: ScreenBuffer;
  randSeed: number;
  gcCalls = 0;
  gcThreshold = 0;
  sleeps: number[] = [];
  readonly logs: string[] = [];
  exited = false;
  lastDispatch = 0;
  steps = 0;
  pendingPack = "";
  pendingStartFile = "";
  pendingParam = "";
  lastAction: RuntimeAction | null = null;
  readonly bitmaps: BitmapSlot[] = [];
  readonly sprites: SpriteSlot[] = [];
  readonly tiles: TileSlot[] = [];
  readonly trace: RuntimeTrace | null = null;
  readonly abiMode: AbiMode = "strict";
  readonly armInstructionBudget: number;
  private readonly monotonicTime?: () => number;
  readonly approvedUnknown = new Map<string, ApprovedBehavior>();
  readonly unknownEvents: UnknownAbiEvent[] = [];
  onExtCall: ((code: number, out: ExtCallResult) => void) | null = null;
  readonly onVibrate: ((milliseconds: number) => void) | null;
  readonly onPlaySound: ((type: number, data: Uint8Array | null, loop: number, positionMs?: number) => void) | null;
  readonly onStopSound: ((type: number) => void) | null;
  soundOn = false;
  shakeOn = false;
  /** Guest `int32 x,y,z` for SkyEngine `MR_MOTION_EVENT`. Raw x/y in p1/p2 crash 迷宫滚球. */
  private motionAddr = 0;

  constructor(opts: MythroadRuntimeOptions = {}) {
    this.monotonicTime = opts.monotonicTime;
    this.profile = defaultProfile(opts.profile);
    this.abiMode = opts.abiMode ?? "strict";
    this.armInstructionBudget = Math.min(
      Math.max(opts.armInstructionBudget ?? DEFAULT_INSN_BUDGET, 1),
      MAX_INSN_BUDGET,
    );
    if (opts.approvedUnknown) {
      for (const [k, v] of Object.entries(opts.approvedUnknown)) this.approvedUnknown.set(k, v);
    }
    this.trace =
      opts.trace instanceof RuntimeTrace
        ? opts.trace
        : opts.trace === true || opts.abiMode === "trace"
          ? new RuntimeTrace()
          : null;
    const rawGfx = opts.graphics ?? new NullGraphicsBackend();
    this.gfx = this.trace ? wrapGraphics(rawGfx, this.trace) : rawGfx;
    this.input = new InputBackend(this.events);
    this.screenW = this.profile.width;
    this.screenH = this.profile.height;
    this.screen = new ScreenBuffer(this.screenW, this.screenH);
    this.randSeed = this.profile.randSeed;
    // Lua file.open uses the same installed package name as ARM mr_open.
    // Package introspection (version/header reads) must see the actual bytes,
    // even when the browser loaded them directly rather than from the SD card.
    this.vfs.readExternal = name => this.appFs.file(name) ?? this.knownPacks.get(this.appFs.normalize(name)) ?? null;
    this.vfs.existsExternal = name => this.appFs.info(name) === MR_IS_FILE || this.knownPacks.has(this.appFs.normalize(name));
    this.systemFiles = opts.systemFiles ?? {};
    this.appFs.readMissing = opts.loadSystemFile;
    this.resourceFiles.readMissing = opts.loadResourceFile;
    for (const [name, bytes] of Object.entries(this.systemFiles)) { this.appFs.createFile(name, true); this.appFs.replace(name, bytes.slice()); }
    for (const name of opts.systemCatalog ?? []) this.appFs.watch(name);
    for (const [name, bytes] of Object.entries(opts.userFiles ?? {})) this.setUserFile(name, bytes);
    for (const [name, bytes] of Object.entries(opts.resourceFiles ?? {})) this.resourceFiles.replace(name, bytes);
    for (const name of opts.resourceCatalog ?? []) this.resourceFiles.watch(name);
    this.appFs.onPersist = opts.onPersistFile;
    this.vfs.onWrite = (name, bytes) => this.appFs.replace(name, bytes, true);
    this.networkRules = opts.networkRules;
    this.onEditChange = opts.onEditChange;
    this.entry = opts.entry ?? "_dsm";
    this.param = opts.param ?? "";
    this.onExtCall = opts.onExtCall ?? null;
    this.onVibrate = opts.onVibrate ?? null;
    this.onPlaySound = opts.onPlaySound ?? null;
    this.onStopSound = opts.onStopSound ?? null;
    this.strCom = createStrCom({
      getVfs: () => this.vfs,
      setReturnApp: (pack, entry) => this.setReturnApp(pack, entry),
      setRamPack: bytes => { this.ramPack = bytes.slice(); },
      getExt: () => this.ext,
      setExt: (rt) => {
        this.bindExt(rt);
      },
      onUnknown: (code, L) => {
        const preview = stackPreview(L);
        return raiseUnknown(this, {
          caller: "lua",
          family: "_strCom",
          code,
          arguments: preview.arguments,
          argumentTypes: preview.argumentTypes,
          returnContext: "native",
          message: `_strCom code ${code} not implemented in Stage 5-C`,
        });
      },
    });
    installNatives(this);
    this.lua.L.setGlobal("_mr_entry", TAG_STRING, this.lua.L.internStr(this.entry));
    this.lua.L.setGlobal("_mr_param", TAG_STRING, this.lua.L.internStr(this.param));
    if (this.trace) attachTrace(this, this.trace);
  }

  get mrp(): MRPArchive | null {
    return this.archive;
  }

  unknownAbi(family: string, code: number, L: import("../lua/state.ts").LuaState): number {
    const preview = stackPreview(L);
    return raiseUnknown(this, {
      caller: "lua",
      family,
      code,
      arguments: preview.arguments,
      argumentTypes: preview.argumentTypes,
      returnContext: "native",
      message: `${family} code ${code} not implemented in Stage 5-C`,
    });
  }

  loadMrp(bytes: Uint8Array): MRPArchive {
    this.saveCurrentPack();
    this.archive = MRPArchive.parse(bytes);
    this.vfs.attach(this.archive);
    this.packName = this.archive.header.filename || "app.mrp";
    this.knownPacks.set(this.appFs.normalize(this.packName), bytes);
    this.ext?.setPackTableName(this.packName);
    // Old current-pack handles must not silently alias a newly loaded archive.
    this.mrTable?.files.reset(false);
    this.installPackPlugins();
    return this.archive;
  }

  /**
   * SkyMobi titles list `plugins\\cloudstorage.mrp` but ship the file at the
   * pack root. Put those members on the EFS plugin path so 冒泡对战 / 云存档
   * open the bundled plugin instead of a missing handset file.
   */
  private installPackPlugins(): void {
    const archive = this.archive;
    if (!archive) return;
    const members = new Set(archive.entries.map(entry => entry.name));
    const install = (src: string, dest: string) => {
      try {
        const data = archive.readFile(src);
        if (!data?.length) return;
        this.appFs.createFile(dest, true);
        this.appFs.replace(dest, data);
      } catch { /* member missing or unreadable */ }
    };
    if (members.has("cloudstorage.mrp")) install("cloudstorage.mrp", "plugins/cloudstorage.mrp");
    if (!members.has("plugins.lst")) return;
    let list: Uint8Array;
    try { list = archive.readFile("plugins.lst"); } catch { return; }
    let text: string;
    try { text = new TextDecoder("gbk").decode(list); }
    catch { text = new TextDecoder().decode(list); }
    for (const line of text.split(/[\r\n]+/)) {
      const raw = line.replace(/^\uFEFF/, "").trim();
      if (!raw || raw.startsWith("#")) continue;
      const path = raw.replace(/\\/g, "/");
      const base = path.split("/").pop();
      if (!base || !members.has(base)) continue;
      install(base, /^plugins\//i.test(path) ? path : `plugins/${base}`);
    }
  }

  start(entry?: string): void {
    if (!this.archive) throw new LuaRuntimeError("no MRP loaded");
    // A small set of packaged launchers uses the legacy underscored entry.
    // Explicit entry requests remain exact, and normal start.mr wins if both exist.
    if (entry === undefined) {
      const files = this.archive.listFiles();
      entry = files.includes(MR_START_FILE) ? MR_START_FILE : files.includes('_start.mr') ? '_start.mr' : files.includes('cfunction.ext') ? 'cfunction.ext' : MR_START_FILE;
    }
    this.state = MR_STATE_RUN;
    this.exited = false;
    // Legacy launcher scripts reject direct starts unless the parent DSM
    // runtime has set this fixed sentinel before loading `start.mr`.
    this.lua.L.setGlobal("_nes3ShP7SwK0", TAG_NUMBER, 370);
    this.lua.L.setGlobal("_mr_entry", TAG_STRING, this.lua.L.internStr(this.entry));
    this.lua.L.setGlobal("_mr_param", TAG_STRING, this.lua.L.internStr(this.param));
    const chunk = this.vfs.readFile(entry);
    if (!chunk) throw new LuaRuntimeError(`cannot read ${entry}`);
    try { this.runEntry(entry, chunk); } catch (error) { if (!(error instanceof AppReturn)) throw error; }
    if (this.timers.state === MR_TIMER_STATE_IDLE && this.lua.hasGlobalFn("dealtimer")) {
      this.timers.start(this.clock, 100, "dealtimer", this.state);
    }
  }

  /** Native-only DSM packages use mr_doExt rather than the Lua chunk loader. */
  private runEntry(name: string, bytes: Uint8Array): void {
    this.nativeEntry = name.toLowerCase().endsWith('.ext');
    if (!this.nativeEntry) { this.lua.runBytes(bytes); return; }
    const ext = new ExtRuntime();
    this.bindExt(ext);
    this.bi |= 1;
    const loaded = ext.load(bytes, { loadCode: 0 });
    if (loaded.kind !== 'return' || loaded.ret !== 0)
      throw new ExtFault(loaded.kind === 'return' ? 'abi-fault' : loaded.kind, loaded.pc ?? 0, `native entry load returned ${loaded.ret}`);
    const source = ext.alloc(bytes.length);
    ext.mem.load(source, bytes);
    const info = new Uint8Array(16), view = new DataView(info.buffer);
    const pack = this.archive!;
    view.setUint32(0, pack.header.appid, true);
    view.setUint32(4, pack.header.version, true);
    const invoke = (code: number, input?: Uint8Array) => {
      const out = input ? ext.arm_ext_call(code, input) : ext.arm_ext_call(code, undefined, source, this.profile.vmver);
      if (out.kind !== 'return') throw new ExtFault(out.kind, out.pc ?? 0, `native entry ${code}: ${out.detail ?? ''}`);
    };
    invoke(6); invoke(8, info); invoke(0);
  }

  canRun(): boolean {
    return this.state === MR_STATE_RUN || (this.timers.runWithoutPause !== 0 && this.state === MR_STATE_PAUSE);
  }

  advance(ms: number): void {
    if (ms < 0) throw new LuaRuntimeError(`advance(${ms})`);
    this.clock += ms | 0;
    const cb = this.timers.due(this.clock);
    if (cb) this.events.queue(EV_TIMER, 0, 0, 0);
  }

  queueEvent(kind: number, type: number, p1 = 0, p2 = 0): void {
    this.events.queue(kind, type, p1, p2);
  }

  /** Maze-ball EXT reads `mr_event(18, &T_MOTION, 0)`, not raw axis integers. */
  queueMotion(x: number, y: number, z = 0): void {
    const table = this.mrTable, mem = this.ext?.mem;
    if (table && mem) {
      if (!this.motionAddr) this.motionAddr = table.malloc(12);
      if (this.motionAddr) {
        mem.write32(this.motionAddr, x | 0);
        mem.write32(this.motionAddr + 4, y | 0);
        mem.write32(this.motionAddr + 8, z | 0);
        if (!this.events.replaceLast(EV_KEY, MR_MOTION_EVENT, this.motionAddr, 0)) {
          this.events.queue(EV_KEY, MR_MOTION_EVENT, this.motionAddr, 0);
        }
        return;
      }
    }
    const px = x | 0, py = y | 0;
    if (!this.events.replaceLast(EV_KEY, MR_MOTION_EVENT, px, py)) this.events.queue(EV_KEY, MR_MOTION_EVENT, px, py);
  }

  pollEvent(): RuntimeEvent | null {
    return this.events.poll();
  }

  dispatchEvent(ev: RuntimeEvent): number {
    this.lastDispatch = ev.kind;
    if (ev.kind === EV_TIMER) return this.dispatchTimer();
    if (ev.kind === EV_KEY && (ev.type === 0 || ev.type === 1) && this.mrTable?.editor.key(ev.type, ev.p1)) return MR_SUCCESS;
    if (ev.kind === EV_KEY && this.mrTable?.nativeUi.key(ev.type, ev.p1, ev.p2)) return MR_SUCCESS;
    return this.dispatchMrEvent(ev.type, ev.p1, ev.p2);
  }

  /** One queued event → Lua/native/EXT. Never an infinite while. */
  step(): boolean {
    const ev = this.events.poll();
    if (!ev) return false;
    this.steps++;
    try { this.dispatchEvent(ev); } catch (error) { if (!(error instanceof AppReturn)) throw error; }
    return true;
  }

  requestRunFile(pack: string, file: string, param: string): void {
    this.pendingPack = pack;
    this.pendingStartFile = file;
    this.pendingParam = param ?? "";
    this.lastAction = { kind: "RUN_FILE", pack, file, param: this.pendingParam };
    this.timers.start(this.clock, 100, "restart", MR_STATE_RUN);
    this.state = MR_STATE_RESTART;
  }

  private saveCurrentPack(): void {
    for (let i = 0; i < this.vfs.ramNames.length; i++) {
      const name = this.vfs.ramNames[i], data = this.vfs.ramData[i];
      if (name && data) this.appFs.replace(name, data);
    }
    const bytes = this.mrTable?.files.currentPackCopy();
    if (bytes) this.knownPacks.set(this.appFs.normalize(this.packName), bytes);
  }

  /** _loadPack changes the resource namespace without restarting Lua/timers. */
  selectReadPack(name: string): string {
    const bytes = name === '$' ? this.ramPack : this.appFs.file(name) ?? this.knownPacks.get(this.appFs.normalize(name)) ?? this.vfs.readFile(name);
    if (!bytes) throw new LuaRuntimeError(`cannot load package ${name}`);
    const archive = MRPArchive.parse(bytes), previous = this.packName;
    this.saveCurrentPack();
    this.archive = archive; this.vfs.attach(archive); this.packName = name;
    this.knownPacks.set(this.appFs.normalize(name), bytes);
    this.ext?.setPackTableName(name);
    return previous;
  }

  setReturnApp(pack: string, entry = MR_START_FILE): void {
    this.returnApp = pack ? { pack, entry } : null;
    this.mrTable?.syncReturnApp();
  }

  exitGuest(): never {
    this.saveCurrentPack(); this.timers.stop(); this.events.clear();
    if (this.returnApp) {
      const app = this.returnApp; this.returnApp = null;
      this.requestRunFile(app.pack, app.entry, this.param);
      throw new AppReturn();
    }
    this.state = MR_STATE_STOP; this.exited = true;
    throw new LuaRuntimeError('Exiting...');
  }

  applyRestart(): void {
    this.saveCurrentPack();
    const pack = this.pendingPack || this.packName;
    const bytes = pack === '$' ? this.ramPack : this.appFs.file(pack) ?? this.knownPacks.get(this.appFs.normalize(pack)) ?? this.vfs.readFile(pack);
    if (!bytes) throw new LuaRuntimeError(`cannot read application ${pack}`);
    const archive = MRPArchive.parse(bytes);
    this.lastAction = { kind: "RESTART" };
    this.timers.stop();
    this.exited = false;
    this.ext = null;
    this.mrTable = null;
    this.motionAddr = 0;
    this.events.clear();
    this.rebindLua();
    this.archive = archive; this.vfs.reset(); this.vfs.attach(archive);
    this.packName = pack; this.knownPacks.set(this.appFs.normalize(pack), bytes);
    this.param = this.pendingParam;
    this.lua.L.setGlobal("_mr_entry", TAG_STRING, this.lua.L.internStr(this.entry));
    this.lua.L.setGlobal("_mr_param", TAG_STRING, this.lua.L.internStr(this.param));
    this.state = MR_STATE_RUN;
    const name = this.pendingStartFile || MR_START_FILE;
    const chunk = this.vfs.readFile(name);
    if (!chunk) throw new LuaRuntimeError(`cannot read ${name}`);
    try { this.runEntry(name, chunk); } catch (error) { if (!(error instanceof AppReturn)) throw error; }
    if (this.timers.state === MR_TIMER_STATE_IDLE && this.lua.hasGlobalFn("dealtimer")) {
      this.timers.start(this.clock, 100, "dealtimer", this.state);
    }
  }

  rebindLua(): void {
    this.lua = new LuaVM();
    installNatives(this);
    if (this.trace) {
      wrapNatives(this, this.trace);
      rewrapLua(this, this.trace);
    }
  }

  private dispatchNativeLifecycle(code: number): void {
    if (!this.ext) return;
    const out = this.ext.arm_ext_call(code, new Uint8Array());
    if (out.kind !== 'return') throw new ExtFault(out.kind, out.pc ?? 0, `native lifecycle ${code}: ${out.detail ?? ''}`);
  }

  pause(): number {
    if (this.state === MR_STATE_RESTART) {
      this.timers.stop();
      return MR_SUCCESS;
    }
    if (this.state === MR_STATE_RUN) this.state = MR_STATE_PAUSE;
    else return MR_IGNORE;
    if (this.lua.hasGlobalFn("suspend")) this.lua.callGlobal("suspend");
    else if (this.nativeEntry) this.dispatchNativeLifecycle(4);
    if (!this.timers.runWithoutPause) this.timers.suspend();
    return MR_SUCCESS;
  }

  resume(): number {
    if (this.state === MR_STATE_RESTART) {
      this.timers.start(this.clock, 100, "restart", MR_STATE_RUN);
      return MR_SUCCESS;
    }
    if (this.state === MR_STATE_PAUSE) this.state = MR_STATE_RUN;
    else return MR_IGNORE;
    if (this.lua.hasGlobalFn("resume")) this.lua.callGlobal("resume");
    else if (this.nativeEntry) this.dispatchNativeLifecycle(5);
    this.timers.resume(this.clock);
    return MR_SUCCESS;
  }

  setUserFile(name: string, bytes: Uint8Array | null): void {
    if (bytes === null) { this.userFiles.remove(name); this.appFs.remove(name); }
    else {
      this.userFiles.createFile(name, true); this.userFiles.replace(name, bytes.slice());
      this.appFs.createFile(name, true); this.appFs.replace(name, bytes.slice());
    }
  }

  bindExt(rt: ExtRuntime | null): void {
    this.saveCurrentPack();
    if (!rt) {
      this.ext = null;
      this.mrTable = null;
      return;
    }
    rt.mem.wordLoadMode = this.profile.wordLoadMode;
    const owner = this.packName || "ext";
    const exitGuest = () => this.exitGuest();
    rt.onGuestExit = exitGuest;
    const bridge = new MrTableBridge(rt, this.vfs, owner, {
      appFs: this.appFs,
      workPath: this.workPath,
      onSetReturnApp: (pack, entry) => this.setReturnApp(pack, entry),
      getReturnApp: () => this.returnApp,
      networkRules: this.networkRules,
      onUiChange: () => {
        if (this.mrTable?.nativeUi.active) this.present();
      },
      onPlatformEvent: (type, value) => this.queueEvent(EV_SYSTEM, type, value, 0),
      onEditChange: this.onEditChange,
      onEditComplete: accepted => this.queueEvent(EV_SYSTEM, 6, accepted ? 0 : 1, 0),
      getDownloadFile: name => this.mrTable?.appFs.file(name) ?? this.resourceFiles.file(name) ?? this.systemFiles[name] ?? null,
      getClock: () => this.clock,
      onSleep: (ms) => { this.clock += ms; },
      onExit: exitGuest,
      getTimer: () => this.timers,
      getMrState: () => this.state,
      setMrState: (state, pack, entry) => {
        if (state === MR_STATE_RESTART) {
          this.pendingPack = pack;
          this.pendingStartFile = entry;
          this.pendingParam = this.param;
        }
        this.state = state;
      },
      getPack: () => (this.archive ? { name: this.packName, bytes: this.archive.data } : null),
      getProfile: () => this.profile,
      getScreen: () => this.screen,
      setScreen: screen => { this.screen = screen; this.screenW = screen.width; this.screenH = screen.height; },
      onDrawRect: (x, y, w, h, r, g, b) => this.gfx.drawRect(x, y, w, h, r, g, b),
      onDrawText: (text, x, y, r, g, b, unicode, font) => this.gfx.drawText(text, x, y, r, g, b, unicode, font),
      onFlush: (x, y, w, h) => this.present(x, y, w, h),
      onVibrate: duration => this.onVibrate?.(duration),
      onPlaySound: (type, data, loop, positionMs) => this.onPlaySound?.(type, data, loop, positionMs),
      onStopSound: (type) => this.onStopSound?.(type),
      onAlloc: (rec) => this.mrAllocs.push(rec),
      onRead: (rec) => this.mrReads.push(rec),
      onUnknownAbi: (info) => {
        const ev = {
          caller: "ext",
          family: info.family,
          code: info.code,
          arguments: [info.code],
          argumentTypes: ["number"],
          returnContext: "ext",
          message: info.message,
        };
        this.unknownEvents.push(ev);
        this.trace?.noteUnknown(ev);
      },
      onUnknownSlot: (n) => {
        this.unknownRequiredSlot = n;
        const message = `UNKNOWN_REQUIRED_SLOT = ${n}`;
        const ev = {
          caller: "ext",
          family: "mr_table",
          code: n,
          arguments: [n],
          argumentTypes: ["number"],
          returnContext: "ext",
          message,
        };
        this.unknownEvents.push(ev);
        this.trace?.noteUnknown(ev);
        throw new UnknownAbiError(message, { family: "mr_table", code: n, caller: "ext" });
      },
    });
    bridge.install();
    rt.setPackTableName(this.packName);
    rt.insnBudget = this.armInstructionBudget;
    rt.monotonicTime = this.monotonicTime;
    rt.onExtCall = this.onExtCall;
    this.mrTable = bridge;
    this.ext = this.trace ? wrapExtInstance(rt, this.trace) : rt;
  }

  private present(x = 0, y = 0, w = this.screenW, h = this.screenH): void {
    const screen = this.screen;
    this.screen = this.mrTable?.nativeUi.render(screen) ?? screen;
    try { this.gfx.flush(x, y, w, h, 0); } finally { this.screen = screen; }
  }

  private dispatchTimer(): number {
    if (this.state === MR_STATE_RESTART) {
      this.applyRestart();
      return MR_SUCCESS;
    }
    if (!this.canRun()) return MR_IGNORE;
    // Lua launchers forward dealtimer to EXT themselves. Calling both paths
    // doubles animation, counters and timer rearming (e.g. Pocket Spirit).
    const name = this.timers.callback;
    if (this.lua.hasGlobalFn(name)) {
      this.lua.callGlobal(name);
      return MR_SUCCESS;
    }
    if (this.ext) {
      const out = this.ext.arm_ext_call(2, new Uint8Array(0));
      if (out.kind !== "return") throw new ExtFault(out.kind, out.pc ?? 0, `timer EXT${out.detail ? `: ${out.detail}` : ""}`);
    }
    return MR_SUCCESS;
  }

  private dispatchMrEvent(type: number, p1: number, p2: number): number {
    if (!this.canRun()) return MR_IGNORE;
    if (this.lua.hasGlobalFn("dealevent")) {
      this.lua.callGlobal("dealevent", [type, p1, p2]);
      return MR_SUCCESS;
    }
    if (this.ext) {
      const out = this.ext.arm_ext_call(1, packEvent(type, p1, p2));
      if (out.kind !== "return") throw new ExtFault(out.kind, out.pc ?? 0, `event EXT${out.detail ? `: ${out.detail}` : ""}`);
      return MR_SUCCESS;
    }
    return MR_IGNORE;
  }
}

function packEvent(type: number, p1: number, p2: number): Uint8Array {
  const b = new Uint8Array(12);
  const v = new DataView(b.buffer);
  v.setInt32(0, type, true);
  v.setInt32(4, p1, true);
  v.setInt32(8, p2, true);
  return b;
}

export { EV_CUSTOM, EV_KEY, EV_SYSTEM, EV_TIMER };
