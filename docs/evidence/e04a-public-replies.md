# E04a 群聊交互与输出（2026-09-09）

状态：已构建、自动验证通过，待用户手测；分支 rouice/ui-workbench，未合并、未推送。

## 实现及最新约束

- 取消本轮未交付的300/600字、5行和一次群发言限制。Bot依上下文、职责判断回复；不是宿主指定报到模板。保留原有任务执行/权限边界。
- 同一成员任务的完全重复group_message不重复写入或唤醒；不同消息保留。task_result最终结果更新最后一条发言并合并产物，避免再追加同一任务最终气泡。不是跨任务语义去重。
- Markdown通过marked和DOMPurify渲染；禁脚本、嵌入元素及事件属性。长文完整保存，默认展示前段，展开仍渲染；明确思考标签先移除，不能证明识别所有隐式推理。
- 已登记产物显示链接；正文指向同一登记产物的Markdown链接打开右侧预览。未登记路径不冒充产物，不放开任意本机文件读取。
- 输入@显示当前群组成员/管理者头像姓名；片段不分大小写匹配；鼠标选择、方向键、Enter/Tab、Esc；镜像文本定位插入光标；中文输入法组合阶段不拦截确认。
- DeepSeek预置添加deepseek-v4-flash-vision-exp，官方来源 https://api-docs.deepseek.com/guides/vision/ 。当前Harness输入只有文字，read工具为UTF-8文本；图片附件传入与真实识图未完成。

## 验证

- npm run typecheck、npm test：20项通过。新增覆盖重复群消息/最终结果、产物保留、3000字符公开文本不丢弃、明确思考标签排除；这些是宿主确定性测试，不是模型任务验收。
- npm run package:dir -- --config.directories.output=build/e04a 成功。最终可运行包：build/e04a/mac-arm64/FormaBot.app。
- 最终构建运行 scripts/smoke-ui-review.mjs 通过：@所有候选、中文片段、键盘选择、鼠标选择、Esc、无匹配；Markdown粗体、安全脚本剔除、正文产物链接实际打开右侧HTML；长文展开/收起、头像/草稿/历史阅读位置、宽窄窗口、重启持久化；Vision选项存在。证据 .tmp/ui-review-SGp3bg，mention-menu.png、conversation.png、workbench-1440.png等。纯UI构造素材，未伪造模型执行。
- scripts/live-public-replies.mjs：真实已配置deepseek-v4-flash在隔离工作空间运行，报到group_message+最终回执只留一条；生成至少1200字复盘模板并read核验，磁盘文件和产物登记检查通过；第二任务不重新申请授权。证据 .tmp/live-public-KTsXHL。该次之后只改Vision预置、重复消息唤醒保护、历史思考剥离后展开入口；最终包已再通过UI和宿主测试，未把Vision识图算作实测。
- 中文系统输入法实际选字、英文命名成员及用户业务多成员对话仍请手测；一次成功不能替代完整群聊自治验收。

## 手测与下一步

退出旧App后打开本包；不需重新配置Key/空间。群里输入@、输入姓名一个字，鼠标/键盘选择；用中文输入法确认不误选。让Bot按职责交付含Markdown的内容和文件，检查不露原始标记，长文可展开，文件点击在右侧打开；设置中确认Vision选项。用户手测未通过不合并。下一小片根据反馈确定；图片传入/识图与完整E04/E05另行推进。
