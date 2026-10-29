# Stage 5-C API Evidence

扫描范围（rxgj，不以标准 Lua 5.x / 记忆为准）：

* `src/mythroad/mythroad.c`（FULL，`MR_VERSION=1968`）
* `src/mythroad/mythroad.h` / `include/mythroad.h`
* `src/mythroad/src/lib/mr_iolib_target.c`
* `src/mythroad/mythroad_mini.c`（仅对照，不作为 Lua 主路径）
* `src/mythroad/src/lib/mr_strlib.c` / `mr_tablib.c` / `mr_baselib.c`
* `src/mythroad/src/lib/unused/mr_mathlib.c`
* `src/mythroad/src/mr_vm.c` / `mr_do.c` / `mr_tm.c` / `mr_tm.h`
* `src/mythroad/mr_pluto.c`
* `src/mythroad/mr_base64.c`
* `src/mythroad/unused/start.mr.lua`（源码样例，**不是** binary `start.mr`）

工作区 **没有** 真实 `*.mr` / `*.mrp` / `*.jar` / `魔塔II.jar`。

`confidence`：只有 **CONFIRMED** 进入主实现。`INFERRED` 必须有 fixture。`UNKNOWN` 禁止猜。

---

## 1. Lua 标准库打开路径

| 字段 | 值 |
|---|---|
| source | `mythroad.c` `_mr_intra_start` |
| registration | `mrp_open_base` / `mrp_open_string` / `mrp_open_table` / `mrp_open_file` |
| 不打开 | `mrp_open_math`（仅 `unused/mr_mathlib.c` + unused `mr.c`） |
| confidence | CONFIRMED |

---

## 2. `__pow` / POW

| 字段 | 值 |
|---|---|
| source file | `src/mr_vm.c` `Arith` TM_POW；`src/mr_tm.c` `mr_T_init` |
| VM lookup | `mr_H_getstr(gt(L), tmname[TM_POW])`；非函数 → `err:1020` |
| tmname[TM_POW] | 活动代码为 `"__op"`（`mr_tm.c:61`）。注释掉的标准名才是 `"__pow"` |
| unused mathlib | `mrp_open_math` 把 `math_pow` 装到 **globals.`__pow`**，主路径不调用 |
| 默认安装 | **无**。主路径既不装 `__op` 也不装 `__pow` |
| 本实现 | POW 热路径仍是 lookup → function。接受 globals.`__op` **或** `__pow`（两处 CONFIRMED 名）。不改 POW opcode 语义，不默认装 mathlib |
| limitation | `^` 在真实 FULL 主路径上默认 `err:1020`，除非应用自己注册 |
| confidence | CONFIRMED（lookup / 错误码 / 未打开 mathlib）；安装位置 = 兼容性限制 |

---

## 3. Metamethod（`mr_tm.h` ORDER TM + `mr_vm.c`）

| name | source | 何时触发 | args | returns | EXT | gfx | timer | VFS | confidence |
|---|---|---|---|---|---|---|---|---|---|
| `__index` | `mr_V_gettable` / `mr_V_index` | 表 miss 或非表 | fn(t,key) 或继续 gettable | 1 | 否 | 否 | 否 | 否 | CONFIRMED |
| `__newindex` | `mr_V_settable` | raw 值为 nil 且存在 TM | fn(t,key,val) 或继续 settable | 0 | 否 | 否 | 否 | 否 | CONFIRMED |
| `__call` | `mr_do.c` `tryfuncTM` | CALL 目标非 function | 插入 TM 再调用 | 依函数 | 否 | 否 | 否 | 否 | CONFIRMED |
| `__add/sub/mul/div` | `Arith` + `call_binTM` | tonumber 失败 | fn(a,b) | 1 | 否 | 否 | 否 | 否 | CONFIRMED |
| `__unm` | `OP_UNM` | tonumber 失败 | fn(a, nil) | 1 | 否 | 否 | 否 | 否 | CONFIRMED |
| `__concat` | `mr_V_concat` | tostring 失败 | fn(a,b) | 1 | 否 | 否 | 否 | 否 | CONFIRMED |
| `__eq` | `mr_V_equalval` | 两 table 且两边 TM 相同 | fn(a,b) | truthy | 否 | 否 | 否 | 否 | CONFIRMED |
| `__lt` / `__le` | `lessthan` / `lessequal` | 非 number/string | 两边 TM 必须 rawequal | truthy | 否 | 否 | 否 | 否 | CONFIRMED |
| 循环上限 | `MAXTAGLOOP=100` | | | `table err:2014` / `2015` | | | | | CONFIRMED |

