# 部署与配置说明

## 1. 本地开发

```bash
npm ci --include=dev --no-audit --no-fund
npm run dev
```

开发环境默认读取 `.env.development`。

## 2. 生产构建

```bash
npm ci --include=dev --no-audit --no-fund
npm test
npm run build
```

本次已修复新增页授权接线与未使用变量问题，标准严格 build 通过，说明见 [../BUILD_REQUIRED.md](../BUILD_REQUIRED.md)。

构建成功后将 `dist/` 目录部署到 Nginx 静态目录，例如：

```text
/usr/share/nginx/html
```

## 3. 环境变量

### `.env.production`

```env
VITE_API_BASE_URL=
VITE_AUTH_MODE=platform
VITE_SM2_PUBLIC_KEY=请替换为真实完整公钥
VITE_AGENT_SESSION_EXPIRE_MINUTES=720
VITE_WATERMARK_API_BASE_URL=/v1/files
VITE_CONVERT_API_BASE_URL=/v1/markdown-word
```

说明：

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE_URL` | 留空表示请求当前 11316 同源 `/v1/...`，由 Nginx 转发。 |
| `VITE_AUTH_MODE` | `platform` 表示走中台/agentToken 权限模式。 |
| `VITE_SM2_PUBLIC_KEY` | 登录密码 SM2 加密公钥。 |
| `VITE_AGENT_SESSION_EXPIRE_MINUTES` | agentToken 前端会话有效期。 |
| `VITE_WATERMARK_API_BASE_URL` | 水印下载服务路由前缀。生产当前 `/v1/files`，沿用现场文件工具代理，最终请求 `/watermark/download`。留空时默认同源 `/v1/files`。 |
| `VITE_CONVERT_API_BASE_URL` | Markdown 转 Word 服务路由前缀。生产当前 `/v1/markdown-word`，沿用现场文件工具代理，最终请求 `/convert`。留空时默认同源 `/v1/markdown-word`。 |

## 4. Nginx 关键代理

当前 `.env.production` 已使用同源文件工具路径，原代理目标按现场保留：

```env
VITE_WATERMARK_API_BASE_URL=/v1/files
VITE_CONVERT_API_BASE_URL=/v1/markdown-word
```

下列为原文件工具代理示例，已有同名 location 时应调整原段，不重复添加。统一上传的 /v1/agentarts/ 也在下方，目标应为本次配套后端：

```nginx
location ^~ /v1/files/ {
    proxy_pass http://10.210.101.117:8000/v1/files/;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_connect_timeout 60s;
    proxy_read_timeout 7200s;
    proxy_send_timeout 7200s;
    client_max_body_size 100m;
}

location ^~ /v1/markdown-word/ {
    proxy_pass http://10.210.101.117:8000/v1/markdown-word/;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_connect_timeout 60s;
    proxy_read_timeout 7200s;
    proxy_send_timeout 7200s;
    client_max_body_size 100m;
}

