import { fetchFileBytes } from './chunk-download.ts';
import './kaios-polyfill.ts';
import { fileBaseName, listSdFiles, readBlobBytes, removeSdFile, saveSdFile, sdPath, type SdFile } from './sd-card.ts';
import { gameTitle, installedGamesFromSd, isMrpFilename, playerHref, readLibrary, type Game } from './library.ts';
import { STORE_DIR, fetchStoreList, isStoreSupported, readCachedStoreList, saveCachedStoreList, storeSdPath, type StoreApp } from './mrp-store.ts';
import { appIdIconUrl, loadPackageInfo, type MrpPackageInfo } from './mrp-meta.ts';
import { applyKaiOS, focusedItem, moveFocus, openMenu, setKaiOSPageKeys, setSoftkeys, showAlert } from './kaios.ts';
import { clearGamePrefs, gameStem, readGamePref, readPref, writePref } from './player-options.ts';
import { registerServiceWorker } from './pwa.ts';

const search = document.querySelector<HTMLInputElement>('#search')!;
const container = document.querySelector<HTMLElement>('#games')!;
const count = document.querySelector<HTMLElement>('#library-count')!;
const categories = document.querySelector<HTMLElement>('#categories')!;
const localFile = document.querySelector<HTMLInputElement>('#local-file')!;
const configFile = document.querySelector<HTMLInputElement>('#config-file')!;
const empty = document.querySelector<HTMLElement>('#empty')!;
const fab = document.querySelector<HTMLButtonElement>('#fab')!;
const overlay = document.querySelector<HTMLElement>('#actionSheetOverlay')!;
const sheet = document.querySelector<HTMLElement>('#gameSettingsSheet')!;
const detailEmpty = document.querySelector<HTMLElement>('#detailEmpty')!;
const detailContent = document.querySelector<HTMLElement>('#detailContent')!;
const asTitle = document.querySelector<HTMLElement>('#asTitle')!;
const asDelete = document.querySelector<HTMLButtonElement>('#asDelete')!;
const detailDelete = document.querySelector<HTMLButtonElement>('#detailDelete')!;
const storeDetailContent = document.querySelector<HTMLElement>('#storeDetailContent')!;
const storeSheet = document.querySelector<HTMLElement>('#storeSheet')!;
const storeSheetContent = document.querySelector<HTMLElement>('#storeSheetContent')!;
const storeSheetClose = document.querySelector<HTMLButtonElement>('#storeSheetClose')!;

let games: Game[] = [];
let category = '全部';
/** 在线商店（首页默认分类）。KaiOS 等不支持 gzip 解压的内核自动隐藏。 */
const STORE_CATEGORY = '在线商店';
const storeSupported = isStoreSupported();
let storeApps: StoreApp[] = [];
let installedStore = new Set<string>();
let storeSource: 'none' | 'cache' | 'online' = 'none';
let storeLastUpdated = 0;
let storeError = '';
let storeLoading = false;
if (storeSupported) category = STORE_CATEGORY;

/** 在线商店条目的下载状态（右侧详情/底部面板共用）。 */
type StoreDlStatus = 'idle' | 'downloading' | 'saving' | 'done' | 'error';
type StoreDl = { status: StoreDlStatus; received: number; total: number; error: string; lastPaint: number };
/** 下载状态以“条目唯一键”索引：appid 不是主键，同 appid 可能有多个版本/分辨率，互不共享状态。 */
const storeDl = new Map<string, StoreDl>();
/** 当前在右侧/底部展示详情的商店条目唯一键（'' 表示未打开）。 */
let storeOpenKey = '';

/** “全部/我的游戏”里各 MRP 包读出的 appid/appname（按 game.name 索引）。 */
const gameInfo = new Map<string, MrpPackageInfo>();
const failedIcons = new Set<number>();
const enrichInflight = new Set<string>();
let enrichBacklog: Game[] = [];
let enrichTimer = 0;
let focusedName = '';
let selected: Game | undefined;
let sheetGame: Game | undefined;
const kaios = applyKaiOS();
const prefIds = ['resolution', 'zoom', 'midi-player', 'rotation', 'speed', 'heap-size', 'keypad-side', 'show-fps'] as const;
const gamePrefMap = [
  ['resolution', 'dsResolution', 'gsResolution'],
  ['zoom', 'dsZoom', 'gsZoom'],
  ['midi-player', 'dsMidi', 'gsMidi'],
  ['rotation', 'dsRotation', 'gsRotation'],
  ['speed', 'dsSpeed', 'gsSpeed'],
  ['heap-size', 'dsHeap', 'gsHeap'],
  ['keypad-side', 'dsKeypad', 'gsKeypad'],
] as const;

function isDesktop(): boolean {
  return window.matchMedia('(min-width: 768px)').matches;
}

function launchGame(game: Game): void {
  location.assign(playerHref(game));
}

