# 294项后续修复：目录枚举

## 软件魔盒 #1300

旧实现省略目录的`.`和`..`。空目录findStart返回有效句柄和空文件名；软件魔盒把空名称当作子目录递归，构造`appbox/plug////...`，最终指针被0x2f字节覆盖并崩溃。

原生依据：本地rxgj-main的src/file_lib.c:375直接返回系统readdir结果，native_dsm_funcs.c:251转发该名称，mythroad/dsm.c:1646打开目录并取首项。原生包含`.`与`..`，空目录不会把空字符串作为首项。

现在ARM和Lua的find接口共享AppFileSystem.findEntries，包含点目录项；普通文件列表保持只返回真实子项。对应空目录、GBK文件名和Lua遍历测试更新。隔离对照和正式代码均不再触发非法指针，写出8个appbox文件后退出安装流程。主功能尚在验证，不以安装退出当完整通过。

860项测试通过、1项跳过；16项既有功能场景串行回归全部passed；类型检查通过。真实证据目录：artifacts/compat-20260915/appbox-fixed、directory-regression。

## 明星美女麻将馆 #1410

已定位UCS2写溢出：guest在0x1e93f1c转换字符串，首次计数遇到NUL后申请24字节；写入循环遇到非法高位字节后跳过后继NUL，继续读写，覆盖0x2a4b40空闲块。调用者0x1e9c36c把一段大端UCS2说明文本当GBK传给文字测量函数。当前证据指向guest内的编码/边界问题，未通过扩大堆或忽略堆校验掩盖；尚未结案。CPU、寄存器和内存写入记录见artifacts/compat-20260915/diagnostics/heap-1410.json。

## 功能补测

12项第一轮定向操作和11项第二轮均串行完成。#1040节日祝福语验证连续下一条/上一条导航，#2486找回元素完成第一关并进入第二关；已审阅画面独立回归均passed并持续60秒。原313项累计结案21项，剩余292项。软件魔盒主功能仍待验证，其安装流程修复未计入结案。

## 父目录路径与后续验证

点目录项需要真实可访问。补齐路径中的`.`/`..`折叠，目录info对工作目录返回MR_IS_DIR，保留`.hidden`字面名称。原生get_filename（dsm.c:1053）对空名称拼接dsmWorkPath，因此空名称也是目录而非不存在的文件。新增父目录访问、重命名和ABI目录类型测试。862项测试通过、1项跳过。

软件魔盒的安装后主包为appbox/plug/opxrjmh.mrp。在保留安装文件的新运行时中启动它，可进入更多软件/精品软件/我的软件及菜单。在线目录请求proxy.51mrp.com/page2未匹配本地离线资源，持续重试；未伪造服务数据，因此在线功能未结案。完整运行1785 ticks、115104ms，无运行异常；证据appbox-child、appbox-enter、appbox-tabs和diagnostics/appbox-installed-files.json。

合并原302项与此前11项为313项串行回归，使用regression313-manifest.json和regression313-scenes.json。补入已核实的按键/触屏操作，仍以每项实际功能证据结案；运行结果写入artifacts/compat-20260915/regression313。
