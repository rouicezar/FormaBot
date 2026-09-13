# Agent SDK / Harness 能力评估

> 历史调研/审查记录：下文结论对应当时的范围与基线，不作为当前已实现能力。最新事实见 [状态矩阵](status.md)，整改顺序见 [执行计划](../tasks/plan.md)。本轮未重新联网核验历史第三方来源。

日期：2026-09-09。结论级别：官方文档核对 + Pi 局部源码检查；未安装 SDK、未调用真实模型、未完成产品运行验收。

最新决定见 [ADR-001](harness-decision.md)：采用 DeepSeek Harness。下文为初筛记录，运行验证仍未完成。

## 结论

没有一个候选能直接提供完整 FormaBot。初筛时建议 Pi 优先；加入官方 DeepSeek Harness 后，最新建议改为 DeepSeek 优先验证、Pi 备选，详见 [专项对比](deepseek-vs-pi.md)。本文件保留三个初筛候选的能力依据，均不是已批准选型。

Pi 组合：pi-ai 负责多服务商模型，pi-agent-core 负责工具循环；pi-coding-agent 提供更完整的会话、压缩和文件工具。先验证完整 SDK 的受控加载与工具替换，若 CLI 默认行为难以收敛，再评估较低层组合，避免过早重写会话管理。

## 需求匹配矩阵

原生表示存在可用接口，不代表本产品验收通过。补建表示需要 FormaBot 实现。

| 需求 | Claude Agent SDK | OpenAI Agents SDK（Python 文档） | Pi SDK |
| --- | --- | --- | --- |
| 多家云模型、不同成员用不同模型 | 官方路径以 Claude 及其云托管渠道为中心；未证明通用多厂商接入 | 自定义模型/兼容接口及第三方适配；能力差异需逐一验证 | pi-ai 原生多服务商和模型目录 |
| read/write/edit/bash | 内置工具 | 函数工具与本地 Shell/ApplyPatch 接口；执行由应用提供 | coding-agent 内置四项工具，可定制执行后端 |
| 浏览器、账号持久化 | 接 MCP/自定义工具，产品账号管理需补建 | Computer 接口或函数工具，浏览器实现需提供 | 自定义工具/扩展；浏览器与账号管理需补建 |
| 同空间只授权一次 | hooks/权限回调可接策略，但自动允许路径可能跳过 canUseTool | 应用在执行器中接授权记录，无须逐次人工审批 | 工具预检/自定义执行器可接策略；不内置权限弹窗 |
| 文件和 Bash 防越界 | 权限规则不能直接当成本产品完整沙盒 | 应用提供执行隔离 | 默认本地工具不是沙盒，必须替换或约束 |
| 持久成员、群组、成员建群 | 子代理不等于持久成员群组，需补建 | Agent/handoff/agent-as-tool 是编排基础，群组需补建 | 多 session + 协作工具，群组和路由需补建 |
| 人类中途介入 | 流式输入与会话接口 | 流式运行和应用调度；介入语义需验证 | steer/followUp/abort 接口；不是任意瞬间打断 |
| 会话恢复 | 原生会话恢复 | sessions/RunState | SessionManager/会话恢复 |
| 崩溃恢复、不重复发布 | 需持久任务记录和幂等 | 同左，RunState 不等于副作用恰好一次 | 同左，会话恢复不等于任务恢复 |
| 本地产物、普通用户配置 UI | 应用补建 | 应用补建 | 应用补建 |

## Pi 的源码证据

检查仓库 earendil-works/pi，commit `6160683a4a8012f0d1cd30c145df18b4ca6f5176`；该提交 coding-agent/package.json 版本为 0.85.1，不据此推断 npm 发布版本。旧 badlogic/pi-mono 和旧包命名不可直接用于新安装指令。

