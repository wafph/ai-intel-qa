# 部署与配置说明

## 1. 本地开发

```bash
npm install
npm run dev
```

开发环境默认读取 `.env.development`。

## 2. 生产构建

```bash
npm install
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
VITE_WATERMARK_API_BASE_URL=http://1.94.244.72:8005/v1/files
VITE_CONVERT_API_BASE_URL=http://1.94.244.72:8005/v1/markdown-word
```

说明：

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE_URL` | 留空表示请求当前 11316 同源 `/v1/...`，由 Nginx 转发。 |
| `VITE_AUTH_MODE` | `platform` 表示走中台/agentToken 权限模式。 |
| `VITE_SM2_PUBLIC_KEY` | 登录密码 SM2 加密公钥。 |
| `VITE_AGENT_SESSION_EXPIRE_MINUTES` | agentToken 前端会话有效期。 |
| `VITE_WATERMARK_API_BASE_URL` | 水印下载服务路由前缀。生产默认 `http://1.94.244.72:8005/v1/files`，最终请求 `/watermark/download`。留空时默认同源 `/v1/files`。 |
| `VITE_CONVERT_API_BASE_URL` | Markdown 转 Word 服务路由前缀。生产默认 `http://1.94.244.72:8005/v1/markdown-word`，最终请求 `/convert`。留空时默认同源 `/v1/markdown-word`。 |

## 4. Nginx 关键代理

当前 `.env.production` 默认直接请求 8005 文件服务。如果生产环境存在浏览器跨域限制，或者希望统一走前端站点同源域名，可将：

```env
VITE_WATERMARK_API_BASE_URL=/v1/files
VITE_CONVERT_API_BASE_URL=/v1/markdown-word
```

并在前端 Nginx 增加以下代理。这样浏览器请求仍是当前站点同源路径，Nginx 再转发到 8005：

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
    proxy_pass http://1.94.244.72:8000;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_connect_timeout 60s;
    proxy_read_timeout 7200s;
    proxy_send_timeout 7200s;
    add_header X-Accel-Buffering no always;
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
