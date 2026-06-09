# 构建说明

本包为前端源码升级包。由于当前沙箱环境中 npm install 被 SIGTERM 终止，未重新生成 dist。

部署前请在有 npm 网络/缓存的构建环境执行：

```bash
npm install
npm run build
```

构建完成后，将 dist 目录发布到 Nginx 静态目录。

本次源码升级内容见：docs/v12_2_6_frontend_review_error_pdf_layout_fix.md
