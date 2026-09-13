# DeepSeek Harness 与 Pi SDK：FormaBot 适配评估

> 历史调研/审查记录：下文结论对应当时的范围与基线，不作为当前已实现能力。最新事实见 [状态矩阵](status.md)，整改顺序见 [执行计划](../tasks/plan.md)。本轮未重新联网核验历史第三方来源。

最新决定：用户要求最终选型后已采用 DeepSeek Harness，见 [ADR-001](harness-decision.md)。下文保留决策前评估和未完成的验证边界。

日期：2026-09-09。范围：官方 DeepSeek Harness 及其 SDK，与 Pi SDK 比较；不是 DeepSeek 模型 HTTP 客户端。
证据：官方文档及固定提交的部分源码。尚未安装运行、调用云模型或进行性能对照。

## 建议

针对完整 FormaBot，优先对 DeepSeek Harness 做集成验证，Pi SDK 作为较轻的备选。此结论取代先前未纳入 DeepSeek Harness 时的 Pi 优先建议，但不等于正式锁定或通过验收。

原因：本项目不仅需要单成员工具循环，还需要多成员通信、持久状态、可插入策略的执行流程和本地沙盒。DeepSeek 已提供更多这些基础接口，可以减少自建范围。代价是 Cordis 插件组合与独立运行进程的集成成本，以及官方明确说明的开发者预览和破坏性变更风险。

Pi 的优势是直接嵌入、多模型和清晰的单成员会话 API；若 DeepSeek 的部署或版本变化成本高于复用收益，再选择 Pi，不预先同时维护两套运行时。

## 核心事实

- DeepSeek Harness 主仓库 LICENSE 为 MIT；模型服务、第三方依赖的条款仍独立。Pi 的开源基础也不是闭源替代品，开源本身不是两者的决定性差异。
- DeepSeek 的 `dsh-llm-pi-ai` 已用 pi-ai 接入多模型。固定提交的 package.json 依赖 `@earendil-works/pi-ai: ^0.85.1`。因此选择 DeepSeek 可以同时复用 Pi 的模型层，而不必采用 Pi 的整套 agent loop。
- DeepSeek SDK 是驱动完整 harness 子进程的 stdio JSON-RPC 客户端，不是把一个轻量函数库导入桌面 UI 就结束。需要打包运行时、插件配置并管理进程生命周期。

## 逐项对比

| FormaBot 需要 | DeepSeek Harness | Pi SDK | 判断 |
| --- | --- | --- | --- |
| 多厂商模型/API Key | 直接 DeepSeek 适配器 + pi-ai 适配器，目录和配置接口 | 原生 pi-ai 多服务商模型目录 | 两者均有基础，具体模型工具能力仍需实测 |
| 读写编辑与 Bash | 文件/工具能力插件、shell 执行与沙盒分层 | 内置 read/write/edit/bash，操作后端可替换 | 两者可接入，DeepSeek 沙盒基础更多 |
| 本地进程沙盒 | Linux bwrap/Landlock、macOS Seatbelt、Windows restricted-token/ACL 实现 | 默认直接本地执行，需要独立受控后端 | DeepSeek 更接近需求，但不等于完整安全边界 |
| 工作空间一次授权 | 审批和沙盒分开，可接应用策略 | 自定义工具检查或 hook 接应用策略 | 两者都要实现工作空间授权记录 |
| 多成员与委派 | AgentRegistry、子代理创建/继续、消息/中断/列表接口 | 多 session 可用，核心不内置子代理组织 | DeepSeek 的可复用接口更多 |
| 固定成员/群组/@ | 子代理树不等于群组，须建产品成员和消息路由 | 同样须建 | 两者都不直接满足成品体验 |
| 人类介入与恢复 | inbox、steer/inject/followup、持久事件、SDK 流 | steer/followUp/abort、会话持久化与压缩 | 两者可用；均非副作用恰好一次保证 |
| 浏览器登录与发布 | 可通过工具/MCP 扩展；未核实开箱即用的完整账号产品 | 自定义工具/扩展接浏览器 | 两者都要补浏览器身份、授权、预览和发布验证 |
| 嵌入自己的桌面 UI | SDK 控制完整子进程，或直接组合插件 | 进程内 SDK 和事件订阅 | Pi 的直接嵌入路径较简单 |
| 升级维护 | 官方明确开发预览、会破坏兼容 | 当前也发生仓库/包名/API 变化 | 都需固定版本；无证据给出稳定性分数 |

## 不能误用的权限语义

DeepSeek 默认预设为 workspace-write + ask。其 `approval: never` 会拒绝需要审批的动作，不能理解为自动同意。
建议：FormaBot 首次写入工作空间授权记录；审批 answerer 查询记录并在范围内返回程序化决定，不弹 UI；越界不能自动升级为 danger-full-access。每次工具调用内部检查不等于每次向用户申请授权。
SDK 当前预设与默认值按 session 管理，不能代替跨成员、跨 session、重启可复用的工作空间授权数据库。

