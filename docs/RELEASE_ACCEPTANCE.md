# 验证记录与边界

- 后端：184 项 unittest 通过；本次变更文件 Ruff 检查通过；配置离线预检通过。
- 前端：105 项 Node 回归通过，含原上传/问答、流式恢复、外部起草、真实 Vue 组件及本机 Vite 代理；标准 vue-tsc 严格检查和 Vite 生产构建通过。
- 新增停止门禁、迟到 taskId、释放状态查询、停止失败重试、URL token 固定、后端保存参数及消息弹窗用例。
- Markdown 共享渲染器与最新附件中 ExternalDraftChat/ExternalDraftResult/ExternalDraftForm 内容保持；scoped 编译测试保留。
- 未连接现场 AgentOS、PostgreSQL/OpenSearch、合同服务或真实父平台；本地替身结果不代表内网联调已完成。现场验收见 DEPLOYMENT_AND_CONFIG.md。
- 全仓原有 Ruff 存在 user_feedback 两个文件的6项历史问题，本次未改该模块；构建依赖有历史注释/包大小提示，本次未改依赖或进行无关拆包。

- 合同保存代理片段通过 Nginx 1.28 语法检查及本机真实 HTTP 转发测试：重写到 /v1/contract-drafts/save、保留 URL Bearer、清空 Cookie、JSON/返回保持。
- 当前环境无可用 Chrome 测试浏览器，安装下载失败，未完成真实浏览器 iframe 点击验收；不能将组件/代理替身结果视为现场浏览器通过。
