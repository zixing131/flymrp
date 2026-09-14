import { fetchFileBytes } from './chunk-download.ts';
import './kaios-polyfill.ts';
import { setupSdPanel } from './sd-panel.ts';
import { listSdFiles, readSdFile, removeSdFile, saveSdFile } from './sd-card.ts';
import { activateKaiOSControl, adjustKaiOSControl, applyKaiOS, closeDialog, dialogIsOpen, focusedItem, moveFocus, openDialog, setKaiOSPageKeys, setSoftkeys, showAlert } from './kaios.ts';
import { SYSTEM_COMPONENTS } from "../src/mythroad/system-components.ts";
import { MRPArchive } from "../src/mrp/index.ts";
import { PlayerClient } from "./player-client.ts";
import { MR_MOUSE_DOWN, MR_MOUSE_UP, MR_MOUSE_MOVE } from "../src/mythroad/constants.ts";
import { EV_KEY } from "../src/mythroad/events.ts";
import { BrowserAudio } from "./audio.ts";
import { DOM_KEY, HeldKeys } from "./controls.ts";
import { assetUrl, catalogHref, readGame, readLibrary } from "./library.ts";
import { registerServiceWorker } from "./pwa.ts";
import { playerScreenSize, playerHeapSize, readPref, writePref, rotatedDirection, rotatedTilt, screenPoint } from "./player-options.ts";
import { readCachedStoreList, storeSdPath } from './mrp-store.ts';
import { PRELOAD_SYSTEM_FILES, isSafeAssetPath, type PlayerFileSource } from "./remote-files.ts";
import { optionalResourceJson } from './resource-json.ts';

