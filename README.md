# flymrp

Browser-native Mythroad MRP runtime.

2026-09-14：[在线商店 2640 项兼容性测试与修复报告](docs/compatibility/2026-09-14-store.md) · [剩余问题清单](docs/compatibility/2026-09-14-store-issues.md)。

[第二轮：430 项复测、持续运行与声音修复](docs/compatibility/2026-09-14-store-round2.md)

[第三轮：剩余 317 项复测与平台、GUI 修复](docs/compatibility/2026-09-14-store-round3.md)

[第四轮：313 项持续复查进展](docs/compatibility/2026-09-14-store-round4-progress.md)

本项目原创代码采用 **GNU Affero General Public License v3.0（AGPL-3.0-only）**，完整协议见 [LICENSE](LICENSE)。第三方依赖、字库、插件和游戏文件保留各自的权利与许可，不因本项目的协议声明而改为 AGPL；组件来源见 [assets/README.md](assets/README.md)。

当前 fork 精选清单随生成配置变化（本次为 1 个《白跑分》），在线商店提供约 2600 个 MRP 应用，支持按名称或类型搜索，也可直接打开玩家本地的 MRP 文件。支持按键与触屏输入、自动/手动分辨率。已修复屏幕尺寸全局变量导致的清屏残留，并支持封装游戏使用的内存 MRP 和 EXT 加载。兼容性仍在完善，不能保证所有 MRP 正常运行。

首页（目录页）默认打开 **在线商店** 分类：列表来自 `https://mrpstore.gddhy.net/api/list.json.gz`（gzip 压缩的 JSON，约 2600 个 MRP 应用，含图标、介绍、作者、分辨率与下载地址）。列表会缓存到浏览器 IndexedDB（`flymrp-store`）：再次打开先展示本地缓存、随后在后台请求 API 并写回缓存。点击条目后：桌面端在右侧（移动端在底部）展示该应用的信息与**下载进度**，下载完成后把 `.mrp` 存入 SD 卡 `games/store/` 并亮出“运行”按钮，由玩家点击后才交给网页内模拟器运行，不会直接跳转；已下载的条目再次点击直接显示“运行”。

“全部/我的游戏”里的本地与内置 MRP 包会通过 `src/mrp/archive.ts` 读取包内 `appname`（应用名）用于展示，并用包内 `appid` 按 32 进制大写规则（同商店：`appid` → `0123456789ABCDEFGHIJKLMNOPQRSTUV`）拼出 `https://mrpstore.gddhy.net/mrp-icon/<32进制>.png` 尝试显示真实图标，图标不存在或加载失败时回退为原文件名首字符；包信息缓存在本地 IndexedDB，避免每次重复读取整个 MRP 文件。在线商店依赖 `DecompressionStream`，KaiOS 2.x（Firefox 48）等老内核不支持时该分类自动隐藏、首页退回“全部”。

```bash
npm install
npm start
# 从本机游戏目录读取精选清单（开发时按需读取，构建时仅复制精选文件）
MRP_GAME_DIR='/Users/zixing/Downloads/mrp游戏大集结' npm start
```

生产构建自带用户提供的 `mythroad/` 资源快照，清单见 [assets/mythroad-manifest.json](assets/mythroad-manifest.json)。

一键静态打包：

```bash
./build.sh
# 其他机器可指定资源目录
MRP_GAME_DIR='/path/to/mrp-games' MRP_RESOURCE_DIR='/path/to/mythroad_res' ./build.sh
```

脚本安装锁定的依赖、检查 TypeScript 并生成根目录 `dist/`。精选清单固定在 [config/classic-games.json](config/classic-games.json)，包含益智休闲、街机动作、飞行射击、棋牌运动、角色策略等类型，以及指定的变形金刚、神兽传说 3、干柴烈火美女剑、神剑破千军和两份仙剑尘缘录版本。两份仙剑尘缘录内容相同，按用户指定的文件分别保留；清单共 100 个文件，不代表 100 个全部通过可玩性验证。原有 104 文件兼容性回归清单保持独立。

默认从 `/Users/zixing/Downloads/mrp游戏大集结` 中读取精选文件，只将它们复制到 `dist/games/`，并生成带显示名称、类型和内容哈希的 `games/index.json`。构建会检查文件是否存在、内容是否匹配清单，缺失或不匹配时中止。开发服务器启用游戏目录后也只展示精选清单中存在的游戏。

