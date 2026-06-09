# PDF 原文定位 worker 静态路径修复说明

本次只修复 PDF 审核完成后点击“原文定位”时 PDF.js worker 加载失败的问题。

原逻辑使用：

```ts
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
GlobalWorkerOptions.workerSrc = pdfWorkerUrl
```

Vite 构建后会生成类似：

```text
/assets/pdf.worker.min-yatZIOMy.mjs
```

在线上部署时，如果 `assets` 文件没有同步、浏览器缓存引用旧 hash、或 Nginx 对 `.mjs` 的 MIME 不正确，就会出现：

```text
Setting up fake worker failed: Failed to fetch dynamically imported module
```

新逻辑固定使用：

```text
/pdf.worker.min.js
```

该文件放在 `public/pdf.worker.min.js`，构建后会被复制到 `dist/pdf.worker.min.js`。`.js` 后缀可避免部分 Nginx 环境下 `.mjs` MIME 类型不兼容。

重新部署时请确保服务器静态目录中存在：

```text
/usr/share/nginx/html/pdf.worker.min.js
```

如仍有浏览器缓存，请清理缓存或强制刷新页面。
