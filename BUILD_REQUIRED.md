# 构建与静态发布

应用版本 1.0.0，发布目录 `regulatory-ai-assistant_v1.0.0_202610221921`。包内包含本次源码构建的 dist。

```bash
npm ci --include=dev --no-audit --no-fund
npm test
npm run build
```

Node.js 使用 22.12+，本次验证为 24.19.0 / npm 11.9.0。没有新增或升级依赖，两个锁文件保留。代码包不包含 node_modules，首次运行 npm run dev 前必须先安装依赖，避免 vite: command not found。

标准构建执行 PDF worker 复制、`vue-tsc -b` 严格类型检查和 Vite 生产构建。前版 ExternalDraft 未使用变量问题已修复，tsconfig 的 strict/noUnusedLocals/noUnusedParameters 未关闭。旧 build:compat 命令保留供比对，本版默认使用标准 build。

本地开发目标在 vite.config.ts 中逐项显式填写，当前为 http://10.210.101.117:8000。更换 IP/端口时修改相应 target，并重启开发服务器。DEV_BACKEND_TARGET、DEV_FILE_TOOL_TARGET、DEV_REVIEW_PDF_TARGET 仅保留历史值，本版不读取。生产仍使用 .env.production 的同源前缀和现场 Nginx 代理。

生产业务 API 仍走同源。部署整体替换 dist，并把 deploy/contract-draft-save.location.conf 合入现有 Nginx server，为 /contract-draft-api/saveZDSingle 转发到合同中台。该片段不能作为完整 nginx.conf，原业务、PDF、文件下载与 iframe 路由保持不变；不要混用旧资源。后端保持 regulation_ai_backend_v1.0.0_202610221019，无需重打后端镜像。第三方草稿服务不属于该后端。

联调页位于 examples/external-draft-host.html，只作为源码包开发示例，不复制进生产 dist。默认 api 模式由新增页直接请求同源合同代理，不依赖父页面保存回执；原父页面协议保留用于 VITE_EXTERNAL_DRAFT_SAVE_MODE=parent。详见 [docs/EXTERNAL_DRAFT_INTEGRATION.md](docs/EXTERNAL_DRAFT_INTEGRATION.md)。