`mr_T_gettmbyobj`：仅 **table / userdata** 有 metatable；number/string 无类型元表。

GETGLOBAL miss → `mr_V_index`（globals 的 `__index`）。SETGLOBAL → `mr_V_settable`。SELF → 同 GETTABLE。

---

## 4. Integer / `mrp_Number = int`

| 字段 | 值 |
|---|---|
| source | `mr_user_number.h` USE_INT；`mr_vm.c` ADD/SUB/MUL/DIV 直接 `mrp_Number` 运算 |
| 本实现 | 热路径保持 `i32`（`n \| 0`） |
| 除零 | C 未定义；本实现 `LuaRuntimeError`（implementation-defined） |
| `INT_MIN / -1` | C UB；本实现 `i32` wrap（implementation-defined） |
| 负除法 | JS `/` 再 `\| 0` = 向零截断（C99；C89 implementation-defined） |
| 负取模 `_mod` / `%` | 符号跟随被除数（JS `%`；C89 implementation-defined） |
| 比较 | 有符号 32-bit |
| 位运算 | 非 number **静默 no-op**（已确认） |
| confidence | CONFIRMED（类型）；溢出/除零 = implementation-defined compatibility choice |

---

## 5. string library（`mr_strlib.c` `mrp_open_string`）

| registration | source fn | argc | returns | notes | confidence |
|---|---|---|---|---|---|
| `string.len` | `str_len` | 1 string | 1 number | 字节长度（含嵌入 0） | CONFIRMED |
| `string.clen` | `str_clen` | 1 | 1 number | `min(len, strlen)` | CONFIRMED |
| `string.wlen` | `str_wlen` | 1 | 1 number | `min(len, mr_wstrlen)` UTF-16LE 至 `0x0000` | CONFIRMED |
| `string.cstr` | `str_cstr` | 1 | 1 string | 截到第一个 NUL | CONFIRMED |
| `string.wstr` | `str_wstr` | 1 | 1 string | 截到第一个 UTF-16 NUL | CONFIRMED |
| `string.sub` | `str_sub` | s, i [, j=-1] | 1 string | 1-based；负索引从末尾 | CONFIRMED |
| `string.lower/upper` | `str_lower/upper` | 1 | 1 string | ASCII | CONFIRMED |
| `string.char` | `str_char` | n ints | 1 string | 每字节 `uchar(c)==c`（0..255） | CONFIRMED |
| `string.rep` | `str_rep` | s, n | 1 string | | CONFIRMED |
| `string.byte` | `str_byte` | s [, pos=1] | 0 或 1 number | **单位置**（非 Lua 5.1 范围） | CONFIRMED |
| `string.find` | `str_find` | s, p [, init=1 [, plain]] | nil 或 start,end | 无 special 或 plain→memfind | CONFIRMED |
| `string.pack` | `b_pack` | fmt, ... | 1 binary string | **不是** Lua 5.3 pack。`x bB hH lL iI c s`；`>`/`<`；默认 native LE | CONFIRMED |
| `string.unpack` | `b_unpack` | fmt, data [, pos=1] | values + nextpos | 1-based pos | CONFIRMED |
| `string.packLen` | `b_size` | fmt | 1 number | size 0 报错 | CONFIRMED |
| `string.subV` | `str_subV` | 1 string | **2**：`(uintptr_t)p`, `len` | MythroadRuntime 提供稳定 guest 地址及可变字符串双向同步（2026-10-29）；独立 LuaVM 无 EXT 时仍返回 `0, len` | CONFIRMED ABI |
| `string.findEx` / `findex` | `gfind` | s, p | 1 closure | | CONFIRMED，本阶段未实现 |
| `string.subEx` / `subex` | `str_gsub` | | 2 | | CONFIRMED，本阶段未实现 |
| `string.format` / `dump` | | | | | CONFIRMED，本阶段未实现 |
| `string.c2u` / `u2c` | GB2312 | | | 需码表 | CONFIRMED，未实现（不猜码表完整性） |
| `string.new/set/update/pupdate` | 改 C 串缓冲 | | | intern 串不可变 | CONFIRMED，未实现 |

