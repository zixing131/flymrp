# 商店兼容性问题清单（2026-09-14）

> 后续更新：请看[第二轮修复与回归](2026-09-14-store-round2.md)及[430 项最新状态](2026-09-14-store-round2-issues.md)。下文保留第一轮历史记录。

本表基于修复后全量 2640 项的冻结结果。430 项未通过短冒烟；退出、静态、黑屏也可能由场景或外部依赖导致，尚未全部确认为模拟器缺陷。条目编号对应 [冻结清单](2026-09-14-store-manifest.json)，完整 MD5、调用诊断与测试设置见 [修复后 JSON](2026-09-14-store-fixed.json)。测试边界和已修复根因见 [主报告](2026-09-14-store.md)。

## 持续运行和浏览器额外问题

以下样本即使短冒烟通过，也尚未完整兼容：

- #22 见缝插针2025：持续脚本在约 19 秒虚拟时间已进入第一关，120 秒宿主预算未完成。
- #28 12530音乐客户端、#1683 人生重开模拟器：入口变化后，持续控制阶段未观察到画面响应。
- #77 Angry Birds、#350 彩蝶少女、#1116 看图片浏览器：持续脚本完成，但缺少逐场景验证，仍需核验。
- #80 Angry Birds 272×480：浏览器进入第一关弹弓画面，声音报 Unable to decode audio data。
- #17 斗地主2026：唯一基线通过、第二轮超时的回退；并发尚在运行时的独立 45 秒复测仍超时；全量结束后单进程 35,404 ms 通过，帧统计与基线一致。未稳定复现功能回退，保留原记录及 [补充结果](2026-09-14-store-recheck.json)。

## 全量未通过项

### 静态画面（161）

