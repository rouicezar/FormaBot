# FormaBot

[English](README.md) | [简体中文](README.zh-CN.md)

FormaBot 是面向 AI 成员协作的本地桌面工作空间。创建持久 Bot 和群组、分配任务、查看执行过程，并直接在对话中打开交付文件。

## 当前状态

FormaBot 正处于积极开发阶段，部分功能仍在完善中。欢迎 Fork 项目进行探索与改进，或通过 [GitHub Issues](https://github.com/rouicezar/FormaBot/issues) 反馈问题、提出建议，共同推动项目发展。

**开发预览，尚非稳定发行版。** 当前验证平台是 macOS Apple Silicon。任务控制、可信交付、浏览器审批、国际化与分发门禁见[发布就绪报告](docs/release-readiness.md)。构建通过不等于发行验收完成。

## 功能

- 持久 Bot 与群组会话、直接 @ 成员。
- 在已授权项目空间中使用文件、命令与浏览器工具。
- 创建时固定项目目录；更改默认目录不迁移已有项目。
- 正文内嵌产物、历史时间轴与隔离预览。
- 执行进度及发送/停止合一按钮。
- 独立设置窗口，管理模型、目录、审批、记忆与会话显示。

本地执行不等于离线推理。需要配置模型服务商和 API Key；必要任务上下文会发送给所选服务商。真实密钥、浏览器资料、对话和用户文件不随仓库发布。

## 安装与开发

安装包面向 [GitHub Releases](https://github.com/rouicezar/FormaBot/releases) 准备；公开分发前应核对发行状态和 SHA-256，不把本地预览包视为已签名公证的正式包。

开发环境：macOS Apple Silicon、Node.js 26.7.0、npm。

```sh
npm ci
npm run typecheck
npm test
npm run package:dir
```

测试包含真实 macOS 沙箱检查，外层沙箱可能导致权限反例无法运行。构建内置执行运行时，普通用户无需安装 Node.js。

## 文档与许可

[需求](docs/requirements.md) · [架构](CAPABILITY-MAP.md) · [状态](docs/status.md) · [计划](tasks/plan.md) · [发布门禁](docs/release-readiness.md)

在设置 → 常规 → 语言中选择简体中文或 English，设置与常用工作台控件即时切换并保存。原生审批、运行时错误和剩余动态描述仍待完整本地化。

采用[个人使用许可](LICENSE)：允许个人非商业使用；商业或组织使用须[另行申请书面授权](docs/commercial-licensing.md)。本项目属于源码可见项目，不声称采用 OSI 开源许可。第三方组件保留各自许可。

最新开发构建见 [GitHub Actions](https://github.com/rouicezar/FormaBot/actions/workflows/build.yml)。打开最新成功的运行记录，下载 macOS arm64 构建产物，其中包含安装包、源码提交号和 SHA-256 校验文件。预览版尚未签名或公证。

[Download latest preview / 下载最新预览版](https://github.com/rouicezar/FormaBot/releases/tag/latest-preview)
