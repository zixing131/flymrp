# 第十三轮：平台随机数重播种契约

修复 `mr_plat(1211)` 每次调用的重播种行为。原实现持续推进旧随机状态，现实现按 guest 当前运行时间播种后产生随机值，并将状态留给后续 `table[20]` 的 `mr_rand` 使用。

依据为 `/Users/zixing/Downloads/rxgj-main/src/mythroad/dsm.c:1982–1988`：`MR_GET_RAND` 先执行 `dsmInFuncs->srand(mr_getTime())`，再返回 `MR_PLAT_VALUE_BASE + dsmInFuncs->rand() % param`。本轮保留模拟平台选用的 LCG 算法，没有假定所有真实手机使用同一随机算法，也没有通过换游戏种子规避失败。

## 验证

- 新增契约测试：同一运行时间重新调用 1211 得到相同结果，即使中间调用过 mr_rand；1211 对共享状态的更新影响后续 mr_rand；更改运行时间改变结果。旧实现不能通过此测试。
- 单元测试 **854 passed、1 skipped**，类型检查通过。
- `artifacts/compat-20260914/round13-full/results.json`：冻结 2640 项全部完成，2422 input-smoke-passed、115 static-frame、62 exited、35 runtime-error、6 black-screen。清单哈希与第八轮相同，逐 caseId 比较分类 **0 项变化**，证据为 `round13-probes/full-comparison.json`。
- `round13-gameplay` 中九款既有实际操作场景 passed：黑白棋 AI、华容道、排列数字、两款 2048、三国英雄传（512 KiB 独立配置）、接水管、夏日 MM 连连看、梦幻西游。该批中的额外 603 项第一次因清单相对路径错误报 worker-error；保留原结果，纠正路径后单独在 `round13-tile` 验证 passed，不将原批次称为 allPassed。
- CPU 性能测试在 `round13-cpu` 完成 812 ticks，初次分数 215329，左软键重跑 212709，持续画面保留结果，无异常。由于真实时钟跑分会变化，保留原始 needs-scene-review，不伪造固定截图指纹通过。此处为人工截图复核。
- `npm run build:edgeone`、`npm run prepare:edgeone` 通过。`artifacts/edgeone/flymrp-edgeone.zip` 为 **716760 bytes**，ZIP CRC 检查通过，仍低于 25 MB。部署目录继续使用 16509 个已校验的 Blob 运行资源与 15 条别名规则。本轮没有部署网站。

## 数学达人仍未解决

修复后用相同指令入口追踪重跑，`round13-math-operands/divides.json` 再次捕获相同操作数，最终仍是 `17 % 0`，结果 exited。这证明本次重播种修复没有解决该包故障；不能据此为其结案，仍需继续追踪 native VM 中生成除数对象的逻辑。

原 313 项累计结案仍为 **10 项**，剩余 **303 项**。最新冒烟快照更新至第十三轮，但不以冒烟分类代替真实玩法验证。