DeepSeek 的 sandbox mode 管理文件写入效果，文档明确网络和进程可见性不在这个词汇范围内；workspace-write 也不表示只能读取该工作空间。Windows/旧 Landlock 还可能报告 partial enforcement。full 仅针对该后端承诺，不表示我们所有文件、凭据、网络边界都满足。
浏览器进程、文件工具、插件内代码必须分别核验。Bash 沙盒不能隔离所有同进程插件，受信插件不得由模型随意加载。对这部分的判断需要真实越界测试。

## 下一步最小决策实验

优先 DeepSeek，复用 agent-sdk-evaluation.md 的 V1–V5 门槛，另加：

1. 固定运行时版本，使用最小明确插件组合，禁止隐式个人配置/凭据发现；证明打包后能启动并干净退出。
2. 两个不同云模型成员执行同一工具契约，工具输出和视觉能力分别核验。
3. 同空间首次授权后，两成员、第二任务、重启均不再请求；撤销即时生效。
4. 原生沙盒实测绝对路径、符号链接、子进程越界读写；记录平台和 full/partial，不静默放宽。
5. 两成员可相互交接，人类插入指令或停止；独立私聊不串上下文。
6. 测试网站登录、上传、结果落地；重启不重复提交。

若 DeepSeek 无法满足硬门槛，再用 Pi 做同一实验。不以星数、品牌、开源声明或工具列表替代运行结果。

## 证据索引

### 补充：设计成员与生图模型

用户新增 R12，生图纳入正式选型门槛 A13。当前结论：DeepSeek Harness 可以通过插件接入生图；本次未证实官方核心提供独立生图目录/API。不能因其使用 pi-ai 聊天适配器，就推断已暴露 pi-ai 生图接口。

Pi 官方 pi-ai README 的 Image Generation 节已有 `ImagesModels` / `generateImages()`；与聊天 `Models` 分离，图片模型不参与工具调用。当前文档写明内置生图 provider 仅 OpenRouter，可实现自定义 ImagesProvider。不能把聊天端支持的所有厂商计为生图原生支持。

DeepSeek 社区 `shanliuling/dsh-image-gen` 的提交 `fa2426589d2a1a0bce3d9a9111b5ad7324f7770f` 已检查 src/index.ts：通过 ctx.tools 注册 generate_image/edit_image，接收 provider/model，调用对应服务，并调用 saveGenerated；仓库还有 workspace-save.ts。代码层面证明有生成、编辑、附件和本地保存的接入路径，尚未运行验证或完成权限审计。它是第三方项目，不是 DeepSeek 官方内置模块，也未决定安装。

FormaBot 候选设计：成员配置区分“对话/执行模型”和“生图模型”；设计成员用前者理解任务与调用工具，由后者产出图片。界面让用户选择生图服务商、模型和凭据，运行时绑定成员授权，不能仅相信模型传入的 provider/model。保存路径必须复用 FormaBot 的产物服务，不直接接受社区插件的默认路径。

新增门槛：真实生图 → 指定文件夹落地 → 对话预览；另验证取消、错误、费用授权复用及未授权模型路由拦截。图片编辑为候选扩展能力，不扩大为本次用户已要求范围。

- Pi 生图文档：https://github.com/earendil-works/pi/blob/main/packages/ai/README.md#image-generation
- 第三方生图插件：https://github.com/shanliuling/dsh-image-gen
- 已检查注册源码：https://github.com/shanliuling/dsh-image-gen/blob/fa2426589d2a1a0bce3d9a9111b5ad7324f7770f/src/index.ts
- 保存实现入口：https://github.com/shanliuling/dsh-image-gen/blob/fa2426589d2a1a0bce3d9a9111b5ad7324f7770f/src/workspace-save.ts

生图单项 Pi 提供更直接的 SDK 原语；DeepSeek 可通过插件达到目标，但集成和权限验证仍需完成。保留 DeepSeek 优先验证建议，同时不在 A13 通过前锁定选型。

DeepSeek 固定提交：`5dda764ed3aa172535a7967b06ff95d9cbfe536a`。Pi 固定提交见 agent-sdk-evaluation.md。

- 官方发布：https://www.deepseek.com/harness/
- 预览状态：https://github.com/deepseek-ai/deepseek-harness
- 许可证：https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/LICENSE
- 多模型：https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/llm/llm-pi-ai/README.md
- SDK：https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/sdk/client/README.md
- 子代理：https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/docs/subsystems/subagent.md
- 沙盒：https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/docs/subsystems/sandbox.md
- 已检查审批源码：https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/interaction/user-approval/src/index.ts
- 已检查沙盒选择源码：https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/sandbox/sandbox-local/src/index.ts
- Pi SDK：https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md
- Pi 核心范围：https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md
