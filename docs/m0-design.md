# M0 最简桌面 App 实施规格

> 设计与实现分开：本文保留模块目标；当前实现、已知反例见 [状态矩阵](status.md)。实施顺序统一遵循 [整改计划](../tasks/plan.md)，局部成功不等于全部约束通过。

目标：打开本地桌面窗口，在 App 内选模型和保存 Key、选工作空间；包内 Harness 可受控启动，随后接真实任务。视觉只使用简单表单和状态列表。

进程：Electron 主进程持有系统凭据、目录选择与受限 IPC；renderer 禁 Node、开启 contextIsolation 和 sandbox，外站不加载到 App 窗口。包内 Node sidecar 承载 SDK，通过固定消息协议连接主进程。构建期复制固定运行时及生产依赖，运行期不安装组件。

状态：模型记录仅保存 provider/model 与加密凭据；只有主进程可解密，renderer 仅得到 hasKey。macOS 使用 Electron safeStorage 的系统保护，不可用时拒绝保存，不退回明文。工作空间记录规范路径及目录身份，授权绑定空间而非成员。当前 SQLite 由 Electron 主进程通过 node:sqlite 持有；sidecar 只承载成员模型循环。

当前 IPC 以 src/shared/contracts.ts 的 FormaApi 与 src/desktop/preload.ts 为准，含 state、saveModel、chooseWorkspace、runTask、stopTask、preview 等。参数在主进程验证；只接受 App 主框架调用；错误脱敏。任务最初在未配置或执行边界未验证时拒绝，不能以占位成功冒充运行。

实现切片：先依赖与可构建桌面壳，再模型配置/安全持久化，再 Harness 与工作空间工具。每片检查类型、行为与构建后提交。真实模型任务仅由 App 内配置的服务商执行；不读取开发者个人 Key、不使用模型替身任务。

验收：可从构建产物打开 App；无外部 Node/npm/dsh 仍能启动内置进程；窗口可选择模型并安全保存、更换和删除配置；未配置的执行请求明确拒绝。包内启动与 UI 通过不替代 A01–A15。
