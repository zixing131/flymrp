# 第十轮：接水管关卡操作与数学达人重开检查

本轮未修改运行时或网页源码，继续针对第九轮未结案项补充有效操作证据。

## 1024 接水管：实际关卡操作通过

正式证据 `artifacts/compat-20260914/round10-pipe-reviewed/results.json`，complete/allPassed 均为 true。2690 ticks、215.2 秒虚拟时间、2 次控制画面变化，无运行异常，场景及交互指纹通过。

触屏通过教学后进入实际关卡。点击 (68,28) 后左上方水管的方向变化：`1-entry4.png` 与 `1-control1.png` 可直接对比；第二次指定点击同样有画面变化。持续运行期间关卡及计时保持工作。验证范围是关卡内实际旋转和持续运行，不声称已接通全部水管或完成全部关卡。

冻结包、资源与场景哈希保存在结果中；场景为 `round10-probes/pipe-reviewed.json`，清单为 `round10-probes/pipe-manifest.json`。原默认按键冒烟仍为 static-frame，正式全量快照不改写。

## 1908 数学达人：答题有效，重开仍需核实

`round10-math-answer/results.json` 与截图证明，在第一道加法题中选择 5 和 15 后分数由 0 增加至 2。游戏帮助说明正确答案加 2 分，与观察一致。较早根据另一时刻数字选择的探针未得分，不能当作已确认的运行时故障。

随后等待正常回合结束，游戏显示当前得分 2 分和“再来一次/离开游戏”的选择界面。`round10-lifecycle` 中尝试点击再来一次再确认，却选中了离开游戏并产生正常退出（`LuaRuntimeError: Exiting...`）。目前未区分输入坐标/场景设计问题与实际交互实现问题，故保持 **resolved:false**。不能把正确答题一次直接代替完整生命周期验证，也不能把此次选择退出直接断言为模拟器崩溃。

相关证据：`round10-help/2-entry1.png`、`round10-math-answer/2-control2.png`、`round10-math-answer/2-sustained.png`、`round10-lifecycle/2-failure.png`，目录均位于 `artifacts/compat-20260914/`。

## 台账

原 313 项累计结案 **10 项**，剩余 **303 项**。本轮仅增加正式场景证据与文档；最近全量测试和 dist 仍采用第八轮，未对相同源码重复构建或重复全量测试。历史回退和其余未解项保持原记录。