- agent-loop.ts：参数验证后调用 beforeToolCall；block 会在真正 execute 前返回阻断结果。可以接持久授权检查，但这个回调本身不提供 OS 隔离。
- bash.ts：默认使用 child_process.spawn，传入 cwd/env；BashOperations.exec 可替换。说明可以接受控执行服务，也说明仅传 cwd 无法保护宿主文件。
- read.ts：默认直接使用 fs 读文件；ReadOperations 可替换。必须控制路径解析、符号链接和相关元数据读取，不能只包住最终 readFile 就声称隔离完成。
- SDK 文档包含 customTools、resourceLoader、session 管理与 steer/followUp/abort。加载器必须由应用控制，避免自动载入用户全局扩展、配置和无关成员上下文。

固定源码：
- https://github.com/earendil-works/pi/blob/6160683a4a8012f0d1cd30c145df18b4ca6f5176/packages/agent/src/agent-loop.ts
- https://github.com/earendil-works/pi/blob/6160683a4a8012f0d1cd30c145df18b4ca6f5176/packages/coding-agent/src/core/tools/bash.ts
- https://github.com/earendil-works/pi/blob/6160683a4a8012f0d1cd30c145df18b4ca6f5176/packages/coding-agent/src/core/tools/read.ts

## 必须由 FormaBot 持有的能力

1. 工作空间身份和持久授权：首次授权一次；新成员、任务与重启复用；撤销立即影响后续执行。
2. 工具执行服务：文件范围、Bash 进程隔离、取消、超时、环境变量过滤，保护模型 Key 和浏览器凭据。
3. 成员与群组：成员独立上下文、群成员关系、消息路由、异步委派、文件/账号资源协调。
4. 浏览器服务：账号身份、登录接管、授权成员使用、上传下载路径、发布结果核验。
5. 任务账本和产物索引：恢复时先检查副作用，不能直接重新执行发布；对话文件卡片指向真实本地文件。

SDK 适配层负责开始、追加指令、取消和订阅事件，不让 UI 直接依赖 SDK 私有消息格式。不是同时运行三套 SDK。

## 决策前验证门槛

- V1：两个真实云服务商各跑一次相同工具任务，验证流式事件、工具参数、错误和用量；未经提供或授权不读取个人现有 Key。
- V2：首次拒绝授权零副作用；同空间授权后新成员/第二任务/重启不再弹窗；撤销后拒绝执行。
- V3：read/write/edit/bash/browser 完成真实本地测试任务，并测试绝对路径、..、符号链接、子进程及上传下载越界。
- V4：两个成员分工交接，人类中途追加与停止，停止后无残留子进程；无关私聊不泄露。
- V5：测试网站登录恢复、上传、提交；中途崩溃恢复不重复提交，产物准确落到本地。

通过 V1–V5 后才接受 harness 选型。没有真实 API Key 时只能完成离线接口和执行器验证，不将 mock 结果标成多模型可用。

## 官方文档来源

- Claude 概览：https://code.claude.com/docs/en/agent-sdk/overview
- Claude 接入：https://code.claude.com/docs/en/agent-sdk/quickstart
- Claude 权限：https://code.claude.com/docs/en/agent-sdk/permissions （自动允许的调用可能不经过 canUseTool；全量拦截需检查 PreToolUse 路径）
- OpenAI 模型：https://openai.github.io/openai-agents-python/models/ （LiteLLM 当前标注 best-effort beta）
- OpenAI 工具：https://openai.github.io/openai-agents-python/tools/ （Computer/ApplyPatch 的本地实现由应用提供）
- OpenAI 审批与恢复：https://openai.github.io/openai-agents-python/human_in_the_loop/
- Pi SDK：https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md
- Pi 模型：https://github.com/earendil-works/pi/blob/main/packages/ai/README.md
- Pi 核心：https://github.com/earendil-works/pi/blob/main/packages/agent/README.md
- Pi 范围：https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md （不内置子代理和权限弹窗）

文档 main 分支会变化；后续安装需固定实际可用版本并重新核对接口。不将 Python SDK 的特性推断为 TypeScript 版本同样支持。
