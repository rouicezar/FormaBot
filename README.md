# FormaBot

[English](README.md) | [简体中文](README.zh-CN.md)

FormaBot is a local desktop workspace for AI teammates. Create persistent bots and groups, assign work, inspect execution progress, and open delivered files directly from conversations.

## Project status

FormaBot is under active development, and some features may not yet be complete. We welcome you to fork the project, contribute improvements, and report bugs or suggest features through [GitHub Issues](https://github.com/rouicezar/FormaBot/issues).

Connect with the developer to share your experience and ideas. Find us on X at [@ericbuszhang](https://x.com/ericbuszhang), or on Douyin, Xiaohongshu, WeChat Channels, and Bilibili as **AI樟榆树**.

**Development preview — not a stable release.** The current validated platform is macOS on Apple Silicon. Task-control, delivery recovery, browser approval, localization, and distribution gates remain tracked in the [release readiness report](docs/release-readiness.md). A successful build does not mean these gates have passed.

## Capabilities

- Persistent bot and group conversations with direct mentions.
- Local file, command, and browser tools within authorized project workspaces.
- Project folders fixed at creation; changing the default does not relocate existing projects.
- Inline artifact references, delivery history, and isolated file previews.
- Execution progress and a combined send/stop control.
- An independent settings window for model connections, workspaces, approval rules, memory, and conversation visibility.

Cloud inference requires a supported provider and an API key. Local execution does not mean offline inference: relevant task context is sent to the selected provider. Existing secrets, browser profiles, conversations, and user files are not part of this repository.

## Installation

Development installers are prepared for [GitHub Releases](https://github.com/rouicezar/FormaBot/releases). Check the release's validation status and SHA-256 checksums before use. Public distribution is pending the release gates; do not assume that a local preview has Developer ID signing or Apple notarization.

## Development

Requirements: macOS Apple Silicon, Node.js 26.7.0, and npm. Runtime components are pinned and verified during build preparation.

```sh
npm ci
npm run typecheck
npm test
npm run package:dir
```

`npm test` includes native macOS sandbox checks. Run it in an environment that permits `sandbox-exec`; an outer sandbox can invalidate those checks. Built applications include their execution runtime and do not ask end users to install Node.js.

## Documentation

- [Requirements](docs/requirements.md)
- [Architecture](CAPABILITY-MAP.md)
- [Acceptance status](docs/status.md)
- [Development plan](tasks/plan.md)
- [Release readiness](docs/release-readiness.md)
- [Internationalization design](docs/internationalization.md)
- [Commercial licensing](docs/commercial-licensing.md)

Choose English or Simplified Chinese in Settings → General → Language. Settings and common workspace controls switch without restarting. Full localization of native approvals, runtime errors and remaining dynamic descriptions is still in progress; see the internationalization status.

## License

Personal noncommercial use is permitted under the [FormaBot Personal Use License](LICENSE). Commercial or organizational use requires a separate written authorization. This project is source-available, not OSI-approved open source. Third-party components retain their own licenses.

Latest development builds are available from [GitHub Actions](https://github.com/rouicezar/FormaBot/actions/workflows/build.yml). Open the latest successful run and download its macOS arm64 artifact, which includes the installer, source commit, and SHA-256 checksums. These previews are unsigned and not notarized.

[Download latest preview / 下载最新预览版](https://github.com/rouicezar/FormaBot/releases/tag/latest-preview)