| 编号 | 应用 | 分辨率 | MD5 前 12 位 | 阶段 / 诊断 | 基线 |
|---:|---|---|---|---|---|
| 3 | sky插件V7安装包 | 240x320 | `cda81002990a` | complete  | static-frame |
| 4 | sky字库V3安装包 | 240x320 | `c50c052b56b4` | complete  | static-frame |
| 5 | vmrp安装包 | 240x320 | `dd9728e2d41c` | complete  | static-frame |
| 10 | 听听音阅 | 240x320 | `13fcde3e3af8` | complete  | static-frame |
| 18 | 斗象棋2026 | 240x320 | `6e491b7d7e27` | complete  | static-frame |
| 31 | 2012超级美眉连连看 | 240x320 | `d22da71dbe58` | complete  | runtime-error |
| 39 | 2048 | 240x320 | `0d006895c66a` | complete  | static-frame |
| 41 | 2048美化版XL | 240x320 | `770e00a71473` | complete  | static-frame |
| 116 | Dota之超神屠夫 | 240x320 | `63153f1e6ed1` | complete  | runtime-error |
| 139 | MSN | 320x480 | `053c087f85b6` | complete  | static-frame |
| 159 | NES积分-天蓝 | 240x320 | `4a49e8c36016` | complete  | static-frame |
| 162 | QQ | 240x320 | `0d85f944a402` | complete  | static-frame |
| 163 | QQ | 320x480 | `66d9135d825a` | complete  | static-frame |
| 183 | QQ手机软件管理 | 240x320 | `64864ec9f43c` | complete  | static-frame |
| 187 | QQ炫舞 | 240x320 | `45a79eeff9ad` | complete  | static-frame |
| 192 | ram_scan | 240x320 | `a523bb52b816` | complete  | static-frame |
| 212 | xqc安装包2 | 240x320 | `103ca253ce60` | complete  | static-frame |
| 215 | ZCOM手机杂志 | 240x320 | `a27060eaa7ce` | complete  | static-frame |
| 216 | “粽”想过61 | 240x320 | `1f852b1ca978` | complete  | static-frame |
| 217 | ＣＳ反恐特警 | 240x320 | `01131383aaf5` | complete  | static-frame |
| 239 | 暗黑穿越-真实杀戮 | 240x320 | `4a8a3ac014a4` | complete  | static-frame |
| 240 | 暗黑穿越-真实杀戮 | 320x480 | `dbbccf8445ea` | complete  | static-frame |
| 265 | 八仙过海 | 240x320 | `69131c0ffdfa` | complete  | static-frame |
| 266 | 把美女灌醉 | 240x320 | `fe7686548c0a` | complete  | static-frame |
| 267 | 把美女灌醉 | 240x320 | `b4d2272e4419` | complete  | static-frame |
| 268 | 把美女灌醉 | 320x480 | `aa718ed30e13` | complete  | static-frame |
| 276 | 百宝箱 | 240x320 | `f1eba0866f77` | complete  | static-frame |
| 295 | 宝石迷阵 | 240x320 | `a078edceaaa0` | complete  | static-frame |
| 315 | 便宜！绝对划算 | 240x320 | `6793f037be72` | complete  | static-frame |
| 321 | 别踩白块 | 240x320 | `4e297aa75463` | complete  | static-frame |
| 336 | 捕鱼达人 | 240x320 | `5242efcf3783` | complete  | static-frame |
| 337 | 捕鱼达人 | 320x480 | `c612d03c5fbd` | complete  | static-frame |
| 347 | 猜奥运金牌得手机 | 240x320 | `a66041a4e961` | complete  | static-frame |
| 349 | 彩蛋大战 | 320x480 | `4719f6e1bda1` | complete  | static-frame |
| 351 | 彩虹QQ2014完整收藏版 | 240x320 | `e50c9d35d701` | complete  | static-frame |
| 405 | 成语大师 | 320x480 | `d7f6e5555be1` | complete  | static-frame |
| 432 | 穿越火线之飞虎队 | 320x480 | `92a78e352804` | complete  | static-frame |
| 451 | 吹裙子 | 240x320 | `088ebd7aeab3` | complete  | static-frame |
| 461 | 存款计算器 | 320x480 | `da5a27bc4c7d` | complete  | static-frame |
| 465 | 打小鸟 | 240x320 | `ca5ae1a92775` | complete  | static-frame |
| 500 | 大雄约会放屁 | 240x320 | `a444b4fabfee` | complete  | static-frame |
| 506 | 弹力球 | 320x480 | `f4ba993e547f` | complete  | static-frame |
| 543 | 第十亿个幸运者 | 240x320 | `719ec639db45` | complete  | static-frame |
| 545 | 第一次亲密接触 | 240x320 | `cd40a1b1f543` | complete  | static-frame |
| 551 | 调色板XL | 240x320 | `da7610404a0d` | complete  | static-frame |
| 553 | 谍影重重Ⅱ | 240x320 | `ff827e652bcb` | complete  | static-frame |
| 589 | 多款游戏限时免费 | 240x320 | `d82144c91e9c` | complete  | static-frame |
| 596 | 夺命番茄 | 320x480 | `c4a48e72eac4` | complete  | static-frame |
| 633 | 放假啦疯狂游戏吧 | 240x320 | `7e93f4d03a5b` | complete  | static-frame |
| 640 | 飞天忍者喵 | 240x320 | `ead1386fc228` | complete  | static-frame |
| 645 | 飞信 | 240x320 | `04eb906a292b` | complete  | static-frame |
| 673 | 疯狂吧！光棍 | 240x320 | `715b97c39792` | complete  | static-frame |
| 674 | 疯狂捕鱼 | 320x480 | `e6a3a2c83c36` | complete  | static-frame |
| 687 | 疯狂的小鸟太空版 | 320x480 | `fea3cabc114b` | complete  | static-frame |
| 723 | 父亲节抢楼送手机 | 240x320 | `01112232cc47` | complete  | static-frame |
| 755 | 给力枪手连环杀 | 240x320 | `d52f2fad768e` | complete  | static-frame |
| 768 | 公交查询 | 240x320 | `4cb2183843c9` | complete  | static-frame |
| 783 | 怪蛋风暴_大屏版 | 320x480 | `b1cf9833397d` | complete  | static-frame |
| 809 | 国庆去哪儿 | 240x320 | `449204f7b671` | complete  | static-frame |
| 839 | 核弹风暴 | 320x480 | `fdff41fe8a26` | complete  | static-frame |
| 841 | 和美女20次亲密接触 | 240x320 | `ce284ef8d144` | complete  | static-frame |
| 858 | 黑白棋AI | 240x320 | `b1781fd05f95` | complete  | static-frame |
| 874 | 华容道 | 240x320 | `31b467867354` | complete  | static-frame |
| 880 | 欢乐马戏团 | 240x320 | `1dc855a1351b` | complete  | static-frame |
| 882 | 欢乐五一幸运抽奖 | 240x320 | `082126624f6a` | complete  | static-frame |
| 894 | 幻想三国 | 240x320 | `8a000a9dfe50` | complete  | static-frame |
| 901 | 黄金矿工 | 240x320 | `a9b23ffc3dab` | complete  | runtime-error |
| 918 | 活动介绍 | 240x320 | `c70a79349530` | complete  | static-frame |
| 922 | 火车订票 | 240x320 | `648734eaceb9` | complete  | static-frame |
| 960 | 极品家丁-9527 | 240x320 | `c49bab56c788` | complete  | static-frame |
| 967 | 寄生兽 | 240x320 | `29be0e91adc4` | complete  | static-frame |
| 968 | 寄生兽 | 240x320 | `ab1a2b8f0a7c` | complete  | static-frame |
| 988 | 剑侣情缘3美人如玉 | 240x320 | `df8ed715de1c` | complete  | runtime-error |
| 1018 | 江南style骑马舞 | 240x320 | `659877407b90` | complete  | static-frame |
| 1024 | 接水管 | 240x320 | `61e31de0088b` | complete  | static-frame |
| 1062 | 精品切水果 | 320x480 | `c178dab058e6` | complete  | static-frame |
| 1078 | 警花射击训练 | 240x320 | `b275bbc40442` | complete  | static-frame |
| 1083 | 狙击小日本 | 320x480 | `3fd57417c083` | complete  | static-frame |
| 1190 | 冷笑话大全 | 240x320 | `03c5e4ad11aa` | complete  | static-frame |
| 1220 | 零距离触摸美女 | 240x320 | `66bac72da423` | complete  | static-frame |
| 1225 | 灵剑封魔录 | 240x320 | `4675637bcaa4` | complete  | static-frame |
| 1285 | 猫捉老鼠 | 240x320 | `4b3daa3c370d` | complete  | static-frame |
| 1287 | 冒泡VIP游戏套餐 | 240x320 | `435e8570bc43` | complete  | static-frame |
| 1292 | 冒泡看图 | 240x320 | `b3f83dd6db26` | complete  | static-frame |
| 1309 | 冒泡听吧 | 240x320 | `f61064ac8945` | complete  | static-frame |
| 1312 | 冒泡音乐 | 240x320 | `1baf93262847` | complete  | static-frame |
| 1315 | 冒泡游戏商城 | 240x320 | `2e1114e5048d` | complete  | static-frame |
| 1339 | 美女3D飞车 | 240x320 | `1a7069947c46` | complete  | static-frame |
| 1406 | 免费抽奖\|欢乐共享 | 240x320 | `1ac8e06df8e9` | complete  | static-frame |
| 1408 | 秒杀iPhone的游戏 | 240x320 | `eb5c7a3ece08` | complete  | static-frame |
| 1414 | 名将三国OL | 240x320 | `eaad25a94a5a` | complete  | static-frame |
| 1491 | 内衣大盗 | 240x320 | `a6d69ac858e7` | complete  | static-frame |
| 1504 | 年年有“愚” | 240x320 | `638c7075cf3c` | complete  | static-frame |
| 1526 | 欧洲杯有奖竞猜 | 240x320 | `8c2e67b60d14` | complete  | static-frame |
| 1527 | 排列数字测智商 | 240x320 | `ad9f9abef446` | complete  | static-frame |
| 1560 | 七夕“遇见爱” | 240x320 | `54d2896c9fa0` | complete  | static-frame |
| 1561 | 七夕冒泡送情意 | 240x320 | `890b9279225c` | complete  | static-frame |
| 1585 | 抢！注册道具费全免 | 240x320 | `56beb74a3580` | complete  | static-frame |
| 1589 | 抢登钓鱼岛 | 240x320 | `4e408b3104fc` | complete  | static-frame |
| 1590 | 抢登钓鱼岛 | 320x480 | `30e1b95c3076` | complete  | static-frame |
| 1591 | 抢滩登陆2012 | 240x320 | `1d9b5ce813cc` | complete  | static-frame |
| 1604 | 青春纪念册 | 240x320 | `f8a6f463183b` | complete  | static-frame |
| 1616 | 情趣高手 | 240x320 | `ea1bf9ec3c68` | complete  | static-frame |
| 1628 | 趣拼高帅富 | 320x480 | `95e2228bcd20` | complete  | static-frame |
| 1629 | 趣拼图 | 320x480 | `9354e72e852c` | complete  | static-frame |
| 1630 | 趣拼学生妹 | 240x320 | `01d696853c30` | complete  | static-frame |
| 1631 | 趣拼学生妹 | 320x480 | `42f94fb36982` | complete  | static-frame |
| 1681 | 人人网 | 240x320 | `cafab6d94588` | complete  | static-frame |
| 1703 | 扔纸团 | 240x320 | `490a607c4cef` | complete  | static-frame |
| 1707 | 如来神掌 | 240x320 | `f84d6f246cf3` | complete  | static-frame |
| 1730 | 三国猛将传 | 240x320 | `08ddddeb855c` | complete  | runtime-error |
| 1781 | 蛇来运转大抽奖 | 240x320 | `1543303ffc2f` | complete  | static-frame |
| 1799 | 神马过年不寂寞 | 240x320 | `5b93c7ded505` | complete  | static-frame |
| 1801 | 神魔大陆 | 240x320 | `d481a9830d38` | complete  | static-frame |
| 1889 | 手机信号强度仪V3 | 240x320 | `6d53cd5afbbd` | complete  | static-frame |
| 1901 | 手信语音聊天 | 240x320 | `1f8d418a5c21` | complete  | static-frame |
| 1903 | 暑期iPhone大礼包 | 240x320 | `bcb7e8dc935e` | complete  | static-frame |
| 1908 | 数学达人 | 320x480 | `0c4d50e74ef1` | complete  | static-frame |
| 1916 | 水果梦工厂 | 320x480 | `5931cda5c71e` | complete  | static-frame |
| 1924 | 水晶之恋 | 240x320 | `38be22274156` | complete  | static-frame |
| 1928 | 水浒对对碰 | 240x320 | `5e97f50581e1` | complete  | static-frame |
| 1975 | 贪吃小鳄鱼 | 240x320 | `64f7eac948c1` | complete  | static-frame |
| 1976 | 贪吃小鳄鱼 | 320x480 | `a32c76c0300f` | complete  | static-frame |
| 2013 | 天天打怪兽 | 240x320 | `1ddf4b37f7d5` | complete  | static-frame |
| 2028 | 听听音阅贺岁版 | 320x480 | `6fdad97b89d6` | complete  | static-frame |
| 2034 | 童年经典游戏合辑 | 240x320 | `49737217f65b` | complete  | static-frame |
| 2036 | 偷看美女 | 320x480 | `24b77498f491` | complete  | static-frame |
| 2064 | 玩手信赢乐phone | 240x320 | `4343770dd615` | complete  | static-frame |
| 2071 | 万水千山粽是情 | 240x320 | `79a1917a4310` | complete  | static-frame |
| 2082 | 网络时钟 | 240x320 | `71420c52251d` | complete  | static-frame |
| 2098 | 未来之英雄传奇 | 240x320 | `3ea72d34d6d9` | complete  | static-frame |
| 2101 | 我爱拼图安装包2 | 240x320 | `3e703fc2d357` | complete  | static-frame |
| 2130 | 五一带你玩转不停 | 240x320 | `70dba3ade10f` | complete  | static-frame |
| 2167 | 夏日缤纷礼包 | 240x320 | `030b785a60c8` | complete  | static-frame |
| 2192 | 限时抢购买一送一 | 240x320 | `cfc7cf0ddf4c` | complete  | static-frame |
| 2265 | 新羊过河 | 240x320 | `b982ded8c84c` | complete  | static-frame |
| 2287 | 性感美女找茬 | 240x320 | `3f92da1e2e1d` | complete  | static-frame |
| 2294 | 熊猫大乱斗 | 240x320 | `f29bea6f6e9b` | complete  | static-frame |
| 2342 | 要钱不要命 | 320x480 | `71d323964781` | complete  | static-frame |
| 2345 | 野人岛3 | 240x320 | `1eb476d90c5f` | complete  | static-frame |
| 2349 | 夜袭鬼子营 | 320x480 | `522f9a74781a` | complete  | static-frame |
| 2354 | 一毛钱手机抽回家 | 240x320 | `69949b9c3410` | complete  | static-frame |
| 2355 | 一枪杀几人 | 320x480 | `83eb28c63969` | complete  | static-frame |
| 2364 | 倚天屠龙绝情剑 | 240x320 | `ea7bf687da23` | complete  | static-frame |
| 2382 | 英雄救美之狙击之神 | 240x320 | `65069ced1ff1` | complete  | static-frame |
| 2407 | 游戏布袋 | 240x320 | `7be0805c731e` | complete  | static-frame |
| 2408 | 游戏猎手 | 240x320 | `b47d8bd04e64` | complete  | static-frame |
| 2411 | 愚人节泡妞利器 | 240x320 | `b42561310ed0` | complete  | static-frame |
| 2451 | 宅人七天乐 | 240x320 | `b3daecd751e7` | complete  | static-frame |
| 2462 | 战国英雄传 | 240x320 | `73f41587a04d` | complete  | static-frame |
| 2481 | 掌上e_mrp | 240x320 | `7207e86016b6` | complete  | static-frame |
| 2485 | 掌星汉字字典 | 240x320 | `9b72be61067c` | complete  | static-frame |
| 2486 | 找回元素 | 240x320 | `7673d30aa8dd` | complete  | static-frame |
| 2508 | 争霸三国 | 240x320 | `e1b89ea7dd04` | complete  | static-frame |
| 2522 | 植物大战僵尸官方版 | 320x480 | `9383a38adb70` | complete  | static-frame |
| 2543 | 中秋:天涯共此时 | 240x320 | `b22cae7f8abf` | complete  | static-frame |
| 2568 | 追忆童真那些年 | 240x320 | `7d92413e76d2` | complete  | static-frame |
| 2577 | 醉美人 | 320x480 | `52604253d1eb` | complete  | static-frame |
| 2606 | 逍遥剑侠传 | 240x320 | `7b5a58ac6e52` | complete  | static-frame |
| 2608 | 缤纷双蛋激情约惠 | 240x320 | `26199c7a4cc2` | complete  | static-frame |
| 2640 | [网游]无双三国 | 240x320 | `a6f6b1aefedf` | complete  | static-frame |