重复构建按 SHA-256 跳过未变化的游戏和资源。`dist/games/` 是构建专用目录，每次成功复制精选游戏后，会清理不在清单中的旧文件，避免此前 11,790 个游戏留在发布包里；原始下载目录不会删除或修改。请勿把个人文件放入 `dist/games/`。

默认将 `/Users/zixing/Downloads/mrp游戏大集结/mythroad_res` 的非隐藏常规文件增量复制到 `dist/mythroad_res/`。保留完整资源包，供精选游戏和玩家本地打开的游戏按需读取；这些资源中的 MRP 组件不加入精选游戏列表。当前精选游戏文件约 30.8 MB，完整资源约 391.3 MB。每次构建最后会校验实际游戏数量、哈希以及整个 `dist/` 的大小，超过 900 MB 会报错，为 GitHub Pages 的 1 GB 站点上限留出余量。

将整个 `dist/` 作为 GitHub Pages 的发布产物或上传其他静态托管即可，支持 `/flymrp/` 等子目录，不需要 Node 服务。GitHub Actions 无法读取你电脑上的 `/Users/...` 目录；当前流程应先在本机执行 `./build.sh` 生成完整产物，再发布产物，不能仅把源码推到 Pages 就自动获得游戏文件。

## 构建完整静态站与 EdgeOne 前端壳

`dist/` 是完整静态站，包含精选游戏、手持机运行时和 `mythroad_res` 资源；它用于本地/普通静态托管，也作为上传 EdgeOne Blob 运行时数据的源目录。先准备游戏与资源目录，再执行：

```bash
MRP_GAME_DIR='/path/to/mrp-games' \
MRP_RESOURCE_DIR='/path/to/mythroad_res' \
npm run build
```

构建完成后，`dist/` 中应有 `games/`、`system/`、`plugins/` 和 `mythroad_res/`。这一步会验证精选游戏清单和发布目录大小。

EdgeOne 使用分离的轻量前端壳。`npm run build:edgeone` 会生成 `dist-edgeone/`，不复制游戏、字体、插件、系统文件或游戏资源；这些内容在生产环境从同域 `/blob/runtime/` 按需下载。前端壳通常约数百 KB：

```bash
npm run build:edgeone
```

要生成可直接上传到 EdgeOne Pages 的 ZIP，需要先完成上面的完整构建，再构建前端壳并打包：

```bash
# 1. 生成完整运行时源，供 Blob 上传和 SHA-256 校验使用
MRP_GAME_DIR='/path/to/mrp-games' \
MRP_RESOURCE_DIR='/path/to/mythroad_res' \
npm run build

# 2. 生成数百 KB 的网页壳
npm run build:edgeone

# 3. 生成带 Edge Functions 的部署 ZIP
npm run prepare:edgeone
```

最终文件为 `artifacts/edgeone/flymrp-edgeone.zip`。它包含 `dist-edgeone/` 的网页壳、`edge-functions/blob/[[path]].js` 分片/Blob 中间件和兼容路由函数，不包含大型运行时资源。部署时上传整个 ZIP，而不是单独上传 `dist-edgeone/`。

首次部署或运行时资源变更时，先将完整 `dist/` 的资源上传到 Blob、再生成分片描述，最后打包并上传 ZIP：

```bash
EDGEONE_TOKEN_FILE='/path/to/private-token' npm run upload:edgeone:runtime
EDGEONE_TOKEN_FILE='/path/to/private-token' npm run chunk:edgeone
npm run prepare:edgeone
```

`upload:edgeone:runtime` 与 `chunk:edgeone` 仅读取完整 `dist/`；`prepare:edgeone` 仅读取 `dist-edgeone/` 作为网页壳，并校验 `dist/` 的运行时文件已经成功上传。部署配置在 [edgeone.json](edgeone.json)，更完整的 Blob 验证与排错说明见 [docs/edgeone-blob.md](docs/edgeone-blob.md)。

玩家通过“打开 MRP 文件”选择任意本地游戏即可运行，不受精选清单限制。该文件只在浏览器中读取，不上传到服务器；兼容性和缺少资源仍可能影响运行。

