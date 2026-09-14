# EdgeOne Blob 与小体积部署包

目标项目 `flymrp`（`makers-gciglthrse9a`），域名 `flymrp-bgoitpfz.edgeone.cool`，命名空间 `my-store`。工作目录 `/Users/zixing/Documents/zixing/github/flymrp`。

## 直接上传的文件

使用 `artifacts/edgeone/flymrp-edgeone.zip`，不要压缩完整 `dist` 上传。当前 ZIP 为 **250407 字节**，共 28 个 ZIP 条目，根目录直接包含 `index.html` 和 `edge-functions/`。其内容仅包括网页、前端脚本、PWA 图标、许可证、必要配置和已打包的函数。

官方说明：[直接上传](https://pages.edgeone.ai/document/direct-upload)。直接上传不会执行 `npm install`，因此打包器使用 esbuild 将 Blob SDK 和分片清单全部并入函数，检查没有未解析的模块导入。保留 SDK 的平台部署凭据占位符与环境回退；用户 API token 不进入 ZIP。正式生产部署尚未执行，包内函数已通过本地部署环境模拟及实际 Blob 读取验证。

## 已迁入 Blob 的数据

- 2640 个商店 MRP、1286 个不同图标，保持 `mrp-files/`、`mrp-icon/` 路径。
- 12 个商店资源 ZIP。
- 完整构建中的 **16509 个运行资源文件**，使用 `runtime/` 前缀，包括 `mythroad_res`、字体、系统组件、游戏索引和配置。先前单独上传的 73 个大文件也包含在这 16509 项中。
- 18 个超过 2000000 字节的文件保留分片协议：33 个去重分片，每片最多 1900000 字节。

15 条目录或文件级改写规则，将原静态资源 URL 转到同域 `/blob/runtime/`。游戏和资源索引也在 Blob，PWA 请求地址保持有效。游戏数据不在部署 ZIP 内。

原始 `dist/` 保留完整静态构建；`artifacts/edgeone/deploy/` 是小体积部署目录。打包器验证每个迁出的文件与上传日志中的 SHA-256 一致，拒绝未上传、内容已变化或缺少已验证分片的文件。

## 上传、编译与打包

API token 仅通过环境变量或仓库外私有文件读取。首次上传完整商店、图标和商店资源：

```sh
EDGEONE_TOKEN_FILE=/path/to/private-token npm run upload:edgeone -- --resources
```

构建后更新所有运行资源，再生成分片、ZIP 和验证：

```sh
MRP_GAME_DIR=./mrpfile MRP_RESOURCE_DIR=/path/to/mythroad_res npm run build:edgeone
EDGEONE_TOKEN_FILE=/path/to/private-token npm run upload:edgeone:runtime
EDGEONE_TOKEN_FILE=/path/to/private-token npm run chunk:edgeone
npm run prepare:edgeone
EDGEONE_TOKEN_FILE=/path/to/private-token \
EDGEONE_FUNCTION_PATH='artifacts/edgeone/deploy/edge-functions/blob/[[path]].js' \
npm run verify:edgeone
```

`prepare:edgeone` 自动生成 ZIP，并强制要求大小小于 **25000000 字节**。先在临时目录完成产物，再替换部署目录，避免中途失败损坏上一份部署包。普通构建仍使用原商店来源；`build:edgeone` 使用同域 `/blob`。

## 验证证据

- `artifacts/edgeone/uploaded.jsonl`：逐对象字节数、SHA-256、强一致性回读时间。
- `runtime-summary.json`：16509 项已完成、缺失 0、失败 0。首轮 25 项回读未通过，重试后均通过，没有把它们跳过。
- `chunks-verified.jsonl`：分片上传校验。
- `zip-verification.json`：ZIP CRC、文件内容及 16509 条资源路径覆盖验证，凭据泄漏 0。
- `packaged-download-verification.json`：使用 ZIP 内同一打包函数和实际云端数据，本地模拟15条改写规则；18 个分片文件及 6 个索引/组件共 24 项字节校验通过，65 次请求，最大响应 1900000 字节。
- `package-summary.json`：ZIP 路径、大小和规则数。

本次相关 15 项测试及 TypeScript 检查通过。图标中部分文件虽然名为 `.png`，实际为 BMP；保持原始字节并返回真实 Content-Type。下载器支持失败重试、每片及合并文件的长度/MD5 校验；上传与独立下载验证额外使用 SHA-256。

详情汇总见 `docs/edgeone-upload-report.json`。本轮仅上传资源、准备部署包，未更新生产网站。
