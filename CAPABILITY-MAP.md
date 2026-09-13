# 能力模块图 / Capability map

状态：既定模块边界继续有效，执行内核为 DeepSeek Harness；原型已实现部分业务，正在工程化整改。实际能力/缺陷见 [状态矩阵](docs/status.md)，顺序见 [整改计划](tasks/plan.md)。

| 模块 ID | 职责 | 依赖 |
| --- | --- | --- |
| local-state | 本地事务存储、迁移、密钥存储接口、恢复记录 | — |
| workspace-access | 工作空间选择、一次授权、撤销、产物路径和执行能力检查 | local-state |
| model-providers | 服务商预置、连接验证、统一工具调用与流式响应 | local-state |
| execution-tools | read/write/edit/bash/browser 执行，路径与进程限制、浏览器身份管理 | workspace-access |
| agent-runtime | 成员配置、模型工具循环、任务队列、取消、重试和恢复 | model-providers, execution-tools |
| team-collaboration | 私聊、群组、消息路由、成员委派、上下文共享策略 | agent-runtime |
| desktop-app | 配置、成员/群聊、授权入口、任务状态和产物预览 | team-collaboration |

构建顺序：底层存储和授权 → 模型接入/执行工具 → 单成员真实任务 → 多成员协作 → 桌面完整体验。
最简桌面壳从 M0 开始，逐步接入各模块，不等待团队模块完成。模型配置、目录选择和任务入口直接在 App 内提供；视觉打磨在执行回归后开始。

模块接口在边界确认后细化；优先在单一应用内划分模块，不预设微服务或多个部署单元。

扩展能力沿用以上模块：local-state 保存能力来源/版本/配置与凭据引用；execution-tools 承载 MCP/插件适配和统一检查；agent-runtime 按需发现工具和加载 Skill；desktop-app 提供连接及生命周期入口。详细边界见 [能力管理设计](docs/capability-management.md)，任务 E11。当前已实现本机发现清单，Skill启停/快照/按需读取已完成自动及真实模型验证，待手测；MCP与安装生命周期仍待后续实现。

2026-09-10细化：team-collaboration负责稳定成员/群、事件投递、语义注意力和任务所有权；agent-runtime只执行受控成员回合，不能成为第二个状态真相源。desktop-app新增更新状态呈现，local-state负责版本迁移，execution-tools承载浏览器选择及页面接管；图像材料进入model-providers真实输入。新需求分别归E12/E13，完整设计见[后端架构](docs/backend-architecture.md)及[更新与选区](docs/updates-and-browser-selection.md)，没有因此宣称实现。
