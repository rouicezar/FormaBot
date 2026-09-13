# FormaBot 全面审计与整改台账

基线：`a8c51788b7237970b6e01800c1753d77f516058f`，独立工作树 a224。启动时 186 个已跟踪文件，工作树干净，已包含 `7fe200e` 发布准备和 `a8c5178` 生命周期/语言入口。origin 为用户指定仓库；本轮不 push、不上传、不公开历史。

审计开始于9月12日，交付跨至9月13日。以下源码行号全部对应审计基线；修复后定位以函数名和Git基线复核。后续首片状态修复见[交付记录](task-outcome-slice.md)，C02/C04仅部分反例自动验证通过，尚待用户手测。本台账48项不因文档交付而关闭。

## 结论与证据边界

当前不具备扩大真实业务或正式发行的条件。全员分析没有实现；部分状态把“无回复”“超时”“没有文件”误表达为已回复、普通失败或完成；浏览器取消与审批存在执行层缺口。应保留现有 Harness 与已实现能力，先收敛状态和执行语义，再处理可信交付、浏览器审批、内测与发行。

本轮检查了全部源码模块和工程入口，沿 renderer → preload/IPC → session → tool host → sandbox/browser → SQLite → preview/rework 追踪。脚本和测试按能力归组检查，不宣称逐个真实模型脚本均已重跑。文件清单见 [覆盖清单](evidence/comprehensive-inventory.csv)。没有读取密钥、生产数据库或真实账号，也没有重放用户群任务；用户提供的生产故障用同文本隔离夹具重新验证。

证据等级：**D** 为隔离运行确认，**S** 为当前源码路径确认，**R** 为待验证风险，**U** 为未实现需求，**V** 为限定检查无问题。D/S 均为已确认问题，但 S 不冒充完整 UI 或模型复现。没有发现所有潜在问题的保证。优先级 P1 阻塞真实业务扩大，P2 首发前修复或明确范围，P3 工程维护。以下全部缺陷初始为开放，只有反例复测和对应用户流程验收才关闭。

## 覆盖矩阵

| 能力/需求 | 检查入口 | 状态与问题 | 首发处理 |
| --- | --- | --- | --- |
| 群消息、定向责任、静默分析 R02/R18/R20 | attention、group-routing、conversation-session、tools-plugin | D/S C01–C03、C07 | 必须修 |
| 停止、中途纠正、超时、并发 R04/R21 | main/startTask、task-host、session、tasks | D/S C04–C06；R X01 | 必须修 |
| 原群返工与逐级回报 | reviewContext、returns、request_rework | S C08；D C05 恢复缺口 | 必须修 |
| 文件交付、时间轴、快照 R07/R19 | recordArtifact、ledger、preview、artifact references | D/S D01–D05；R X02 | 必须修 |
| 本地权限、子进程 R06/R08–R10/R30 | local、hardlinks、file-worker、task-host | D B01；S B07；R X01/X02/X03 | 必须修/证明边界 |
| 浏览器租约、审批、敏感值 R11/R30/R31 | browser、gateBrowserCall、secure-prompt | D/S B02–B06 | 必须修 |
| 固定项目空间、复制 | executionWorkspace、settings、create/update | V 固定绑定；S S04；授权时点仍需完整手测 | 保留并回归 |
| 记忆、迁移、历史 R16/R21 | workbench、migrations、settings | D S01–S03；S S05 | 首发修 |
| 多服务商、视觉 R05/R15/R22/R29 | model config、task-sidecar、main attachments | S M01–M04；连接事件限定测试通过 | 首发修或批准缩范围 |
| 设置、双语、草稿、布局 R17/R20 | renderers、i18n、layout、HTML | S I01–I03；已有交互回归 | 双语首发门禁 |
| macOS hide/activate/quit | main lifecycle | V 源码正确方向；活跃模型场景仍待测 | 内测门禁 |
| 内置 runtime R14、供应链、发行 | lock、prepare-runtime、builder、LICENSE | V 精确版本与摘要；U/R R01–R04 | 正式发行门禁 |
| 生图 R12、通用扩展 R25–R27、更新 R28、例行 R32 | 全源码/工具清单/设置入口 | U U01–U04 | 需明确首发范围，不能删除需求 |