`start.mr.lua` 使用：`string.pack`、`string.sub`、`string.subV`。

---

## 6. table library（`mr_tablib.c`）

| registration | source | notes | confidence |
|---|---|---|---|
| `table.concat` | `str_concat` | `t [, sep="" [, i=1 [, j=getn]]]`；元素须 string/number | CONFIRMED |
| `table.getArrSize` / `getn` | `mr_B_getn` | `t.n` 若为 number≥0，否则 hidden sizes，否则数 1..n 至 nil | CONFIRMED |
| `table.setArrSize` / `setn` | `mr_B_setn` | 有 `t.n` 则写 `t.n`，否则 sizes[t] | CONFIRMED |
| `table.insert` / `remove` | | 用 getn/setn 移动数组 | CONFIRMED |
| `table.rawGet` / `rawSet` | | 不走 TM | CONFIRMED |
| `table.next` / `pairs` / `iPairs` | | | CONFIRMED |
| `table.save` / `load` | Pluto persist | 同 SaveTable 格式 | CONFIRMED |
| `table.sort` / `forEach` | | | CONFIRMED；sort 本阶段实现简单数组排序 |

---

## 7. base（`mr_baselib.c`）

| registration | source | args / returns | confidence |
|---|---|---|---|
| `_setTab` | `mr_B_setmetatable` | table, nil\|table → 1；`__metatable` 则 error | CONFIRMED |
| `_getTab` | `mr_B_getmetatable` | any → mt 或 `__metatable` 或 nil | CONFIRMED |
| `_num` / `tonumber` | `mr_B_tonumber` | | CONFIRMED |
| `_str` / `tostring` | `mr_B_tostring` | | CONFIRMED |
| `_next` / `next` | `mr_B_next` | | CONFIRMED |
| `type` / `_t` | | 长/短名 | CONFIRMED（5-B 已实现） |
| `coroutine.*` | `mrp_open_base` | create/wrap/resume/yield/status | CONFIRMED **ABI**；本 VM **无 thread**，不实现（不猜 yield） |

---

## 8. SaveTable / LoadTable

| 字段 | 值 |
|---|---|
| source | `mythroad.c:2734` / `:2766`；格式 `mr_pluto.c` |
| SaveTable | `(perms:table, root, filename)` → settop 2；open WRONLY\|CREATE 失败 **return 0**；成功 persist + `MR_SUCCESS`，return 1 |
| LoadTable | `(perms:table, filename)` → settop 2, pop；open 失败留下 perms，return 1；成功 unpersist，return 1 |
| 格式 | 每对象：`int firsttime`（0=ref / 1=first）；first→ `int ref` + `int type` + payload。nil = `0,0`。bool=`int`。number=`mrp_Number`（4 字节 LE）。string=`int len` + bytes。table：`int isspecial` + persist(mt) + k/v… + persist(nil) |
| PLUTO_TPERMANENT | 101 |
| 禁止 | `JSON.stringify` |
| 本实现 | 字面 nil/bool/number/string/table（含环、metatable）。function/userdata/thread **拒绝**（C 的 Lua closure persist 未移植） |
| EXT / gfx / timer | 否 / 否 / 否 |
| VFS | 是 |
| confidence | CONFIRMED |

---

## 9. `_runFile` / `RunFile` / RESTART

| 字段 | 值 |
|---|---|
| source | `mythroad.c:2968` `MRF_RunFile`；`mr_timer:4355` |
| args | `(pack, startfile, param)` 皆 tostring，缺省 0 指针 |
| returns | 0 |
| side effects | 写 `pack_filename` / `start_filename` / `start_fileparameter`；`mr_timer_p="restart"`；`MR_TIME_START(100)`；`mr_state=RESTART` |
| 不递归 | timer 见 RESTART：`mr_stop()` 然后 `_mr_intra_start(start_filename)` |
| pause@RESTART | 停 timer，`MR_SUCCESS` |
| resume@RESTART | `mr_timer_p="restart"`，`MR_TIME_START(100)` |
| pack 切换 | C 改 pack 名再 intra_start。本宿主无真实 FS；只跑 **当前 VFS** 里的 `startfile` |
| confidence | CONFIRMED |

