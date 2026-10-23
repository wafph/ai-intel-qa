# 代码逻辑调用流程说明

本文用于代码交接，说明四个功能、任务化流式、刷新恢复、文档预览和导出的主要调用链路。

## 1. 登录与权限

```text
Login.vue
  -> userStore.login / platformLogin
  -> POST /v1/agent-permission/platform-login
  -> 保存 token、用户信息、权限范围
  -> 进入业务页面
```

agentToken 模式：

```text
URL agentToken / postMessage SET_AGENTTOKEN
  -> /v1/agent-permission/validate
  -> 保存权限上下文
  -> 进入对应功能页
```

## 2. 智能问答

```text
IntelligentQA.vue
  -> 上传附件时 POST /v1/agentarts/workflows/qa/upload-file
  -> 仅本轮有附件时，提交前 POST /v1/agentarts/workflows/qa/refresh-file-url
  -> 仅本轮有附件时，原历史接口先保存 answer.metadata.uploadedFiles
  -> useAppShell.sendMessage
  -> POST /v1/agentarts/workflows/qa/tasks
  -> 返回 taskId / qaId / sessionId
  -> GET /v1/agentarts/tasks/{taskId}/stream?fromEventId=...
  -> processStreamChunk 追加正文
  -> workflow_finished 校准最终正文和来源
  -> completed 保留任务等待 done
  -> done 校准并保存最终历史
```

引用来源：

```text
workflow_finished.outputs.user_fields.data_json
  -> extractSourcesFromAny
  -> assistantMessage.sources
  -> 点击来源标题
  -> fetchWatermarkDocument(file_id)
  -> POST /v1/files/watermark/download
  -> PDF 预览或文件下载
```

## 3. 智能检索

```text
IntelligentRetrieval.vue
  -> useAppShell.sendMessage
  -> POST /v1/agentarts/workflows/search/tasks
  -> SSE 订阅 task stream
  -> 输出检索回答与 sources
```

查看详情：

```text
source.file_id
  -> fetchWatermarkDocument
  -> POST /v1/files/watermark/download
  -> PDF 预览或下载
```

## 4. 辅助起草

```text
AuxiliaryDraft.vue
  -> useAppShell.sendMessage
  -> POST /v1/agentarts/workflows/draft/tasks
  -> SSE 输出起草内容
  -> 推荐范文 sources 显示
```

范文预览：

```text
source.file_id
  -> POST /v1/files/watermark/download
  -> PDF 预览或下载
```

导出：

```text
exportDocument.ts
  -> POST /v1/markdown-word/convert
  -> 获取 download_url
  -> GET download_url 获取 Blob
  -> 前端触发浏览器下载
```

## 5. 合规审核

```text
ComplianceReview.vue
  -> POST /v1/agentarts/workflows/review/upload-file（用户 Bearer，由后端管理平台凭证）
  -> 前端解析原文快照 originalText
  -> POST /v1/chat/review-context 保存审核上下文
  -> POST /v1/agentarts/workflows/review/tasks
  -> 拿到 taskId 后补写 review-context
  -> SSE 输出审核结果
```

审核原文恢复：

```text
GET /v1/chat/history
  -> answer.metadata.complianceOriginalText
  -> answer.metadata.reviewContext.originalText
  -> ComplianceReview 原文标记面板恢复
```

审核过程提示过滤：

```text
review 场景输出
  -> stripReviewProgressText
  -> 过滤独立成行的“分段完成/合规性处理完成/冲突性处理完成”
  -> 不影响问答、检索、起草
```

## 6. 刷新与切换恢复

```text
发送消息后
  -> localStorage 保存 taskId、sessionId、qaId、lastEventId、answerEventId、answerContent

刷新或切换回来
  -> registerRecoverableTaskFromSession
  -> GET /v1/agentarts/tasks/{taskId}
  -> 如果使用后端 answerContent，则 fromEventId = answerEventId
  -> 如果后端快照游标更旧，则保留本地正文和 lastEventId
  -> 重新订阅 /stream
```

最终校准：

```text
workflow_finished / done
  -> 读取本轮最终正文，不以字符串长度判断
  -> completed 状态包不提前移除任务
  -> done 校准、结束并保存历史
  -> completed 后直接断流且缺最终正文时才补查 task detail
```

## 7. 新建/切换不中断

```text
点击新建、切换会话、切换功能页
  -> 前端弹窗提示当前任务仍在生成
  -> 用户确认后仅 detach 当前浏览器订阅
  -> 不调用 /stop
  -> 后端任务继续生成
```

只有用户点击“停止回答”时：

```text
POST /v1/agentarts/tasks/{taskId}/stop
```

## 8. 问答 URL 过期和平台切换

普通发送有当前选中文件时才刷新 upload_ref；无文件时不继承历史，不传 file_url。重新生成明确使用被点击轮次的附件并 force 刷新，不修改输入区待发文字/新附件。引用通过原 metadata 历史和任务快照保存。异常时保留待发内容，不重复执行整轮任务。

旧 IAM 自动获取已停用，原实现保留供比对。完整流程见 [AGENT_UPLOAD_BACKEND_INTEGRATION.md](AGENT_UPLOAD_BACKEND_INTEGRATION.md)。


## 9. 外部起草独立入口

普通登录后继续原菜单。第三方 iframe 进入 /external-draft → externalDraftAccess 校验用户 token → 同一 session_id 下每轮新 qaId 创建 draft task → SSE 最终结果确认 → 该轮 qaId 转 DOCX → 自动 GET download_url 并校验、缓存文件 → 按后台原名展示附件 → 用户点击保存到草稿箱 → api 模式使用当前 token+本轮 DOCX 下载 URL 请求合同专用代理 → 合同 saveZDSingle → message 仅弹窗并更新保存状态。parent 模式仍按原 SAVE_DRAFT_TO_BOX/SAVE_DRAFT_RESULT 协议处理。

每轮另有后端 taskId 和请求 request_id；保存消息有独立 requestId，不能以 session_id 代替 qaId。新增页不复用内部登录存储，外部失败不触发原登录循环；后台仍保留既有 draft 历史。详见 [EXTERNAL_DRAFT_INTEGRATION.md](EXTERNAL_DRAFT_INTEGRATION.md)。