let rotation = 0, speed = 1;
const editorDialog = document.querySelector<HTMLDialogElement>("#guest-editor")!;
const editorText = document.querySelector<HTMLInputElement>("#guest-editor-text")!;
let editingRuntime: PlayerClient | null = null;
document.querySelector("#guest-editor-form")!.addEventListener("submit", ev => { ev.preventDefault(); editingRuntime?.finishEdit(editorText.value, true); });
document.querySelector("#guest-editor-cancel")!.addEventListener("click", () => editingRuntime?.finishEdit(editorText.value, false));
editorDialog.addEventListener("cancel", ev => { ev.preventDefault(); editingRuntime?.finishEdit(editorText.value, false); });
const canvas = document.querySelector<HTMLCanvasElement>("#screen")!;
const fileInput = document.querySelector<HTMLInputElement>("#file")!;
const resolution = document.querySelector<HTMLSelectElement>("#resolution")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const pauseBtn = document.querySelector<HTMLButtonElement>("#pause")!;
const restartBtn = document.querySelector<HTMLButtonElement>("#restart")!;
const titleEl = document.querySelector<HTMLElement>("#game-title")!;
const fpsEl = document.querySelector<HTMLElement>("#fps")!;
const emptyScreen = document.querySelector<HTMLElement>("#empty-screen")!;
let paused = false;
let frames = 0;
let fpsStart = 0;
let lastGame: { name: string; read: () => Promise<ArrayBuffer>; screen?: string } | null = null;
const audio = new BrowserAudio();
const midiPlayer = document.querySelector<HTMLSelectElement>("#midi-player")!;
const kaios = applyKaiOS({ fullscreen: true });
const pageQuery = new URL(location.href).searchParams;
const selectedName = pageQuery.get("game");
const localPath = pageQuery.get("local");
const currentGameKey = localPath || selectedName;
try { audio.setMidiPlayer(readPref("midi-player", currentGameKey) === "simple" || kaios ? "simple" : "tinysynth"); } catch { /* storage is optional */ }
if (kaios) {
  try { if (!localStorage.getItem("flymrp.midi-player")) audio.setMidiPlayer("simple"); } catch { /* storage is optional */ }
  const hint = emptyScreen.querySelector("span");
  if (hint) hint.textContent = "用方向键、确认键和左右软键玩。返回键回到列表。长按 * 打开设置。";
}
midiPlayer.value = audio.midiPlayer;
midiPlayer.addEventListener("change", () => {
  audio.setMidiPlayer(midiPlayer.value === "simple" ? "simple" : "tinysynth");
  try { localStorage.setItem("flymrp.midi-player", audio.midiPlayer); } catch { /* storage is optional */ }
});
type Session = { rt: PlayerClient; raf: number; last: number; title: string; nextHud: number };
let session: Session | null = null;
let loadingRuntime: PlayerClient | null = null;
const sdPanel = setupSdPanel((path, bytes) => (session?.rt ?? loadingRuntime)?.setUserFile(path, bytes));
const pendingEfs = new Map<string, Uint8Array | null>();
let efsTimer = 0;
async function flushEfs(): Promise<void> {
  const batch = [...pendingEfs]; pendingEfs.clear();
  if (!batch.length) return;
  for (const [path, bytes] of batch) {
    try {
      if (bytes) await saveSdFile({ path, bytes, modified: Date.now() });
      else await removeSdFile(path);
    } catch { /* storage is optional */ }
  }
  void sdPanel.refresh();
}
function persistEfs(path: string, bytes: Uint8Array | null): void {
  if (!isSafeAssetPath(path)) return;
  pendingEfs.set(path, bytes);
  clearTimeout(efsTimer);
  efsTimer = window.setTimeout(() => { void flushEfs(); }, 200);
}
window.addEventListener('pagehide', () => { void flushEfs(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) void flushEfs(); });
let generation = 0;
let fontPromise: Promise<void> | null = null;
const systemFiles: Record<string, Uint8Array> = {};
let touch: number | null = null;
const held = new HeldKeys(
  key => { session?.rt.input.press(key); applyTiltKey(key, true); },
  key => { session?.rt.input.release(key); applyTiltKey(key, false); },
);
const tilt = { oriX: 0, oriY: 0, keyX: 0, keyY: 0, sentX: 0, sentY: 0, next: 0, listening: false, haveOrientation: false };
const TILT_KEY = 80;
function currentTilt(): [number, number] {
  return rotatedTilt(tilt.oriX + tilt.keyX, tilt.oriY + tilt.keyY, rotation);
}
function pushTilt(now = performance.now(), force = false): void {
  if (!session || paused) return;
  if (!force && now < tilt.next) return;
  const [x, y] = currentTilt();
  const ix = x | 0, iy = y | 0;
  if (!force && ix === tilt.sentX && iy === tilt.sentY) return;
  tilt.next = now + 50;
  tilt.sentX = ix;
  tilt.sentY = iy;
  session.rt.motion(ix, iy);
}
function applyTiltKey(alias: string, down: boolean): void {
  if (alias === "LEFT") tilt.keyX = down ? -TILT_KEY : tilt.keyX < 0 ? 0 : tilt.keyX;
  else if (alias === "RIGHT") tilt.keyX = down ? TILT_KEY : tilt.keyX > 0 ? 0 : tilt.keyX;
  else if (alias === "UP") tilt.keyY = down ? -TILT_KEY : tilt.keyY < 0 ? 0 : tilt.keyY;
  else if (alias === "DOWN") tilt.keyY = down ? TILT_KEY : tilt.keyY > 0 ? 0 : tilt.keyY;
  else return;
  pushTilt(performance.now(), true);
}
function onDeviceOrientation(ev: DeviceOrientationEvent): void {
  if (ev.gamma == null || ev.beta == null) return;
  tilt.haveOrientation = true;
  tilt.oriX = Math.max(-100, Math.min(100, Math.round(ev.gamma * 10 / 9)));
  tilt.oriY = Math.max(-100, Math.min(100, Math.round(ev.beta * 10 / 9)));
  pushTilt();
}
function onDeviceMotion(ev: DeviceMotionEvent): void {
  if (tilt.haveOrientation) return;
  const a = ev.accelerationIncludingGravity;
  if (!a || a.x == null || a.y == null) return;
  tilt.oriX = Math.max(-100, Math.min(100, Math.round(a.x * 10)));
  tilt.oriY = Math.max(-100, Math.min(100, Math.round(-a.y * 10)));
  pushTilt();
}
async function enableMotion(): Promise<void> {
  if (tilt.listening) return;
  tilt.listening = true;
  const orient = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
  const motion = DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
  try {
    if (typeof orient.requestPermission === "function") await orient.requestPermission();
    else if (typeof motion.requestPermission === "function") await motion.requestPermission();
  } catch { /* permission is optional; keys still tilt */ }
  window.addEventListener("deviceorientation", onDeviceOrientation);
  window.addEventListener("devicemotion", onDeviceMotion);
}

