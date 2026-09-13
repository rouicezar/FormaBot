# Technical Decisions

The following is historical technical research. Current implementation status is tracked in [status](status.md).

## 技术依据（能力存在，不等于本产品已验证）

- https://playwright.dev/docs/auth ：认证状态复用。
- https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context ：持久浏览器配置。
- https://developer.apple.com/documentation/virtualization/running-gui-linux-in-a-virtual-machine-on-a-mac ：本地图形 Linux 虚拟机。

## 候选方案与待验证项

专用浏览器配合本地文件工具是候选起点；完整虚拟机是否必要要由权限验证决定，未选定技术栈。
工作目录并不限制 Bash 的访问。必须测试绝对路径、..、符号链接、子进程及浏览器上传下载的越界行为。
账号登录态应由应用托管；成员获得受控使用能力而不是直接读凭据。BrowserContext 不是操作系统沙盒。
私聊、私人记忆默认不向无关成员扩散是设计建议；细粒度共享规则还需规格化。
共享同一账号时不能承诺仅靠提示词限制只能读、不能发布。严格边界应采用服务商 API 权限或受限执行能力。
必须保留同一工作空间只授权一次的体验；执行层允许/拒绝已授范围内动作，不新增逐工具或逐成员审批。

## 当前未确定

桌面框架、数据库、模型 SDK、进程沙盒、首发系统、外部平台支持清单、安装签名、许可证。
正式定案前分别记录选择理由、验证结果及限制，不能把候选方案当成既成事实。
