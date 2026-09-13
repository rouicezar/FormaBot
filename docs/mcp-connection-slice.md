# MCP 连接与授权首片

## 需求与设计
2026-09-13 用户手测：工具页缺少真实浏览器授权入口。设置顶部增加独立 Figma MCP 卡片；Skill 不作为服务连接。只使用 FormaBot 自己的 OAuth 注册和凭据；不得借用其他客户端身份。状态为未连接、正在连接、等待浏览器授权、已连接、失败、已保存待验证。取消与错误不能放入已连接状态。

本片验证远程 MCP OAuth、握手及工具列表；Bot 调用外部工具另需执行权限接入，界面明确说明当前边界。Figma 官方仅允许认可客户端，新客户端需申请：https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/ 。服务 https://mcp.figma.com/mcp ，公开 OAuth 元数据提供注册接口，但这不等于 FormaBot 已获准。

SDK 使用 @modelcontextprotocol/sdk 1.30.0，基于其 OAuthClientProvider 与 StreamableHTTPClientTransport。授权通过系统浏览器，回调仅绑定 127.0.0.1；校验随机 state、路径、单次消费及 issuer。PKCE 由 SDK 实现。凭据用系统安全存储加密，不进入 renderer、工作空间或模型。连接超时和取消中止网络/回调，退出清理资源；重启不把旧记录直接视为当前连接。连接失败只显示安全摘要，不透出授权码/令牌或服务原始响应。

## 验证与交付
实现与自动验证完成，待用户手测。122 项/33 文件测试、类型检查/build 通过；隔离协议服务覆盖成功回调、错误 state 拒绝、拒绝授权、取消、重启验证。打包设置测试验证入口无需滚动可见、轮询保留键盘焦点；Skill 设置回归通过。证据 `.tmp/mcp-settings-6ZSmEg` 与 `.tmp/skills-settings-RVDPlh`。构建 `build/mcp-connect/mac-arm64/FormaBot.app`，版本 0.1.0，提交/摘要见同目录 build-info.json。真实 Figma 授权仍需用户完成，且受服务端客户端准入限制；不以协议测试替代 Figma 验收。

## 手测反馈修复：间距与注册失败（2026-09-13）
需求：按钮不能接触卡片边线，扫描操作与卡片分开；核验无法授权根因。卡片原样式 `padding:0 16px` 依赖内部行组件提供竖向间距，MCP 使用直接子元素，因此底部没有留白。修复为工具卡片独立四向内边距和 actions 按钮区，避免影响其他设置页。
真实请求以 FormaBot 身份向官方注册接口提交原参数，得到 HTTP 403，正文 Forbidden；没有获得客户端凭据，没有进入用户授权。官方说明限制客户端准入，但单次响应不能证明具体拒绝因素。错误按 400/422、403、429、5xx 分类，不再把一切失败解释成准入许可问题。未绕过服务限制、未借用其他应用身份；真实接通仍未解决。
验证包括按钮边距与卡片外扫描间距的打包几何断言、截图检查、授权错误分类回归。交付 `build/mcp-layout/mac-arm64/FormaBot.app`，待用户复测；远程接入受阻不记为完成。