function setStatus(text: string, err = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle("err", err);
}
function stop(keepStatus = false): void {
  void flushEfs();
  generation++;
  if (dialogIsOpen(editorDialog)) closeDialog(editorDialog);
  editingRuntime = null;
  held.clear();
  tilt.keyX = 0;
  tilt.keyY = 0;
  tilt.sentX = 0;
  tilt.sentY = 0;
  touch = null;
  if (session) { cancelAnimationFrame(session.raf); session.rt.stop(); }
  loadingRuntime?.stop(); loadingRuntime = null;
  session = null;
  audio.stopAll();
  pauseBtn.disabled = true;
  pauseBtn.textContent = "暂停";
  paused = false;
  fpsEl.textContent = "— FPS";
  if (!keepStatus) setStatus("已停止。选择游戏即可重新加载。");
}
function fail(e: unknown, rt?: PlayerClient): void {
  const exited = Boolean(rt?.exited) || (e instanceof Error && (e.message === "游戏已退出" || e.message === "Exiting..."));
  stop(true);
  if (kaios && exited) { goLibrary(); return; }
  setStatus(exited ? "游戏已退出，可重新加载。" : `运行失败：${e instanceof Error ? e.message : String(e)}`, !exited);
}
function frame(now: number): void {
  const s = session;
  if (!s) return;
  if (paused) { s.last = now; s.raf = requestAnimationFrame(frame); return; }
  try {
    pushTilt(now);
    s.rt.tick(now - s.last, speed);
    s.last = now;
    if (s.rt.exited) {
      stop(true);
      if (kaios) { goLibrary(); return; }
      setStatus("游戏已退出，可重新加载。");
      return;
    }
    if (now >= s.nextHud) {
      setStatus(`${s.title} · ${s.rt.screenW}×${s.rt.screenH} · 运行中${audio.lastError ? ` · 声音：${audio.lastError}` : ""}`);
      s.nextHud = now + 500;
      const elapsed = now - fpsStart;
      if (elapsed >= 500) { fpsEl.textContent = `${Math.round((s.rt.frames - frames) * 1000 / elapsed)} FPS`; frames = s.rt.frames; fpsStart = now; }
    }
    s.raf = requestAnimationFrame(frame);
  } catch (e) { fail(e, s.rt); }
}
async function ensureFont(): Promise<void> {
  if (PRELOAD_SYSTEM_FILES.every(name => systemFiles[name])) return;
  fontPromise ??= (async () => {
    await Promise.all(PRELOAD_SYSTEM_FILES.map(async name => {
      systemFiles[name] = await fetchFileBytes(assetUrl(name));
    }));
  })().catch(e => { fontPromise = null; throw e; });
  await fontPromise;
}
let systemCatalogPromise: Promise<{ names: string[]; localSystem: boolean }> | null = null;
let resourceIndex: Promise<Record<string, string[]>> | null = null;
function namesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const name = typeof item === "string" ? item : item && typeof item === "object" && "name" in item && typeof item.name === "string" ? item.name : "";
    if (!isSafeAssetPath(name) || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}
