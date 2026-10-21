# 智能审核 PDF 预处理与原文定位前端升级说明

## 变更范围

本次只针对智能审核新增 PDF 处理链路、原文定位优化和收藏排序对齐做增量升级，其它功能逻辑保持不变。

## PDF 上传链路

非 PDF 文件经自建后端 review/upload-file 上传；问答使用 qa/upload-file。

PDF 文件走新链路：

1. 前端调用 `VITE_REVIEW_PDF_PREPARE_API_BASE_URL/prepare`。
2. PDF 预处理服务保存原始 PDF，按后端现有策略解析并返回 `parsed_text`（标准 PDF 为 PyMuPDF，非标/扫描按后端配置）。
3. 前端把 `parsed_text` 组装成 `.txt File`。
4. 前端调用后端 review/upload-file，获取顶层 url；后端自行管理平台上传凭证。
5. 前端调用 `bind-review-file` 将后端返回的 URL 绑定回 `context_id`。
6. 审核工作流仍继续使用原来的 `file_url` 入参。

## 原文定位

### 标准 PDF

当 PDF 预处理服务返回：

```json
{
  "locator_available": true,
  "locator_mode": "pdf_text_layer"
}
```

前端使用 `source_file_url` 加载原始 PDF，并基于 PDF.js 文本层做页内高亮定位。

### 非标准 PDF / 扫描 PDF

当返回：

```json
{
  "locator_available": false,
  "locator_mode": "parsed_text_only"
}
```

前端展示 mineru 解析文本；用户点击原文定位时提示无法进行原 PDF 精准定位。

### Word / 非 PDF

继续保留原文文本定位，同时把原文面板展示从整段文本优化为段落级展示和高亮。

## 刷新与持久化

PDF 预处理接口返回 `context_id`。前端会把该值写入审核 metadata。刷新或历史恢复时，`ComplianceReview.vue` 会根据 `context_id` 调用：

```http
GET /v1/review/pdf/context/{context_id}?include_content=true
```

恢复：

- `source_file_url`
- `parsed_text`
- `review_file_url`
- `locator_available`
- `locator_mode`
- `locator_unavailable_reason`

## 新增配置

```env
VITE_REVIEW_PDF_PREPARE_API_BASE_URL=/review-pdf-api/v1/review/pdf
```

开发环境 Vite 代理：

```ts
'/review-pdf-api': {
  target: 'http://127.0.0.1:8006',
  changeOrigin: true,
  secure: false,
  rewrite: (path) => path.replace(/^\/review-pdf-api/, ''),
}
```

生产环境 Nginx 需要增加同名代理到 PDF 预处理服务。

## 新增依赖

```json
"pdfjs-dist": "^4.10.38"
```


## 本次统一上传接入

PDF 检测、解析、TXT 生成与定位行为保留，仅替换上传目标。问答 PDF 解析后的 TXT 上传到 qa，返回 upload_ref 并保存到附件历史；后续 URL 重传由后端使用缓存 TXT 完成，不再运行 PDF 解析。审核使用 review，保持原审核重传和绑定策略。详见 [AGENT_UPLOAD_BACKEND_INTEGRATION.md](AGENT_UPLOAD_BACKEND_INTEGRATION.md)。