---

## 10. `_strCom` 本阶段新增

| code | source | args | returns | side effects | EXT | VFS | confidence |
|---|---|---|---|---|---|---|---|
| 300 | `_mr_TestCom1` | bytes | 1 string 或 0 | gzip/unzip；非 gzip **原样返回** | 否 | 否 | CONFIRMED |
| 500 | | bytes | 1 string(16) | MD5 digest | 否 | 否 | CONFIRMED |
| 501 | `mr_base64.c` `_mr_encode` | bytes | 1 string 或 0 | **置换字母表** base64，不是标准 RFC | 否 | 否 | CONFIRMED |
| 502 | `_mr_decode` | bytes | 1 string 或 0 | 同上解码 | 否 | 否 | CONFIRMED |
| 2–6, 600, 603 | | | | host 指针 / m0 | | | CONFIRMED 存在，**不实现** |
| 700, 701, 900 | | | | SMS / platEx | | | P2，不实现 |

601/602/800/801/802：Stage 5-B，保持。

---

## 11. `_com`

5-B 已实现：1, 100, 101, 102, 400, 401, 403, 406, 3629。

| 未实现 | 原因 |
|---|---|
| 2–6 | native 函数指针 |
| 200–307 | shake / sms（P2） |
| 402 | socket（P2） |
| 其余 | UNKNOWN 或非 P0 |

---

## 12. Graphics command（仍 Null backend，不接 Canvas）

已有（5-B）：clear / rect / line / point / text / eff / flush。

| name | source | args | command op | confidence |
|---|---|---|---|---|
| `BitmapLoad` | `mythroad.c:1988` | i, file, x, y, w, h, max_w | `image` load；需 `bi & MR_FLAGS_BI` | CONFIRMED |
| `BitmapShow` | `:2067` | i, x, y [, rop, sx, sy, w, h] | `image` | CONFIRMED |
| `BitmapNew` | `:2111` | i, w, h | 分配槽（记录 state） | CONFIRMED |
| `BitmapDraw` | `:2139` | di,dx,dy,si,sx,sy,w,h,A,B,C,D,rop | `image` draw | CONFIRMED |
| `SpriteSet` | `:2207` | i, h | state | CONFIRMED |
| `SpriteDraw` | `:2219` | i, idx, x, y [, mod] | `sprite` | CONFIRMED |
| `TileSet` | `:2288` | i, x, y, w, h, tileh | state | CONFIRMED |
| `TileSetRect` | `:2324` | i, x1, y1, x2, y2 | state | CONFIRMED |
| `TileDraw` | `:2346` | i | `tile`（用已设 state） | CONFIRMED |
| `BitmapShowEx` | | 像素指针 | host 指针 | CONFIRMED，**不实现** |
| GUI / audio | | | | P1/P2，本阶段仅 command 记录已确认 draw |

`BITMAPMAX=30` `SPRITEMAX=10` `TILEMAX=3`。

---

## 13. `_plat` / `_platEx`

| 字段 | 值 |
|---|---|
| Lua | `MRF_plat(code, param)` → 1 number；`MRF_platEx(code, str)` → output, ret |
| 具体 code | `dsm.c` `mr_plat` / `mr_platEx` 分发；未逐码接到 Lua 测试 |
| confidence | 入口 CONFIRMED；**各 code 语义 UNKNOWN，禁止猜** |

---

## 14. Coroutine / closure / ownership

| 项 | 结论 | confidence |
|---|---|---|
| coroutine | base 注册 create/wrap/resume/yield/status；VM 无 thread | CONFIRMED 未实现 |
| closure / upvalue | 5-A 已有；对象活在 `LuaState` 数组（tables/closures/strings/upvals），不靠 JS GC 时机 | CONFIRMED |
| 打开 upvalue | 指向栈槽；`CLOSE`/`RETURN` 拷进 UpVal | CONFIRMED |

