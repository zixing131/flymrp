# Stage 5-C：Real Mythroad Compatibility Layer

状态：核心启动链已接通。Stage 5-C **COMPLETE**。Stage 5-D **STARTED**（持续 event/frames/input 尚未闭环）。

范围：以 rxgj FULL Mythroad（`MR_VERSION=1968`）为证据，补齐真实应用运行所需的 P0 兼容层：

```text
Lua → Mythroad API → resource/file → timer/event → EXT
```

未接入：Canvas / WebGL / WebGPU / WebAudio / DOM / `setTimeout` / IndexedDB / 网络 / SMS / WAP / JIT / DRM。  
Stage 3 CPU **未改**。Stage 4 EXT ABI：5-C.10I 将 `table[100]` 从 8-byte scalar 改为 128-byte `pack_filename` buffer（`src/abi`）。5-C.10K 注册 table[40]/[44]/[45]/[41] current-pack 只读 alias。

真实 fixture：`test/fixtures/real/app.mrp`（蜀山剑侠传）。**不是 real-app green。** 见 `docs/real-binary-compatibility-report.md`。  
当前增量：自主推进。AppFS EFS + timer 31/32 + getScreenInfo 80 **REAL_EXECUTED**。guest inflate **PASS**；`arm_ext_call(0)` **NORMAL RETURN**；Lua **resumes**。Stage 5-C **COMPLETE**。Stage 5-D **STARTED**。见 `docs/autonomous-progress.md`。

证据：`docs/stage5c-api-evidence.md`。真实 binary 说明：`test/fixtures/real/README.md`。

---

## Inventory

| 类 | 数量 | 说明 |
|---|---|---|
| A | 29 | 冻结（5-B） |
| B | 26 | 冻结（5-B） |
| C | 36 | 上表 + `mr_table/0`、`mr_table/14`、`mr_table/125`、`mr_table/130/7`、`mr_table/38/0x4c6`、`mr_table/33/mr_getTime`、`mr_table/17/sprintf/%d`、`mr_table/100/pack_filename`、`mr_table/40/current-pack/RDONLY`、`mr_table/44/read`、`mr_table/45/seek`、`mr_table/41/close`、`mr_table/3/memcpy2`、`mr_table/10/strcmp2`、`mr_table/1/mr_free/registry-only`、`mr_table/9/memcmp2` |

`IMPLEMENTED_A.length === 29`、`IMPLEMENTED_B.length === 26` 保持不变。

---

## 分项 tests

| 项 | 文件 | n | 门槛 |
|---|---|---|---|
| API evidence | `test/mythroad/evidence.test.ts` + 文档 | 1（文档 CONFIRMED ≥ 20） | ≥ 20 |
| string | `test/lua/string.test.ts` | 17 | ≥ 15 |
| table/metamethod | `test/lua/metamethod.test.ts` | 20 | ≥ 20 |
| integer | `test/lua/integer.test.ts` | 11 | ≥ 10 |
| closure/upvalue | `test/lua/closure.test.ts` | 10 | ≥ 10 |
| SaveTable/LoadTable | `test/mythroad/persist.test.ts` | 9 | ≥ 8 |
| `_strCom`/`_com` | `strcom-c` 9 + 5-B 既有 | ≥ 15 | ≥ 15 |
| graphics command | `graphics.test.ts` 8 + `graphics-c` 8 | 16 | ≥ 15 |
| timer/event | timer 11 + events 11 + timer-c 6 | 28 | ≥ 15 |
| restart/runFile | `test/mythroad/restart.test.ts` | 5 | ≥ 5 |
| real binary | `test/mythroad/real-binary.test.ts` | 1（unavailable） | 有则 ≥ 1 |
| real MRP startup | `test/real/real-mrp-startup.test.ts` | 3 | 真实 app.mrp；table[9] memcmp2 REAL_EXECUTED；停 ARM insn budget |
| file-chain forensics | `test/real/file-chain-forensics.test.ts` | 3 | 5-C.10J：file ABI 静态链；不实现 40/41+ |
| table[3] memcpy forensics | `test/real/memcpy-3-forensics.test.ts` | 3 | 5-C.10L：首笔 memcpy2 ABI；现停 1 |
| table[3]/[10] ABI | `test/mythroad/memcpy2-strcmp2.test.ts` | 15 | 5-C.10M：前向 memcpy2 + strcmp2 -1/0/1 |
| table[1] free forensics | `test/real/free-1-forensics.test.ts` | 4 | 5-C.10N：header 协议 / first-fit 模型 |
| table[1] mr_free ABI | `test/mythroad/mr-free.test.ts` | 5 | 5-C.10O：registry-only；NULL/mismatch/no-reuse |
| table[100] pack_filename | `test/mythroad/pack-filename.test.ts` | 5 | 128-byte data slot；非 handler |
| table[130] ABI | `test/real/testcom-130-abi.test.ts` | 6 | 仅 case 7 |
| error paths | `test/mythroad/errors.test.ts` | 20 | ≥ 10 |

`npm test`：**514/514**。`tsc --noEmit` 通过。

---

## 性能（本机，第二次 `npx tsx bench/run.ts`）

