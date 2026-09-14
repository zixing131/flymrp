# 本地兼容组件

这些文件提供旧手机运行环境中的字库和插件。游戏本体仍由用户从本地目录加载，测试清单保存文件的 SHA-256，不复制游戏到仓库。

- `system/gb16.uc2`：项目原有的 16 点 UCS-2 字库，SHA-256 `6a6d819025765b4b967aa9dd5c7efc5c86b06265b73a14db91869b22bf3d2dd5`。
- `system/gb12.uc2`、`gb12_uc2.adl`、`gb16_uc2.adl`：来自用户游戏集合中的 `320×480分辨率游戏（无中文明命名）/相关文件/system/`。12 点字库 SHA-256 为 `f8e9a443e28eecce3a99f0ebf26a197b1ef5e65bab5406054ff7e985d48274b3`，两个索引文件均为 `3149a176488216bda8e4656c918962584c19d29fdde1a9e40c162e0da3a33bce`。
- `plugins/netpay.mrp`：来自本机参考项目 `rxgj-main/test/fixtures/plugins/netpay.mrp` 的兼容测试组件，appid 480010、版本 386，SHA-256 `6f6d7f07d9751860bd77f76e4b844bf60332e6a36af1966ccb86eecdff3cfd4c`。参考项目的 `omx_wiki/gjxwsmn-netpay-plugin-update-progress.md` 记录了该文件的来源与版本。此前测试用户集合的版本 374 时，《干柴烈火美女剑》会报付费值异常；版本 386 能完成本地提示回调并恢复剧情。

每次运行将组件复制到独立的内存文件系统。`OfflineNetwork` 在内存中复用参考项目 `tools/pay-server/skymobi-pay-server.go` 的 `/payOneAsTlv` 和 `/payOne` 测试响应，保留事务号回显、PREREG 非授权响应以及 REG/PROP 的继续动作；本地使用已安装的 386 组件，不强制下载更新。测试报告单独记录命中的离线服务。

来宾无法访问真实短信、支付或网络；未知域名、端点和 UDP 均返回失败。离线测试服务不等于原在线业务或真实支付功能，也不意味着其他依赖在线服务器的游戏已经兼容。

- `system/gb12v2.uc2`、`gb12v2.adl`：来自同一集合的 `相关文件/system/`，供第二版字库加载器直接读取，避免反复提示下载字库。SHA-256 分别为 `728e3c78b4a7ebd11c3cdcec671a4c0c70d2cb03fe5f919ca0b4379ac74533f9` 和 `05ff9a62aeea4d5c8a2a0c3d2a45fa086c478e2f9628f1bbe1cdb75f3a9b61ee`。
- `plugins/flaengine.mrp`：来自同一集合的 `相关文件/plugins/`，appid 490284、版本 1029，SHA-256 `e8cf02e024c451368f8d2dd8af868a287b4e2aa5f278c231a749c2f1920e5d0d`。供《格子风暴》等游戏加载本地引擎。

## 生产资源包

用户已授权将游戏集合 `mythroad/` 中的有效文件复制进 Git 并用于生产构建。根目录结构直接映射为来宾文件系统路径，完整清单、大小和 SHA-256 见 [mythroad-manifest.json](mythroad-manifest.json)。排除 `.DS_Store` 等隐藏系统文件。

清单记录所有文件，包括 `system/` 字库、`plugins/` 通用插件、`gwy/` 资源和 `app240400/` 已有数据；保留原字节和文件名。Vite 将其复制到生产输出目录，网页按清单加载，无需依赖开发服务器上的用户目录。第三方资源不因项目采用 AGPL-3.0 而被重新许可。

- `ydqtwo.mrp`：来自用户集合 `MRP游戏软件合集3426合一（内容杂乱，多数无中文命名）/ydqtwo.mrp` 的共享阅读器，69,149 字节，SHA-256 `2b79762e5bd51780e20ebb0fb5a39872d2d9987db884f64f44044a5bc52a0684`。用于旧图文包的 `_loadPack`/`dofile` 加载链，保留原始字节；不是模拟成功的空组件。

## 第四轮补充（持续验证中）

- `plugins/msbase.mrp`：用户集合 `mrp资源2218个文件（无中文命名）/171875_2301250msbase.mrp`，29118 字节，SHA-256 `1cdd728c69c909e4e193a97c1b1e68406c97c11c7a3cacfdd35eb484a1d7a5f5`。保持原始字节。
- `plugins/mscore.mrp`：用户集合 `MRP游戏软件合集3426合一（内容杂乱，多数无中文命名）/mscore.mrp`，74413 字节，SHA-256 `a8e965e5b243490e7c46f4cc118430c01a07f256e827b0823619f1af72ec892a`。保持原始字节。
- `plugins/kbill.mrp`：用户集合 `MRP游戏软件合集3426合一（内容杂乱，多数无中文命名）/kbill.mrp`，31306 字节，SHA-256 `bd9b7e8fc17ec68ead4971b6ea95eb26ae9067ad35b581227052a5e2fd3bb3c5`。保持原始字节。
- `plugins/addons.mrp`：用户集合 `mythroad_res/plugins/addons.mrp`，1202 字节，SHA-256 `d2f158c25e78c57e3d9e54564ba07739dc54e7802eaaab5dc327a4e892788ddb`。保持原始字节。

`msbase`（appid 499990/version 1001）与 `mscore`（499991/1009）加入原始包下载映射，真实安装器已逐次收到它们；后续 appid 480101 仍缺失，尚不能宣称该安装链完成。`addons.mrp` 是集合中原有的编码资源，不按普通 MRPG 文件强行解析或重打包。