## 任务控制台账

| ID / 优先级 / 等级 | 用户影响与复现条件 | 证据与根因 | 修复方案 / 依赖 / 验证 |
| --- | --- | --- | --- |
| C01 P1 D | 三人群普通“所有人…”仅一人获执行机会；@A 时其余成员也没有分析机会 | attention.ts:9–19；group-routing.ts:3；隔离 facts.routing 为 3→1。固定 manager/selected fallback，非全员注意力 | 持久消息事件×成员投递；独立无副作用分析阶段，明确 @ 责任，不能扩关键词；依赖 C03/C05/C06；三成员无@、@、普通通知、上下游消息真实模型验收 |
| C02 P1 D | 全员 silent 却显示“已回复·结果待确认”；silent 也可发生在显式任务上 | session.ts:97–100,227–238；facts.silentOutcome=responded；silent 检查不约束责任 | 根状态按实际公开消息/交付/中断汇总，静默不能代替任务履约；依赖 C01；全静默、混合、显式责任、silent 后已有公开发言反例 |
| C03 P1 S | 静默判断可先写文件/发群消息，再选择 silent；不满足静默分析与行动隔离 | task-host.ts:12–21 全工具可用；session.ts:100 仅设布尔值，228 跳过公开产物 | 分析回合只允许结构化参与决定，执行回合独立授权；依赖 C01；分析工具拒写/Bash/browser/建队，已有副作用不能标纯静默 |
| C04 P1 D | 两分钟空转/十分钟超时变 failed，失去 interrupted 和重新入队入口 | task-host.ts:59–64 抛 TaskTimeout；session.ts:233–234 吞类型；main.ts:342 接不到；facts.timeout | 保留类型、持久中断原因/已执行副作用，根/成员一致；依赖 C05；超时前已写文件、下游 held、中断后重开 |
| C05 P1 D/S | 重启 held 永久遗留；返工复核链、依赖、去重和上游关联丢失 | workbench.ts:13 只处理中断 queued/running；session.ts:11–24/199–207 内存 returns/maps；facts.heldAfterRestart | SQLite 保存消息/依赖/return/幂等键；启动收敛全部非终态，默认不重放外发；依赖 C01/C04；逐节点杀进程重开验证 |
| C06 P1 S | 同 Bot 私聊在运行时再开群任务可重入；同时启动在 probe/授权 await 前无锁 | main.ts:46 只查 c.members/managerId，不含私聊 c.id；263–275 先检查后 await 再登记；跨群 handoff 不取成员锁 | 以真实成员和执行空间原子占位，跨会话任务统一取得锁；依赖 C05；并发 IPC、私聊→群、群→私聊、handoff 碰撞 |
| C07 P2 S | 普通成员仍受“协调人专属 assign_tasks”限制；自动响应 40 次硬上限也包含 human job | session.ts:33,39,143；tools-plugin.ts assign_tasks | 区分用户消息、分析投递、自动行动预算；任务所有权/权限替代管理身份必经路径；依赖 C01；非主管协作、连续人工指令、循环保护 |
| C08 P1 S | 返工定位只限仍在的群、参与轮次最近60 job；普通跨群委派没有自动上游回执；返工 private 回报包包含本轮全部公开消息 | workbench.ts:185–189；session.ts:109–126/199–207。无稳定交付→上下游边模型 | 持久来源/交付/返工边与必要结果包，保留历史成员访问规则；依赖 C05/D01；旧任务、多人同轮、两级返工、失败、群变更、重启 |
| C09 P1 S | 改岗/纠正后在途旧版本仍能执行副作用；提示词私聊仍称未接改岗工具 | main.ts:121,297,349；session.ts:220。工具授权只查空间不查角色/指令版本 | 副作用提交前复验执行版本，区分补充与纠正；统一工具能力说明；依赖 C06/B04；审批等待中改岗、旧 Bash/browser 提交拒绝 |

## 可信交付与状态数据

