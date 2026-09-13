# M0 桌面与包内启动证据

> 阶段证据：成功用例仅覆盖本文明确场景；后续审查发现的反例仍有效。当前完整验收见 [状态矩阵](../status.md)。

2026-09-09，macOS 26.6.2 / arm64，本机开发环境。没有真实模型调用。

## 已实测

- TypeScript 检查与 esbuild 构建成功。
- Vitest 6 项：配置脱敏与重启、拒绝跨服务商复用 Key、系统加密不可用时拒绝保存、参数校验；实际 Harness 启动关闭、缺失包内 Node 拒绝、探测中止（部分断言合并在同一测试）。
- scripts/smoke-desktop.mjs：真实 Electron safeStorage 加密保存测试字符串，重启恢复模型配置，页面不回显 Key，删除配置。落盘无原始测试字符串；不是使用模拟加密函数的实机证据。
- scripts/smoke-package.mjs：运行 build/mac-arm64/FormaBot.app，cwd 为 .tmp/package-smoke，PATH 只有系统目录。app.isPackaged 为 true；包内 Node 驱动包内 SDK/DSH，完成初始化并退出。未调用模型、未执行工具。
- 包中包括 Node LICENSE、Electron LICENSE、Chromium notices 与依赖自身许可文件；构建阶段完成依赖获取，App 无运行期安装入口。

## 固定组件

- dsh / SDK client / llm-pi-ai：0.1.2-rc.1，npm 锁文件记录完整依赖。
- Node 26.7.0 darwin-arm64 归档 SHA256：7ee659a7768e641bbfd5360940660b8e8fd0052f77488f365562bac522fc15d4。
- Electron 44.2.0 darwin-arm64 归档 SHA256：f906dff5d054b1b92e5711781b13cc206fd7139ce66467503b9d0a3e6fbc9b02。
- Electron 的构建期下载使用镜像取得文件，并对照包中发布校验和验证；可重复构建脚本默认使用官方 URL。Node 对照官方 SHASUMS256 验证。校验常量保存在 scripts/prepare-runtime.mjs。

## 留存与限制

截图 .tmp/desktop-smoke/app.png、.tmp/package-smoke/packaged-app.png；构建日志 .tmp/package-build.log。临时证据不进入 Git，复验脚本进入 Git。

这证明配置界面、系统加密接口、重启恢复和包内启动在当前机器可用。不证明干净系统兼容性、模型可调用、完整任务停止、授权隔离或多成员功能。未签名公证，未执行 A15 的真实模型工具任务；任务入口保持禁用。授权和执行接入是下一切片。