async function loadSystemCatalog(): Promise<{ names: string[]; localSystem: boolean }> {
  systemCatalogPromise ??= (async () => {
    const bundled = SYSTEM_COMPONENTS.filter(isSafeAssetPath);
    if (import.meta.env.PROD) return { names: bundled, localSystem: false };
    const res = await fetch("/__system");
    if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return { names: bundled, localSystem: false };
    const extra = namesOf(await res.json());
    return { names: [...new Set([...bundled, ...extra])], localSystem: extra.length > 0 };
  })().catch(error => { systemCatalogPromise = null; throw error; });
  return systemCatalogPromise;
}
async function loadResourceCatalog(packName: string): Promise<string[]> {
  if (import.meta.env.KAIOS) return [];
  if (!/^[a-z0-9_.-]+\.mrp$/i.test(packName)) return [];
  const stem = packName.slice(0, -4).toLowerCase();
  if (import.meta.env.DEV) {
    const res = await fetch(`/__resources?game=${encodeURIComponent(packName)}`);
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const names = namesOf(await res.json());
      if (names.length) return names;
    }
  }
  const grouped = await fetch(assetUrl(`mythroad_res/groups/${encodeURIComponent(stem)}.json`));
  const group = await optionalResourceJson(grouped);
  if (group !== null) return namesOf(group);
  resourceIndex ??= (async () => {
    const index = await fetch(assetUrl("mythroad_res/index.json"));
    const data = await optionalResourceJson(index) as { groups?: Record<string, unknown> } | null;
    const groups = data?.groups ?? {};
    const mapped: Record<string, string[]> = {};
    for (const [name, files] of Object.entries(groups)) mapped[name] = namesOf(files);
    return mapped;
  })().catch(error => { resourceIndex = null; throw error; });
  return (await resourceIndex)[stem] ?? [];
}
async function start(name: string, read: () => Promise<ArrayBuffer>, screen?: string): Promise<void> {
  stop(true);
  lastGame = { name, read, screen };
  restartBtn.disabled = false;
  titleEl.textContent = name.split("/").at(-1)!.replace(/\.mrp$/i, "");
  emptyScreen.hidden = true;
  const token = generation;
  const profile = { ...playerScreenSize(name, resolution.value, screen), guestHeapSize: playerHeapSize(document.querySelector<HTMLSelectElement>("#heap-size")!.value) };
  audio.resume();
  void enableMotion();
  setStatus(`正在读取 ${name.split("/").at(-1)}…`);
  let rt: PlayerClient | undefined;
  try {
    const [buffer, systemCatalog] = await Promise.all([read(), ensureFont().then(() => loadSystemCatalog())]);
    if (token !== generation) return;
    setStatus("正在启动游戏，请稍候…");
    await new Promise<void>(resolve => setTimeout(resolve, 40));
    if (token !== generation) return;
    canvas.width = profile.width;
    canvas.height = profile.height;
    fitScreen();
    const packName = MRPArchive.parse(new Uint8Array(buffer)).header.filename;
    const resourceCatalog = await loadResourceCatalog(packName);
    if (token !== generation) return;
    const fileSource: PlayerFileSource = {
      base: document.baseURI, system: systemCatalog.names, resources: resourceCatalog, packName,
      localSystem: systemCatalog.localSystem, localResources: import.meta.env.DEV,
    };
    rt = new PlayerClient(canvas, { edit: state => {
      if (!state) { if (dialogIsOpen(editorDialog)) closeDialog(editorDialog); editingRuntime = null; if (!kaios) canvas.focus(); syncPlayerKaiOS(); return; }
      editingRuntime = rt ?? null;
      document.querySelector("#guest-editor-title")!.textContent = state.title || "游戏输入";
      editorText.type = state.type === 2 ? "password" : "text";
      editorText.inputMode = state.type === 1 ? "numeric" : "text";
      editorText.maxLength = state.maxLength; editorText.value = state.text;
      if (!dialogIsOpen(editorDialog)) openDialog(editorDialog); editorText.focus();
      syncPlayerKaiOS();
    }, sound: (type, data, loop, positionMs) => audio.play(type, data, loop, positionMs), soundStop: type => audio.stop(type),
      persist: persistEfs,
      error: error => { if (token === generation) fail(error, rt); } });
    loadingRuntime = rt;
    await flushEfs();
    const userFiles: Record<string, Uint8Array> = {};
    for (const file of await listSdFiles().catch(() => [])) userFiles[file.path] = file.bytes;
    if (token !== generation) return;
    const guestTitle = await rt.start({ type: 'start', bytes: buffer, files: { ...systemFiles }, userFiles, profile, fileSource });
    if (token !== generation) return;
    loadingRuntime = null;
    const title = guestTitle || name.split('/').at(-1)!;
    session = { rt, raf: 0, last: performance.now(), nextHud: 0, title };
    titleEl.textContent = title;
    pauseBtn.disabled = false;
    frames = rt.frames; fpsStart = performance.now();
    if (window.matchMedia("(max-width: 760px)").matches) setDrawer(false);
    if (!kaios) canvas.focus();
    syncPlayerKaiOS();
    session.raf = requestAnimationFrame(frame);
  } catch (e) { if (token === generation) fail(e, rt); }
}
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = ""; // Same game can be selected again after failure or exit.
  if (file) void start(file.name, () => file.arrayBuffer());
});
pauseBtn.addEventListener("click", () => {
  if (!session) return;
  releaseAll();
  try {
    if (paused) session.rt.resume(); else session.rt.pause();
    paused = !paused;
    pauseBtn.textContent = paused ? "继续" : "暂停";
    session.last = performance.now();
    fpsStart = session.last; frames = session.rt.frames;
    setStatus(paused ? "已暂停" : "运行中");
  } catch (e) { fail(e, session.rt); }
});
restartBtn.addEventListener("click", () => { if (lastGame) void start(lastGame.name, lastGame.read, lastGame.screen); });
const drawer = document.querySelector<HTMLElement>("#game-drawer")!;
const libraryToggle = document.querySelector<HTMLButtonElement>("#library-toggle")!;
function setDrawer(open: boolean): void { drawer.hidden = !open; libraryToggle.setAttribute("aria-expanded", String(open)); syncPlayerKaiOS(); }
function syncPlayerKaiOS(): void {
  if (!kaios) return;
  if (dialogIsOpen(editorDialog)) { setSoftkeys("确定", "", "取消"); return; }
  if (!drawer.hidden) {
    setSoftkeys("选择", "确定", "关闭");
    if (!drawer.querySelector(".kaios-nav.focus")) drawer.querySelector(".kaios-nav")?.classList.add("focus");
    return;
  }
  setSoftkeys(session ? "左软键" : "", "确定", session ? "右软键" : "返回");
}
function goLibrary(): void {
  stop();
  const home = catalogHref(document.baseURI);
  if (!kaios) { location.assign(home); return; }
  try {
    if (/index\.html(?:[?#]|$)/i.test(document.referrer)) { history.back(); return; }
  } catch { /* packaged builds may hide referrer */ }
  location.replace(home);
}
function submitGuestEditor(): boolean {
  document.querySelector<HTMLFormElement>("#guest-editor-form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  if (dialogIsOpen(editorDialog)) closeDialog(editorDialog);
  syncPlayerKaiOS();
  return true;
}
function cancelGuestEditor(): boolean {
  editingRuntime?.finishEdit(editorText.value, false);
  if (dialogIsOpen(editorDialog)) closeDialog(editorDialog);
  syncPlayerKaiOS();
  return true;
}
libraryToggle.addEventListener("click", () => setDrawer(drawer.hidden));
document.querySelector("#theme")!.addEventListener("click", () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
});
document.querySelector("#fullscreen")!.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { setStatus("此浏览器暂不支持全屏，可隐藏虚拟键盘扩大画面。"); }
});
function syncFullscreenButton(): void {
  const button = document.querySelector<HTMLButtonElement>("#fullscreen")!;
  const on = Boolean(document.fullscreenElement || (document as Document & { mozFullScreenElement?: Element | null }).mozFullScreenElement);
  button.setAttribute("aria-pressed", String(on));
  button.setAttribute("aria-label", on ? "退出全屏" : "全屏");
  button.title = on ? "退出全屏" : "进入全屏";
  fitScreen();
}
document.addEventListener("fullscreenchange", syncFullscreenButton);
document.addEventListener("mozfullscreenchange", syncFullscreenButton);
window.addEventListener("keydown", ev => {
  if (!session || paused || !drawer.hidden || dialogIsOpen(editorDialog) || (ev.target instanceof HTMLElement && ev.target.closest("input, select, textarea, button, summary"))) return;
  const alias = ev.key === "*" ? "STAR" : ev.key === "#" ? "POUND" : (DOM_KEY[ev.code] || DOM_KEY[ev.key]);
  if (!alias) return;
  if (kaios && (ev.key === "Backspace" || ev.key === "EndCall")) return;
  ev.preventDefault();
  audio.resume();
  void enableMotion();
  held.press(`keyboard:${ev.code || ev.key}`, rotatedDirection(alias, rotation));
});
window.addEventListener("keyup", ev => held.release(`keyboard:${ev.code || ev.key}`));
function releaseAll(): void {
  held.clear();
  tilt.keyX = 0;
  tilt.keyY = 0;
  document.querySelectorAll("[data-key].held").forEach(button => button.classList.remove("held"));
  if (touch !== null && session) session.rt.queueEvent(EV_KEY, MR_MOUSE_UP, 0, 0);
  touch = null;
}
window.addEventListener("blur", releaseAll);
document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });
let activationId = 0;
if (!kaios) for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-key]")) {
  let pointerActivated = false;
  const pointers = new Map<number, { source: string; start: number }>();
  btn.addEventListener("pointerdown", ev => {
    ev.preventDefault();
    if (!session || paused) return;
    btn.setPointerCapture(ev.pointerId);
    audio.resume();
    void enableMotion();
    pointerActivated = true;
    const source = `pointer:${ev.pointerId}:${++activationId}`;
    pointers.set(ev.pointerId, { source, start: performance.now() });
    btn.classList.add("held");
    held.press(source, rotatedDirection(btn.dataset.key!, rotation));
  });
  const release = (ev: PointerEvent) => {
    const pointer = pointers.get(ev.pointerId);
    if (!pointer) return;
    pointers.delete(ev.pointerId); btn.classList.remove("held");
    const delay = ev.type === "pointercancel" ? 0 : Math.max(0, 80 - (performance.now() - pointer.start));
    setTimeout(() => held.release(pointer.source), delay);
  };
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  btn.addEventListener("pointercancel", () => { pointerActivated = false; });
  btn.addEventListener("lostpointercapture", release);
  // Keyboard/assistive activation emits click without pointerdown/up. Keep its
  // key down briefly so games that poll the keypad can observe the activation.
  btn.addEventListener("click", ev => {
    const alreadyHandled = pointerActivated && ev.detail !== 0;
    pointerActivated = false;
    if (alreadyHandled || !session || paused) return;
    const source = `activation:${++activationId}`;
    audio.resume();
    held.press(source, rotatedDirection(btn.dataset.key!, rotation));
    setTimeout(() => held.release(source), 120);
  });
}
function touchEvent(ev: PointerEvent, type: number): void {
  if (!session) return;
  const rect = canvas.getBoundingClientRect();
  const [x, y] = screenPoint((ev.clientX - rect.left) / rect.width, (ev.clientY - rect.top) / rect.height, canvas.width, canvas.height, rotation);
  session.rt.queueEvent(EV_KEY, type, x, y);
}
if (!kaios) {
  canvas.addEventListener("pointerdown", ev => {
    if (!session || touch !== null) return;
    ev.preventDefault(); canvas.focus(); canvas.setPointerCapture(ev.pointerId);
    void enableMotion();
    touch = ev.pointerId; touchEvent(ev, MR_MOUSE_DOWN);
  });
  canvas.addEventListener("pointermove", ev => { if (ev.pointerId === touch) touchEvent(ev, MR_MOUSE_MOVE); });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) canvas.addEventListener(type, ev => {
    if (ev.pointerId === touch) { touchEvent(ev, MR_MOUSE_UP); touch = null; }
  });
}


