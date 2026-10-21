# 部署与配置说明

## 1. 本地开发

```bash
npm ci --no-audit --no-fund
npm run dev
```

开发环境默认读取 `.env.development`。

## 2. 生产构建

```bash
npm ci --no-audit --no-fund
npm run build
```

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
    proxy_pass http://1.94.244.72:8005/v1/files/;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_connect_timeout 60s;
    proxy_read_timeout 7200s;
    proxy_send_timeout 7200s;
    client_max_body_size 100m;
}

location ^~ /v1/markdown-word/ {
    proxy_pass http://1.94.244.72:8005/v1/markdown-word/;
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
    proxy_pass http://1.94.244.72:8000;
    proxy_http_version 1.1;
    proxy_connect_timeout 60s;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

location ^~ /v1/agentarts/ {
    # 问答/审核上传和问答 URL 刷新也走此段；大小含 multipart 开销。
    client_max_body_size 512m;
    proxy_pass http://1.94.244.72:8000;
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
    proxy_pass http://1.94.244.72:8000;
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

curl -i -X POST http://1.94.244.72:8005/v1/files/watermark/download \
  -H 'Content-Type: application/json' \
  -d '{"file_id":"test","user_name":"test"}'

curl -i -X POST http://1.94.244.72:8005/v1/markdown-word/convert \
  -H 'Content-Type: application/json' \
  -d '{"markdown":"# 测试导出","qa_id":"test"}'
```

`file_id=test` 可能返回业务错误，但不应返回 405、CORS 或前端 404 页面。若生产改为同源 Nginx 代理，则验证地址可改为 `http://前端域名/v1/files/watermark/download` 与 `http://前端域名/v1/markdown-word/convert`。

## 6. 统一上传和后端平台切换

先部署配套后端 regulation_ai_backend_v1.0.0_202610211516，再发布本次 dist。确认现有 /v1/agentarts/ 转发到该版本，覆盖 qa/review 上传与 qa/refresh-file-url。外层网关若仍限制 100m，则上传上限以网关为准。

开发 VITE_API_BASE_URL=/api；Vite 的 /api 和 /v1 已统一转发自建后端。生产留空使用同源。原外部上传与开发 IAM 配置已注释停用。后续只改后端 AGENT_PROVIDER 并重启，无需重编前端。问答重传依赖后端 AGENT_UPLOAD_STORAGE_ROOT 持久化原件。

验证 npm test、npm run build，再按 [AGENT_UPLOAD_BACKEND_INTEGRATION.md](AGENT_UPLOAD_BACKEND_INTEGRATION.md) 检查浏览器没有 IAM 初始化及外部直传请求，并测试到期重传、页面刷新恢复和后端平台切换。
