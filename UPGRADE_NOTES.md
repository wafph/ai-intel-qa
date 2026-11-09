# 前端专项升级记录（2026-10-23）

基线是用户最新 qa-20261023.zip，保留其 ExternalDraftChat、ExternalDraftForm、ExternalDraftResult 及页面样式，未覆盖回前一发布版。应用版本仍为1.0.0。

## 本次改动

- 新增页只认跳转 URL token（兼容 agentToken），移除父消息注入或覆盖身份；内部登录流程与凭据保留。
- 停止新增等待 taskId、发送 stop、确认 workerReleased 的门禁，等待期间禁止发送/重新起草；失败可重试停止，输入文本保留。
- 草稿保存统一调用自建后端：Authorization 为 URL token，JSON 只含 sessionId/qaId/taskId/zdName，应用凭据、wordPath 与合同双层业务码解析在后端。
- 原 DOCX 转换/获取/缓存/文件命名、手动保存时机、message 仅弹窗和按钮布局保持。前端检查标准业务码与明确的 success，字符串草稿 ID 不丢失。
- Vite 与生产代理仅迁移合同保存目标，显式后端 IP 不变；环境文件注释停用已迁移的旧成功码和文件源开关，其它生效值保持。
- 删除测试 HTML 页面，模拟存储移到 tests/helpers；deploy 保留生产代理片段。同步说明、接口、配置、测试、清单和本次 dist。

无依赖升级、无前端业务平台切换开关变更。先部署配套后端再部署本前端。完整验收见 docs/RELEASE_ACCEPTANCE.md。

本次发布名：regulatory-ai-assistant_v1.0.0_202610231732；配套后端：regulation_ai_backend_v1.0.0_202610231732。