---

## 15. 真实 binary / 魔塔II

| 项 | 结果 |
|---|---|
| rxgj `*.mr` / `*.mrp` | 无 |
| flymrp 工作区 | `test/fixtures/real/app.mrp`（用户提供，未改原文件） |
| 身份 | SHA-256 `77487205…4263`，MRPG，`gssjxz.mrp`，蜀山剑侠传 |
| 启动 | 第一份 `start.mr`：`_mr_c_load==0`；cfunction load + `801` code 6 guest 返回 0 |
| 停点 | `table[49]` `mr_mkDir`（FILE）。LIVE name `gsidbak`。table[42] `mr_info` 已 REAL_EXECUTED（`dbglog.txt`/`gsidbak` → `MR_IS_INVALID`）。Lua 未恢复。Stage 5-C **NOT COMPLETE**。见 `docs/autonomous-progress.md` |
| `魔塔II.jar` | **工作区不存在**。未做 DRM。 |
| 结论 | **INSPECTED，不是 real-app green。** |

### table[14] memset2

| 字段 | 值 |
|---|---|
| source | `mythroad.c` `_mr_c_function_table[14] = memset2`；`string.c` `memset2` |
| ABI | `void *memset2(void *s, int c, size_t count)`：填 `c` 的低 8 位，返回 `s` |
| 真实调用 | `r0=0x00200294` `r1=0` `r2=19952`（ER_RW） |
| confidence | CONFIRMED |

### table[130] asm_mr_TestCom（5-C.10B：仅 case 7）

| 字段 | 值 |
|---|---|
| source | `mythroad.c` `_mr_c_function_table[130] = asm_mr_TestCom`；`fixR9.h` `#define asm_mr_TestCom _mr_TestCom` |
| ABI | `_mr_TestCom(L, input0, input1)`；rxgj `aex_t130` 传 `(NULL, r1, r2)`。Guest r0/r3 忽略 |
| 实现 | **仅 case 7**：rxgj FULL `#ifdef MR_PLAT_DRAWTEXT` → `return input1`。其它 case → `UnknownAbiError`。不是 universal Mythroad，不是平台探测 |
| 真实调用 | `r1=7` `r2=0x270f` → `r0=0x270f` **REAL_EXECUTED** |
| ER_RW | 函数本身不写；guest 随后 `str` 使 **ER_RW+0x1c = 0x270d**（LIVE） |
| 后继 | table[14] memset → table[38] REAL_EXECUTED → table[33] STOP |
| confidence | case 7 CONFIRMED（rxgj FULL）。整表 TestCom **未**实现 |

### table[38] asm_mr_platEx（5-C.10C：仅 code 0x4c6）

| 字段 | 值 |
|---|---|
| source | `mythroad.c` `_mr_c_function_table[38] = asm_mr_platEx`；`fixR9.h` `#define asm_mr_platEx mr_platEx`。**无 `_mr_platEx` 符号** |
| ABI | `int32 mr_platEx(int32 code, uint8 *input, int32 input_len, uint8 **output, int32 *output_len, MR_PLAT_EX_CB *cb)` |
| 实现 | **仅 code 0x4c6**：rxgj FULL `return MR_SUCCESS`（0），无副作用。其它 code → `UnknownAbiError`。`table[38] registered` ≠ 完整 platEx。不是背光系统 |
| 真实调用 | `0x01ea666a` BLX r4；`r0=0x4c6` `r1=0` `r2=0` `r3=0` `[sp]=0` `[sp+4]=0` **REAL_EXECUTED** |
| 返回 | LIVE `r0=0`；guest 无 cmp/test；下一 BL `0x01ea7ce8` 覆盖 r0。table[33] 入口 `r0=0x00010084` |
| 后继 | table[33] `mr_getTime` **REAL_EXECUTED** → table[17] `sprintf_` **REAL_EXECUTED** → table[40]/[44]/[45]/[41]/[43] **REAL_EXECUTED** → table[3]/[10] **REAL_EXECUTED** → table[1] **REAL_EXECUTED** → table[9] **REAL_EXECUTED** → guest inflate **PASS** → AppFS EFS **REAL_EXECUTED** → timer 31/32 + getScreenInfo 80 **REAL_EXECUTED** → **arm_ext_call(0) NORMAL RETURN** |
| confidence | 本次 0x4c6 CONFIRMED（rxgj FULL）。整表 platEx **未**实现 |