`index.html` 是独立游戏展示页，`main.html` 在播放器中执行游戏，也可直接打开后选择本地文件。界面与方向/数字键盘参考 myjump 的 javasrc：设置中提供音量与静音、旋转、实际画面刷新 FPS、自动适配或指定缩放、0.5–4 倍速、暂停、重启、截图、键盘左右布局和全屏。旋转后方向键及触屏坐标同步调整；显示、声音和速度偏好保存在浏览器中。

每个游戏在独立 Web Worker 中执行，长计算不会阻塞页面工具栏；挂断或切换游戏会直接终止旧线程。大量刷屏合并为最多约每 16 ms 一次显示消息，游戏内部仍执行全部绘制。FPS 统计浏览器实际呈现的帧数。

MIDI 默认使用 TinySynth GM，支持多种乐器、打击乐和 MIDI 控制器，无需在线下载音色库。也可选择“轻量方波”，切换时当前 MIDI 从头播放，选择保存在当前浏览器。TinySynth 使用 Apache-2.0 许可，随构建保留在 `licenses/`。网络拦截在后台运行，不向玩家展示调试配置。

网页入口已接入 Google AdSense 脚本，发布商 ID 为 `ca-pub-3251239894110421`，开发网页与静态构建均包含该脚本。

启用本地游戏库时，会自动读取该目录下的 `mythroad/`，把其中的字库、插件和已有下载资源按原相对路径挂载到游戏的内存文件系统。也可用 `MRP_SYSTEM_DIR=/path/to/mythroad` 单独指定。用户目录中的同名资源优先于内置组件；运行中的写入只影响本次会话。切换游戏时会刷新资源清单，批量兼容性测试使用同一目录并记录资源哈希。

打开终端显示的本地地址。方向键 / WASD 移动，Enter / 空格确认，Q / E 为左右软键；数字 0–9、*、# 对应原手机键盘。分辨率选择在下次加载时生效。普通上传模式下游戏在浏览器中运行；开发游戏库按需从本机服务器读取。

```bash
npm test
npm run typecheck
npm run build
npm run test:games -- '/path/to/mrp/collection' 40 /tmp/mrp-results.json
```

2026-09-07 完成两组各 40 个文件的抽测，覆盖 79 个不同路径、77 种文件内容。17 次输入冒烟通过，11 次游戏退出，4 次停在静态画面，48 次读取或运行报错。冒烟通过表示短流程内没有异常且按键期间画面有变化，**不等于游戏通关或完整可玩**。网页实玩步骤、限制和原始结果见 [本次兼容性记录](docs/compatibility/2026-09-07.md)。

网络地址拦截、下载映射与 `mythroad_res` 资源发布方式见 [本地下载与网络拦截](docs/network-interception.md)。

## 历史开发记录

