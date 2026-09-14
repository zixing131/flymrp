# 第十六轮：索引式 MRP 的陈旧包长度

修复 #1201「恋爱气球」因陈旧 `FileLen` 拒绝启动的问题。冻结包 SHA256 见 `artifacts/compat-20260914/round16-probes/length-manifest.json`；物理长度 331255 字节，包头仍报 365325 字节，但完整索引中的 9 个资源都落在实际文件内。

原生实现依据：`/Users/zixing/Downloads/rxgj-main/src/mythroad/mythroad.c:1434-1530` 的索引式读取先读取完整索引，再检查资源末尾不超过声明的 FileLen，最后实际读取所需资源；没有要求物理总长度等于声明长度。现在只对索引式包允许声明长度大于实际文件，仍以二者较小值限制每个资源，同时明确要求整个索引在界内，避免早停索引绕过尾部检查。保留原始包头元数据，未补零或修改原包。顺序式包保留原来的长度校验。

新增测试覆盖陈旧总长度、真正缺失资源字节、早停但索引尾部缺失。旧实现前者拒绝加载、第三项错误接受；修复后均符合预期。**860 项测试通过、1 项跳过，类型检查通过。**

## 真实样本

- #1201 在 `round16-length/results.json` 为 `needs-scene-review`，987 ticks，无运行异常，菜单能打开。但设为主题仍提示“设置失败”，不能将加载修复等同于主题功能完成，仍未结案。
- #947「激情冲动」实际只有 98304 字节，`cfunction.ext` 的 offset 84891、length 40085 超出实际文件，修复后仍被资源边界检查拒绝。详细测试器在构建 runtime 前解析失败，原始输出为 `worker-error`；不改写成通过。
- *G/*J 启动失败依赖未提供的原生 m0 注册槽内容；已有系统资源不能证明与这些槽对应，不将当前包冒充为依赖包。

## 最终验证

- 冻结 2640 项全量回归完成：2423 input-smoke-passed、115 static-frame、62 exited、34 runtime-error、6 black-screen。与第十五轮相比仅 #1201 从运行错误变为冒烟通过，无新增分类回退。清单哈希相同，结果和逐项对比为 `round16-full/results.json`、`round16-probes/full-comparison.json`。
- `round16-gameplay/results.json`：11 款既有实际操作场景全部 passed。
- 超时组使用网页 worker 同样的 `performance.now()` 时钟复核：#523、#2405 仍在原位置预算超限；#2057 吞食天地2 可启动并推进多段开场对话，但尚未确认自由移动或战斗；#2620 鳄鱼洗澡可通过触屏进入章节选择，尚无有效关卡操作证据。对应 `round16-clock`、`round16-rpg-long`、`round16-croc-level`，均未按完整玩法结案。
- `MRP_GAME_DIR=/Users/zixing/Documents/zixing/github/flymrp/mrpfile npm run build:edgeone`、`npm run prepare:edgeone` 通过。ZIP 1001091 字节，CRC 校验通过，未部署网站。

原 313 项累计结案仍为 **11**，剩余 **302**。本轮交付的是公共包加载修复；“恋爱气球”主题设置能力仍未完成。