function formatSize(size?: number): string {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function gameMeta(game: Game): string {
  const parts = [game.local ? '我的游戏' : (game.category ?? '经典游戏')];
  const size = formatSize(game.size);
  if (size) parts.push(size);
  return parts.join(' · ');
}

function artTone(game: Game): string {
  return String(game.id % 6);
}

/** “全部/我的游戏”卡片显示名：优先用 MRP 包内 appname，未读取到则回退原标题。 */
function displayTitle(game: Game): string {
  const info = gameInfo.get(game.name);
  return (info && info.appname) || gameTitle(game);
}

/** 后台读取当前列表里各 MRP 包的 appid/appname（读包较慢，仅进入“全部/我的游戏”等视图时触发）。 */
function scheduleEnrich(list: Game[]): void {
  if (kaios || !list.length) return;
  for (const game of list) {
    if (!gameInfo.has(game.name) && !enrichInflight.has(game.name)) enrichBacklog.push(game);
  }
  pumpEnrich();
}

function pumpEnrich(): void {
  const CONCURRENCY = 2;
  while (enrichBacklog.length && enrichInflight.size < CONCURRENCY) {
    const game = enrichBacklog.shift()!;
    enrichInflight.add(game.name);
    void loadPackageInfo(game)
      .then(info => { if (info && info.appid) gameInfo.set(game.name, info); })
      .catch(() => { /* 单个包解析失败不影响列表 */ })
      .finally(() => { enrichInflight.delete(game.name); afterEnrich(); pumpEnrich(); });
  }
}

function afterEnrich(): void {
  if (category === STORE_CATEGORY) return;
  if (enrichTimer) window.clearTimeout(enrichTimer);
  enrichTimer = window.setTimeout(() => { enrichTimer = 0; render(); }, 150);
}

function focusedGame(): Game | undefined {
  const name = focusedItem(container, '.game-card')?.getAttribute('data-name');
  if (!name) return undefined;
  return games.find(game => game.name === name);
}

function launchFocused(): boolean {
  const game = focusedGame();
  if (game) launchGame(game);
  return true;
}

function refreshListFocus(): void {
  if (!kaios) return;
  const cards = Array.from(container.querySelectorAll<HTMLElement>('.game-card'));
  let current = cards.find(card => card.getAttribute('data-name') === focusedName) ?? cards[0];
  for (const card of cards) card.classList.remove('focus');
  if (current) {
    current.classList.add('focus');
    focusedName = current.getAttribute('data-name') ?? '';
    if (current.scrollIntoView) current.scrollIntoView(false);
  }
  setSoftkeys('菜单', cards.length ? '启动' : '安装', '退出');
}

function fillPrefs(prefix: 'ds' | 'gs', game: Game): void {
  for (const [name, ds, gs] of gamePrefMap) {
    const id = prefix === 'ds' ? ds : gs;
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (select) select.value = readGamePref(game.name, name);
  }
}

function savePrefsFrom(prefix: 'ds' | 'gs', game: Game): void {
  for (const [name, ds, gs] of gamePrefMap) {
    const id = prefix === 'ds' ? ds : gs;
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (select) writePref(name, select.value, game.name);
  }
}

function selectGame(game: Game | undefined): void {
  if (storeOpenKey) closeStorePanel();
  selected = game;
  for (const card of Array.from(container.querySelectorAll('.game'))) {
    card.classList.toggle('selected', !!game && card.getAttribute('data-name') === game.name);
  }
  if (!game) {
    detailEmpty.hidden = false;
    detailContent.hidden = true;
    return;
  }
  detailEmpty.hidden = true;
  detailContent.hidden = false;
  const icon = document.querySelector<HTMLElement>('#detailIcon')!;
  icon.textContent = displayTitle(game).slice(0, 2);
  icon.dataset.tone = artTone(game);
  document.querySelector('#detailName')!.textContent = displayTitle(game);
  document.querySelector('#detailMeta')!.textContent = gameMeta(game);
  detailDelete.classList.toggle('disabled', !game.local);
  fillPrefs('ds', game);
}

function openActionSheet(game: Game): void {
  sheetGame = game;
  asTitle.textContent = displayTitle(game);
  asDelete.classList.toggle('disabled', !game.local);
  sheet.classList.remove('active');
  overlay.classList.add('show');
}

function closeActionSheet(): void {
  overlay.classList.remove('show');
  sheet.classList.remove('active');
}

function openGameSheet(game: Game): void {
  sheetGame = game;
  document.querySelector('#gsTitle')!.textContent = `${gameTitle(game)} · 独立设置`;
  fillPrefs('gs', game);
  overlay.classList.add('show');
  sheet.classList.add('active');
}

function confirmAction(title: string, message: string, ok: () => void): void {
  if (kaios) {
    showAlert(title, message, ok, () => refreshListFocus());
    return;
  }
  if (window.confirm(message)) ok();
}

async function clearGameData(game: Game): Promise<void> {
  clearGamePrefs(game.name);
  const stem = gameStem(game.name);
  const files = await listSdFiles().catch(() => []);
  for (const file of files) {
    if (file.path === game.name) continue;
    if (file.path.indexOf('games/') === 0) continue;
    if (file.path.indexOf(stem) >= 0) await removeSdFile(file.path);
  }
  count.textContent = `已清除 ${gameTitle(game)} 的独立设置与相关存档`;
}

function deleteGame(game: Game): void {
  if (!game.local) {
    if (kaios) showAlert('提示', '内置游戏不能删除。先安装自己的 MRP，再删除。');
    else window.alert('内置游戏不能删除。');
    return;
  }
  confirmAction('删除', `删除 ${gameTitle(game)}？`, () => {
    void removeSdFile(game.name).then(() => {
      if (focusedName === game.name) focusedName = '';
      if (selected?.name === game.name) selectGame(undefined);
      return load();
    }).catch(failInstall);
  });
}

function render(): void {
  const term = search.value.trim().toLowerCase();
  const storeView = category === STORE_CATEGORY;
  const cards: HTMLElement[] = [];
  let status = '';
  let gameMatches: Game[] = [];
  if (storeView) {
    const matches = storeApps.filter(app => !term || `${app.label} ${app.name} ${app.vendor} ${app.scr} ${app.detail}`.toLowerCase().includes(term));
    for (const app of matches) cards.push(storeCard(app, installedStore.has(storeSdPath(app))));
    if (storeSource === 'none') {
      status = storeLoading ? '正在加载在线商店…' : storeError ? `在线商店暂不可用：${storeError}` : '在线商店暂无数据';
    } else {
      const where = storeSource === 'cache' ? '本地缓存' : '已联网更新';
      const when = storeLastUpdated ? ` · ${formatClock(storeLastUpdated)} 更新` : '';
      status = `在线商店 · ${matches.length} 款 · ${where}${when}`;
    }
    if (cards.length) empty.hidden = true;
    else if (storeSource === 'none' && !storeLoading && storeError) {
      empty.textContent = `在线商店加载失败：${storeError}。请检查网络后到“设置”点“刷新游戏库”重试，或切换到“全部”浏览内置游戏。`;
      empty.hidden = false;
    } else {
      empty.textContent = storeSource === 'none' && storeLoading ? '正在加载在线商店…' : '没有找到匹配的在线游戏，换个关键词试试。';
      empty.hidden = false;
    }
  } else {
    gameMatches = games.filter(game => (category === '全部' || game.category === category) && `${displayTitle(game)} ${game.category} ${game.name}`.toLowerCase().includes(term));
    status = `${gameMatches.length} 款游戏`;
    cards.push(...gameMatches.map(gameCard));
    empty.textContent = '没有找到游戏，换个关键词，或打开自己的 MRP 文件。';
    empty.hidden = !!gameMatches.length;
  }
  count.textContent = status;
  container.replaceChildren(...cards);
  if (storeView) {
    if (selected) {
      selected = undefined;
      for (const card of Array.from(container.querySelectorAll<HTMLElement>('.game:not(.store-item)'))) card.classList.remove('selected');
    }
    if (storeOpenKey) highlightStoreCard(storeOpenKey);
    else { detailEmpty.hidden = false; detailContent.hidden = true; }
  } else {
    if (storeOpenKey) closeStorePanel();
    if (selected && !gameMatches.some(game => game.name === selected!.name)) selectGame(undefined);
    else if (selected) selectGame(selected);
    else if (isDesktop() && gameMatches[0]) selectGame(gameMatches[0]);
    else { detailEmpty.hidden = false; detailContent.hidden = true; }
  }
  refreshListFocus();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatClock(timestamp: number): string {
  try { return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function storeMeta(app: StoreApp, installed: boolean): string {
  const parts: string[] = [];
  if (installed) parts.push('已下载');
  const size = app.size || formatSize(app.len);
  if (size) parts.push(size);
  if (app.vendor) parts.push(app.vendor);
  if (app.scr) parts.push(app.scr);
  return parts.join(' · ');
}

function gameCard(game: Game): HTMLElement {
  const info = gameInfo.get(game.name);
  const title = displayTitle(game);
  const appid = info?.appid || 0;
  const iconUrl = appid && !failedIcons.has(appid) ? appIdIconUrl(appid) : '';
  const card = document.createElement('a');
  card.className = 'game game-card listitem';
  card.setAttribute('data-name', game.name);
  if (game.local) card.setAttribute('data-local', '1');
  card.href = playerHref(game);
  const art = document.createElement('span');
  art.className = 'game-art';
  art.dataset.tone = artTone(game);
  art.setAttribute('aria-hidden', 'true');
  if (iconUrl) {
    art.classList.add('store-art');
    const img = document.createElement('img');
    img.className = 'store-icon';
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = iconUrl;
    img.addEventListener('error', () => {
      failedIcons.add(appid);
      art.classList.remove('store-art');
      img.remove();
      art.textContent = title.slice(0, 2);
    });
    art.appendChild(img);
  } else {
    art.textContent = title.slice(0, 2);
  }
  const infoBlock = document.createElement('span');
  infoBlock.className = 'game-info';
  const titleEl = document.createElement('div');
  titleEl.className = 'game-name';
  titleEl.textContent = title;
  const detail = document.createElement('div');
  detail.className = 'game-meta';
  detail.textContent = gameMeta(game);
  infoBlock.append(titleEl, detail);
  card.append(art, infoBlock);
  card.setAttribute('aria-label', `开始游戏：${title}`);
  card.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (kaios) { launchGame(game); return; }
    if (isDesktop()) { selectGame(game); return; }
    openActionSheet(game);
  });
  card.addEventListener('dblclick', event => {
    event.preventDefault();
    if (isDesktop()) launchGame(game);
  });
  return card;
}

function storeArtBlock(label: string, iconUrl: string, tone: string, extraClass = ''): HTMLElement {
  const art = document.createElement('span');
  art.className = `game-art store-art${extraClass ? ` ${extraClass}` : ''}`;
  art.dataset.tone = tone;
  if (iconUrl) {
    const img = document.createElement('img');
    img.className = 'store-icon';
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = iconUrl;
    img.addEventListener('error', () => {
      img.remove();
      art.textContent = (label || '?').slice(0, 2);
    });
    art.appendChild(img);
  } else {
    art.textContent = (label || '?').slice(0, 2);
  }
  return art;
}

/** 列表条目的唯一键：appid 不是主键（同 appid 可能有不同版本/分辨率），down 文件名唯一，用作卡片与状态标识。 */
function storeKey(app: StoreApp): string {
  return app.down;
}

/** 卡片角标：down 文件名以 sky_ 开头→“顶”，new_ 开头→“新”。 */
function storeBadge(app: StoreApp): { text: string; kind: string } | null {
  const base = fileBaseName(app.down).toLowerCase();
  if (base.startsWith('sky_')) return { text: '顶', kind: 'top' };
  if (base.startsWith('new_')) return { text: '新', kind: 'new' };
  return null;
}

function storeCard(app: StoreApp, installed: boolean): HTMLElement {
  const card = document.createElement('a');
  card.className = 'game game-card listitem store-item';
  card.setAttribute('data-name', `store:${storeKey(app)}`);
  card.href = app.downUrl;
  card.title = app.detail || `${app.label} · ${app.vendor || '作者未知'}`;
  const art = storeArtBlock(app.label, app.iconUrl, String(app.id % 6));
  const info = document.createElement('span');
  info.className = 'game-info';
  const title = document.createElement('div');
  title.className = 'game-name';
  title.textContent = app.label;
  const detail = document.createElement('div');
  detail.className = 'game-meta';
  detail.textContent = storeMeta(app, installed);
  info.append(title, detail);
  card.append(art, info);
  const badge = storeBadge(app);
  if (badge) {
    const tag = document.createElement('span');
    tag.className = `store-badge ${badge.kind}`;
    tag.textContent = badge.text;
    card.appendChild(tag);
  }
  card.setAttribute('aria-label', `${installed ? '查看并运行' : '查看并下载'}：${app.label}`);
  card.addEventListener('click', event => {
    event.preventDefault();
    void openStore(app);
  });
  return card;
}

/* ---- 在线商店：右侧详情 / 底部面板、下载进度与运行按钮 ---- */

function dlState(app: StoreApp): StoreDl {
  const key = storeKey(app);
  let state = storeDl.get(key);
  if (!state) {
    state = {
      status: installedStore.has(storeSdPath(app)) ? 'done' : 'idle',
      received: 0,
      total: app.len || 0,
      error: '',
      lastPaint: 0,
    };
    storeDl.set(key, state);
  }
  return state;
}

function runStoreApp(app: StoreApp): void {
  const path = storeSdPath(app);
  const game: Game = { id: app.id, name: path, title: app.label, category: STORE_CATEGORY, size: app.len || undefined, local: true, resolution: app.scr };
  location.assign(playerHref(game));
}

function maybePaintStore(app: StoreApp): void {
  const state = dlState(app);
  const now = performance.now();
  if (now - state.lastPaint > 80) { state.lastPaint = now; paintStore(app); }
}

/** 在网页内下载商店应用并展示进度；完成后只亮出“运行”按钮，不自动跳转模拟器。 */
async function startStoreDownload(app: StoreApp, force = false): Promise<void> {
  const state = dlState(app);
  if (state.status === 'downloading' || state.status === 'saving') return;
  if (!force && state.status === 'done') return;
  state.status = 'downloading';
  state.received = 0;
  state.total = app.len || 0;
  state.error = '';
  paintStore(app);
  try {
    const bytes = await fetchFileBytes(app.downUrl, (received, total) => {
      state.received = received; if (total > 0) state.total = total; maybePaintStore(app);
    });
    if (!bytes.length) throw new Error('下载的文件是空的');
    state.status = 'saving';
    state.received = bytes.length;
    state.total = bytes.length;
    paintStore(app);
    const path = storeSdPath(app);
    await saveSdFile({ path, bytes, modified: Date.now(), resolution: app.scr });
    installedStore.add(path);
    state.status = 'done';
    paintStore(app);
  } catch (error) {
    state.status = 'error';
    state.error = errorText(error);
    paintStore(app);
  }
}

/** 点击商店条目：桌面在右侧、移动端在底部展示信息与下载进度；未下载自动开始下载。 */
function openStore(app: StoreApp): void {
  if (!storeSupported) return;
  const key = storeKey(app);
  if (isDesktop()) {
    closeStoreSheet();
    detailEmpty.hidden = true;
    detailContent.hidden = true;
    storeDetailContent.dataset.app = key;
    storeDetailContent.hidden = false;
  } else {
    closeStorePanel(); // 收起可能残留的桌面面板（会重置高亮，稍后统一重设）
    openStoreSheet(app);
  }
  storeOpenKey = key;
  highlightStoreCard(key);
  paintStore(app);
  const state = dlState(app);
  if (state.status === 'idle') void startStoreDownload(app);
}

function highlightStoreCard(key: string): void {
  for (const card of Array.from(container.querySelectorAll<HTMLElement>('.store-item'))) {
    card.classList.toggle('selected', key !== '' && card.getAttribute('data-name') === `store:${key}`);
  }
}

function closeStorePanel(): void {
  storeOpenKey = '';
  highlightStoreCard('');
  storeDetailContent.dataset.app = '';
  storeDetailContent.hidden = true;
  storeDetailContent.replaceChildren();
}

let storeSheetHideTimer = 0;
function openStoreSheet(app: StoreApp): void {
  if (storeSheetHideTimer) { window.clearTimeout(storeSheetHideTimer); storeSheetHideTimer = 0; }
  storeSheet.dataset.app = storeKey(app);
  storeSheet.hidden = false;
  overlay.classList.add('show');
  requestAnimationFrame(() => storeSheet.classList.add('active'));
  paintStore(app);
}

function closeStoreSheet(): void {
  storeSheet.classList.remove('active');
  overlay.classList.remove('show');
  if (storeOpenKey) { storeOpenKey = ''; highlightStoreCard(''); }
  if (storeSheetHideTimer) window.clearTimeout(storeSheetHideTimer);
  storeSheetHideTimer = window.setTimeout(() => {
    storeSheetHideTimer = 0;
    storeSheet.dataset.app = '';
    storeSheetContent.replaceChildren();
    storeSheet.hidden = true;
  }, 320);
}

function storeHosts(app: StoreApp): HTMLElement[] {
  const hosts: HTMLElement[] = [];
  const key = storeKey(app);
  if (!storeDetailContent.hidden && storeDetailContent.dataset.app === key) hosts.push(storeDetailContent);
  if (!storeSheet.hidden && storeSheet.dataset.app === key) hosts.push(storeSheetContent);
  return hosts;
}

function paintStore(app: StoreApp): void {
  // 注意：不要用 cloneNode 复制同一节点——clone 不携带 addEventListener 绑定，
  // 会导致“运行/重新下载/重试”按钮无响应。每个容器各构建一份新 UI。
  for (const host of storeHosts(app)) host.replaceChildren(buildStoreUi(app));
}

function uiButton(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = primary ? 'btn btn-primary' : 'btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

let storeSettingsId = 0;
/** Use the existing per-game controls and the same saved-file key as the player. */
function buildStoreSettings(app: StoreApp): HTMLElement {
  const section = document.createElement('section');
  const heading = document.createElement('div');
  heading.className = 'detail-settings-title';
  heading.textContent = '独立运行设置';
  const hint = document.createElement('p');
  hint.className = 'store-ui-meta';
  hint.textContent = '仅对当前游戏生效，未单独设置的选项使用全局设置。更改后自动保存。';
  const form = document.querySelector<HTMLElement>('#detailSettingsForm')!.cloneNode(true) as HTMLElement;
  const path = storeSdPath(app);
  const controls = gamePrefMap.map(([name, id]) => ({ name, select: form.querySelector<HTMLSelectElement>(`#${id}`)! }));
  const reset = form.querySelector<HTMLButtonElement>('#dsReset')!;
  const save = form.querySelector<HTMLButtonElement>('#dsSave')!;
  const prefix = `store-settings-${++storeSettingsId}-`;
  // Desktop and mobile can coexist; labels must address their own controls.
  for (const el of [form, ...Array.from(form.querySelectorAll<HTMLElement>('[id]'))]) el.id = prefix + el.id;
  for (const label of Array.from(form.querySelectorAll<HTMLLabelElement>('label[for]'))) label.htmlFor = prefix + label.htmlFor;
  const fill = () => { for (const { name, select } of controls) select.value = readGamePref(path, name); };
  const persist = () => { for (const { name, select } of controls) writePref(name, select.value, path); };
  for (const { name, select } of controls) select.addEventListener('change', () => writePref(name, select.value, path));
  save.addEventListener('click', persist);
  reset.addEventListener('click', () => { clearGamePrefs(path); fill(); });
  fill();
  section.append(heading, hint, form);
  return section;
}

function buildStoreUi(app: StoreApp): HTMLElement {
  const state = dlState(app);
  const root = document.createElement('div');
  root.className = 'store-ui';

  const head = document.createElement('div');
  head.className = 'store-ui-head';
  head.append(storeArtBlock(app.label, app.iconUrl, String(app.id % 6), 'store-ui-icon'));
  const main = document.createElement('div');
  main.className = 'store-ui-main';
  const name = document.createElement('div');
  name.className = 'store-ui-name';
  name.textContent = app.label;
  const meta = document.createElement('div');
  meta.className = 'store-ui-meta';
  const metaParts = [app.vendor || '作者未知', app.size || formatSize(app.len), app.scr ? `${app.scr} 分辨率` : '分辨率未知', `AppID ${app.id}`];
  meta.textContent = metaParts.join(' · ');
  main.append(name, meta);
  head.append(main);

  const desc = document.createElement('p');
  desc.className = 'store-ui-desc';
  desc.textContent = app.detail || '暂无介绍。';

  const progress = document.createElement('div');
  progress.className = 'store-ui-progress';
  const track = document.createElement('div');
  track.className = 'store-progress-track';
  const fill = document.createElement('div');
  fill.className = 'store-progress-fill';
  const pct = state.total > 0 ? Math.min(100, Math.round((state.received / state.total) * 100)) : state.received > 0 ? 100 : 0;
  fill.style.width = `${pct}%`;
  track.append(fill);
  const progressText = document.createElement('div');
  progressText.className = 'store-progress-text';
  const recText = state.received ? formatSize(state.received) : '0 B';
  const totText = state.total ? formatSize(state.total) : '未知';
  progressText.textContent = `${recText} / ${totText} · ${pct}%`;
  progress.append(track, progressText);
  progress.hidden = state.status !== 'downloading' && state.status !== 'saving';

  const status = document.createElement('div');
  status.className = 'store-ui-status';
  if (state.status === 'error') {
    status.classList.add('err');
    status.textContent = state.error;
  } else if (state.status === 'done') {
    status.textContent = `已下载 ${formatSize(state.total)}，可离线随时运行`;
  } else if (state.status === 'saving') {
    status.textContent = '下载完成，正在写入本地…';
  } else if (state.status === 'downloading') {
    status.textContent = '正在从在线商店下载…';
  } else {
    status.textContent = '尚未下载，点击下方“下载”后即可在本地运行。';
  }

  const actions = document.createElement('div');
  actions.className = 'store-ui-actions';
  if (state.status === 'done') {
    actions.append(uiButton('运行', true, () => runStoreApp(app)));
    actions.append(uiButton('重新下载', false, () => { void startStoreDownload(app, true); }));
  } else if (state.status === 'error') {
    actions.append(uiButton('重试', true, () => { void startStoreDownload(app, true); }));
    if (installedStore.has(storeSdPath(app))) actions.append(uiButton('运行旧版本', false, () => runStoreApp(app)));
  } else if (state.status === 'idle') {
    actions.append(uiButton('下载', true, () => { void startStoreDownload(app, true); }));
  }
  // downloading / saving 期间不展示按钮，避免重复下载

  root.append(head, desc, progress, status, actions);
  if (state.status === 'done' || installedStore.has(storeSdPath(app))) root.append(buildStoreSettings(app));
  return root;
}

/** 后台刷新在线商店列表：成功后写缓存并更新界面；失败且无任何数据时退回“全部”。 */
async function syncStoreList(): Promise<void> {
  if (storeLoading || !storeSupported) return;
  storeLoading = true;
  storeError = '';
  render();
  try {
    const apps = await fetchStoreList();
    storeApps = apps;
    storeSource = 'online';
    storeLastUpdated = Date.now();
    await saveCachedStoreList({ savedAt: storeLastUpdated, apps });
  } catch (error) {
    storeError = errorText(error);
  } finally {
    storeLoading = false;
    rebuildCategories();
    if (storeSource === 'none' && category === STORE_CATEGORY) {
      category = '全部';
      rebuildCategories();
      render();
      count.textContent = `在线商店暂不可用：${storeError}`;
      scheduleEnrich(games);
      return;
    }
    render();
  }
}

function rebuildCategories(): void {
  const names = ['全部', ...new Set(games.map(game => game.category ?? '经典游戏'))];
  if (storeSupported) names.unshift(STORE_CATEGORY);
  if (!names.includes(category)) category = names[0] ?? '全部';
  categories.replaceChildren(...names.map(name => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.setAttribute('aria-pressed', String(name === category));
    button.addEventListener('click', () => {
      category = name;
      for (const item of Array.from(categories.querySelectorAll('button'))) item.setAttribute('aria-pressed', String(item === button));
      if (name === STORE_CATEGORY && storeSource === 'none' && !storeLoading && !storeApps.length) void syncStoreList();
      if (name !== STORE_CATEGORY) {
        if (storeOpenKey) closeStorePanel();
        scheduleEnrich(games);
      }
      render();
    });
    return button;
  }));
}

function failInstall(error: unknown): void {
  const text = error instanceof Error ? error.message : String(error);
  count.textContent = `无法安装本地游戏：${text}`;
  if (kaios) showAlert('安装失败', text, bindCatalogKeys, bindCatalogKeys);
}

async function installMrp(blob: Blob, filename: string): Promise<void> {
  const name = fileBaseName(filename || 'game.mrp');
  if (!isMrpFilename(name)) throw new Error('请选择 .mrp 文件');
  count.textContent = `正在安装 ${name}…`;
  const bytes = await readBlobBytes(blob);
  if (!bytes.length) throw new Error('文件是空的');
  const path = sdPath('games', name);
  await saveSdFile({ path, bytes, modified: (blob as File).lastModified || Date.now() });
  focusedName = path;
  location.assign(playerHref({ id: 0, name: path, local: true }));
}

function pickLocalMrp(): void {
  localFile.value = '';
  localFile.click();
  if (kaios) refreshListFocus();
}

function deleteFocused(): void {
  const game = focusedGame();
  if (!game) return;
  deleteGame(game);
}

function exitApp(): void {
  showAlert('退出', '确定退出 flymrp？', () => { window.close(); }, () => { setSoftkeys('菜单', container.querySelector('.game-card') ? '启动' : '安装', '退出'); });
}

function openCatalogMenu(): boolean {
  openMenu([
    { label: '启动游戏', action: () => { launchFocused(); } },
    { label: '安装 MRP', action: pickLocalMrp },
    { label: '删除游戏', action: deleteFocused },
    { label: '刷新列表', action: () => { void load(); } },
    { label: '关于', action: () => showAlert('关于', 'flymrp · KaiOS 2.x\n菜单「安装 MRP」选择文件，装完立刻开玩。\n已安装的游戏会出现在列表最上面。') },
    { label: '退出', action: exitApp },
  ]);
  return true;
}

function bindCatalogKeys(): void {
  setKaiOSPageKeys({
    up: () => { const current = moveFocus(container, '.game-card', -1); focusedName = current?.getAttribute('data-name') ?? focusedName; return true; },
    down: () => { const current = moveFocus(container, '.game-card', 1); focusedName = current?.getAttribute('data-name') ?? focusedName; return true; },
    enter: () => {
      if (!container.querySelector('.game-card')) { pickLocalMrp(); return true; }
      return launchFocused();
    },
    softLeft: openCatalogMenu,
    softRight: () => { exitApp(); return true; },
    back: () => { exitApp(); return true; },
  });
  refreshListFocus();
}

async function load(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>('#refresh-library')!;
  button.disabled = true;
  try {
    const [files, bundled, cached] = await Promise.all([
      listSdFiles().catch(() => [] as SdFile[]),
      readLibrary(),
      storeSupported ? readCachedStoreList() : Promise.resolve(null),
    ]);
    installedStore = new Set<string>();
    for (const file of files) {
      if (file.path.indexOf(`${STORE_DIR}/`) === 0) installedStore.add(file.path);
    }
    games = installedGamesFromSd(files).concat(bundled);
    document.querySelector('#total-count')!.textContent = String(games.length);
    if (cached && cached.apps.length) {
      storeApps = cached.apps;
      storeSource = 'cache';
      storeLastUpdated = cached.savedAt || 0;
    }
    rebuildCategories();
    render();
  } catch (error) { count.textContent = errorText(error); }
  finally { button.disabled = false; }
  void syncStoreList();
  if (category !== STORE_CATEGORY) scheduleEnrich(games);
}

function applyTheme(mode: string): void {
  const resolved = mode === 'dark' || (mode !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  document.documentElement.dataset.theme = resolved;
  try {
    localStorage.setItem('flymrp.theme-mode', mode);
    localStorage.setItem('flymrp.theme', resolved);
  } catch {}
}

function loadGlobalPrefs(): void {
  const theme = document.querySelector<HTMLSelectElement>('#theme')!;
  let mode = 'auto';
  try { mode = localStorage.getItem('flymrp.theme-mode') ?? (localStorage.getItem('flymrp.theme') ?? 'auto'); } catch {}
  if (mode !== 'light' && mode !== 'dark' && mode !== 'auto') mode = 'auto';
  theme.value = mode;
  applyTheme(mode);
  for (const id of prefIds) {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (!select) continue;
    const saved = readPref(id);
    if (saved && Array.from(select.options).some(option => option.value === saved)) select.value = saved;
  }
  const bg = (() => { try { return localStorage.getItem('flymrp.game-bg') ?? ''; } catch { return ''; } })();
  for (const dot of Array.from(document.querySelectorAll<HTMLElement>('#bgColorPicker .color-dot'))) {
    dot.classList.toggle('active', (dot.dataset.color ?? '') === bg);
  }
}

function bindGlobalPrefs(): void {
  document.querySelector<HTMLSelectElement>('#theme')!.addEventListener('change', event => {
    applyTheme((event.currentTarget as HTMLSelectElement).value);
  });
  for (const id of prefIds) {
    document.getElementById(id)?.addEventListener('change', event => {
      writePref(id, (event.currentTarget as HTMLSelectElement).value);
    });
  }
  for (const dot of Array.from(document.querySelectorAll<HTMLElement>('#bgColorPicker .color-dot'))) {
    dot.addEventListener('click', () => {
      const color = dot.dataset.color ?? '';
      try { if (color) localStorage.setItem('flymrp.game-bg', color); else localStorage.removeItem('flymrp.game-bg'); } catch {}
      for (const item of Array.from(document.querySelectorAll('#bgColorPicker .color-dot'))) item.classList.toggle('active', item === dot);
    });
  }
}

function exportConfig(): void {
  const data: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key.indexOf('flymrp.') !== 0) continue;
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    }
  } catch {}
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'flymrp-config.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importConfig(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result)) as Record<string, unknown>;
      for (const [key, value] of Object.entries(data)) {
        if (key.indexOf('flymrp.') !== 0 || typeof value !== 'string') continue;
        localStorage.setItem(key, value);
      }
      loadGlobalPrefs();
      if (selected) fillPrefs('ds', selected);
      count.textContent = '配置已导入';
    } catch (error) {
      count.textContent = `无法导入配置：${error instanceof Error ? error.message : String(error)}`;
    }
  };
  reader.readAsText(file);
}