const stage = document.querySelector<HTMLElement>('#stage')!;
const viewport = document.querySelector<HTMLElement>('#screen-viewport')!;
const shell = document.querySelector<HTMLElement>('#screen-shell')!;
const keypad = document.querySelector<HTMLElement>('#keypad')!;
const zoomSelect = document.querySelector<HTMLSelectElement>('#zoom')!;
const rotationSelect = document.querySelector<HTMLSelectElement>('#rotation')!;
function fitScreen(): void {
  if (!stage) return;
  const swapped = rotation % 2 !== 0;
  const width = swapped ? canvas.height : canvas.width, height = swapped ? canvas.width : canvas.height;
  const inset = kaios ? 0 : 32;
  const fit = Math.max(.1, Math.min((stage.clientWidth - inset) / width, (stage.clientHeight - (kaios ? 0 : 26)) / height));
  const scale = zoomSelect.value === 'auto' ? fit : Math.min(fit, Number(zoomSelect.value));
  const pad = kaios ? 0 : 10;
  canvas.style.width = `${canvas.width * scale}px`; canvas.style.height = `${canvas.height * scale}px`;
  viewport.style.width = `${width * scale + pad}px`; viewport.style.height = `${height * scale + pad}px`;
  shell.style.transform = `translate(-50%, -50%) rotate(${rotation * 90}deg)`;
}
function storeSetting(name: string, value: string): void { try { localStorage.setItem(`flymrp.${name}`, value); } catch {} }
function bindSelect(id: string, apply: (value: string) => void): void {
  const select = document.querySelector<HTMLSelectElement>(`#${id}`)!;
  try { const saved = readPref(id, currentGameKey); if (saved && Array.from(select.options).some(option => option.value === saved)) select.value = saved; } catch {}
  apply(select.value);
  select.addEventListener('change', () => { writePref(id, select.value, currentGameKey); apply(select.value); canvas.focus(); });
}
bindSelect('zoom', fitScreen);
bindSelect('speed', value => { speed = Number(value); });
bindSelect('rotation', value => { releaseAll(); rotation = Number(value); fitScreen(); });
bindSelect('keypad-side', value => keypad.classList.toggle('reverse', value === 'reverse'));
bindSelect('resolution', () => {});
bindSelect('heap-size', () => {});
function rotate(delta: number): void { rotationSelect.value = String((rotation + delta + 4) % 4); rotationSelect.dispatchEvent(new Event('change')); }
document.querySelector('#rotate-left')!.addEventListener('click', () => rotate(-1));
document.querySelector('#rotate-right')!.addEventListener('click', () => rotate(1));
document.querySelector('#close-settings')!.addEventListener('click', () => setDrawer(false));
const keyboardButton = document.querySelector<HTMLButtonElement>('#toggle-keypad')!;
function showKeyboard(show: boolean): void {
  releaseAll(); keypad.hidden = !show; keyboardButton.setAttribute('aria-pressed', String(show)); keyboardButton.setAttribute('aria-label', show ? '隐藏虚拟键盘' : '显示虚拟键盘'); storeSetting('keypad', String(show)); fitScreen();
}
try { showKeyboard(kaios ? false : localStorage.getItem('flymrp.keypad') !== 'false'); } catch { if (kaios) showKeyboard(false); }
keyboardButton.addEventListener('click', () => showKeyboard(keypad.hidden));
if (kaios) {
  document.querySelector('#keypad-side')?.closest('label')?.classList.add('kaios-hide');
  document.querySelector('#midi-player')?.closest('label')?.classList.add('kaios-hide');
  for (const el of Array.from(drawer.querySelectorAll<HTMLElement>('.setting, .transport button, #theme'))) {
    if (el.classList.contains('kaios-hide') || el.id === 'screenshot') continue;
    el.classList.add('kaios-nav');
  }
  setKaiOSPageKeys({
    up: () => { if (drawer.hidden) return false; moveFocus(drawer, '.kaios-nav', -1); return true; },
    down: () => { if (drawer.hidden) return false; moveFocus(drawer, '.kaios-nav', 1); return true; },
    left: () => {
      if (drawer.hidden) return false;
      const item = focusedItem(drawer, '.kaios-nav');
      if (item) adjustKaiOSControl(item, -1);
      return true;
    },
    right: () => {
      if (drawer.hidden) return false;
      const item = focusedItem(drawer, '.kaios-nav');
      if (item) adjustKaiOSControl(item, 1);
      return true;
    },
    enter: () => {
      if (dialogIsOpen(editorDialog)) return submitGuestEditor();
      if (drawer.hidden) return false;
      const item = focusedItem(drawer, '.kaios-nav');
      if (item) activateKaiOSControl(item);
      return true;
    },
    softLeft: () => {
      if (dialogIsOpen(editorDialog)) return submitGuestEditor();
      if (!drawer.hidden) {
        const item = focusedItem(drawer, '.kaios-nav');
        if (item) activateKaiOSControl(item);
        return true;
      }
      return false;
    },
    softRight: () => {
      if (dialogIsOpen(editorDialog)) return cancelGuestEditor();
      if (!drawer.hidden) { setDrawer(false); return true; }
      if (!session) { goLibrary(); return true; }
      return false;
    },
    back: () => {
      if (dialogIsOpen(editorDialog)) return cancelGuestEditor();
      if (!drawer.hidden) { setDrawer(false); return true; }
      if (!session) { goLibrary(); return true; }
      showAlert('返回', '返回游戏列表？', goLibrary, () => { syncPlayerKaiOS(); });
      return true;
    },
  });
  syncPlayerKaiOS();
  let starAt = 0;
  window.addEventListener('keydown', ev => {
    if (ev.key !== '*' || dialogIsOpen(editorDialog) || !drawer.hidden) return;
    if (!starAt) starAt = Date.now();
  }, true);
  window.addEventListener('keyup', ev => {
    if (ev.key !== '*') return;
    if (starAt && Date.now() - starAt > 800 && session && drawer.hidden && !dialogIsOpen(editorDialog)) setDrawer(true);
    starAt = 0;
  }, true);
}
const showFps = document.querySelector<HTMLInputElement>('#show-fps')!;
try { showFps.checked = readPref('show-fps', currentGameKey) !== 'false'; } catch {}
fpsEl.hidden = !showFps.checked;
showFps.addEventListener('change', () => { fpsEl.hidden = !showFps.checked; storeSetting('show-fps', String(showFps.checked)); });
const volume = document.querySelector<HTMLInputElement>('#volume')!;
const mute = document.querySelector<HTMLButtonElement>('#mute')!;
let muted = false;
try { const saved = localStorage.getItem('flymrp.volume'); if (saved !== null && Number.isFinite(Number(saved))) volume.value = String(Math.min(100, Math.max(0, Number(saved)))); muted = localStorage.getItem('flymrp.muted') === 'true'; } catch {}
function applyVolume(): void {
  audio.setVolume(Number(volume.value) / 100); audio.setMuted(muted);
  document.querySelector('#volume-value')!.textContent = `${volume.value}%`;
  mute.setAttribute('aria-pressed', String(muted)); mute.setAttribute('aria-label', muted ? '开启声音' : '静音');
  mute.title = muted ? '开启声音' : '静音';
  storeSetting('volume', volume.value); storeSetting('muted', String(muted));
}
volume.addEventListener('input', () => { applyVolume(); audio.resume(); });
mute.addEventListener('click', () => { muted = !muted; applyVolume(); if (!muted) audio.resume(); });
applyVolume();
try { document.documentElement.dataset.theme = localStorage.getItem('flymrp.theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch {}
try { const bg = localStorage.getItem('flymrp.game-bg'); if (bg) document.querySelector<HTMLElement>('.stage')!.style.background = bg; } catch {}
document.querySelector('#theme')!.addEventListener('click', () => storeSetting('theme', document.documentElement.dataset.theme!));
if (typeof ResizeObserver === 'function') new ResizeObserver(fitScreen).observe(stage);
else window.addEventListener('resize', fitScreen);
new MutationObserver(fitScreen).observe(canvas, { attributes: true, attributeFilter: ['width', 'height'] });
document.querySelector('#screenshot')!.addEventListener('click', () => {
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `${titleEl.textContent || 'flymrp'}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
});
document.querySelector('#back')!.addEventListener('click', () => goLibrary());
window.addEventListener('pagehide', () => stop(true));
// PWA：播放器页同样注册 Service Worker（离线可用、触发版本更新检查）。
// 采用 "quiet" 策略：新版本激活时不自动刷新，避免打断正在运行的游戏；
// 返回目录页时由目录页的 reload 行为完成刷新。
registerServiceWorker("quiet");
if (localPath) void (async () => {
  try {
    const file = await readSdFile(localPath);
    if (!file) throw new Error('此浏览器中找不到本地游戏，请返回首页重新选择文件。');
    // Old downloads predate SD metadata; recover their hint from the cached store.
    const cached = !file.resolution && !pageQuery.get('scr') ? await readCachedStoreList() : null;
    const screen = pageQuery.get('scr') || file.resolution || cached?.apps.find(app => storeSdPath(app) === localPath)?.scr;
    await start(file.path.split('/').at(-1)!, async () => new Uint8Array(file.bytes).buffer, screen);
  } catch (error) { fail(error); }
})();
else if (selectedName) void (async () => {
  try { const game = (await readLibrary()).find(game => game.name === selectedName); if (!game) throw new Error('游戏不在精选清单中，请从游戏库选择或打开本地文件。'); await start(game.name, () => readGame(game)); }
  catch (error) { fail(error); }
})();
