# 第十二轮：数学达人重开零除数

本轮继续追踪第十一轮固定失败场景，没有修改运行时或游戏包。1908 数学达人仍未结案；原 313 项累计结案 10 项，剩余 303 项。

## 已确认的调用链

包 SHA-256：`8d950b6d9d3c36eb517f39d985111cf5bac49c51705ff399f6a70e4c1844a044`。配置 320×480，生产资源。沿用 `round11-probes/confirm-down.json`，首先答对第一题得 2 分，等待结算，选择再来一次，按下确认。

`round12-math-trace/failure-trace.json` 记录确认事件 `(type=2,p1=100,p2=440)` 经 Lua `dealevent`、native 801 进入 `arm_ext_call(1)`。捕获退出时的 LR 后，检查实际内存中的 ARM/Thumb 指令，定位到 native VM 取余路径，而不是直接的“离开游戏”处理。

具体指令：

- Thumb `0x2c1be6` 从 `[r7+0x10]` 读被除数，`0x2c1be8` 从 `[r6+0x10]` 读除数。
- `0x2c1bea` 调用 ARM 有符号除法辅助函数 `0x2bf4f0`，返回后 `0x2c1bee` 将余数 r1 写回。
- 辅助函数的零除数检测 `0x2bf544–0x2bf548` 跳入 `0x2bf5c8` 异常路径，随后进入退出处理。

`round12-math-operands/divides.json` 在辅助函数入口捕获了真实操作数。时钟 70288 的最后五次调用依次是：593477197 % 20、16975380 % 20、17 / 5、0 / 5、**17 % 0**。最后一次 LR 为 `0x2c1bef`。这是本轮确认的直接触发原因；零值在包内出题计算中如何产生、是否源于更早的模拟执行偏差，尚未定位完成。

因此应修正“正常选择退出”的早期判断：当前退出来自零除数异常路径。不能通过吞掉退出、强行让除零返回 0、或改用不会触发的输入场景把该项记为通过。

## 证据与复现

目录均位于 `artifacts/compat-20260914/`：

- `round12-math-exit`：退出寄存器、栈与调用者代码窗口。
- `round12-math-divide`：除法辅助函数代码、VM 上下文及字节码窗口。
- `round12-math-operands`：操作数环形记录及同场景失败截图；结果与无追踪的第十一轮一致。
- `round12-restart752/753/754`：分别将结算等待改为 752/753/754 ticks，三次均 exited；这些变体没有单独捕获操作数，不能据此声称全部在相同算式退出。
- `round12-probes/trace-runner.ts.txt`：临时追踪工具完整快照。复现时复制到 `tools/real/.round12-trace.ts` 以保持相对导入路径，设置 `MRP_TEST_PRODUCTION=1`、`MRP_TEST_MANIFEST=artifacts/compat-20260914/round10-probes/manifest.json`、`MRP_TEST_SCENARIOS=artifacts/compat-20260914/round11-probes/confirm-down.json`，以游戏目录和新证据目录为参数运行，附加 `--only=2`。结束后删除临时脚本。

分析沿用已加载的 ida-reverse 工作流原则，本机未使用 IDA；实际运行地址和代码由模拟器捕获，指令由本地 Capstone 解码。没有改动冻结包内容，也没有应用内存补丁。

下一步应追踪出题计算及 VM 中保存除数的对象，而非继续调整结算按钮坐标。本轮仅新增诊断证据，不重复构建相同运行时代码；全量快照和 dist 仍采用第八轮。
