# Architecture / 架构

FormaBot is an Electron desktop workspace. DeepSeek Harness powers member execution. The following responsibility map describes module boundaries, not a guarantee that every capability has passed acceptance. See [preview limitations](docs/release-readiness.md).

FormaBot 是基于 Electron 的桌面工作空间，以 DeepSeek Harness 承载成员执行。下表说明模块职责，不代表所有能力均已通过验收。

| 模块 ID | 职责 | 依赖 |
| --- | --- | --- |
| local-state | 本地事务存储、迁移、密钥存储接口、恢复记录 | — |
| workspace-access | 工作空间选择、一次授权、撤销、产物路径和执行能力检查 | local-state |
| model-providers | 服务商预置、连接验证、统一工具调用与流式响应 | local-state |
| execution-tools | read/write/edit/bash/browser 执行，路径与进程限制、浏览器身份管理 | workspace-access |
| agent-runtime | 成员配置、模型工具循环、任务队列、取消、重试和恢复 | model-providers, execution-tools |
| team-collaboration | 私聊、群组、消息路由、成员委派、上下文共享策略 | agent-runtime |
| desktop-app | 配置、成员/群聊、授权入口、任务状态和产物预览 | team-collaboration |
