# PDF 原文定位线上 Worker / 文件加载修复说明

版本：v12-2-5

## 背景

本地 Vite 开发环境下 PDF 原文定位正常，线上 Nginx 部署后失败。线上日志显示：

- `/review-pdf-api/v1/review/pdf/context/...` 返回 200；
- `/pdf.worker.min.js` 返回 200；
- 但没有出现 `/review-pdf-api/v1/review/pdf/files/...` 请求。

这说明问题发生在 PDF.js worker 初始化或 PDF.js 内部加载 PDF 文件之前。

## 原因

`pdfjs-dist@4.x` 的 worker 原生文件是 ESM：`pdf.worker.min.mjs`。线上使用 `.js` 兼容文件时，部分浏览器 / Nginx / PDF.js fake worker 流程下可能仍出现模块初始化失败。

同时，PDF.js 直接通过 `url` 加载 PDF 时会受到线上代理、Range 请求、MIME、缓存等链路影响。本地 Vite proxy 对这些行为更宽松，因此本地正常不代表线上正常。

## 本次最小增量修复

1. 固定 worker 为：

```text
/pdf.worker.min.mjs
```

不再使用：

```text
/pdf.worker.min.js
```

2. 保留 `pdf.worker.min.js` 作为兼容文件。
3. PDF 原文件先由前端通过 `fetch()` 请求，再转成 `Uint8Array` 交给 PDF.js：

```ts
const pdfData = await fetchPdfData(url);
const loadingTask = pdfjsLib.getDocument({ data: pdfData });
```

这样线上点击原文定位时，Nginx 日志应能看到：

```text
GET /review-pdf-api/v1/review/pdf/files/...
GET /pdf.worker.min.mjs
```

## 部署检查

服务器静态目录应存在：

```bash
ls -lh /usr/share/nginx/html/pdf.worker.min.mjs
ls -lh /usr/share/nginx/html/pdf.worker.min.js
```

访问检查：

```bash
curl -I http://10.210.101.209:11316/pdf.worker.min.mjs
```

应返回：

```text
HTTP/1.1 200 OK
Content-Type: application/javascript
```