Stage 5-C 收尾记录：guest inflate 完成；`arm_ext_call(0)` **NORMAL RETURN**；Lua **resumes**。Stage 5-C **COMPLETE**。Stage 5-D **STARTED**（event/frames/input 尚未闭环）。见 `docs/autonomous-progress.md`。
Stage 5-C.10R：生产 watchdog 下 guest inflate 完整完成；输出 SHA-256 与 reference gunzip 一致。当时停在 `table[30]`。见 `docs/stage5c10r-progress.md`。  
Stage 5-C.10Q：guest inflate 在 ARM/Thumb 内完成（1,404,897 insn）。可配置 ARM watchdog 默认 2e6 / 上限 20e6。当时生产停在 `table[30]`。见 `docs/stage5c10q-progress.md`。  
Stage 5-C.10P：实现 `table[9]` `memcmp2`（unsigned char，精确 `*su1-*su2`，early exit）。当时 LIVE gzip magic `1F 8B` equal，生产停在 ARM insn budget。见 `docs/stage5c10p-progress.md`。  
Stage 5-C.10N：`table[1]` / `mr_free` ownership + allocation header **只读取证**。当时**未实现** table[1]。当时生产停在 `table[1]`。见 `docs/stage5c10n-progress.md`。  
Stage 5-C.10M：实现 `table[3]` memcpy2（前向逐 byte，非 memmove）+ `table[10]` strcmp2（-1/0/1）。当时**未实现** `table[1]`。当时生产停在 `table[1]`。见 `docs/stage5c10m-progress.md`。  
Stage 5-C.10L：`table[3]` memcpy2 ABI + directory loop 只读取证，当时**未实现**。当时生产停在 `table[3]`。见 `docs/stage5c10l-progress.md`。  
Stage 5-C.10K：实现 current-pack 只读 file backend（table[40]/[44]/[45]/[41]）。当时生产停在 `table[3]` memcpy。见 `docs/stage5c10k-progress.md`。  
Stage 5-C.10J：current-pack file ABI 只读取证 + 只读 handle 设计。当时**未实现** table[40]/41+。当时生产停在 `table[40]`。见 `docs/stage5c10j-progress.md`。  
Stage 5-C.10I：实现 `table[100]` / `pack_filename` 128-byte data slot。当时生产停在 `table[40]`；LIVE filename 为 `"gssjxz.mrp"`。见 `docs/stage5c10i-progress.md`。  
Stage 5-C.10H：`table[40]` / `mr_open` 只读取证，**未实现**。当时空 filename 来自未写入的 `table[100]`。见 `docs/stage5c10h-progress.md`。  
Stage 5-C.10G：`table[17]` / `sprintf_` 仅 **literal + `%d`**。当时生产停在 `table[40]`。见 `docs/stage5c10g-progress.md`。  
Stage 5-C.10F：`table[17]` / `sprintf_` 只读取证，当时未实现。当时生产停在 `table[17]`。见 `docs/stage5c10f-progress.md`。  
Stage 5-C.10E：`table[33]` `mr_getTime` 接 `runtime.clock >>> 0`；当时停在 `table[17]`。见 `docs/stage5c10e-progress.md`。  
Stage 5-C.10D：`table[33]` / `asm_mr_getTime` 只读取证，**未实现**。当时生产停在 `table[33]`。见 `docs/stage5c10d-progress.md`。  
Stage 5-C.10C：`table[38]` 仅 `mr_platEx` code `0x4c6`（rxgj FULL `MR_SUCCESS`，无副作用）；真实 app 停在 `table[33]`。见 `docs/stage5c10c-progress.md`。  
Stage 5-C.10B：`table[130]` 仅 case 7（rxgj FULL）；当时停在 `table[38]`。见 `docs/stage5c10b-progress.md`。  
Stage 5-C.10A：真实 `app.mrp` 启动基线（实现 130 前停在 130）。见 `docs/stage5c10a-progress.md`。  
Stage 5-C.9：`table[38]` / `asm_mr_platEx` 只读取证，未实现。见 `docs/stage5c9-progress.md`。  
Stage 5-C.8：`mrc_init` 后继 BLX / `table[38]` platEx 取证，未实现。见 `docs/stage5c8-progress.md`。  
Stage 5-C.7：table[130] 返回值对 `mrc_init` 的依赖取证，未实现。见 `docs/stage5c7-progress.md`。  
Stage 5-C.6：table[130] / `asm_mr_TestCom` 只读取证，未实现。见 `docs/stage5c6-progress.md`。  
Stage 5-C.5：CONFIRMED table[14] memset ABI。见 `docs/stage5c5-progress.md`。  
Stage 5-C.4：恢复真实 cfunction.ext 初始化链。见 `docs/stage5c4-progress.md`。  
Stage 5-C.3：Real cfunction.ext Code-6 ABI Forensics。见 `docs/real-cfunction-code6.md`。  
Stage 5-C.2：Real EXT Loader ABI Wiring。见 `docs/stage5c2-progress.md`。  
Stage 5-C.1：Real Binary Readiness & Compatibility Gate。见 `docs/real-binary.md`。  
Stage 5-C：Mythroad 兼容层。见 `docs/stage5c-progress.md`。  
Stage 5-B：Mythroad Core Runtime。见 `docs/stage5b-progress.md`。  
Stage 5-A：MRP + Lua VM，见 `docs/stage5a-progress.md`。  
Stage 4：EXT ABI，见 `docs/stage4-progress.md`。  
后续可玩性回归见 `test/real/playable-gate.test.ts`。

```bash
npm test
npx tsx bench/run.ts
npx tsx tools/real/inspect.ts test/fixtures/real/app.mrp
npx tsx tools/real/startup-baseline.ts test/fixtures/real/app.mrp
npx tsx tools/real/forensics-33.ts test/fixtures/real/app.mrp
npx tsx tools/real/forensics-40.ts test/fixtures/real/app.mrp
npx tsx tools/real/forensics-3.ts test/fixtures/real/app.mrp
npx tsx tools/real/forensics-1.ts test/fixtures/real/app.mrp
```