### table[33] asm_mr_getTime（5-C.10E 已实现）

| 字段 | 值 |
|---|---|
| source | `mythroad.c` `_mr_c_function_table[33] = asm_mr_getTime`；`fixR9.h` `#define asm_mr_getTime mr_getTime` |
| C | `uint32 mr_getTime(void)` |
| flymrp | `runtime.clock >>> 0`（deterministic elapsed ms；非 Date.now） |
| LIVE | stub `0x00010084`；零参数；`REAL_EXECUTED`；返回 0（未 advance）；STR `ER_RW+0x4358 = 0` |
| confidence | 身份/单位/LIVE 执行 **CONFIRMED**。见 `docs/stage5c10e-progress.md` |

### table[17] sprintf_（5-C.10G 已实现 literal+`%d`）

| 字段 | 值 |
|---|---|
| source | `mythroad.c` `_mr_c_function_table[17] = sprintf_`（mpaland/printf，非 libc） |
| C | `int sprintf_(char* buffer, const char* format, ...)` |
| flymrp | guest-aware literal bytes + `%d`（int32）。其它 specifier → `UnknownAbiError`。无 host va_list |
| LIVE | stub `0x00010044`；`r0=buffer` `r1="res_lang%d.rc"` `%d` **CONFIRMED** `R2=0`；写入 `"res_lang0.rc\0"`；返回 12（不含 NUL） |
| pack | 12 个 ER_RW+0x5c callsite；本次 LIVE 只需 `%d`；STATIC 另有 `%s`（未实现） |
| confidence | 身份/AAPCS/LIVE `%d` 写入 **CONFIRMED**。见 `docs/stage5c10g-progress.md` |

### table[40] asm_mr_open（5-C.10K：仅 current-pack RDONLY）

| 字段 | 值 |
|---|---|
| source | `mythroad.c` `_mr_c_function_table[40] = asm_mr_open`；`fixR9.h` `#define asm_mr_open mr_open` |
| C | `int32 mr_open(const char *filename, uint32 mode)` |
| mode | `MR_FILE_RDONLY=1`（LIVE R1）。不是 POSIX `O_RDONLY=0` |
| flymrp | 仅 `filename === packName` 且 `mode === 1` → 正整数 handle，backing = `MRPArchive.data`。其它 path/mode → `UnknownAbiError` |
| LIVE | stub `0x000100a0`；`r0=0x00200058` `"gssjxz.mrp"`；`r1=1`；返回 handle **1** **REAL_EXECUTED** |
| 限制 | 不是完整文件系统。不是 any-filename fallback |
| confidence | 身份/LIVE 数据流 **CONFIRMED**。见 `docs/stage5c10k-progress.md` |

### table[44]/[45]/[41] file ABI（5-C.10K：current-pack 字节流）

| 字段 | 值 |
|---|---|
| source | `mythroad.c` `_mr_c_function_table`；guest PIC wrapper `0x01ea8c30` / `0x01ea9304` / `0x01ea6e18` |
| C | `mr_read(f,p,l)` 返回字节数；`mr_seek(f,pos,method)` 成功 0；`mr_close(f)` 成功 0 |
| LIVE | read 16 header **match** `archive.data[0:16]`；seek CUR 224：16→240；read 5496 index **match** `archive.data[240:5736]`。table[41] 未到达 |
| 当前路径 | `_mr_readFile` EFS：open pack → read 16 → seek CUR → read index → memcpy/strcmp 目录扫描 → free TempName/index → seek/read payload → close → memcmp2 gzip magic → guest inflate complete → AppFS `gssjxz\\69` create/write → timer + getScreenInfo → **arm_ext_call(0) NORMAL RETURN** |
| 设计 | current `packName` + `MR_FILE_RDONLY` → `MRPArchive.data` 字节流。禁止包内成员 VFS |
| confidence | wrapper/slot/C + LIVE header/index **CONFIRMED** |

### table[100] pack_filename（5-C.10I 已实现 data slot）

