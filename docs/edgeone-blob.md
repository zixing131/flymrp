# EdgeOne Blob 部署

目标项目 `flymrp`（`makers-gciglthrse9a`），预设域名 `flymrp-bgoitpfz.edgeone.cool` 已由项目 API 确认。命名空间为 `my-store`。本轮只上传数据并准备部署文件，网页正式部署由用户后续执行。

使用官方 `@edgeone/pages-blob` SDK。依据：[官方文档](https://cloud.tencent.com/document/product/1552/131425)。API token 只从环境变量或仓库外的私有文件读取；Edge Functions 自动使用部署身份，浏览器不接收 token。

## 文件清单和核验

源清单：`artifacts/compat-20260914/store-manifest.json`。2640 个 MRP，890548248 字节，1286 个不同图标。上传保留 `mrp-files/`、`mrp-icon/` 路径。商店目录 `api/list.json.gz` 不包含本地路径，仅在所有 MRP 和图标核验完成后发布。

上传器逐个验证 MRP 原始 MD5，上传后以强一致性读取并比较 SHA-256。远端已存在的文件不会直接覆盖，必须校验相同。支持凭借本地日志断点续传，结束时再次列出远端核对缺失文件。

- `artifacts/edgeone/uploaded.jsonl`：逐对象大小、SHA-256、校验时间。
- `artifacts/edgeone/summary.json`：MRP/图标批次结果。
- `artifacts/edgeone/summary-extras.json`：资源包/大文件批次结果。

```sh
EDGEONE_TOKEN_FILE=/path/to/private-token npm run upload:edgeone
EDGEONE_TOKEN_FILE=/path/to/private-token npm run upload:edgeone -- --extras-only --resources --large
```

不要把 token 填入命令行参数、前端环境变量或提交到 Git。

## 后续构建和部署

```sh
MRP_GAME_DIR=./mrpfile MRP_RESOURCE_DIR=/path/to/mythroad_res npm run build:edgeone
```

`build:edgeone` 把商店来源设为同域 `/blob`，普通构建保持原商店来源。旧 IndexedDB 商店缓存读取时也会重新生成下载和图标地址。

部署须包含根目录 `edge-functions/blob/[[path]].js`、`edgeone.json` 和构建的静态文件；只上传旧版静态 dist 不会安装 Blob 路由。该函数允许 GET/HEAD，校验路径前缀，流式返回原始二进制字节，设置 PNG/WASM/JSON 类型并支持 ETag。MRP 图标地址示例：`https://flymrp-bgoitpfz.edgeone.cool/blob/mrp-icon/TAN.png`（新函数部署后生效）。

目前生产站未发布上述函数，不能把当前站点 HTTP 响应作为新路由上线证据。

## 本轮完成结果（2026-09-14）

- 2640 个 MRP、1286 个图标：全部上传并以强一致性回读校验通过。
- 12 个商店资源 ZIP、73 个超过 1 MB 的构建资源：全部上传并校验通过。
- 按 2,000,000 字节检查，发现 18 个超限文件：2 个 MRP、15 个构建资源、1 个 ZIP。最大文件为 7,108,100 字节的字体。
- 上述文件拆成 33 个去重分片，每片最多 1,900,000 字节；上传后逐片核验 SHA-256。原对象保留，但新下载路由对大文件返回分片清单。
- 客户端通过分片清单逐片下载、最多重试三次，校验每片及完整文件的长度和 MD5。异步商店下载、启动字体预载、Worker 同步资源加载均支持该协议。
- 使用实际云端数据在本地运行同一 Edge 函数及前端下载器，18 个文件的合并 SHA-256 全部与原文件相同。共 59 次请求，最大响应 1,900,000 字节。
- 部分图标扩展名是 `.png`，实际内容为 BMP。保留源文件字节，服务端检测真实图片类型并返回正确的 Content-Type。

完整核验报告：`docs/edgeone-upload-report.json`。25 项相关测试、TypeScript 类型检查、EdgeOne 前端构建和 Edge 函数打包均通过。

后续修改文件后，重新运行上传、分片、验证和准备步骤：

```sh
EDGEONE_TOKEN_FILE=/path/to/private-token npm run chunk:edgeone
EDGEONE_TOKEN_FILE=/path/to/private-token npm run verify:edgeone
npm run prepare:edgeone
```

准备好的完整部署目录是 `artifacts/edgeone/deploy`：包含静态网页、Edge 函数、分片清单及 73 条大文件改写规则，已移除远端验证过的大文件副本。打包程序会拒绝缺少已核验分片的大文件。普通 `dist` 仍保留本地静态发布所需的资源。

后续在 CLI 登录或设置 `EDGEONE_PAGES_API_TOKEN` 后，可手动部署：

```sh
npx edgeone@1.6.39 makers deploy artifacts/edgeone/deploy --name flymrp --env production
```

此命令尚未执行；当前生产站未更新。