### 退出（56）

| 编号 | 应用 | 分辨率 | MD5 前 12 位 | 阶段 / 诊断 | 基线 |
|---:|---|---|---|---|---|
| 7 | 冒泡 | 240x320 | `5f8bac5fe4e5` | input LuaRuntimeError: Exiting... | exited |
| 11 | 应用列表8.0 | 240x320 | `879f70851253` | start LuaRuntimeError: Exiting... | exited |
| 76 | a.bmp→a.jpg | 320x480 | `1cff3b79b15a` | input LuaRuntimeError: Exiting... | exited |
| 95 | CS1.6特警先锋 | 240x320 | `52e556c230ce` | input LuaRuntimeError: Exiting... | exited |
| 106 | DNF复仇者之怒 | 320x480 | `b8de67542860` | start LuaRuntimeError: Exiting... | exited |
| 161 | nes模拟器XL版1.2 | 240x320 | `576fe45f4f63` | start LuaRuntimeError: Exiting... | exited |
| 178 | QQ空间 | 240x320 | `a41df0777c29` | sustained LuaRuntimeError: Exiting... | exited |
| 179 | QQ空间 | 320x480 | `db017fef4c7b` | sustained LuaRuntimeError: Exiting... | exited |
| 188 | Q版飞车 | 240x320 | `5eed46ccde60` | input LuaRuntimeError: Exiting... | exited |
| 279 | 百家乐 | 320x480 | `f5c8801ab963` | input LuaRuntimeError: Exiting... | exited |
| 366 | 超级合金装备 | 240x320 | `795ad526c5d2` | input LuaRuntimeError: Exiting... | exited |
| 575 | 毒蛇行动2-丛林之谜 | 240x320 | `f78739da8943` | input LuaRuntimeError: Exiting... | exited |
| 577 | 独孤九剑 | 240x320 | `fa64e0961dd2` | boot LuaRuntimeError: Exiting... | exited |
| 665 | 风云三国 | 240x320 | `3195e5496333` | input LuaRuntimeError: Exiting... | exited |
| 758 | 更多精品游戏 | 240x320 | `7fcca238d937` | sustained LuaRuntimeError: Exiting... | exited |
| 801 | 鬼手伏魔录 | 320x480 | `b945660278be` | start LuaRuntimeError: Exiting... | exited |
| 844 | 合金弹头2013 | 240x320 | `f492ef88e523` | input LuaRuntimeError: Exiting... | exited |
| 855 | 黑暗传说之利器 | 240x320 | `1e26b20cdb21` | input LuaRuntimeError: Exiting... | exited |
| 908 | 毁灭巫师 | 240x320 | `8c536f8d627c` | input LuaRuntimeError: Exiting... | exited |
| 910 | 会飞的汤姆猫 | 240x320 | `6ba08d165f75` | input LuaRuntimeError: Exiting... | exited |
| 1004 | 僵尸大暴走 | 240x320 | `729a83de3ac5` | input LuaRuntimeError: Exiting... | exited |
| 1040 | 节日祝福语 | 240x320 | `fd5c97cda4b4` | input LuaRuntimeError: Exiting... | exited |
| 1081 | 狙击精英 | 240x320 | `0d0a50c6f1e8` | input LuaRuntimeError: Exiting... | exited |
| 1091 | 绝命杀手斩龙刃 | 240x320 | `f059cea39844` | input LuaRuntimeError: Exiting... | exited |
| 1286 | 冒泡 | 320x480 | `bc8f9cd1494f` | input LuaRuntimeError: Exiting... | exited |
| 1296 | 冒泡平台 | 240x320 | `943a9df381e2` | input LuaRuntimeError: Exiting... | exited |
| 1303 | 冒泡视频交友 | 240x320 | `06ac93c547dc` | input LuaRuntimeError: Exiting... | exited |
| 1310 | 冒泡网 | 240x320 | `de9f58f3f470` | sustained LuaRuntimeError: Exiting... | exited |
| 1515 | 怒火铁拳 | 240x320 | `e19188da11a3` | input LuaRuntimeError: Exiting... | exited |
| 1516 | 怒火铁拳 | 240x320 | `16381c9add2c` | input LuaRuntimeError: Exiting... | exited |
| 1517 | 怒火铁拳 | 320x480 | `d6ec8825e394` | input LuaRuntimeError: Exiting... | exited |
| 1565 | 奇迹捕鱼 | 320x480 | `a267d6da935f` | sustained LuaRuntimeError: Exiting... | exited |
| 1696 | 忍者水果 | 320x480 | `e336f228949c` | input LuaRuntimeError: Exiting... | exited |
| 1697 | 忍者水果 | 240x320 | `f90b857999d5` | input LuaRuntimeError: Exiting... | exited |
| 1698 | 忍者水果 | 240x400 | `b7554b4e0fe0` | input LuaRuntimeError: Exiting... | exited |
| 1699 | 忍者水果 | 272x480 | `010a4cdd32f3` | input LuaRuntimeError: Exiting... | exited |
| 1700 | 忍者水果 | 320x480 | `b93ad498910a` | input LuaRuntimeError: Exiting... | exited |
| 1715 | 三国大富翁 | 240x320 | `6971088a06bb` | sustained LuaRuntimeError: Exiting... | exited |
| 1716 | 三国大富翁 | 320x480 | `855ad118aab6` | sustained LuaRuntimeError: Exiting... | exited |
| 1895 | 手写库01 | 240x320 | `a0430226085f` | start LuaRuntimeError: Exiting... | exited |
| 1896 | 手写库02 | 240x320 | `647567e570c8` | start LuaRuntimeError: Exiting... | exited |
| 1897 | 手写库03 | 240x320 | `c4a5ac99a553` | start LuaRuntimeError: Exiting... | exited |
| 1898 | 手写库04 | 240x320 | `ab7ca57f7af7` | start LuaRuntimeError: Exiting... | exited |
| 1915 | 水果老虎机 | 320x480 | `e8fa31494afd` | input LuaRuntimeError: Exiting... | exited |
| 2014 | 天天打折货到付款 | 240x320 | `672c090ac4d5` | input LuaRuntimeError: Exiting... | exited |
| 2024 | 铁血抗日 | 240x320 | `71bc85988857` | sustained LuaRuntimeError: Exiting... | exited |
| 2025 | 铁血抗日 | 240x320 | `178d0f7ce0c9` | sustained LuaRuntimeError: Exiting... | exited |
| 2029 | 听听音阅贺岁版 | 320x480 | `b66fbe577db5` | sustained LuaRuntimeError: Exiting... | exited |
| 2165 | 夏日Party | 320x480 | `3a3baf5663f1` | input LuaRuntimeError: Exiting... | exited |
| 2333 | 炎龙骑士 | 240x320 | `5f3720edcfb6` | start LuaRuntimeError: Exiting... | exited |
| 2399 | 永远的冒险岛 | 240x320 | `fa1dde713ce1` | input LuaRuntimeError: Exiting... | exited |
| 2438 | 缘分测试 | 320x480 | `702b5b15ac33` | input LuaRuntimeError: Exiting... | exited |
| 2468 | 战神金刚 | 240x320 | `e2f515ce32fc` | input LuaRuntimeError: Exiting... | exited |
| 2476 | 战神之魂 | 240x320 | `01bd74cacf36` | input LuaRuntimeError: Exiting... | exited |
| 2571 | 字体模块 | 240x320 | `6e66c068a13c` | start LuaRuntimeError: Exiting... | exited |
| 2601 | 喋血双雄 | 240x320 | `d4c589fdb623` | input LuaRuntimeError: Exiting... | exited |