function switchTab(tabName: string): void {
  closeStoreSheet();
  document.querySelectorAll('.tab-view').forEach(tab => tab.classList.toggle('active', tab.id === `tab-${tabName}`));
  document.querySelectorAll('.bottom-nav-item, .rail-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tabName);
  });
  const titles: Record<string, string> = { games: '游戏列表', settings: '设置' };
  const title = titles[tabName] ?? '游戏列表';
  document.querySelector('#topBarLargeTitle')!.textContent = title;
  document.querySelector('#topBarSmallTitle')!.textContent = title;
  fab.classList.toggle('hidden', tabName !== 'games');
  const hideDetail = tabName !== 'games';
  document.querySelector('#desktopDetail')!.classList.toggle('hidden', hideDetail);
  document.querySelector('#topAppBar')!.classList.toggle('no-detail', hideDetail);
  document.querySelector('.page-layout')!.classList.toggle('no-detail', hideDetail);
  window.scrollTo({ top: 0 });
}

function onPickedFile(input: HTMLInputElement): void {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  input.disabled = true;
  void installMrp(file, file.name).catch(failInstall).then(() => { input.disabled = false; });
}

search.addEventListener('input', render);
document.querySelector('#refresh-library')!.addEventListener('click', () => { void load(); });
document.querySelector('#choose-local')!.addEventListener('click', pickLocalMrp);
document.querySelector('#open-player')!.addEventListener('click', () => { location.assign('./main.html'); });
document.querySelector('#export-config')!.addEventListener('click', exportConfig);
document.querySelector('#import-config')!.addEventListener('click', () => { configFile.value = ''; configFile.click(); });
configFile.addEventListener('change', event => {
  const file = (event.currentTarget as HTMLInputElement).files?.[0];
  if (file) importConfig(file);
});
localFile.addEventListener('change', event => onPickedFile(event.currentTarget as HTMLInputElement));
fab.addEventListener('click', pickLocalMrp);
document.querySelector('#detailRun')!.addEventListener('click', () => { if (selected) launchGame(selected); });
document.querySelector('#detailClearData')!.addEventListener('click', () => {
  if (!selected) return;
  confirmAction('清除数据', `清除 ${gameTitle(selected)} 的独立设置和相关存档？`, () => {
    void clearGameData(selected!).then(() => { if (selected) fillPrefs('ds', selected); });
  });
});
detailDelete.addEventListener('click', () => { if (selected) deleteGame(selected); });
document.querySelector('#dsSave')!.addEventListener('click', () => { if (selected) savePrefsFrom('ds', selected); });
document.querySelector('#dsReset')!.addEventListener('click', () => {
  if (!selected) return;
  clearGamePrefs(selected.name);
  fillPrefs('ds', selected);
});
for (const [, ds] of gamePrefMap) {
  document.getElementById(ds)?.addEventListener('change', () => { if (selected) savePrefsFrom('ds', selected); });
}

