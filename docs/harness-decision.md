# ADR-001：DeepSeek Harness 执行内核

状态：已决定采用；本机运行已有证据，完整产品验收未完成，见 [状态矩阵](status.md)。依据：用户要求做最终选择，执行与测试优先、视觉后置。

采用官方 DeepSeek Harness，TypeScript SDK 控制独立运行进程，应用管理最小插件组合。通过 dsh-llm-pi-ai 接多家云模型，不同时维护 Pi agent loop。
理由：已有成员通信、会话事件、工具策略和沙盒后端，适合团队执行应用。开发者预览的兼容性风险通过固定发布版、适配层和回归测试管理。

## 开发基准

- TypeScript / Node.js / npm lockfile；Vitest 测试，Electron WebContentsView 承载专用浏览器，Playwright 用于开发验证。
- 首轮实机验证基准为当前 macOS；Windows/Linux 后续单列，不声明已支持。
- 第一阶段提供最简 Electron 桌面界面，包含 App 内模型与 API Key 配置、目录选择、一次授权、任务输入与执行状态。视觉设计后置。Electron 自带运行时和 Chromium，DeepSeek Harness 及固定插件随包提供；SDK 显式定位包内执行入口，不从系统 PATH 寻找或调用 npx 下载。打包兼容性需要实测。
- 应用状态采用 SQLite，保存授权、成员、群组、任务与产物索引。已采用 node:sqlite，由主进程保存应用对话、任务、成员与授权真相源；Harness 运行事件是任务诊断记录，不替代应用业务状态。
- 凭据通过应用凭据接口读取，macOS 使用系统凭据存储；Bash 环境不得继承模型 Key，执行进程不能访问凭据目录。
- 生图独立于成员工作模型。首条路线封装 pi-ai 生图接口，经 OpenRouter 接入；其他直连接口分别验证。社区插件仅作参考，不自动安装其所有功能。

2026-09-09 核验 npm：dsh 的 latest 为 0.1.2-rc.1；dsh-sdk-client 和 dsh-llm-pi-ai 均存在该同版本，但各自 latest 标签仍为 0.0.1-rc.1。因此禁止逐包安装 latest，T01 以 0.1.2-rc.1 为首次一致版本验证目标。
源码 master 不等于发布包。初次核验时 Node v26.7.0、npm 11.19.0 只证明工具存在；后续本机兼容证据见状态矩阵，不能扩大为所有平台通过。注册表来源：https://registry.npmjs.org/@deepseek-ai%2fdsh 、https://registry.npmjs.org/@deepseek-ai%2fdsh-sdk-client 。

## 不可让步的执行边界

在启动可执行工具或有副作用插件前完成首次工作空间授权；成员、任务、重启共享持久记录。内部检查不重复弹 UI。
撤销阻止新调用并取消正在使用旧授权的执行。模型不能自行扩大权限。
workspace-write 不能等同完整读隔离；文件、Bash、浏览器与凭据分别核验，失败不能退回 full-access。

FormaBot 负责成员群组、持久授权、账号、生图配置、任务幂等和产物；Harness 负责循环、会话事件和执行插件；适配层管理进程与协议映射。
本决策固定开发方向，不表示验收完成。若硬性边界无法实现，保留失败证据再重开决策，不静默换内核。

## 分发边界

按操作系统与架构构建自包含安装包。构建机下载依赖，用户机器不承担依赖安装。浏览器工具使用随包 Chromium/浏览器引擎及匹配控制接口，不在首次任务时触发 Playwright 下载。需要 Bash 的目标平台必须由受支持系统保证可用或随包提供，不能把安装责任交给用户。检查包内第三方许可和原生依赖完整性。网络用于用户配置的云模型和任务目标站点；不是用于首次启动补装执行环境。自动更新后续设计，不代替初始包完整性。

## 发布包核对后的接入约束

2026-09-09 最终审核直接核对 0.1.2-rc.1 发布包，详见 [审核记录](preflight-review.md)。SDK 启动命令使用 process.execPath，dshBin 指向 JS 入口，不能在 Electron 主进程中假设它会启动普通 Node。首选随包 Node sidecar 运行 SDK 与 Harness，Electron 通过受限 IPC 控制；不依赖系统 Node。固定 Node 版本及原生依赖兼容性在 M0 实测后写入锁定清单。

SDK 没有 wire cancel，停止通过关闭该执行单元运行时并清理其子进程实现，UI 在退出证据成立后才显示已停止。审批桥接不是现成 SDK 回调，需要 FormaBot 受控工具插件/本地桥接；工作空间授权由 App 持久保存，逐工具内部查询不弹窗。
