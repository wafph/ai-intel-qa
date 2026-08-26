# 构建说明

本交付包已根据当前源码执行 TypeScript 检查和 Vite 生产构建，`dist/` 为本次问题反馈升级对应的静态发布文件，可以直接部署到 Nginx 静态目录。

如果后续继续修改源码，请重新执行：

```bash
npm install
npm run build
```

构建完成后，将新的 `dist/` 内容发布到 Nginx 静态目录。本次升级说明见 `docs/USER_FEEDBACK_FRONTEND.md`。
