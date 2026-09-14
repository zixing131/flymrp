# 第三轮：原 317 项逐项状态

新增冒烟通过 4 项；仍有 313 项未通过。#603 即使短冒烟通过，持续操作仍异常。所有条目均保留，不把静态画面或主动退出当成功。

| Case | 名称 | 上轮 → 本轮 | 当前错误 | 诊断 |
|---:|---|---|---|---|
| 3 | sky插件V7安装包 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 4 | sky字库V3安装包 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 5 | vmrp安装包 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 7 | 冒泡 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 10 | 听听音阅 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 11 | 应用列表8.0 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 18 | 斗象棋2026 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 31 | 2012超级美眉连连看 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 39 | 2048 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 41 | 2048美化版XL | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 76 | a.bmp→a.jpg | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 81 | AV美女写真 | runtime-error → runtime-error | ExtFault: EXT fault abi-fault at 0x24ba7c (arm_ext_call: budget exceeded) | 来宾指令预算超限，仍待定位，预算未提高 |
| 87 | CPU性能测试 | runtime-error → runtime-error | ExtFault: EXT fault abi-fault at 0x24cf22 (arm_ext_call: budget exceeded) | 来宾指令预算超限，仍待定位，预算未提高 |
| 95 | CS1.6特警先锋 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 98 | CS反恐风云 | runtime-error → runtime-error | LuaRuntimeError: cann`t find sdk key! | 缺 SDK 配置依赖，未提供替代授权数据 |
| 106 | DNF复仇者之怒 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 109 | DNF狂战之怒 | runtime-error → runtime-error | LuaRuntimeError: cannot read start.mr | 此前逐包核验无 Lua 启动成员，不能独立启动的资源包 |
| 110 | DNF欲望格斗 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 115 | Dota之超神屠夫 | runtime-error → runtime-error | LuaRuntimeError: cann`t find sdk key! | 缺 SDK 配置依赖，未提供替代授权数据 |
| 116 | Dota之超神屠夫 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 132 | MRP NES软件平台 | runtime-error → runtime-error | LuaRuntimeError: cannot read application *G | Lua GUI 与 _platEx(1221) 已补；需要平台预注册 m0 槽 *G，包未提供 |
| 137 | MSN | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 138 | MSN | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 139 | MSN | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 144 | MTK魔法寿司_320x240 | runtime-error → runtime-error | ExtFault: EXT fault unmapped at 0x1e870a4 (arm_ext_call: GuestMemory map16 fault at 0x200ffff) | 读16越过主内存尾部；循环根因未确定，未扩大主内存掩盖越界 |
| 145 | MTK魔法寿司_320x480 | runtime-error → runtime-error | ExtFault: EXT fault unmapped at 0x1e87098 (arm_ext_call: GuestMemory map16 fault at 0x200ffff) | 读16越过主内存尾部；循环根因未确定，未扩大主内存掩盖越界 |
| 159 | NES积分-天蓝 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 160 | NES模拟器 | runtime-error → runtime-error | LuaRuntimeError: attempt to call a non-function | 整图加载越过原错误；start.mr PC100 调用缺失的 _bmpInfo(30)，仍待实现真实来宾像素地址接口 |
| 161 | nes模拟器XL版1.2 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 162 | QQ | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 163 | QQ | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 164 | QQ2010 | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 165 | QQ2010 | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 166 | QQ2010 | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 170 | QQ2010（超级挂Q） | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 174 | QQ斗地主3.3正式版 | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 178 | QQ空间 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 179 | QQ空间 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 183 | QQ手机软件管理 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 184 | QQ网游大厅 | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 187 | QQ炫舞 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 188 | Q版飞车 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 192 | ram_scan | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 197 | RX管理器 | runtime-error → input-smoke-passed |  | 补齐平台 IO 内存；磁盘信息界面和持续运行已核验 |
| 212 | xqc安装包2 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 215 | ZCOM手机杂志 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 216 | “粽”想过61 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 217 | ＣＳ反恐特警 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 232 | 爱上3D爱上图 | runtime-error → runtime-error | LuaRuntimeError: cann`t find sdk key! | 缺 SDK 配置依赖，未提供替代授权数据 |
| 233 | 爱阅看书2.0 | runtime-error → runtime-error | Error: corrupt guest heap free block: address=0x32d100 size=0x0 base=0x2965c8 end=0x3965c8 | 来宾堆损坏，仍待定位 |
| 236 | 按键扫描实例 | runtime-error → input-smoke-passed |  | 补齐平台 IO 内存；按键窗口有画面变化，持续运行完成 |
| 239 | 暗黑穿越-真实杀戮 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 240 | 暗黑穿越-真实杀戮 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 253 | 傲剑OL | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 265 | 八仙过海 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 266 | 把美女灌醉 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 267 | 把美女灌醉 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 268 | 把美女灌醉 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 276 | 百宝箱 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 279 | 百家乐 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 295 | 宝石迷阵 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 314 | 避孕大作战 | runtime-error → runtime-error | LuaRuntimeError: cannot read start.mr | 此前逐包核验无 Lua 启动成员，不能独立启动的资源包 |
| 315 | 便宜！绝对划算 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 321 | 别踩白块 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 336 | 捕鱼达人 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 337 | 捕鱼达人 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 347 | 猜奥运金牌得手机 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 349 | 彩蛋大战 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 351 | 彩虹QQ2014完整收藏版 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 366 | 超级合金装备 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 396 | 超爽绝杀大合辑 | runtime-error → runtime-error | LuaRuntimeError: cannot read application *J | Lua GUI 已补；需要平台预注册 m0 槽 *J，包未提供 |
| 405 | 成语大师 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 432 | 穿越火线之飞虎队 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 451 | 吹裙子 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 461 | 存款计算器 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 465 | 打小鸟 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 491 | 大漠狂刀 | runtime-error → runtime-error | LuaRuntimeError: cannot read start.mr | 此前逐包核验无 Lua 启动成员，不能独立启动的资源包 |
| 498 | 大师在线设计签名 | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 500 | 大雄约会放屁 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 506 | 弹力球 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 523 | 盗墓鬼吹灯笔记 | runtime-error → runtime-error | ExtFault: EXT fault abi-fault at 0x262f62 (arm_ext_call: budget exceeded) | 来宾指令预算超限，仍待定位，预算未提高 |
| 543 | 第十亿个幸运者 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 545 | 第一次亲密接触 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 551 | 调色板XL | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 553 | 谍影重重Ⅱ | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 575 | 毒蛇行动2-丛林之谜 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 577 | 独孤九剑 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 583 | 赌王之王-黄金城 | runtime-error → runtime-error | LuaRuntimeError: cannot read start.mr | 此前逐包核验无 Lua 启动成员，不能独立启动的资源包 |
| 589 | 多款游戏限时免费 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 596 | 夺命番茄 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 603 | 俄罗斯方块 | runtime-error → input-smoke-passed |  | 整图加载兼容已修；短冒烟通过，较长操作仍触发 SetTile(0,11,21,0) 越界，不能算持续运行修复 |
| 633 | 放假啦疯狂游戏吧 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 640 | 飞天忍者喵 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 643 | 飞信 | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 645 | 飞信 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 659 | 风流三国 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 665 | 风云三国 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 673 | 疯狂吧！光棍 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 674 | 疯狂捕鱼 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 687 | 疯狂的小鸟太空版 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 723 | 父亲节抢楼送手机 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 726 | 干爹的爱 | runtime-error → runtime-error | ExtFault: EXT fault abi-fault at 0x24c588 (arm_ext_call: budget exceeded) | 来宾指令预算超限，仍待定位，预算未提高 |
| 727 | 干爹的爱 | runtime-error → runtime-error | ExtFault: EXT fault abi-fault at 0x2976f4 (arm_ext_call: budget exceeded) | 来宾指令预算超限，仍待定位，预算未提高 |
| 734 | 港式五张 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 752 | 给力猫 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 753 | 给力猫 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 755 | 给力枪手连环杀 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 758 | 更多精品游戏 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 768 | 公交查询 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 782 | 股票交易版 | runtime-error → static-frame |  | 自动识别 _start.mr；60 秒场景可操作并到登录界面，固定冒烟仍静态，在线功能未验证 |
| 783 | 怪蛋风暴_大屏版 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 801 | 鬼手伏魔录 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 809 | 国庆去哪儿 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 839 | 核弹风暴 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 841 | 和美女20次亲密接触 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 844 | 合金弹头2013 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 845 | 合金弹头2013 | runtime-error → runtime-error | LuaRuntimeError: cannot read start.mr | 此前逐包核验无 Lua 启动成员，不能独立启动的资源包 |
| 855 | 黑暗传说之利器 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 858 | 黑白棋AI | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 874 | 华容道 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 880 | 欢乐马戏团 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 882 | 欢乐五一幸运抽奖 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 894 | 幻想三国 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 895 | 幻想三国online | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 901 | 黄金矿工 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 908 | 毁灭巫师 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 910 | 会飞的汤姆猫 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 917 | 魂之利刃 | runtime-error → input-smoke-passed |  | 补齐 0x40000000 平台内存；进入战斗教学并完成持续运行 |
| 918 | 活动介绍 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 922 | 火车订票 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 923 | 火车订票 | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 947 | 激情冲动 | runtime-error → runtime-error | MrpFormatError: MRP FileLen 124976 exceeds buffer 98304 | 包长度或压缩数据异常，需可验证完整包 |
| 960 | 极品家丁-9527 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 967 | 寄生兽 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 968 | 寄生兽 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 975 | 假日休闲乐逍遥 | runtime-error → runtime-error | LuaRuntimeError: cannot read application *J | Lua GUI 已补；需要平台预注册 m0 槽 *J，包未提供 |
| 988 | 剑侣情缘3美人如玉 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1004 | 僵尸大暴走 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1018 | 江南style骑马舞 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1021 | 降龙十八掌 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 1024 | 接水管 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1040 | 节日祝福语 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1062 | 精品切水果 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1075 | 经典泡泡龙 | runtime-error → runtime-error | LuaRuntimeError: cannot read start.mr | 此前逐包核验无 Lua 启动成员，不能独立启动的资源包 |
| 1078 | 警花射击训练 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1081 | 狙击精英 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1083 | 狙击小日本 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1091 | 绝命杀手斩龙刃 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1143 | 快点网址导航 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 1160 | 来电助手 | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 1190 | 冷笑话大全 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1201 | 恋爱气球 | runtime-error → runtime-error | MrpFormatError: MRP FileLen 365325 exceeds buffer 331255 | 包长度或压缩数据异常，需可验证完整包 |
| 1220 | 零距离触摸美女 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1225 | 灵剑封魔录 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1285 | 猫捉老鼠 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1286 | 冒泡 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1287 | 冒泡VIP游戏套餐 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1292 | 冒泡看图 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1296 | 冒泡平台 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1297 | 冒泡棋牌 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 1298 | 冒泡棋牌 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 1300 | 冒泡软件魔盒 | runtime-error → runtime-error | UnknownAbiError: unsupported sprintf format unterminated string | 真实第70次 sprintf %s/%s 的 guest 路径缺 NUL，扫描70000字节仍未终止；未截断或吞错 |
| 1301 | 冒泡社区 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 1302 | 冒泡社区安装 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 1303 | 冒泡视频交友 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1309 | 冒泡听吧 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1310 | 冒泡网 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1311 | 冒泡网游 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 1312 | 冒泡音乐 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1315 | 冒泡游戏商城 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1324 | 冒泡浏览器安装 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 1325 | 冒泡浏览器安装 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 1328 | 冒险岛 | runtime-error → runtime-error | LuaRuntimeError: cannot read start.mr | 此前逐包核验无 Lua 启动成员，不能独立启动的资源包 |
| 1339 | 美女3D飞车 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1350 | 美女翻翻看 | runtime-error → runtime-error | ExtFault: EXT fault abi-fault at 0x297372 (arm_ext_call: budget exceeded) | 来宾指令预算超限，仍待定位，预算未提高 |
| 1386 | 梦幻封神 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 1397 | 梦幻西游-无敌战神 | runtime-error → runtime-error | UnknownAbiError: unsupported sprintf format % | 固定冒烟仍为裸百分号错误；另一次短诊断提前退出，根因仍待定位 |
| 1406 | 免费抽奖\|欢乐共享 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1408 | 秒杀iPhone的游戏 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1410 | 明星美女麻将馆 | runtime-error → runtime-error | Error: corrupt guest heap free block: address=0x2a4a08 size=0x43005100 base=0x24b5c8 end=0x34b5c8 | 来宾堆损坏，仍待定位 |
| 1414 | 名将三国OL | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1491 | 内衣大盗 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1504 | 年年有“愚” | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1511 | 农民斗地主 | runtime-error → runtime-error | LuaRuntimeError: cann`t find sdk key! | 缺 SDK 配置依赖，未提供替代授权数据 |
| 1515 | 怒火铁拳 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1516 | 怒火铁拳 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1517 | 怒火铁拳 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1526 | 欧洲杯有奖竞猜 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1527 | 排列数字测智商 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1560 | 七夕“遇见爱” | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1561 | 七夕冒泡送情意 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1565 | 奇迹捕鱼 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1585 | 抢！注册道具费全免 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1589 | 抢登钓鱼岛 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1590 | 抢登钓鱼岛 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1591 | 抢滩登陆2012 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1604 | 青春纪念册 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1616 | 情趣高手 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1628 | 趣拼高帅富 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1629 | 趣拼图 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1630 | 趣拼学生妹 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1631 | 趣拼学生妹 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1681 | 人人网 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1696 | 忍者水果 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1697 | 忍者水果 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1698 | 忍者水果 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1699 | 忍者水果 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1700 | 忍者水果 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1703 | 扔纸团 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1707 | 如来神掌 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1714 | 三国保钓战 | runtime-error → runtime-error | LuaRuntimeError: cann`t find sdk key! | 缺 SDK 配置依赖，未提供替代授权数据 |
| 1715 | 三国大富翁 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1716 | 三国大富翁 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1730 | 三国猛将传 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1736 | 三国纳妾记 | runtime-error → runtime-error | LuaRuntimeError: cannot read start.mr | 此前逐包核验无 Lua 启动成员，不能独立启动的资源包 |
| 1744 | 三国英雄传 | runtime-error → runtime-error | ExtFault: EXT fault unmapped at 0x24c5aa (arm_ext_call: GuestMemory map32 fault at 0xfffffffc) | 运行时或来宾故障仍待定位；保留原始异常 |
| 1781 | 蛇来运转大抽奖 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1799 | 神马过年不寂寞 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1801 | 神魔大陆 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1868 | 侍魂之修罗斩 | runtime-error → runtime-error | LuaRuntimeError: cannot read start.mr | 此前逐包核验无 Lua 启动成员，不能独立启动的资源包 |
| 1880 | 手机QQ | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 1883 | 手机UC原版 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 1889 | 手机信号强度仪V3 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1891 | 手机阅读 | runtime-error → runtime-error | LuaRuntimeError: cann`t find sdk key! | 缺 SDK 配置依赖，未提供替代授权数据 |
| 1895 | 手写库01 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1896 | 手写库02 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1897 | 手写库03 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1898 | 手写库04 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1901 | 手信语音聊天 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1903 | 暑期iPhone大礼包 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1904 | 蜀山剑侠 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 1908 | 数学达人 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1915 | 水果老虎机 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 1916 | 水果梦工厂 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1924 | 水晶之恋 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1928 | 水浒对对碰 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1929 | 水浒反殴传 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 1975 | 贪吃小鳄鱼 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1976 | 贪吃小鳄鱼 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 1998 | 天龙八部 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2013 | 天天打怪兽 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2014 | 天天打折货到付款 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 2024 | 铁血抗日 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 2025 | 铁血抗日 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 2028 | 听听音阅贺岁版 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2029 | 听听音阅贺岁版 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 2034 | 童年经典游戏合辑 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2036 | 偷看美女 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2042 | 途客行天下 | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 2057 | 吞食天地2 | runtime-error → runtime-error | ExtFault: EXT fault abi-fault at 0x24cc72 (arm_ext_call: budget exceeded) | 来宾指令预算超限，仍待定位，预算未提高 |
| 2064 | 玩手信赢乐phone | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2071 | 万水千山粽是情 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2082 | 网络时钟 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2098 | 未来之英雄传奇 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2101 | 我爱拼图安装包2 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2130 | 五一带你玩转不停 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2145 | 西游记OL | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2146 | 西游记OL | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2164 | 夏日MM连连看 | runtime-error → runtime-error | Error: corrupt guest heap free list: base=2965c8 end=3e4f78 head=2005c0 node=52cb94 previousEnd=396968 | 来宾堆损坏，仍待定位 |
| 2165 | 夏日Party | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 2167 | 夏日缤纷礼包 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2177 | 仙剑问情 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2184 | 仙魔逆唯我独尊 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2185 | 仙魔逆唯我独尊 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2192 | 限时抢购买一送一 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2225 | 笑傲江湖 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2265 | 新羊过河 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2271 | 星河舰队 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2285 | 幸运砸蛋 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2287 | 性感美女找茬 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2294 | 熊猫大乱斗 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2333 | 炎龙骑士 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 2342 | 要钱不要命 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2345 | 野人岛3 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2349 | 夜袭鬼子营 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2354 | 一毛钱手机抽回家 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2355 | 一枪杀几人 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2359 | 移动股票王 | runtime-error → static-frame |  | 自动识别 _start.mr；60 秒场景可操作并到登录界面，固定冒烟仍静态，在线功能未验证 |
| 2360 | 移动视线 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2364 | 倚天屠龙绝情剑 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2380 | 英汉字典 | runtime-error → runtime-error | LuaRuntimeError: cann`t be run direct! | 包明确要求父启动平台，上下文未补齐 |
| 2382 | 英雄救美之狙击之神 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2391 | 应用软件>> | runtime-error → static-frame |  | GUI 小写别名及 DSM 配置接口已补；显示更多游戏提示，未证明输入有效 |
| 2399 | 永远的冒险岛 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 2405 | 优化大师 | runtime-error → runtime-error | ExtFault: EXT fault abi-fault at 0x1e90fcc (arm_ext_call: budget exceeded) | 来宾指令预算超限，仍待定位，预算未提高 |
| 2407 | 游戏布袋 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2408 | 游戏猎手 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2409 | 游戏中心 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2411 | 愚人节泡妞利器 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2438 | 缘分测试 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 2442 | 越狱吧吊丝 | runtime-error → runtime-error | MrpFormatError: invalid deflate distance | 包长度或压缩数据异常，需可验证完整包 |
| 2451 | 宅人七天乐 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2462 | 战国英雄传 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2465 | 战神 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2468 | 战神金刚 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 2476 | 战神之魂 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 2481 | 掌上e_mrp | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2485 | 掌星汉字字典 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2486 | 找回元素 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2508 | 争霸三国 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2514 | 正义英雄联盟-蝙蝠侠 | runtime-error → runtime-error | LuaRuntimeError: cannot read start.mr | 此前逐包核验无 Lua 启动成员，不能独立启动的资源包 |
| 2522 | 植物大战僵尸官方版 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2543 | 中秋:天涯共此时 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2565 | 抓拍宝贝 | runtime-error → runtime-error | ExtFault: EXT fault unsupported at 0x24fda0 (arm_ext_call: unsupported Thumb insn at 0x24fda0 word=0xb8e0) | 运行时或来宾故障仍待定位；保留原始异常 |
| 2568 | 追忆童真那些年 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2571 | 字体模块 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 2577 | 醉美人 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2601 | 喋血双雄 | exited → exited | LuaRuntimeError: Exiting... | 来宾主动退出；正常流程与兼容故障尚未区分，不能算通过 |
| 2606 | 逍遥剑侠传 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2608 | 缤纷双蛋激情约惠 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
| 2619 | 鳄鱼爱洗澡 | runtime-error → runtime-error | LuaRuntimeError: cannot read start.mr | 此前逐包核验无 Lua 启动成员，不能独立启动的资源包 |
| 2620 | 鳄鱼洗澡 | runtime-error → runtime-error | ExtFault: EXT fault abi-fault at 0x2a20a0 (arm_ext_call: budget exceeded) | 来宾指令预算超限，仍待定位，预算未提高 |
| 2622 | 魅惑浮生录 | runtime-error → runtime-error | LuaRuntimeError: cann`t find sdk key! | 缺 SDK 配置依赖，未提供替代授权数据 |
| 2635 | [免费]冒泡棋牌 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2638 | [免费]冒泡社区安装 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2639 | [免费]冒泡网游 | black-screen → black-screen |  | 无可确认的可见场景，根因仍待逐包核验 |
| 2640 | [网游]无双三国 | static-frame → static-frame |  | 固定键序无画面变化；真实入口、触屏或资源原因仍待逐包核验 |