# 业务后端仍按原逻辑转发到 8000。
location ^~ /v1/chat/ {
    proxy_pass http://10.210.101.117:8000;
    proxy_http_version 1.1;
    proxy_connect_timeout 60s;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

location ^~ /v1/agentarts/ {
    # 问答/审核上传和问答 URL 刷新也走此段；大小含 multipart 开销。
    client_max_body_size 512m;
    proxy_pass http://10.210.101.117:8000;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_connect_timeout 60s;
    proxy_read_timeout 7200s;
    proxy_send_timeout 7200s;
    add_header X-Accel-Buffering no always;
}

# 用户问题反馈接口：普通用户沿用智能体当前登录凭证提交到 8000。
location = /v1/feedback {
    proxy_pass http://10.210.101.117:8000;
    proxy_http_version 1.1;
    proxy_connect_timeout 60s;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    client_max_body_size 32m;
}
```

## 5. 部署验证

```bash
curl -i http://1.94.244.72:11316/

curl -i -X POST http://10.210.101.117:8000/v1/files/watermark/download \
  -H 'Content-Type: application/json' \
  -d '{"file_id":"test","user_name":"test"}'

curl -i -X POST http://10.210.101.117:8000/v1/markdown-word/convert \
  -H 'Content-Type: application/json' \
  -d '{"markdown":"# 测试导出","qa_id":"test"}'
```

`file_id=test` 可能返回业务错误，但不应返回 405、CORS 或前端 404 页面。若生产改为同源 Nginx 代理，则验证地址可改为 `http://前端域名/v1/files/watermark/download` 与 `http://前端域名/v1/markdown-word/convert`。

## 6. 统一上传和后端平台切换

先部署配套后端 regulation_ai_backend_v1.0.0_202610221019，再发布本次 dist。确认现有 /v1/agentarts/ 转发到该版本，覆盖 qa/review 上传与 qa/refresh-file-url。外层网关若仍限制 100m，则上传上限以网关为准。

开发 API 基础前缀仍为 /api；业务、文件工具及 PDF 在 vite.config.ts 中分别显式配置 target: http://10.210.101.117:8000。更换服务时修改对应 target 并重启开发服务，历史 DEV_* 环境值不再读取。PDF 开发代理会去掉 /review-pdf-api 前缀后访问 /v1/review/pdf/...。生产 API 基础前缀仍留空，走同源。原外部上传与开发 IAM 配置已注释停用。后续只改后端 AGENT_PROVIDER 并重启，无需重编前端。问答重传依赖后端 AGENT_UPLOAD_STORAGE_ROOT 持久化原件。

验证 npm test、npm run build，再按 [AGENT_UPLOAD_BACKEND_INTEGRATION.md](AGENT_UPLOAD_BACKEND_INTEGRATION.md) 检查浏览器没有 IAM 初始化及外部直传请求，并测试到期重传、页面刷新恢复和后端平台切换。


## 7. 外部起草与下载配置

本版恢复 vite.config.ts 显式 IP 写法；各业务/文件代理 target 均为 http://10.210.101.117:8000。修改相应 target 后重启 npm run dev。原 .env.development 的 DEV_BACKEND_TARGET、DEV_FILE_TOOL_TARGET、DEV_REVIEW_PDF_TARGET 仅保留，不作为生效配置。VITE_EXTERNAL_DOWNLOAD_PROXY=/external-file-download 仅用于外部页开发文件读取，不改变父平台收到的 downloadUrl。

VITE_ALLOWED_PARENT_ORIGINS 为主系统 origin 白名单（协议+域名/IP+端口，不含路径）；留空时绑定实际父窗口来源，生产建议填真实主系统。VITE_EXTERNAL_DRAFT_ACK_TIMEOUT_MS 默认 30000。这些 VITE_ 项是构建时配置，生产修改后需重新 build。

生产 Nginx 需要转发 /v1/、/review-pdf-api/ 和 /download/；已有更具体 location 时修改原段，避免旧目标仍被优先匹配。原 SPA 深链需保留 try_files 回退：

```nginx
# 示例：合入现有 server，不重复定义已有 location。
location ^~ /v1/ {
    proxy_pass http://10.210.101.117:8000;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_read_timeout 7200s;
    client_max_body_size 512m;
}
location ^~ /review-pdf-api/ {
    # 尾斜线将浏览器前缀替换为 /，最终请求 /v1/review/pdf/...。
    proxy_pass http://10.210.101.117:8000/;
    proxy_read_timeout 7200s;
    client_max_body_size 512m;
}
location ^~ /download/ {
    proxy_pass http://10.210.101.117:8000;
    proxy_set_header Host $http_host;
    proxy_read_timeout 7200s;
}
location / {
    try_files $uri $uri/ /index.html;
}
```

第三方 iframe 与前端保持浏览器允许的协议和嵌入策略；若有 sandbox，应允许页面脚本、必要源访问和下载。主系统草稿接口由第三方提供，暂缺时使用 examples 父页面模拟，与自建后台路由无关。完整联调见 [EXTERNAL_DRAFT_INTEGRATION.md](EXTERNAL_DRAFT_INTEGRATION.md)。


## 8. 本次合同草稿保存

默认 api 模式必须合入 [合同专用 location](../deploy/contract-draft-save.location.conf)，只新增精确 /contract-draft-api/saveZDSingle，不改现有 /v1/、/download/、PDF、SSE 或 SPA 段。Vite 已新增对应显式目标 10.100.10.19:18100 和路径 rewrite，原业务目标仍为 117:8000。

新增 VITE_EXTERNAL_DRAFT_SAVE_API、VITE_EXTERNAL_DRAFT_SAVE_MODE、VITE_EXTERNAL_DRAFT_SAVE_SUCCESS_CODES、VITE_EXTERNAL_DRAFT_PUBLIC_FILE_ORIGIN 均为构建时配置。PUBLIC_FILE_ORIGIN 留空沿用后台完整下载 URL；需要更换合同可达源时只填协议+主机+端口并重新构建，保留 /download/ 路径和签名参数。应用密钥暂时写在 contractDraft.ts，不是服务端保密配置。详见 [CONTRACT_DRAFT_SAVE.md](CONTRACT_DRAFT_SAVE.md)。
