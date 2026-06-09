# 前端升级说明：合规审核历史标题、PDF 原文定位与错误兜底

## 版本说明

本版本用于配合后端 `regulation_ai_backend_v12_2_18_backend_review_pdf_title_error_fix.zip`。

## 本次修复点

### 1. 审核历史标题刷新前后保持一致

合规审核场景下，前端本地新建会话、历史预览和任务请求统一使用：

```text
文件名（不含后缀）｜审核维度
```

发送给后端的 `questionContent/sessionTitle/metadata/reviewContext` 也同步携带该信息，避免页面未刷新时按上传文件名显示、刷新后按统一审核维度显示的问题。

### 2. PDF 原文定位上下文恢复

前端历史详情读取时会从以下位置恢复审核上下文：

- `answer.metadata.reviewContext`
- `answer.metadata.complianceParams`
- `answer.reviewContext`
- 用户消息与助手消息 metadata
- 后端 `/v1/chat/review-context` 返回的 PDF context

恢复字段包括：

- `pdfContextId`
- `pdfType`
- `sourceFileUrl`
- `parsedTxtUrl`
- `parsedMarkdownUrl`
- `locatorMode`
- `locatorAvailable`
- `locatorUnavailableReason`
- `reviewFileUrl`
- `textSource`

这样刷新后再次打开审核历史，点击“原文定位”仍可恢复 PDF.js 文本层定位或解析文本展示。

### 3. 智能体异常前端统一兜底

前端不再把上游原始错误直接展示到对话框，例如：

```text
Failed to get the element from redis
```

原始错误只写入浏览器控制台，页面展示统一兜底文案。

兜底文案配置：

```env
VITE_FRONTEND_FALLBACK_ERROR_MESSAGE=抱歉，当前智能体服务繁忙或请求处理失败，请稍后重试。
```

### 4. 首次点击 Redis 瞬时错误兼容

后端已做短暂重试；前端也对 SSE 包装错误、任务创建失败、流式异常做统一兜底，避免首次点击偶发错误直接暴露给用户。

## 更新文件

```text
src/composables/useAppShell.ts
src/stores/chat.ts
src/views/ComplianceReview.vue
src/types/chat.ts
src/services/config.ts
.env.development
.env.production
docs/FRONTEND_REVIEW_BACKEND_V18_SYNC.md
```

## 构建校验

已执行：

```bash
npm install --no-audit --no-fund --ignore-scripts --loglevel=error
npm run build
```

构建通过。Vite 仅提示第三方依赖 pure annotation 和 chunk size 警告，不影响本次功能。
