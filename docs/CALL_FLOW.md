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
  -> useAppShell.sendMessage
  -> POST /v1/agentarts/workflows/qa/tasks
  -> 返回 taskId / qaId / sessionId
  -> GET /v1/agentarts/tasks/{taskId}/stream?fromEventId=...
  -> processStreamChunk 追加正文
  -> workflow_finished / done 后保存历史
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
  -> 上传文件到 AgentArts 上传接口
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
  -> 如果本地内容更完整，则 fromEventId = local lastEventId
  -> 重新订阅 /stream
```

最终校准：

```text
done/completed
  -> 再拉取 task detail
  -> 如果后端最终 answerContent 更完整，校准页面内容
  -> 保存历史
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
