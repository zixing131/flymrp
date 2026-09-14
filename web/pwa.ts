/**
 * PWA Service Worker 注册（index.html 与 main.html 共用）。
 * 只在生产构建注册（开发服务器没有 sw.js）；注册失败时静默降级。
 *
 * 更新行为：
 *   - "reload"：新版本 SW 激活并接管页面后自动刷新（目录页用，保证线上更新及时生效）
 *   - "quiet"：新版本 SW 激活后不刷新（播放器页用，避免打断正在运行的游戏；
 *     用户返回目录页时由目录页的 reload 行为完成页面刷新）
 */
export function registerServiceWorker(behavior: "reload" | "quiet"): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  const swUrl = new URL("sw.js", document.baseURI).href;
  navigator.serviceWorker
    .register(swUrl, { scope: new URL("./", document.baseURI).href })
    .catch(() => { /* SW 不可用（如隐私模式）时静默降级 */ });
  if (behavior !== "reload") return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
}
