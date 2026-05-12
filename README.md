# AI+规章制度智能体前端

## 本版本升级重点

- 登录页标题改为“规章制度智能体”，保留原 AI 图标。
- 新增用户注册入口，对接后端 `POST /v1/auth/register`。
- 顶部右上角用户信息和退出登录移到左侧历史面板底部，与“我的收藏”放在同一区域。
- 直接访问业务页面时接入登录管理，调用 `POST /v1/auth/login`。
- 第三方访问只保留标准 URL 参数：`/intelligent-qa?agentToken=xxxx`。
- 继续保留第三方 `postMessage` 的 `SET_AGENTTOKEN` 方式。
- `agentToken` 校验 `/v1/scopes` 回归原始前端方式：`POST /v1/scopes`，请求体 `{ "access_token": agentToken }`。
- 404 页面简化，不再展示状态码、访问地址、发生时间和错误详情。
- 问答引用文件下载直接请求 `http://101.245.75.75:11328/watermark/download`，请求体为 `{ "file_id": "", "user_name": "" }`，不要求当前 Nginx 映射。
- 前端部署 IP 不硬编码；`/v1/*` 仍由 Nginx 按现有配置转发。

## 构建

```bash
pnpm install
pnpm build
```

打包产物：

```text
dist/
```

## Docker + Nginx 部署

```bash
docker run -d \
  --name web_guizhangzhidu \
  --restart always \
  --add-host=host.docker.internal:host-gateway \
  -p 11316:11316 \
  -v /mnt/data/web_hubeijiaotou/dist:/usr/share/nginx/html:ro \
  -v /mnt/data/web_hubeijiaotou/nginx.conf:/etc/nginx/nginx.conf:ro \
  -v /tmp/file_download_service:/tmp/file_download_service \
  docker.m.daocloud.io/library/nginx:stable-alpine
```

示例配置：

```text
deploy/nginx.conf.example
```

## 文档

- 登录管理与 agentToken：`docs/LOGIN_AUTH_UPGRADE.md`
- 文件下载：`docs/DOWNLOAD_UPGRADE.md`


## v8 调整说明

- 登录页去掉“系统登录 / AI+规章制度智能体”旧文案，统一为“规章制度智能体”。
- 新增注册表单，对接 `/v1/auth/register`。
- 用户信息、登录方式、我的收藏、退出登录统一放在左侧底部。
- 文件下载改为 `POST /watermark/download`，请求体 `{ file_id, user_name }`，不再调用 `GET /watermark/download/{fileId}`。
- 404 页面不再展示状态码、访问地址、发生时间、错误详情。


## v9 修复说明

- 修复智能问答点击引用文件时报 `Failed to fetch / 水印生成失败` 的问题。
- 水印服务返回 `download_url` 后，前端不再二次 `fetch(download_url)`，而是直接用返回地址预览或打开文件，避免 8001 文件服务跨域导致失败。
- 详情见 `docs/DOWNLOAD_UPGRADE.md`。