document.querySelector('#asRun')!.addEventListener('click', () => { if (sheetGame) launchGame(sheetGame); });
document.querySelector('#asSettings')!.addEventListener('click', () => { if (sheetGame) openGameSheet(sheetGame); });
document.querySelector('#asClearData')!.addEventListener('click', () => {
  if (!sheetGame) return;
  const game = sheetGame;
  closeActionSheet();
  confirmAction('清除数据', `清除 ${gameTitle(game)} 的独立设置和相关存档？`, () => { void clearGameData(game); });
});
asDelete.addEventListener('click', () => {
  if (!sheetGame) return;
  const game = sheetGame;
  closeActionSheet();
  deleteGame(game);
});
document.querySelector('#asCancel')!.addEventListener('click', closeActionSheet);
overlay.addEventListener('click', event => {
  if (event.target !== overlay) return;
  if (!storeSheet.hidden && storeSheet.classList.contains('active')) closeStoreSheet();
  else closeActionSheet();
});
storeSheetClose.addEventListener('click', closeStoreSheet);
document.querySelector('#gsSave')!.addEventListener('click', () => {
  if (sheetGame) savePrefsFrom('gs', sheetGame);
  closeActionSheet();
});
document.querySelector('#gsReset')!.addEventListener('click', () => {
  if (!sheetGame) return;
  clearGamePrefs(sheetGame.name);
  fillPrefs('gs', sheetGame);
});