| ID / 优先级 / 等级 | 用户影响与复现条件 | 证据与根因 | 修复方案 / 依赖 / 验证 |
| --- | --- | --- | --- |
| D01 P1 D | 要求文件但零登记仍可 completed；文件被其他任务改写仍核验通过 | session.ts:105；workbench.ts:203–213 不比哈希；facts.noFileCompletion/changedHashAccepted | 期望交付、submitted/accepted 独立；比最终版本摘要，问答可无文件；依赖 C05；缺文件/修改/问答/拒收/接受持久化 |
| D02 P1 S | 同一 job 多次交付同路径覆盖旧快照，旧消息可能显示新版本；快照丢失静默回读活动文件 | main.ts:148–175,289–294；固定 job+path 而非交付版本 | 独立不可变 artifactVersion，明确缺失版本，不静默伪装；依赖 D01；两次公开交付后改源/删快照/双入口 |
| D03 P1 S | HTML 首次预览才固定关联资源，正文和图片/CSS/JS可能不是同一时点；首次读取还可触发远程图片请求 | main.ts:167–174；preview.ts 资源逐个读取、CSP img-src https | 交付时捕获依赖集合，版本 manifest；外部资源需要清楚的网络策略；依赖 D02/B04；交付后改图片、远程追踪像素、递归CSS资源 |
| D04 P2 S | 写入后失败/停止/silent，没有消息引用，时间轴看不到已产生文件 | main.ts:288–339 artifacts局部变量；session.ts:228,234；artifactHistory只读消息 | 持久 artifact 即时登记并显示失败任务有效成果；依赖 D01/C04；写→工具失败/停止/静默均可取回 |
| D05 P2 S | 快照读取不受4MB限制；recordArtifact 主进程同步读取任意大小文件；普通二进制文件无法用声明登记 | main.ts:152,292,300 与 file-worker preview格式白名单 | 流式摘要/限额/独立登记与预览能力；依赖 D02；大文件、PDF/视频/ZIP声明不应因无法预览而失败 |
| S01 P2 D | 连续纠正后记忆历史链丢一段 | workbench.ts:228 清空被替代记录自身 supersedes；facts.memoryChain仅 two/three | 保留不可变前驱，单独 active状态；迁移不编造已丢链；无依赖；三次以上纠正及重启 |
| S02 P2 D | 重试同名同成员但修改职责/目标仍返回旧团队成功 | workbench.ts:48–52 只比较姓名；facts.teamRevision | 操作幂等键和需求版本分开，返回差异/显式更新；依赖 C09；相同请求幂等，修改请求不能静默忽略 |
| S03 P2 D | 手动建群转协调人返回 true，但没有保存 | workbench.ts:162–168 UPDATE teams，对无teams行更新0；facts.managerUpdate | 创建/更新统一团队关系，检查影响行；无依赖；手动群→转协调人→重启 |
| S04 P2 S | 创建时默认空间分支没有主动完成授权；设置忘记空间只撤销当前默认，已绑定其他空间无对应撤销入口 | main.ts:110–119,429；create取默认路径无需token；TaskStore支持revoke但UI仅forget默认 | 按已授权项目清单显示创建/撤销状态，确认固定项目语义；依赖 C06；默认未授权创建、不同绑定授权撤销不误伤 |
| S05 P2 D/S | 历史只显示100消息/80任务，无翻页；review_context60条；记忆无限注入，越用越慢且挤压上下文 | workbench.ts:151,187,234,275；session.ts:216–221；facts.historyVisible | 游标翻页/检索、上下文预算和引用式记忆，保留原记录；依赖 C05；千条历史、旧任务返工、长记忆规模验收 |
| S06 P2 S | 删除Bot/群后仍残留交付账本、快照、附件、部分偏好，违背“所有数据清空”说明 | workbench.ts:100–148 仅部分表/偏好；main.ts:81–85只清runs | 持久清理清单涵盖应用私有数据，保留共享内容与工作文件；依赖 D02；隔离删除夹具+每类数据计数，不触碰生产 |

## 执行权限、浏览器与审批

