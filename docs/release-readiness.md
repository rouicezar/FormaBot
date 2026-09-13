# Development preview status / 开发预览状态

FormaBot is under active development. Downloadable previews are not stable releases, and successful builds do not establish complete product acceptance.

FormaBot 正处于积极开发阶段。可下载预览版并非稳定发行版，构建成功不代表所有功能均已完成验收。

## Downloads / 下载

- [Latest preview / 最新预览版](https://github.com/rouicezar/FormaBot/releases/tag/latest-preview)
- [Build workflow / 构建记录](https://github.com/rouicezar/FormaBot/actions/workflows/build.yml)

Check the release's source commit and SHA-256 checksums. Current previews target macOS on Apple Silicon and are unsigned and not notarized. Other platforms are not currently validated.

请核对发行页的源码提交与 SHA-256 校验和。当前预览版面向 Apple Silicon Mac，尚未签名或公证；其他平台尚未验证。

## Known limitations / 已知限制

- Task cancellation, recovery and multi-member delivery still need further acceptance testing. A completed message alone is not proof of a usable file.
- Browser authorization and remote MCP connections remain under development; enabling a Skill does not establish an MCP connection.
- English and Simplified Chinese are available, but localization of some dynamic messages and native prompts remains incomplete.
- Cloud inference requires model configuration and sends relevant task context to the selected provider. Local file storage does not mean offline inference.

- 任务取消、恢复与多成员交付仍需进一步验收；消息结束不等于文件已正确交付。
- 浏览器授权及远程 MCP 连接仍在完善；启用 Skill 不代表已连接 MCP。
- 已支持英文与简体中文，但部分动态消息和原生提示尚未完成翻译。
- 云端推理需要配置模型，相关任务上下文会发送至所选服务商；本地存储不等于离线推理。

Please report reproducible problems through [GitHub Issues](https://github.com/rouicezar/FormaBot/issues), including the version, steps and expected behavior. Remove API keys and personal content before attaching logs or screenshots.

欢迎通过 GitHub Issues 提交版本、复现步骤与预期结果。附加日志或截图前，请移除 API Key 和个人内容。
