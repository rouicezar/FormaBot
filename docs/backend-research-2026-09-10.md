# Backend Architecture Review

FormaBot owns member identity, conversation routing, task lifecycle, workspace authorization, and delivery records. DeepSeek Harness remains the execution engine for each member.

The following findings describe the original review baseline, not current completion. See [current status](status.md).

## 3. 当前代码与目标的关键差距

| 本地证据 | 实际缺口 | 对应整改 |
| --- | --- | --- |
| `src/shared/contracts.ts`、`src/state/workbench.ts`：成员role文本，群成员JSON，消息speaker姓名 | 改名/改岗/同名历史缺稳定作者与版本；管理关系和角色文案可能矛盾 | E05a/E05b，成员ID与群成员关系权威化 |
| `src/runtime/conversation-session.ts`：literal提及+默认执行者，replyOnly正则 | 理解受关键词控制；普通群消息并非每位成员各自判断；显式静默缺协议 | E04c/E04d |
| 同文件：内存队列、40次上限、自动主管汇总 | 消息投递不等于接单，排队合并可能遗漏任务；无可靠异步交接/在途纠正 | E06a–d |
| `src/desktop/main.ts`：全局running/session；每个job创建执行环境 | 不同会话不能独立运行；需要可恢复的成员会话与资源租约 | E06d/E08b，受E02约束 |
| 历史仅最后70条并按字符截断 | 长期职责、批准、事实与来源可能丢失 | E08a |
| `task_result`自报完成，最后回执替代正文 | 回答结束不代表成果合格，群汇总也不是验收 | E07a/E07b |
| 私聊跨会话派单全部拒绝 | 能防止静默扩散，但无法满足人类明确授权的跨会话协作 | E06c的最小共享授权包 |
| `src/tools/browser.ts`：单共享view、正文读取截断，无选区接口 | 选中区域无法作为独立附件；页面并发控制不完整 | E03/E12 |
| `electron-builder.yml`：dir、identity:null；package固定0.1.0 | 无真实发行、签名、更新源和迁移协议 | E13 |



## Execution boundaries

Tasks run locally while the application is running. A working directory is not a security boundary. File, process and browser access must be enforced by the execution layer. Sensitive values require user-controlled entry and must not enter model-visible messages.