| ID / 优先级 / 等级 | 用户影响与复现条件 | 证据与根因 | 修复方案 / 依赖 / 验证 |
| --- | --- | --- | --- |
| B01 P1 D | 汇总只读任务实际用Bash写入成功；建队/浏览器等副作用同样未统一限制 | task-host.ts:17只拦write/edit；current-audit summaryBashWrite=audit | 能力白名单+底层只读沙盒，不靠工具描述；依赖 C03；所有副作用路径反例 |
| B02 P1 D | browser open返回后停止，页面延时POST仍发送 | browser.ts:70–72移除abort监听；main stop仅controller；browser-audit pagePostedAfterAbort=true | 任务页面生命周期归属，停止取消页面后续活动；依赖 C06；工具间隙停止/完成/超时/退出 |
| B03 P1 S | 页面直接鼠标键盘不触发接管；60秒自动归还；多个会话共享单页可能错点 | browser.ts:56–72,175–186；main.ts:185按空间共享 | 任务/账号页面租约，真实输入接管、明确归还，整段操作锁；依赖 C06；A open/B open/A click、人类长输入 |
| B04 P1 S | 审批仅host+click/fill，不显示内容/元素/账号；等待后目标可变化；open始终放行 | main.ts:195–204；approval-policy；无法实现R30参数和影响绑定 | 审批快照绑定任务/页面/账号/参数/内容版本，提交前复验，未知效果不自动批准；依赖 B03/C09；导航/重定向/内容变化/窄规则 |
| B05 P1 S | 密码输入等待后可在已停止或已导航页面填写；secure IPC不校验sender，多窗共享频道 | main.ts:190–193；secure-prompt.ts:12–13；browser.ts:169–173 | 敏感输入加入同一租约和取消事务，IPC按窗口与请求ID校验，覆盖OTP；依赖 B03/B04；两个输入窗、错误sender、停止/导航后不填 |
| B06 P1 D/S | 选择退出后监听器残留；选择按钮可同时触发页面业务；页面可伪造选择结果 | browser.ts:18–31,44–48；current-audit监听器3→6；仅preventDefault不阻止页面handler | 可撤销隔离选择层和页面版本校验，拦截真实点击；依赖 B03；重复进入退出、发布按钮上选区、导航、拖框 |
| B07 P1 S | 高风险本地删除/覆盖没有R30逐动作审批，Bash回环可访问本地服务；注释“无出站”过强 | local.ts sandbox允许空间write及localhost:*；dispatchTool未评估本地动作 | 明确空间基础授权与高风险动作政策，执行层落实并收窄回环目标；依赖 B04；隔离删除/覆盖/本地代理反例 |

## 模型、材料、UI与工程

| ID / 优先级 / 等级 | 用户影响与复现条件 | 证据与根因 | 修复方案 / 依赖 / 验证 |
| --- | --- | --- | --- |
| M01 P1 S | 群带图按群ID查memberModel直接失败；在途补图丢失 | main.ts:229调用只接受Bot的workbench:292；startTask:260不保存images | 材料绑定消息/成员任务，按实际接收成员模型判能力；依赖 C01/C05；群图、多模型、在途补图 |
| M02 P2 S | 启动被拒绝前已清材料；选择/截图期间换会话把结果加入新会话 | main.ts:230早清，366/386重新读当前会话 | 接收事务后清草稿，固定发起会话/页面/材料ID；依赖 M01；未配置、忙碌、取消授权、切换会话 |
| M03 P2 S | 换服务商覆盖唯一Key，旧绑定Bot不可执行；不满足多服务商成员 | settings.ts Settings.model单槽；main.ts:282,417 | provider→密文凭据表、成员绑定引用；依赖 C06；双服务商真实任务及重启保留 |
| M04 P2 S | 生效模型以名字含vision判断，不是实际能力；搜索仅DeepSeek；其他预置模型未当前真实验收 | main.ts:229；tools-plugin config.search；models/config | 明确能力表和真实兼容矩阵，保留失败信息；依赖 M03；逐首发模型工具/视觉/取消验证，缺凭据标待验收 |
| I01 P2 S | 中英切换不覆盖原生审批、错误、动态图标提示/描述；设置已显示的部分文案不会随语言重新populate | main中文dialogs/errors；renderer动态文案；settings-renderer language onchange | 按i18n设计完整资源目录与错误码映射；依赖B04；两窗口切换、已打开弹窗、草稿和活跃任务 |
| I02 P2 S | 草稿只存在内存Map，显式退出/崩溃后丢失；设置其它保存refresh可能清未保存模型输入 | renderer.ts:36；settings-renderer refresh/populate | 会话草稿独立持久化，设置字段dirty状态；无依赖；重启/切换/保存其它配置 |
| I03 P2 S | 每600ms完整拉状态；历史产物全量查询且每文件再查时间，多次全量list；规模增大阻塞主进程 | renderer.ts:398；main.ts:50–59；workbench.ts:192–197 | 增量状态/缓存、分页、批量SQL；依赖S05；千产物/多会话延迟与内存测量，不凭静态推断具体毫秒 |
| I04 P3 S | main混合所有业务域；旧内嵌设置与独立设置重复实现，CSS覆盖叠加，状态多为string | renderer settingsCategory与settings-renderer并存；main 450行高密度业务；contracts | 随功能整改抽取任务/交付/审批服务与类型化状态，删已证明死路径；依赖相关修复；不先做大重写 |
| R01 P1 U | 未签名/公证，无法按正式发行承诺安装体验 | electron-builder.yml identity:null；本机仅Apple Development/Distribution，无Developer ID Application | 发行阶段签名、公证、staple、Gatekeeper/干净机验收；依赖所有P1；不替用户上传或绕过系统安全 |
| R02 P2 R | LGPL等原生依赖的对应源码/替换重链接条件未逐版本确认 | docs/licenses/README.md明确缺口；THIRD_PARTY_NOTICES只库存 | 基于实际包manifest核对义务与对应源码；依赖打包精确清单；无律师审定或法律合规保证 |
| R03 P2 S | 版本固定0.1.0，构建脚本不内嵌commit/manifest；旧开发历史不能直接公开；无CI发行门禁 | package.json、build.mjs、builder配置；git完整本地历史 | 可追溯构建元数据、受审快照、CI分层门禁；依赖R01/R02；精确导出扫描及签名包验证 |
| R04 P2 S | README clean checkout步骤直接test，却未先setup/build；脚本硬编码不同build目录 | README开发命令；runtime.test和smoke脚本路径 | 文档/统一验证入口先准备再测，可传App路径；无依赖；新工作树按说明跑通 |

