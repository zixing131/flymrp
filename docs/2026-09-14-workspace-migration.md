# 工作目录迁移（2026-09-14）

按用户纠正，当前唯一工作目录为 `/Users/zixing/Documents/zixing/github/flymrp`。后续代码、测试、构建、兼容性目标和部署准备均在此目录执行。

迁入内容包括 fork 的商店功能、本轮所有兼容性修复、2640 个包的测试材料、图标和资源缓存、分片数据、EdgeOne 上传记录及部署工具。保留目标仓库原有 `.git` 和 `origin=https://github.com/zixing131/flymrp.git`，没有提交或推送。

迁移前目标工作区干净。备份位于 `/Users/zixing/Documents/zixing/github/flymrp-migration-backup-20260914/`：

- `target-before/`：原 flymrp 完整备份。
- `source-before/`：原 flymrp2 完整备份，包括原 Git 历史。

旧路径 `/Users/zixing/Documents/zixing/github/flymrp2` 现在只是指向 `flymrp` 的符号链接，用于让历史测试证据和临时探针中的旧绝对路径继续有效；没有第二个活动工作区。历史结果文件内容和校验值不重写。

校验了 32525 个源文件（排除依赖、Git、可重建产物及 Finder 元数据），无缺失。78 个临时诊断脚本/日志归档到 `artifacts/compat-20260914/migration-debug-files/`。凭据继续保留在仓库外。

新目录中执行 `npm ci`、类型检查和全套测试：844 项通过、1 项跳过，157 个测试文件通过。EdgeOne 构建通过。重新生成部署目录时修复了已打开目录的 Finder 元数据可能导致清理失败的问题：改为先生成完整临时目录，再切换到正式部署目录，避免破坏上一份产物。

完整部署产物位于 `artifacts/edgeone/deploy/`。云端 Blob 无需重新上传，项目和存储键均未改变；正式网站仍未发布。兼容性 313 项目标仍在继续，本次目录迁移不代表这些问题已全部解决。