### 运行异常（176）

| 编号 | 应用 | 分辨率 | MD5 前 12 位 | 阶段 / 诊断 | 基线 |
|---:|---|---|---|---|---|
| 29 | 2010十二星座运势 | 240x320 | `91775e141105` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 81 | AV美女写真 | 240x320 | `c23e088936c0` | start ExtFault: EXT fault abi-fault at 0x24ba7c (arm_ext_call: budget exceeded) | runtime-error |
| 87 | CPU性能测试 | 240x320 | `7dc5b4dcf256` | start ExtFault: EXT fault abi-fault at 0x24cf22 (arm_ext_call: budget exceeded) | runtime-error |
| 98 | CS反恐风云 | 320x480 | `caa06c256ae9` | start LuaRuntimeError: cann`t find sdk key! | runtime-error |
| 109 | DNF狂战之怒 | 320x480 | `5cf0ac4840d1` | start LuaRuntimeError: cannot read start.mr | runtime-error |
| 115 | Dota之超神屠夫 | 240x320 | `9386d847c8b6` | start LuaRuntimeError: cann`t find sdk key! | runtime-error |
| 132 | MRP NES软件平台 | 240x320 | `b4bdfafc2c64` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 137 | MSN | 240x320 | `f428f4850407` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 138 | MSN | 240x320 | `5d0e4e03fb56` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 144 | MTK魔法寿司_320x240 | 320x240 | `8cffb31c17c4` | boot ExtFault: EXT fault unmapped at 0x1e870a4 (arm_ext_call: GuestMemory map16 fault at 0x200ffff) | runtime-error |
| 145 | MTK魔法寿司_320x480 | 320x480 | `eaa4ecb7de09` | boot ExtFault: EXT fault unmapped at 0x1e87098 (arm_ext_call: GuestMemory map16 fault at 0x200ffff) | runtime-error |
| 158 | NBA：超经典射篮 | 240x320 | `2dfca266f62b` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 160 | NES模拟器 | 240x320 | `8920c6a45cab` | start LuaRuntimeError: BitmapLoad: image bounds exceed resource | runtime-error |
| 164 | QQ2010 | 240x320 | `d47caa5b3ccb` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 165 | QQ2010 | 240x320 | `325859f2d233` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 166 | QQ2010 | 240x320 | `ac648f79c639` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 170 | QQ2010（超级挂Q） | 240x320 | `f20689c7d50c` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 173 | QQDSM | 240x320 | `3b795f6aae22` | start LuaRuntimeError: attempt to index a non-table | runtime-error |
| 174 | QQ斗地主3.3正式版 | 240x320 | `ff85e4354e97` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 184 | QQ网游大厅 | 240x320 | `30a63a6b3d73` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 189 | Q版火影忍者壁纸 | 240x320 | `a47f6893aa11` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 193 | RC编辑器 | 240x320 | `b665feda31fb` | input UnknownAbiError: unsupported mr_platEx code 1404 | runtime-error |
| 197 | RX管理器 | 240x320 | `7477dddd523a` | start ExtFault: EXT fault unmapped at 0x26552e (arm_ext_call: GuestMemory map16 fault at 0x80110004) | runtime-error |
| 200 | seg编辑器 | 240x320 | `46128e78465b` | input UnknownAbiError: unsupported mr_platEx code 1404 | runtime-error |
| 214 | X战警：金刚狼传 | 240x320 | `93b06f415483` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 223 | 阿凡提笑话大全 | 240x320 | `6aa559d014ba` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 228 | 艾弗森：NBA球星 | 240x320 | `f567c7ff3b81` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 232 | 爱上3D爱上图 | 320x480 | `35cd916f5745` | start LuaRuntimeError: cann`t find sdk key! | runtime-error |
| 233 | 爱阅看书2.0 | 320x480 | `d4283e37dc8d` | boot Error: corrupt guest heap free block: address=0x32d100 size=0x0 base=0x2965c8 end=0x3965c8 | runtime-error |
| 236 | 按键扫描实例 | 240x320 | `cd24efc018a5` | input ExtFault: EXT fault unmapped at 0x24cf3a (arm_ext_call: GuestMemory map16 fault at 0x80110004) | runtime-error |
| 282 | 保护眼睛的壁纸集 | 240x320 | `731a64493f62` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 302 | 暴强国外笑话 | 240x320 | `9d16168d0bc3` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 305 | 爆笑古代人 | 240x320 | `23fe51f0df46` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 314 | 避孕大作战 | 320x480 | `769920f5490c` | start LuaRuntimeError: cannot read start.mr | runtime-error |
| 344 | 不是一般的幽默 | 240x320 | `aa0ae4f5eec4` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 345 | 布拉德皮特魅力秀 | 240x320 | `a33b68b9fa55` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 391 | 超强悍：改装跑车 | 240x320 | `76534199766f` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 396 | 超爽绝杀大合辑 | 240x320 | `eecbaef4651b` | start LuaRuntimeError: attempt to index a non-table | runtime-error |
| 431 | 穿越火线秘密行动 | 240x320 | `cf16a2d74cff` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 455 | 刺陵：周杰伦主演 | 240x320 | `e347c1725cd1` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 489 | 大明星汤姆克鲁斯 | 240x320 | `3502c4e520f8` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 491 | 大漠狂刀 | 320x480 | `f9ca35e1fc61` | start LuaRuntimeError: cannot read start.mr | runtime-error |
| 498 | 大师在线设计签名 | 240x320 | `e8aa2132c2c4` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 519 | 到此一游 | 240x320 | `779e21913f81` | start UnknownAbiError: unsupported sprintf format unterminated format | runtime-error |
| 523 | 盗墓鬼吹灯笔记 | 240x320 | `1467d18f5c1d` | start ExtFault: EXT fault abi-fault at 0x262f62 (arm_ext_call: budget exceeded) | runtime-error |
| 548 | 点击最高的爆笑图 | 240x320 | `c54eb9daf031` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 558 | 动物亦是武林高手 | 240x320 | `9da8eaeee931` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 583 | 赌王之王-黄金城 | 320x480 | `e112fdb3adbd` | start LuaRuntimeError: cannot read start.mr | runtime-error |
| 603 | 俄罗斯方块 | 240x320 | `7cb5e0079506` | start LuaRuntimeError: BitmapLoad: image bounds exceed resource | runtime-error |
| 643 | 飞信 | 240x320 | `f16e1694acb1` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 664 | 风云2：武侠巨制 | 240x320 | `e5336f9924f0` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 726 | 干爹的爱 | 240x320 | `dcc7afb12f0c` | start ExtFault: EXT fault abi-fault at 0x24c588 (arm_ext_call: budget exceeded) | runtime-error |
| 727 | 干爹的爱 | 320x480 | `6132c8a722d1` | start ExtFault: EXT fault abi-fault at 0x2976f4 (arm_ext_call: budget exceeded) | runtime-error |
| 742 | 搞笑事件大集合 | 240x320 | `9cf53ae74dfb` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 752 | 给力猫 | 240x320 | `7d50483fb4d6` | boot UnknownAbiError: unsupported sprintf format %m | runtime-error |
| 753 | 给力猫 | 240x320 | `7a692885dadb` | boot UnknownAbiError: unsupported sprintf format %m | runtime-error |
| 754 | 给力猫 | 320x480 | `6792604d2084` | start UnknownAbiError: unsupported sprintf format %m | runtime-error |
| 772 | 孤军深入 | 176x220 | `176ccf6a6758` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 773 | 古代暴强笑话 | 240x320 | `b6770aab9725` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 776 | 古惑仔 | 240x320 | `ec607aa63751` | start UnknownAbiError: unsupported sprintf format %- | runtime-error |
| 781 | 古人的幽默 | 240x320 | `e02f85e80fe4` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 782 | 股票交易版 | 240x320 | `58a418cd7673` | start LuaRuntimeError: cannot read start.mr | runtime-error |
| 810 | 国外爱情笑话 | 240x320 | `c6e8f108af1b` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 811 | 国外幽默荟萃 | 240x320 | `3c9802ae9bb5` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 830 | 韩国超人气布娃娃 | 240x320 | `81115ff653f5` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 831 | 韩国花样美男乐队 | 240x320 | `4f6f283bbd3d` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 832 | 韩国手绘纯美女孩 | 240x320 | `bd633237b08b` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 837 | 好莱坞电影壁纸集 | 240x320 | `9eb4f1b532d5` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 845 | 合金弹头2013 | 320x480 | `a0d0f54a7db0` | start LuaRuntimeError: cannot read start.mr | runtime-error |
| 886 | 欢迎来到童话世界 | 240x320 | `4dbffd6c3cd3` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 912 | 婚礼花饰大揭秘 | 240x320 | `02cac85d69ec` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 917 | 魂之利刃 | 240x320 | `cef96d9ee851` | input ExtFault: EXT fault unmapped at 0x1000c (arm_ext_call: GuestMemory map8 fault at 0x40008d80) | runtime-error |
| 923 | 火车订票 | 240x320 | `f0cec678e091` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 947 | 激情冲动 | 240x320 | `de912f401a94` | load MrpFormatError: MRP FileLen 124976 exceeds buffer 98304 | runtime-error |
| 974 | 家居装饰经典插花 | 240x320 | `35c2efc84cea` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 975 | 假日休闲乐逍遥 | 240x320 | `f58809c00238` | start LuaRuntimeError: attempt to index a non-table | runtime-error |
| 976 | 价值上亿元的豪宅 | 240x320 | `44dcfa388d8c` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1065 | 精选非主流清新图 | 240x320 | `b7f0df1eef57` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1073 | 经典国外幽默 | 240x320 | `44b8ee60cafa` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1075 | 经典泡泡龙 | 320x480 | `83a0227cb2b2` | start LuaRuntimeError: cannot read start.mr | runtime-error |
| 1076 | 经典悬疑冒险漫画 | 240x320 | `a5e88f4227b1` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1111 | 开心瞬间 | 240x320 | `9c3f9903c513` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1123 | 科幻世界主题壁纸 | 240x320 | `5f155f324af0` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1124 | 可爱新娘唯美婚纱 | 240x320 | `f5af6edcaa56` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1160 | 来电助手 | 240x320 | `14f6762aa1bc` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 1161 | 来自天堂的精灵们 | 240x320 | `5205ccdac770` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1169 | 老外的搞笑事 | 240x320 | `08aeea712a4d` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1201 | 恋爱气球 | 240x320 | `642481aa4feb` | load MrpFormatError: MRP FileLen 365325 exceeds buffer 331255 | runtime-error |
| 1227 | 刘烨：忧郁的硬汉 | 240x320 | `d3516e96ab41` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1280 | 漫画里的俊男靓女 | 240x320 | `70a9eb50420a` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1300 | 冒泡软件魔盒 | 240x320 | `aed658c79cd0` | start UnknownAbiError: unsupported sprintf format unterminated string | runtime-error |
| 1328 | 冒险岛 | 320x480 | `8cb03038858d` | start LuaRuntimeError: cannot read start.mr | runtime-error |
| 1350 | 美女翻翻看 | 320x480 | `2152b826887d` | start ExtFault: EXT fault abi-fault at 0x297372 (arm_ext_call: budget exceeded) | runtime-error |
| 1354 | 美女话费领回家 | 240x320 | `90315de2cad8` | start UnknownAbiError: unsupported sprintf format unterminated format | runtime-error |
| 1393 | 梦幻文件管理器 | 240x320 | `56528264216b` | input UnknownAbiError: unsupported sprintf format %. | runtime-error |
| 1397 | 梦幻西游-无敌战神 | 240x320 | `740c4b7da345` | input UnknownAbiError: unsupported sprintf format % | runtime-error |
| 1410 | 明星美女麻将馆 | 240x320 | `cf3cae04628e` | input Error: corrupt guest heap free block: address=0x2a4a08 size=0x43005100 base=0x24b5c8 end=0x34b5c8 | runtime-error |
| 1426 | 魔法世界的大冒险 | 240x320 | `be50c62b3496` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1485 | 南极海底未知生物 | 240x320 | `aaa600434973` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1511 | 农民斗地主 | 320x480 | `a013125456f3` | start LuaRuntimeError: cann`t find sdk key! | runtime-error |
| 1534 | 跑跑卡丁车壁纸集 | 240x320 | `7fd0dce667a2` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1621 | 邱泽：忧郁美少年 | 240x320 | `20d044a28c64` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1633 | 全球最怪异的求婚 | 240x320 | `1afc547a04f3` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1651 | 让你笑喷的笑话 | 240x320 | `be0a3aa4d2f5` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1680 | 人气漫画壁纸合集 | 240x320 | `cae26178a27d` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1682 | 人生就像摩天轮 | 240x320 | `1f5dbfcad1b1` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1708 | 塞尔达传说游戏图 | 240x320 | `1eb26e2ff3e3` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1711 | 赛车场上生死之战 | 240x320 | `42ace2d308c7` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1714 | 三国保钓战 | 240x320 | `5c55910f6cfb` | start LuaRuntimeError: cann`t find sdk key! | runtime-error |
| 1736 | 三国纳妾记 | 320x480 | `1da1855230ea` | start LuaRuntimeError: cannot read start.mr | runtime-error |
| 1737 | 三国群英传壁纸集 | 240x320 | `94730ba5ea61` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1744 | 三国英雄传 | 240x320 | `101797ab1636` | input ExtFault: EXT fault unmapped at 0x24c5aa (arm_ext_call: GuestMemory map32 fault at 0xfffffffc) | runtime-error |
| 1851 | 史上最贱百变猫叔 | 240x320 | `c6b8be6d0d87` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1864 | 世界名贵跑车合集 | 240x320 | `f32781b149db` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1868 | 侍魂之修罗斩 | 320x480 | `70c30a7dc316` | start LuaRuntimeError: cannot read start.mr | runtime-error |
| 1870 | 释小龙：功夫小子 | 240x320 | `e34584e58b51` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1872 | 视频下载器 | 240x320 | `b8f56e764350` | start UnknownAbiError: unsupported sprintf format %. | runtime-error |
| 1880 | 手机QQ | 240x320 | `58e565e03257` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 1887 | 手机恋人唯美图片 | 240x320 | `831549c345a8` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1891 | 手机阅读 | 320x480 | `bc5186eb26f7` | start LuaRuntimeError: cann`t find sdk key! | runtime-error |
| 1938 | 说不出的美妙感觉 | 240x320 | `9fdda091692a` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1948 | 死亡笔记动漫壁纸 | 240x320 | `5bb5faa5a05e` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1962 | 孙红雷：阳刚之气 | 240x320 | `ff3c59728f06` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1964 | 她迷倒了千万男生 | 240x320 | `a681157a45f5` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1966 | 泰坦尼克号壁纸集 | 240x320 | `647655f2674d` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 1989 | 特种部队英勇身姿 | 240x320 | `e18e691abfea` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2005 | 天马行空傲视群雄 | 240x320 | `9c87a675b112` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2039 | 图片浏览器 | 240x320 | `2a869270d864` | input UnknownAbiError: unsupported sprintf format unterminated format | runtime-error |
| 2040 | 图片浏览器 | 320x480 | `877a0d104244` | input UnknownAbiError: unsupported sprintf format unterminated format | runtime-error |
| 2042 | 途客行天下 | 240x320 | `054f58a5e8fc` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 2057 | 吞食天地2 | 240x320 | `02da0308d190` | input ExtFault: EXT fault abi-fault at 0x24cc72 (arm_ext_call: budget exceeded) | runtime-error |
| 2061 | 外国笑话 | 240x320 | `134486778e96` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2062 | 外国笑话典藏 | 240x320 | `dc04598eab2a` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2063 | 外国幽默大全 | 240x320 | `62b23021add2` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2105 | 我记忆中的E界参赛作品 | 240x320 | `b28279804515` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2110 | 巫妖王之怒官方图 | 240x320 | `b62f2e028c91` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2141 | 误入一个花的海洋 | 240x320 | `c7159f433bd0` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2164 | 夏日MM连连看 | 320x480 | `430d972dfc75` | boot Error: corrupt guest heap free list: base=2965c8 end=3e4f78 head=2005c0 node=52cb94 previousEnd=396968 | runtime-error |
| 2181 | 仙境传说可爱人物 | 240x320 | `6585cf0444f1` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2191 | 现代人的幽默观 | 240x320 | `191bb190776b` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2194 | 香格里拉灵魂之地 | 240x320 | `04d5be80825f` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2208 | 小火柴里的大谜题 | 240x320 | `4753839340cc` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2216 | 小时候的难忘趣事 | 240x320 | `4abc7c1f3590` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2233 | 笑笑阿凡提 | 240x320 | `2e682a78cbde` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2234 | 笑笑更健康 | 240x320 | `e9dc295ce80f` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2235 | 笑在现代 | 240x320 | `4e04ad7da675` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2292 | 雄霸三国神鬼乱舞 | 320x480 | `42a4bd4a7252` | input UnknownAbiError: unsupported sprintf format %£ | runtime-error |
| 2359 | 移动股票王 | 240x320 | `309b21a4d305` | start LuaRuntimeError: cannot read start.mr | runtime-error |
| 2374 | 银钩杀戮之危险情人 | 240x320 | `38188f6521b3` | start UnknownAbiError: unsupported sprintf format %- | runtime-error |
| 2380 | 英汉字典 | 240x320 | `3d573fea8f44` | start LuaRuntimeError: cann`t be run direct! | runtime-error |
| 2389 | 应用列表 | 240x320 | `c46dafe3fe01` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2391 | 应用软件>> | 240x320 | `79670026a0e3` | start LuaRuntimeError: attempt to index a non-table | runtime-error |
| 2405 | 优化大师 | 240x320 | `c31148636712` | start ExtFault: EXT fault abi-fault at 0x1e90fcc (arm_ext_call: budget exceeded) | runtime-error |
| 2442 | 越狱吧吊丝 | 240x320 | `9eade5faeb95` | start MrpFormatError: invalid deflate distance | runtime-error |
| 2445 | 怎么看也看不厌哦 | 240x320 | `a32b5c0198ef` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2479 | 张敬轩：全才歌手 | 240x320 | `879ea02e262a` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2490 | 这样的笑话才好笑 | 240x320 | `bbf2b044b28c` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2514 | 正义英雄联盟-蝙蝠侠 | 320x480 | `ce1bc54ccabd` | start LuaRuntimeError: cannot read start.mr | runtime-error |
| 2537 | 中国笑林大全 | 240x320 | `9486ad476f4c` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2540 | 中国幽默荟萃 | 240x320 | `057820ffc2b9` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2565 | 抓拍宝贝 | 240x320 | `55d3852ffcf0` | input ExtFault: EXT fault unsupported at 0x24fda0 (arm_ext_call: unsupported Thumb insn at 0x24fda0 word=0xb8e0) | runtime-error |
| 2584 | 最浪漫的表白方式 | 240x320 | `23c8f2bb2cfa` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2585 | 最新笑话专集 | 240x320 | `3d194435f427` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2619 | 鳄鱼爱洗澡 | 320x480 | `0009291085af` | start LuaRuntimeError: cannot read start.mr | runtime-error |
| 2620 | 鳄鱼洗澡 | 320x480 | `f0e3ffdc1f43` | start ExtFault: EXT fault abi-fault at 0x2a20a0 (arm_ext_call: budget exceeded) | runtime-error |
| 2622 | 魅惑浮生录 | 320x480 | `72417b717f8c` | start LuaRuntimeError: cann`t find sdk key! | runtime-error |
| 2624 | [壁纸]爱情之花 | 240x320 | `1fa16e81236b` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2625 | [壁纸]宝马跑车 | 240x320 | `42f612f6ded8` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2626 | [壁纸]迪斯尼乐园 | 240x320 | `a46d8d73f16e` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2627 | [壁纸]非主流美女 | 240x320 | `3c2af9d7c31d` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2628 | [壁纸]韩国校花 | 240x320 | `79841a821a4a` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2629 | [壁纸]浪漫法国 | 240x320 | `ce5ea1b7e264` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2630 | [壁纸]玛丽兄弟 | 240x320 | `10416af66b06` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2631 | [壁纸]雪之世界 | 240x320 | `ee3d0b9cbbe9` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2632 | [壁纸]仰望天空 | 240x320 | `5696cd528913` | start LuaRuntimeError: attempt to call a non-function | runtime-error |
| 2633 | [壁纸]野生动物 | 240x320 | `e6611fab4d19` | start LuaRuntimeError: attempt to call a non-function | runtime-error |