| 字段 | 值 |
|---|---|
| source | `mythroad.c` `_mr_c_function_table[100] = (void*)pack_filename`；`char pack_filename[MR_MAX_FILENAME_SIZE]`（128） |
| C | 不是 function。guest 读到的是 `char*` 指向 128 字节缓冲 |
| copy | rxgj `arm_ext_set_pack_table_name`：`memset(dst,0,128)` + `snprintf(dst,128,"%s",name)` |
| flymrp | `MythroadRuntime.packName`（MRP header filename / Lua `PackName`）。`bindExt` 时写入。无 host path / UTF-8 FS 转换 |
| LIVE | 地址 `0x00200058`；内容 `"gssjxz.mrp\0"`；扩容使后续 P/ER_RW +0x78 |
| confidence | 类型/大小/copy/生命周期/LIVE **CONFIRMED**。见 `docs/stage5c10i-progress.md` |

### table[3] memcpy2（5-C.10M 已实现前向逐 byte）

| 字段 | 值 |
|---|---|
| source | `mythroad.c` `_mr_c_function_table[3] = (void*)memcpy2`；`string.c` `memcpy2` |
| C | `void *memcpy2(void *dest, const void *src, size_t count)` |
| 行为 | 前向逐 byte `read8` 再 `write8`；返回 dest；count=0 不访问指针；**不是** memmove / TypedArray.set |
| flymrp | `memcpy2()`；overlap `[1,2,3,4,5]` dst=src+1 count=4 → `[1,1,1,1,1]` |
| LIVE | 第一笔 R0=`0x01e7ff34` R1=`0x00205864` R2=4 → dst `09 00 00 00`（len=9）。第二笔 TempName `"start.mr\0"` count=9 |
| confidence | identity/LIVE/前向 overlap **CONFIRMED**。不是完整 libc memcpy。见 `docs/stage5c10m-progress.md` |

### table[10] strcmp2（5-C.10M 已实现）

| 字段 | 值 |
|---|---|
| source | `_mr_c_function_table[10] = (void*)strcmp2`；rxgj `string.c` 用 `unsigned char c1,c2`，返回 -1/0/1 |
| C | `int strcmp2(const char *cs, const char *ct)` |
| flymrp | 逐 byte `read8`，first-diff 即停；不 decode UTF-8 / locale |
| LIVE | `"res_lang0.rc"` vs `start.mr` → -1；vs `mrc_loader.ext` → 1；vs `res_lang0.rc` → 0 |
| confidence | identity/unsigned-char/-1/0/1/LIVE **CONFIRMED**。不是完整 libc strcmp |

### table[1] mr_free（5-C.10O registry-only）

| 字段 | 值 |
|---|---|
| source | `_mr_c_function_table[1] = (void*)asm_mr_free`；`fixR9.h` `#define asm_mr_free mr_free` |
| C | `void mr_free(void *p, uint32 len)`。C 返回 void。`aex_t001` 总是 `R0=MR_SUCCESS` |
| flymrp | registry-only：exact live `guestAddr`+`size` 后退役；NULL/unknown/already-free → 0；known pointer + wrong len → `NativeAbiError`。不复用、不写 free-list metadata |
| LIVE | TempName `0x00206de0`/132 **REAL_EXECUTED** ret=0；indexbuf `0x00205860`/5500 **REAL_EXECUTED** ret=0 |
| confidence | identity/wrap/LIVE/registry **CONFIRMED**。不是完整 origin_mem。见 `docs/stage5c10o-progress.md` |

### table[9] memcmp2（5-C.10P 已实现）

| 字段 | 值 |
|---|---|
| source | `_mr_c_function_table[9] = (void*)memcmp2`；`string.c` `int memcmp2(const void *cs, const void *ct, size_t count)` |
| C | unsigned char 逐 byte；`res = *su1 - *su2`；first-diff early exit；`count==0` 返回 0 且不访问 pointer。**不是** `-1/0/1` |
| flymrp | 按 `string.c`，不套 libc `memcmp`。`aex_t009` 用宿主 memcmp，可能夹成 `-1/0/1`；本实现不复刻该夹取 |
| LIVE | `#1/#2` `1F 8B` vs `1F 8B` n=2 **ret=0**。`CMP r0,#0` / `BEQ` 进入 gzip path。随后 guest inflate 停在 ARM insn budget |
| confidence | identity/返回规则/LIVE **CONFIRMED**。见 `docs/stage5c10p-progress.md` |