for (const item of Array.from(document.querySelectorAll<HTMLElement>('[data-tab]'))) {
  item.addEventListener('click', () => switchTab(item.getAttribute('data-tab') ?? 'games'));
}

const topBar = document.querySelector('#topAppBar')!;
let scrolled = false;
window.addEventListener('scroll', () => {
  const y = window.pageYOffset;
  if (!scrolled && y > 30) { scrolled = true; topBar.classList.add('scrolled'); }
  else if (scrolled && y < 5) { scrolled = false; topBar.classList.remove('scrolled'); }
}, { passive: true });

loadGlobalPrefs();
bindGlobalPrefs();
const initTab = new URLSearchParams(location.search).get('tab');
if (initTab) switchTab(initTab);
if (kaios) {
  applyTheme('dark');
  bindCatalogKeys();
}
void load();

// ---- PWA：Service Worker 注册与版本更新 ----
// 目录页采用 "reload" 策略：新构建的版本号写入 sw.js，浏览器检测到脚本变化后
// 安装新缓存，激活时清除旧版本缓存并刷新目录页，保证线上更新及时生效。
registerServiceWorker("reload");
// 注：.mrp 的 PWA File Handling（系统“打开方式”）已指向 ./main.html，
// 由播放器页直接接收文件并运行，不再经过目录页。