## 待验证风险（不当作已利用漏洞）

| ID / 优先级 | 证据缺口与潜在影响 | 验证/修复方向 | 依赖/首发 |
| --- | --- | --- | --- |
| X01 P1 | detached后代脱离进程组可继续写；此次仅重测同组回收，不冒称完整进程树安全 | 隔离setsid反例，收敛到可证明生命周期容器/监督；进程组kill本身不足 | C04/C06/B02，内测前 |
| X02 P1 | main recordArtifact在sandbox preview后重新按path读，符号链接/外部进程竞态可能使宿主读到不同文件；快照不验证真实路径 | 描述符或受控worker传字节/摘要，加入路径替换竞态探针 | D02/B07，首发前 |
| X03 P1 | hardlink扫描忽略不可读目录/ stat失败，并在每个任务同步遍历；服务器listen后扫描失败在finally外可能泄漏监听服务 | 权限失败/大树/替换并发反例，fail closed且所有资源进finally | C06，内测前 |
| X04 P2 | 预览allow-scripts+https图片可能通过脚本动态图片外发预览内容；CSP不是无网络保证 | 本机HTTPS测试端点捕获，明确禁止外发或获批准再载入 | D03/B04，首发前 |
| X05 P2 | 活跃真实模型下红色关闭、退出等待审批、切语言、升级Key保留尚未本轮实测 | 隔离真实模型任务及审批等待退出，签名稳定后升级；不得用fixture冒充 | R01/C04/B05，内测前 |

## 未实现需求与首发范围

| ID | 需求与证据 | 能力状态 | 处理 |
| --- | --- | --- | --- |
| U01 | R12生图；工具白名单无图像生成 | 未实现 | 不把视觉理解算生图；需用户批准后置，否则首发补齐 |
| U02 | R25–R27能力目录/MCP/插件/Skill生命周期；只有固定内置tools-plugin | 未实现 | 不把依赖包存在当产品接入；同上 |
| U03 | R28自动更新/版本入口；无更新源/下载安装链 | 未实现 | 正式发行前确定手动或自动升级范围，未授权不得删需求 |
| U04 | R32定时/触发任务；无持久调度器；R11上传下载显式禁用 | 未实现 | 明确首发限制并经用户确认；不承诺后台/关机执行或通用平台发布 |

