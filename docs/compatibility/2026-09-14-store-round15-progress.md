# 第十五轮：负坐标位图裁剪

检查 #2442「越狱吧吊丝」花屏时发现两处公共裁剪缺陷：

- `MrTableBridge.drawBitmap` 先按屏宽/高截断复制数量，再跳过负坐标像素。因此 242×322 位图从 (-1,-1) 画到 240×320 LCD 时，最右列和最下行没有更新。改为求原始目标矩形与 LCD 的交集，再以原始位图宽度计算源偏移。
- `copyLcdDirtyRect` 先将负起点改为零，再加宽高，扩大了实际刷新区域。改为分别裁剪原始矩形的两个端点；完全位于屏外的矩形不再修改 LCD。

新增三项回归测试，分别覆盖跨四边的位图复制、负起点局部刷新、完全位于左侧或上方的刷新。三项测试均先在旧实现失败，再在修复后通过；既有 HUD 保留测试继续通过。单元测试 **857 passed、1 skipped**，类型检查通过。

## 回归与构建

- `artifacts/compat-20260914/round15-full/results.json`：2640 项全部完成，2422 input-smoke-passed、115 static-frame、62 exited、35 runtime-error、6 black-screen。冻结清单哈希与第十三轮一致，逐 caseId 分类变化 0 项，比较证据为 `round15-probes/full-comparison.json`。
- `round15-gameplay/results.json`：11 项全部 passed，包括两款 2048、黑白棋 AI、华容道、排列数字、三国英雄传（512 KiB）、接水管、夏日 MM 连连看、梦幻西游、俄罗斯方块及别踩白块。该批清单修正了第十三轮 603 项的历史相对路径错误。
- `MRP_GAME_DIR=/Users/zixing/Documents/zixing/github/flymrp/mrpfile npm run build:edgeone` 及 `npm run prepare:edgeone` 通过。首次裸命令使用外部游戏大集结目录，缺少当前精选清单中的白跑分；按现有 `build.sh` 的游戏目录重跑通过，原包哈希与清单相同，未修改精选清单。
- 最新 ZIP 为 847930 字节，CRC 校验通过，包含 16509 个 Blob 运行资源引用及 15 条别名规则。未部署网站。

## #2442 仍未结案

`artifacts/compat-20260914/round15-probes/graphics2442.ts` 在未修复代码上采集 `round15-2442-before` 场景。记录 476 次 table[29] 呈现、1 次普通 table[120] 复制、0 次 table[121] 仿射绘图。所有呈现坐标非负，主要为整屏呈现，故本轮负坐标修复不能作为该游戏花屏的结案依据。修复后 `round15-2442-after/results.json` 仍为 `needs-scene-review`，所有检查点图像哈希与修复前一致。后续需追踪游戏直接写入帧缓冲的数据来源。

原 313 项累计结案保持 **11 项**，剩余 **302 项**。
