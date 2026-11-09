# 新增外部起草页面集成

本版基于用户最新附件 qa-20261023.zip；保留附件中的“制度起草”标题、首次输入页、聊天布局、附件和按钮样式。原四业务入口与路由不变，仅 /external-draft 的身份选择、停止确认、草稿保存作本次升级。

## 跳转与身份

父平台 iframe 指向 `/external-draft?token=<encodeURIComponent后的用户token>`，兼容参数名 agentToken。URL 中的 token 是该独立页面的唯一用户凭证；不使用内部登录缓存 JWT、Cookie、固定账号 token，也不接受 SET_AGENTTOKEN 消息补充或替换身份。缺少/无效 URL token 不进入起草。

新页面通过既有 `/v1/agent-permission/validate` 校验 URL token。创建任务正文 agent_token 与 Authorization、订阅、任务详情、停止及草稿保存均来自同一份外部凭证。合同保存的后端会将该 token 作为合同接口 data.token，不将后端 appkey/secretkey 当作用户 token。更换身份必须重新跳转有效 URL。

VITE_ALLOWED_PARENT_ORIGINS 保持现有值；如配置，填写父平台的完整 origin，多个逗号分隔，不填路径。当前父页 `http://27.19.39.78:1051/contact/#/...` 对应 origin 为 `http://27.19.39.78:1051`。READY 握手和原 parent 保存协议保留，但消息不参与鉴权。

## 会话与停止

sessionId 是本页面业务会话 ID，同会话多次输入保持相同；每轮 qaId 和 taskId 独立，文件缓存以 qaId 为键，不能用 sessionId 代替 qa_id。

点击停止：立即停止界面增量，保持停止确认门禁；若创建请求尚未返回，等待其 taskId 后发送停止。必须待后端 workerReleased=true 才能再次发送。停止失败后停止按钮可重新点击，期间输入框保留文本，Enter、发送及重新起草都不能绕过门禁。停止部分内容不生成 DOCX。

后端在等待响应头、首事件或输出期间关闭本地上游连接。停止或失败后的下一轮由后端重新分配上游 conversation_id，前端 sessionId 不变。正常完成的连续起草保持上游上下文；workerReleased 不等同 AgentOS 远端官方终止确认。

## 文件与保存

流式终稿确认后沿用原 Markdown 转 Word 接口，传本轮 qa_id；取回并校验真实 DOCX，按后端原文件名展示附件，不自动调用合同保存接口。点击“保存到草稿箱”后仅提交本轮标识至自建后端，接口 message 只弹窗。保存中禁重复操作，成功后不重复提交；失败保留文件供核对和重试。

默认 VITE_EXTERNAL_DRAFT_SAVE_MODE=api。legacy parent 模式仍保留，但测试页面已移除；测试辅助程序位于 tests/helpers，不部署至 dist。deploy 目录内的代理是生产所需配置，保留并更新。

## iframe 与 Chrome

按钮不依赖第三方 Cookie/localStorage。若父平台使用 sandbox，由父平台按所需功能允许脚本、正确 origin 和文件下载；缺少下载权限时浏览器会阻止附件下载，子页面无法自行放开父平台权限。

父页面公网 HTTP 地址通过 iframe 直开 `http://10.210.101.117:11316` 属于公网页面访问本地网络。Chrome 整个 iframe 被拦截时本页面尚未运行，不能用修改 Vue 按钮或普通 API CORS 消除。应由实际可达网关提供页面、同源 API 和下载，让父平台 iframe 使用网关地址并避免重定向回私网。HTTPS 页面也应使用对应 HTTPS 的资源链路。不要把公共 URL 的域名解析到内网后就假定限制已解除。

部署后分别验收直接访问、父平台 iframe、父平台 sandbox（若启用）和受限制 Chrome；本地模拟测试不能代替现场浏览器策略验收。