### 黑屏（33）

| 编号 | 应用 | 分辨率 | MD5 前 12 位 | 阶段 / 诊断 | 基线 |
|---:|---|---|---|---|---|
| 110 | DNF欲望格斗 | 240x320 | `24a78fcb280e` | complete  | black-screen |
| 253 | 傲剑OL | 240x320 | `6ac9bee0f3e0` | complete  | black-screen |
| 659 | 风流三国 | 240x320 | `076b748ba3d1` | complete  | black-screen |
| 734 | 港式五张 | 320x480 | `50d52f0e640c` | complete  | black-screen |
| 895 | 幻想三国online | 240x320 | `2bdafe418f1d` | complete  | black-screen |
| 1021 | 降龙十八掌 | 240x320 | `0da36801d03a` | complete  | black-screen |
| 1143 | 快点网址导航 | 240x320 | `a1340bcbc895` | complete  | runtime-error |
| 1297 | 冒泡棋牌 | 240x320 | `cfd4df865dbe` | complete  | black-screen |
| 1298 | 冒泡棋牌 | 320x480 | `122d7f33aea6` | complete  | black-screen |
| 1301 | 冒泡社区 | 240x320 | `9bdccd09b020` | complete  | black-screen |
| 1302 | 冒泡社区安装 | 240x320 | `f9ed97019303` | complete  | black-screen |
| 1311 | 冒泡网游 | 240x320 | `d2641fe9a6f1` | complete  | black-screen |
| 1324 | 冒泡浏览器安装 | 240x320 | `bbd3c025c03f` | complete  | black-screen |
| 1325 | 冒泡浏览器安装 | 320x480 | `5b40de168b47` | complete  | black-screen |
| 1386 | 梦幻封神 | 240x320 | `484d31666e68` | complete  | black-screen |
| 1883 | 手机UC原版 | 240x320 | `e9936d995ff9` | complete  | black-screen |
| 1904 | 蜀山剑侠 | 240x320 | `2586ba3844d7` | complete  | black-screen |
| 1929 | 水浒反殴传 | 240x320 | `443fa5acc511` | complete  | black-screen |
| 1998 | 天龙八部 | 240x320 | `4f1433669149` | complete  | black-screen |
| 2145 | 西游记OL | 240x320 | `2d679c799366` | complete  | black-screen |
| 2146 | 西游记OL | 240x320 | `6e89edcb3c61` | complete  | black-screen |
| 2177 | 仙剑问情 | 240x320 | `384d8f26aeb8` | complete  | black-screen |
| 2184 | 仙魔逆唯我独尊 | 240x320 | `485d44427e7c` | complete  | black-screen |
| 2185 | 仙魔逆唯我独尊 | 240x320 | `b2593526eb12` | complete  | black-screen |
| 2225 | 笑傲江湖 | 240x320 | `485135633cb1` | complete  | black-screen |
| 2271 | 星河舰队 | 240x320 | `9a023a6ddc0c` | complete  | black-screen |
| 2285 | 幸运砸蛋 | 240x320 | `c15171a40ea4` | complete  | black-screen |
| 2360 | 移动视线 | 240x320 | `1934bba5fe66` | complete  | black-screen |
| 2409 | 游戏中心 | 240x320 | `3eaf6aa0afcb` | complete  | black-screen |
| 2465 | 战神 | 240x320 | `414ab35f13bf` | complete  | black-screen |
| 2635 | [免费]冒泡棋牌 | 320x480 | `3619fbbf112d` | complete  | black-screen |
| 2638 | [免费]冒泡社区安装 | 240x320 | `1b8a6d531a15` | complete  | black-screen |
| 2639 | [免费]冒泡网游 | 240x320 | `7d215f1dc286` | complete  | black-screen |

