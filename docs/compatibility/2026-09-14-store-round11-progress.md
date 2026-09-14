# 第十一轮：数学达人结算复现与等待场景

本轮没有修改模拟器或网页运行逻辑，没有新增结案项。原 313 项仍为 10 项结案、303 项未解决。

## 数学达人（1908）

固定 320×480 配置，第一题选择 5 和 15 得到 2 分，等待结算后点击 (160,247) 选择“再来一次”。截图 `round11-confirm-down/2-control4.png` 和 `2-control5.png` 均显示第一项选中；随后按下确认 (100,440)，游戏在释放之前抛出 `LuaRuntimeError: Exiting...`。864 ticks，原始结果为 exited，保持未解决。

这修正了第十轮文档“选择到离开游戏”的推断：第一项选中时也会退出，不能仅归因于误选第二项。此前对释放事件切换选项的怀疑也没有得到纯等待探针支持。选择第二项并确认同样退出（`round11-second-confirm`）；软左键没有确认效果（`round11-key-confirm`）。尚未定位到具体运行时缺陷或包内逻辑，不能声称已修复触控或重开。

该包 SHA-256 为 `8d950b6d9d3c36eb517f39d985111cf5bac49c51705ff399f6a70e4c1844a044`。`start.mr` 为 Lua 字节码，另外包含 native EXT 和带有 `panel.ResultPanel` 类名的 `sky.skf`；目前没有可读的结算 Lua 源码。

证据目录均位于 `artifacts/compat-20260914/`。可复现场景为 `round11-probes/confirm-down.json`，清单为 `round10-probes/manifest.json`，运行 `collection-test.ts --only=2` 并设置 `MRP_TEST_PRODUCTION=1`。所有探针保留原始失败分类。

## 测试工具改进与回归

`tools/real/collection-test.ts` 增加 `{ "idle": ticks }` 场景动作：只推进时间，不注入触屏或按键。等待不增加 keysTested/inputChanges/controlChanges，其截图也不能用作 controlSha256 的交互认证。这样可以独立检查释放后的行为，不再借用无关点击等待回合结束。

- `round11-idle-only`：接水管进入关卡后只等待，5182 ticks、controlChanges=0、interactionVerified=false，正确得到 no-input-response。
- `round11-pipe-regression`：接水管既有场景 passed，2690 ticks、2 次有效变化。
- `round11-puzzle-regression`：黑白棋 AI、华容道、排列数字三个既有场景全部 passed，分别 2631/2681/2815 ticks。
- `npx tsc --noEmit` 通过。

运行时代码未变，最新全量快照与部署包仍采用第八轮。本轮未重新构建 dist，也未将等待动画或结算页面计为新增兼容通过项。
