# 代码交接说明

## 维护边界

| 模块 | 修改边界 |
| --- | --- |
| 任务化流式 | 由 `useAppShell.ts` 组装，实现在 `useStreamTask.ts` / `useStreamChunk.ts`，修改时必须考虑 taskId、lastEventId、answerEventId。 |
| 会话历史 | `stores/chat.ts` 负责历史映射，`useAppShell.ts` 负责保存和恢复。 |
| 文档预览 | `documentDownload.ts` 与 `sourceUtils.ts`，不要改到 8000 后端代理逻辑。 |
| 文档导出 | `exportDocument.ts`，保持 `/v1/markdown-word/convert -> download_url -> Blob 下载` 原始链路。 |
| 合规审核原文 | `review-context` 接口、metadata、reviewContext 字段不能删除。 |
| 审核过程过滤 | `reviewProgress.ts`，只作用于 review 场景。 |

## 常见排障

### 1. 文档预览 Network Error

优先检查 `VITE_WATERMARK_API_BASE_URL` 是否指向 当前集成文件服务路由前缀，例如 `http://10.210.101.117:8000/v1/files`，或同源 Nginx `/v1/files/` 是否已转发到 10.210.101.117:8000。

### 2. 导出后显示前端 404

说明 `/v1/markdown-word/convert` 返回的 `download_url` 是相对地址，但 Nginx 没有代理对应下载路径。按当前文件服务实际返回路径补充代理，或让服务返回完整绝对下载地址。

### 3. 刷新后内容缺一段

检查后端是否返回 `answerEventId`，前端恢复时是否从 `answerEventId` 继续订阅。

### 4. 审核原文标记为空

检查审核发起时是否调用 `/v1/chat/review-context`，历史接口返回中是否包含 `metadata.reviewContext` 或 `metadata.complianceOriginalText`。

### 5. 审核过程提示重新出现

确认当前消息 functionId 是否为 `review`，并检查 `reviewProgress.ts` 是否在历史回显、流式追加和最终校准阶段被调用。

## 代码注释策略

本整理版已为脚本添加文件级说明，并为核心函数补充注释。后续新增函数时请延续：

```ts
/** 处理用户发送消息并创建可恢复任务。 */
const handleSend = async () => {}
```

## 统一上传维护边界

上传及刷新统一使用 agentUpload.ts 和 api.ts 中固定后端路由，不恢复 sharedDataToken/IAM 自动获取。后端 AGENT_PROVIDER 是唯一平台开关。问答引用沿用 answer.metadata.uploadedFiles，保存/恢复和重新生成都必须保留 upload_ref/expires_at；任务创建前的历史预保存不能删，否则浏览器提前关闭会失去引用。

普通发送只使用输入区本次附件，不继承最近历史附件；重新生成使用该轮明确快照且保留下一条草稿。旧函数、旧环境值和旧代理保留且停用，不能因看到旧字符串就恢复主流程调用。改动后运行 npm test 和 npm run build；标准严格构建已通过，说明见 [../BUILD_REQUIRED.md](../BUILD_REQUIRED.md)。接口及错误处理见 [AGENT_UPLOAD_BACKEND_INTEGRATION.md](AGENT_UPLOAD_BACKEND_INTEGRATION.md)。


## 本次流式维护约束

以 taskId、messageId、会话和当前订阅识别本轮，按事件游标去重，不按正文内容去重。`completed` 后仍要处理 `done`；最终快照允许短于临时正文或为空，不能恢复旧的长度门槛。仅在校准后保存最终历史，检索 sources 与正文分开保留。不要将重新生成附件写回输入区，也不要恢复普通问答的历史附件兜底。问题与验收见 [REGENERATE_FIX.md](REGENERATE_FIX.md)。


## 外部起草维护边界

externalDraftAccess.ts 只存已校验的外部内存凭证；不要恢复内部登录缓存兜底或向 localStorage 写外部 token。main/router 仅为独立入口分支接线，其余业务沿用原鉴权。session_id 代表整个新建会话，qaId 代表会话内一轮问答，taskId 由后端创建；不要合并这些 ID。每轮 DOCX 的 qa_id 使用该轮 qaId。

externalDraftBridge.ts 等待父系统 SAVE_DRAFT_RESULT，成功且含 draftId 才更新 UI。examples 中的模拟存储属于第三方父页面样例，不要移入自建业务后端。替换真实入库接口时保留来源验证、轮次关联和幂等。详见 [EXTERNAL_DRAFT_INTEGRATION.md](EXTERNAL_DRAFT_INTEGRATION.md)。


## 本次附件状态与界面维护

useExternalDraftDocx.ts 先初始化 records[key] 再单独读取 Vue 代理，禁止把 ||= 首次赋值返回的原始对象作为后续状态写入入口。转换成功后继续 GET 并校验真实 DOCX，文件缓存按 qaId 隔离；done 代表已获取有效文件。文件读取重试复用转换结果，附件下载与父页面保存复用缓存 Blob；退出时清理，不写入浏览器持久存储。

ExternalDraftResult.vue 按生成/获取/就绪/错误显示，附件、保存、重新起草纵向排列；ExternalDraftForm.vue 不展示合同长度/强弱势，保留原描述提交。页面隐藏新建会话按钮，但原授权变更的会话初始化逻辑保留。Vite 目标在 vite.config.ts 显式维护；旧 DEV_* 环境项不再读取。回归使用真实 Vue 编译和组件更新，不能只读取最终对象值判断界面正常。详见 [EXTERNAL_DRAFT_ATTACHMENT_FIX.md](EXTERNAL_DRAFT_ATTACHMENT_FIX.md)。


## 当前合同接口适配

contractDraft.ts 封装 wordPath/zdName、同一外部 token、临时前端应用凭据和独立响应判断；useExternalDraftDocx.ts 默认调用它，仅在 parent 模式沿用原消息。message 仅 ElMessage 弹窗，ExternalDraftResult.vue 不渲染 boxError，组件只展示保存状态。不要将合同业务码判断扩散到其他智能体接口。新同源 /contract-draft-api 仅连合同中台，原 117 路由不变。凭据硬编码为本次用户明确要求，后续迁移服务端时仅替换适配边界，避免重复迁移业务。详见 [CONTRACT_DRAFT_SAVE.md](CONTRACT_DRAFT_SAVE.md)。