## 限定无问题项与旧问题复核

- V01：精确依赖版本和锁文件存在；新工作树 `npm ci --ignore-scripts` 完成，Node/Electron由固定SHA256校验下载。npm官方audit返回0项已知漏洞，不能替代供应链行为审查。
- V02：100项/29文件测试通过，typecheck/build通过。首轮准备前失败不作为产品缺陷证据，准备后在允许原生sandbox-exec的环境重跑。
- V03：S1a依赖修复重新实测：responded/failed/silent不会释放下游、循环拒绝且0 job、多级blocked收敛。旧N01这些反例已改善；重启和全员模型仍未关闭。
- V04：main快照使用job.id并支持图片，已修旧根ID错位；双入口都走preview API。仍存在D02/D03边界，不能整体关闭可信交付。
- V05：IPC主/设置窗口来源与主frame校验、sandbox/contextIsolation、Markdown净化、空间dev/ino授权、固定项目路径更新拒绝、复制不复制聊天/记忆，在对应源码及既有回归中未发现新反例。secure-prompt为独立例外B05。
- V06：本地Git fsck无损坏，仅有dangling对象；未清理对象。当前树有限敏感模式/README链接/文档文件名检查无发现，不是全历史无秘密证明。
- V07：新工作树基线包 `build/audit-baseline/mac-arm64/FormaBot.app` 构建完成，隔离UI回归 `.tmp/ui-review-8zBYzW` 通过：设置、复制/删除、搜索、长文、产物、1440/800布局。未做真实模型验收。浏览器探针绕过main审批直接测工具，只证明生命周期反例，不能把其直接点击测试当作main审批已被绕过。

## 整改顺序与关闭规则

1. **任务控制**：先统一状态事实C02/C04，再完成C01/C03全员分析与责任，C05/C06持久任务和锁，C08/C09返工/纠正；C07随之收敛。每片独立可运行构建，待用户手测后才能下一片。
2. **可信交付**：D01→D02→D03/D04/D05，结合S01–S06。交付、验收、失败残留产物和历史版本均可追溯。
3. **浏览器与审批**：B01能力隔离、B02/B03页面所有权、B04/B05审批事务、B06/B07及X01–X04隔离反例。禁止真实外发试险。
4. **受控内测**：M01–M04、I01/I02、规模I03、生命周期X05及正式首发范围。真实用户输入→授权→执行→同会话可用文件，各失败/停止分支验收。
5. **正式发行**：R01–R04、U范围决定、签名升级/干净安装、逐版本许可、受审公开快照；通过发行门禁后再申请真实发布，不公开旧历史。

每项关闭记录必须包括修复commit、运行包摘要、原反例复测、新正常流程、剩余边界和用户确认；自动测试通过仅记自动验证。当前整轮审计已完成上述范围并排序，产品修复另开本阶段记录，不以本报告关闭任何产品缺陷。

## 外部事实依据

Electron官方说明macOS发行需签名和公证，且稳定签名影响safeStorage升级识别：[Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)。本轮仅查看签名身份元数据，未导出证书或密钥。

原生许可应依据随包许可证及实际链接方式核验；现有 `docs/licenses` 自身明确尚未完成逐版本义务核对，本报告不作法律合规结论。

## 9月13日手测新增（原48项之外）

| ID / 优先级 / 等级 | 用户影响与复现条件 | 根因和证据 | 修复/依赖/验证/状态 |
| --- | --- | --- | --- |
| C10 P1 D | 已安排等待审查的排版，群通知再次唤醒生成无依赖的第二条排版任务 | routeMention只查pending不查held；只读生产任务状态发现2条排版，隔离@与all反例均生成2条 | 将held纳入已有待办匹配，回执保留held，不丢通知；依赖C05全量恢复；前置blocked不执行、completed仅一次；当前片已修待复测，真实被停止任务未重跑 |
| I05 P2 S | 用户看到m2/m3无法辨别执行Bot；内部代号进入分工/交付说明 | session成员名册主动使用m编号，tools-plugin建议短代号；用户截图反馈 | 新提示/工具指引使用完整姓名，正文姓名转彩色可点击Bot引用；代码路径和历史裸编号不猜测改写；实际模型回复仍待用户手测，兼容解析不等于公开展示 |
