# 构建与静态发布

本包包含当前统一后端上传及问答 URL 刷新对应的 `dist/`，可发布其内容到原 Nginx 静态目录。先部署配套后端 `regulation_ai_backend_v1.0.0_202610211516.zip`，保证 `/v1/agentarts/` 转发到该后端。

本次构建使用 `.env.production`：业务接口同源，PDF 和文件工具保留原现场配置；不需要前端 IAM 密码或平台密钥。后续仅切换后端 AGENT_PROVIDER 时无需重新构建。

源码或前端环境配置改变后执行：

```bash
npm ci --no-audit --no-fund
npm test
npm run build
```

使用 Node.js 22.12+。构建包含 TypeScript 检查、PDF worker 静态复制和 Vite 生产打包。部署应整体替换 dist 内容，避免 index.html 与资源哈希混用；原 Nginx 路由配置按现场保留。

本次说明见 [docs/AGENT_UPLOAD_BACKEND_INTEGRATION.md](docs/AGENT_UPLOAD_BACKEND_INTEGRATION.md)，验收见 [docs/RELEASE_ACCEPTANCE.md](docs/RELEASE_ACCEPTANCE.md)。
