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
VITE_WATERMARK_API_BASE_URL=
VITE_CONVERT_API_BASE_URL=
```

说明：

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE_URL` | 留空表示请求当前 11316 同源 `/v1/...`，由 Nginx 转发。 |
| `VITE_AUTH_MODE` | `platform` 表示走中台/agentToken 权限模式。 |
| `VITE_SM2_PUBLIC_KEY` | 登录密码 SM2 加密公钥。 |
| `VITE_AGENT_SESSION_EXPIRE_MINUTES` | agentToken 前端会话有效期。 |
| `VITE_WATERMARK_API_BASE_URL` | 留空时请求 `/watermark/download`。 |
| `VITE_CONVERT_API_BASE_URL` | 留空时请求 `/convert`。 |

## 4. Nginx 关键代理

生产环境需要保证 11316 Nginx 至少包含以下代理：

```nginx
location ^~ /watermark/ {
    proxy_pass http://1.94.244.72:11328/watermark/;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_connect_timeout 60s;
    proxy_read_timeout 7200s;
    proxy_send_timeout 7200s;
    client_max_body_size 100m;
}

location = /convert {
    proxy_pass http://1.94.244.72:11327/convert;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_connect_timeout 60s;
    proxy_read_timeout 7200s;
    proxy_send_timeout 7200s;
    client_max_body_size 100m;
}

location ~ ^/(download|downloads|output|outputs|storage|files|export|exports|documents|converted|generated|tmp|temp|media)/ {
    proxy_pass http://1.94.244.72:11327;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_connect_timeout 60s;
    proxy_read_timeout 7200s;
    proxy_send_timeout 7200s;
    client_max_body_size 100m;
}

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

curl -i -X POST http://1.94.244.72:11316/watermark/download \
  -H 'Content-Type: application/json' \
  -d '{"file_id":"test","user_name":"test"}'

curl -i -X POST http://1.94.244.72:11316/convert \
  -H 'Content-Type: application/json' \
  -d '{"content":"测试导出","title":"测试文档"}'
```

`file_id=test` 可能返回业务错误，但不应返回 405、CORS 或前端 404 页面。