### table[30] mr_getCharBitmap（已实现）

| 字段 | 值 |
|---|---|
| source | `mythroad.c` `_mr_c_function_table[30] = asm_mr_getCharBitmap`；`aex_t030`；`dsm.c` sky16 |
| C | `const char *mr_getCharBitmap(uint16 ch, uint16 fontSize, int *width, int *height)` |
| flymrp | 无 `gb12.uc2` → 全部 fontSize 用 gb16 度量（ASCII 8×16，其它 16×16）。字形生成，不是 UC2。32 字节 `arm_alloc` 槽复用 |
| LIVE | R0=`0x662f` R1=0 R2/R3 width*/height* LR=`0x01eaadad` **REAL_EXECUTED** |
| confidence | 度量 CONFIRMED。像素是 documented stand-in |

### table[37] mr_plat（仅 code 1206）

| 字段 | 值 |
|---|---|
| source | `_mr_c_function_table[37] = asm_mr_plat`；`1206 == MR_GET_HANDSET_LG`；rxgj `dsm.c` 返回 `MR_CHINESE==1000` |
| flymrp | 仅 1206 → 1000。其它 code → `UnknownAbiError`。rxgj FULL，不是完整 plat |
| LIVE | R0=1206 R1=0 LR=`0x01e8edf3` **REAL_EXECUTED** |
| confidence | 本次 1206 CONFIRMED |

### table[26] mr_printf（subset）

| 字段 | 值 |
|---|---|
| source | `_mr_c_function_table[26] = asm_mr_printf`；`aex_t026` `format_arm(..., first_arg=1)`，返回 0 |
| flymrp | literals / `%d` / `%s` / optional width。不调用 host printf |
| LIVE | `SDK%s%dv%d%s)` 与 `SDKv%d.%d.%d.%2d(%dv%d%s)` **REAL_EXECUTED** |
| confidence | LIVE subset CONFIRMED。不是完整 libc printf |

### table[42] mr_info（已实现）

| 字段 | 值 |
|---|---|
| source | `_mr_c_function_table[42] = asm_mr_info`；`int32 mr_info(const char *filename)` |
| 返回 | `MR_IS_FILE=1` / `MR_IS_DIR=2` / `MR_IS_INVALID=8` |
| flymrp | 仅 current pack name → `MR_IS_FILE`。archive member / `dbglog.txt` / 其它 → `MR_IS_INVALID` |
| LIVE | `dbglog.txt` 然后 `gsidbak` → `MR_IS_INVALID` **REAL_EXECUTED** |
| 注意 | rxgj：当前 MRP 内条目不是已安装 EFS，不能报 `MR_IS_FILE` 以免跳过解包 |
| confidence | 身份 + LIVE 查询 CONFIRMED。writable EFS 未实现 |

### table[49] mr_mkDir（BLOCKED）

| 字段 | 值 |
|---|---|
| source | `_mr_c_function_table[49] = asm_mr_mkDir`；`int32 mr_mkDir(const char *name)` |
| LIVE | name=`gsidbak` stub=`0x000100c4` LR=`0x01ea89b3` |
| confidence | 身份 CONFIRMED。实现未落地 |

---

## 16. 计数（证据条目）

本文件列出的独立 API / opcode 证据条目 ≥ 20。

| confidence | 约数 |
|---|---|
| CONFIRMED | 本阶段实现所依据的全部主路径 |
| INFERRED | 0（无） |
| UNKNOWN | `_plat*` 其它 code、未读完的 GUI/audio/network |

---

## 17. 明确不实现（本阶段）

Canvas / WebGL / WebGPU / WebAudio / DOM / setTimeout / IndexedDB / network / SMS / WAP / JIT / CPU·EXT rewrite / DRM / 猜测 UNKNOWN ABI / 默认安装 mathlib / `string.set` 可变缓冲 / coroutine thread / Pluto 持久化 Lua function。
