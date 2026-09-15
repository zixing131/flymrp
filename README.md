# flymrp

Browser-native Mythroad MRP runtime.

在浏览器中运行 Mythroad MRP 应用，支持在线商店、本地 MRP 文件、触屏与键盘输入、自动或手动分辨率，以及 PWA 安装。

## 本地开发

```bash
npm install
npm start

# 开发时按需从本机游戏目录读取精选游戏
MRP_GAME_DIR='/path/to/mrp-games' npm start
```

## 构建完整静态站

`dist/` 是完整静态站，包含精选游戏、手持机运行时和 `mythroad_res` 资源。它适用于本地或普通静态托管，也是 EdgeOne Blob 运行时资源的上传源。

```bash
MRP_GAME_DIR='/path/to/mrp-games' \
MRP_RESOURCE_DIR='/path/to/mythroad_res' \
npm run build
```

构建会校验精选游戏清单、文件哈希和发布目录大小。完成后，将整个 `dist/` 上传到 GitHub Pages 或其他静态托管即可；不需要 Node 服务。

## 构建 EdgeOne 前端壳

EdgeOne 使用独立的 `dist-edgeone/`。它只包含网页、PWA 文件和前端代码，通常约数百 KB；游戏、字体、插件、系统文件和游戏资源会从同域 `/blob/runtime/` 按需加载。

```bash
npm run build:edgeone
```

## 生成 EdgeOne 部署包

部署包需要完整运行时源和轻量网页壳。按顺序执行：

```bash
# 1. 完整运行时源：上传 Blob 前必须生成
MRP_GAME_DIR='/path/to/mrp-games' \
MRP_RESOURCE_DIR='/path/to/mythroad_res' \
npm run build

# 2. 轻量网页壳
npm run build:edgeone

# 3. 上传或更新 Blob 运行时资源
EDGEONE_TOKEN_FILE='/path/to/private-token' npm run upload:edgeone:runtime
EDGEONE_TOKEN_FILE='/path/to/private-token' npm run chunk:edgeone

# 4. 打包网页壳、Blob 中间件和兼容路由
npm run prepare:edgeone
```

最终部署文件是 `artifacts/edgeone/flymrp-edgeone.zip`。上传整个 ZIP 到 EdgeOne Pages，不能只上传 `dist-edgeone/`。

ZIP 包含：

- 轻量网页壳 `dist-edgeone/`
- Blob/分片中间件 `edge-functions/blob/[[path]].js`
- 旧资源路径的兼容路由函数

ZIP 不包含大型运行时资源；`upload:edgeone:runtime` 和 `chunk:edgeone` 从完整 `dist/` 读取并上传这些资源。部署配置见 [edgeone.json](edgeone.json)，Blob 的验证与排错说明见 [docs/edgeone-blob.md](docs/edgeone-blob.md)。

## 使用说明

首页默认展示在线商店，列表来自 `https://mrpstore.gddhy.net/api/list.json.gz`，并缓存到浏览器 IndexedDB。下载完成的应用保存在浏览器内的 `games/store/`，由用户选择后运行。

也可以通过“打开 MRP 文件”直接运行本地文件；文件不会上传到服务器。游戏运行在独立 Web Worker 中。设置支持音量、旋转、缩放、运行倍速、暂停、重启、截图、键盘位置和全屏。

方向键或 WASD 移动，Enter 或空格确认，Q/E 为左右软键，数字键、`*` 与 `#` 对应原手机键盘。

## 测试

```bash
npm test
npm run typecheck
npm run build
npm run test:games -- '/path/to/mrp/collection' 40 /tmp/mrp-results.json
```

兼容性报告、未解决问题和网络资源约定见 [兼容性文档](docs/compatibility/2026-09-14-store.md)、[问题清单](docs/compatibility/2026-09-14-store-issues.md) 与 [本地下载和网络拦截](docs/network-interception.md)。

## 许可

本项目原创代码采用 **GNU Affero General Public License v3.0（AGPL-3.0-only）**，完整协议见 [LICENSE](LICENSE)。第三方依赖、字库、插件和游戏文件保留各自的权利与许可；组件来源见 [assets/README.md](assets/README.md)。