| 项 | 5-C | vs 5-B | vs 5-A |
|---|---|---|---|
| Lua opcode/sec | 46.95 Mops/s | 48.91（噪声 / 同机波动） | 48.62 |
| Lua → native | 0.12 µs/call | 0.12 | 0.13 |
| Lua → EXT → Lua | 11.06 µs/call | 10.43 | 11.26 |
| start.mr full | 717 µs/call | 765 | 788 |
| ARM ADD+cache | 44.18 Mips | 44.60 | 45.05 |
| EXT direct | 185 kcalls/s | 187 | 178 |
| table bridge | 4.90 µs/call | 4.95 | 5.32 |
| lua_string_len | 0.18 µs/call | 新 | — |
| lua_meta_index | 0.28 µs/get | 新 | — |
| gfx_command | 14.9 M trip/s | 新 | — |

未改 `src/hot` / `src/abi`。opcode/sec 与 ARM/EXT 波动幅度与 5-B 记录的同机噪声同级，**不作为 CPU/EXT 回归**。

stdlib 安装使 `LuaVM` 的 intern/closure 基数上升（bench `intern=57 cl=44`，5-A 为 `intern=2 cl=4`）。算术热路径仍是 `i32`，GETTABLE hit / 两 number 算术仍 inline。

---

## 关键实现选择（仅 CONFIRMED）

* **`__pow`**：`mr_T_init` 的 `tmname[TM_POW] = "__op"`；unused mathlib 才装 globals.`__pow`。主路径不 `mrp_open_math`。POW 查 `__op` 或 `__pow`，皆非函数 → `err:1020`。不改 POW opcode，不默认装 mathlib。
* **Metamethod**：GETTABLE miss / 非表 → `__index`；SETTABLE raw nil 且有 TM → `__newindex`；CALL → `__call`；算术 tonumber 失败走 TM。循环上限 100 → `table err:2014/2015`。
* **Integer**：热路径 `i32`。除零 / `INT_MIN/-1` / 负除法向零 = **implementation-defined compatibility choice**。
* **string.pack**：rxgj `b_pack`（`x bB hH lL iI c s`，`>`/`<`，默认 LE），不是 Lua 5.3 pack。
* **string.subV**：2026-10-29 已在 MythroadRuntime 提供稳定 guest 指针、NUL 终止及可变字符串双向同步；独立 LuaVM 无 EXT 时仍返回 `0, len`。
* **SaveTable/LoadTable**：Pluto LE；nil/bool/number/string/table（含环、metatable）。拒绝 function。禁止 JSON。
* **RunFile**：pending + timer `"restart"` 100ms + `state=RESTART`。禁止递归 `runFile()`。`callGlobal` 嵌套时不重置 CI。
* **Graphics**：仍 `NullGraphicsBackend`，补 image/sprite/tile command recording。

---

## 已知兼容性 / 未实现

* 无默认 `__pow`/`math`；应用必须自己注册，否则 `^` → `err:1020`。
* 独立 LuaVM 的 `string.subV` 第一返回值为 0；完整 MythroadRuntime 已实现指针桥接。
* `string.findEx` / `gsub` / `format` / `c2u` / `u2c` / `new`/`set`/`update` 未实现。
* coroutine / thread / yield 未实现。
* Pluto 不持久化 Lua function。
* `_plat` / `_platEx` 各 code、指针类 `_strCom`/`_com`、socket/SMS/WAP、GUI、audio：未实现。
* `BitmapShowEx` 像素指针：不实现。
* 真实 fixture：`test/fixtures/real/app.mrp`（见 5-C.1–5-C.10R + `docs/autonomous-progress.md`）。`魔塔II.jar` 仍无。生产停点：`table[49]` `mr_mkDir`（FILE，LIVE `gsidbak`）。table[30]/[37]/[26]/[42] 已 REAL_EXECUTED。5-C.10R：inflate POP 返回 + 输出 SHA-256 对照；Stage 5-C 未过 completion gate。5-C.10Q：guest inflate 完成（1,404,897 insn）；ARM watchdog 默认 2e6。5-C.10P：table[9] `memcmp2`；gzip magic `1F 8B` equal。5-C.10O：table[1] registry-only `mr_free`；`_mr_readFile("res_lang0.rc")` 已完整成功。5-C.10N：table[1] ownership/header 只读取证。5-C.10M：table[3] `memcpy2` + table[10] `strcmp2` 已实现。5-C.10L：table[3] `memcpy2` 只读取证。5-C.10K：current-pack RDONLY file alias 已接 `MRPArchive.data`。5-C.10J：file ABI 静态链已取证。5-C.10I：`table[100]` / `pack_filename` 已写入 `"gssjxz.mrp"`。5-C.10H：空 filename 曾是 `table[100]` 未写入，不是 `res_lang0.rc`。5-C.10G：table[17] `sprintf_` 仅 literal+`%d`。5-C.10E：`table[33]` `mr_getTime` 接 `runtime.clock >>> 0`。
* pack 切换无真实 FS，只跑当前 VFS 中的 startfile。

---

## 如何跑

```bash
npm test
npx tsc --noEmit
npx tsx bench/run.ts
```

Stage 5-C 停止。不要进入 Stage 5-D。