### 宿主超时（4）

| 编号 | 应用 | 分辨率 | MD5 前 12 位 | 阶段 / 诊断 | 基线 |
|---:|---|---|---|---|---|
| 17 | 斗地主2026 | 240x320 | `c3c89b2469e8` |  45s wall-clock timeout | input-smoke-passed |
| 203 | Tom猫 | 240x320 | `1aec07488b26` |  45s wall-clock timeout | runtime-error |
| 806 | 滚木块 | 240x320 | `14bca0599b97` |  45s wall-clock timeout | runtime-error |
| 1942 | 撕衣美女之对对碰 | 320x480 | `f26eadd978a1` |  45s wall-clock timeout | worker-timeout |

## 新通过短冒烟的 48 项

这只证明原短流程停点被越过；持续复测及浏览器已知问题仍以上方记录为准。

| 编号 | 应用 | 基线诊断 |
|---:|---|---|
| 8 | 冒泡娱乐城 | UnknownAbiError: unsupported mr_platEx code 458753 |
| 22 | 见缝插针2025 | ExtFault: EXT fault unsupported at 0x25a0f8 (arm_ext_call: unsupported ARM insn at 0x25a0f8 word=0xe1c300f0) |
| 28 | 12530音乐客户端 | UnknownAbiError: UNKNOWN_REQUIRED_SLOT = 129 |
| 38 | 2023冒泡网站 | UnknownAbiError: UNKNOWN_REQUIRED_SLOT = 62 |
| 77 | Angry Birds | UnknownAbiError: unsupported mr_platEx code 4200 |
| 78 | Angry Birds | UnknownAbiError: unsupported mr_platEx code 4200 |
| 79 | Angry Birds | UnknownAbiError: unsupported mr_platEx code 4200 |
| 80 | Angry Birds | UnknownAbiError: unsupported mr_platEx code 4200 |
| 230 | 爱启动_v03beta8 | UnknownAbiError: unsupported mr_platEx code 1401 |
| 350 | 彩蝶少女 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 632 | 放大镜 | UnknownAbiError: unsupported mr_plat code 2500 |
| 636 | 非主流美女 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 680 | 疯狂的小鸟 | UnknownAbiError: unsupported mr_platEx code 4200 |
| 683 | 疯狂的小鸟 | UnknownAbiError: unsupported mr_platEx code 4200 |
| 740 | 搞怪火星文 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 741 | 搞怪兔斯基 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 770 | 孤单麦克风 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 838 | 浩瀚星空 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 969 | 寂寞的都市 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 1057 | 劲舞团 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 1060 | 精灵的挽歌 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 1116 | 看图片浏览器 | UnknownAbiError: unsupported mr_plat code 3012 |
| 1162 | 蓝色梦幻 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 1165 | 浪漫下雪天 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 1200 | 恋爱气球 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 1204 | 两小无猜 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 1306 | 冒泡手机卫士 | UnknownAbiError: unsupported mr_platEx code 2600 |
| 1316 | 冒泡娱乐城 | UnknownAbiError: unsupported mr_platEx code 458753 |
| 1317 | 冒泡娱乐城 | UnknownAbiError: unsupported mr_platEx code 458753 |
| 1318 | 冒泡娱乐城 | UnknownAbiError: unsupported mr_platEx code 458753 |
| 1336 | 美眉小秘密 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 1457 | 魔兽世界 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 1606 | 青花瓷 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 1683 | 人生重开模拟器 | ExtFault: EXT fault unsupported at 0x273638 (arm_ext_call: unsupported ARM insn at 0x273638 word=0xe14b21f4) |
| 1779 | 少女勾魂眼 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 1881 | 手机QQ | UnknownAbiError: unsupported mr_plat code 1006 |
| 1886 | 手机精灵 | UnknownAbiError: unsupported mr_plat code 2500 |
| 1934 | 水浒英雄传 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 1943 | 私房甜心 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 1955 | 四叶草的传说 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 2068 | 晚安摩天轮 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 2092 | 唯美水墨画 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 2196 | 香水有毒 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 2357 | 伊人独憔悴 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 2489 | 这就是我 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 2510 | 整蛊音盒 | UnknownAbiError: unsupported mr_platEx code 1004 |
| 2578 | 醉梦忆江南 | UnknownAbiError: unsupported mr_platEx code 1112 |
| 2612 | 炫彩空间 | UnknownAbiError: unsupported mr_platEx code 1112 |
