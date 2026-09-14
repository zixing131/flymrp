# 第十四轮：别踩白块触屏操作复核

接续上轮中断时保留的冻结清单和操作序列，重新执行生产资源模式测试。原包 SHA256 为 `40bcdff9d6a34f1a015fabc4167679cc915a271c603477e8775ee299e36cea7d`，未修改游戏包或运行时代码。

复跑命令：

```sh
MRP_TEST_PRODUCTION=1 \
MRP_TEST_MANIFEST=docs/compatibility/2026-09-14-round14-321-manifest.json \
MRP_TEST_SCENARIOS=docs/compatibility/2026-09-14-round14-321-scenes.json \
npx tsx tools/real/collection-test.ts /Users/zixing/Downloads/mrp游戏大集结 artifacts/compat-20260914/round14-321-resumed
```

结果 `passed`：1938 ticks（155.04 秒虚拟推进时间），48 次控制画面变化，无退出、运行错误或未知接口。人工复核截图：

- `1-control90.png`：第一局连续命中 45 块，首末命中相隔 70.4 秒。
- `1-control92.png`：漏块后正常结算，分数 45。
- `1-control93.png`：左软键重开，分数归零。
- `1-control96.png`：第二局再次有效得分，分数 1。

结果及原始截图保存在 `artifacts/compat-20260914/round14-321-resumed/`；清单和场景纳入版本控制。此次为触屏玩法证据补齐，默认键盘冒烟的 `static-frame` 分类保持原样，不宣称新增运行时修复。本轮未修改运行时代码，因此未重复第十三轮全量冒烟。

原 313 项累计结案 **11 项**，剩余 **302 项**。
