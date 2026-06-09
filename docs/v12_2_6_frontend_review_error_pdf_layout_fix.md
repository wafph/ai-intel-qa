# v12-2-6 前端升级说明

本版本基于 v12-2-5 做增量升级，配合后端 v12.2.20。

## 变更范围

1. 上传 PDF 前先调用 `/review-pdf-api/v1/review/pdf/detect`，非标准 PDF 在完整解析前先弹窗确认。
2. 新增 `src/services/errorSanitizer.ts`，四个功能统一过滤 AgentArts / ModelArts / Redis 原始错误。
3. 历史恢复、任务恢复、流式输出、最终快照、历史落库前均做错误脱敏。
4. 清空历史提示使用 `offset: 72`，避免遮挡合规审核内容。
5. 非标准 PDF 不再禁用原文标记，支持弱原文查看，并提示“当前仅支持查看原文页面，暂不支持精准文字高亮定位”。
6. 合规审核原文定位从右侧 fixed 抽屉改为页面内左右分栏，PDF 按页展示。
7. 问答、检索、起草的来源/推荐范文/详情文档预览从全屏弹窗改为页面内右侧分栏；PDF 使用浏览器内置 PDF 工具栏分页。

## 部署提示

前端生产仍需保证 Nginx 提供：

- `/pdf.worker.min.mjs`
- `/review-pdf-api/v1/review/pdf/detect`
- `/review-pdf-api/v1/review/pdf/files/`

