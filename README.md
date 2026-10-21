# 规章制度智能体前端工程交付版

本版基于原版 regulatory-ai-assistant-1021-origin 做前端最小升级，配套后端 `regulation_ai_backend_v1.0.0_202610211516.zip`。问答与审核统一请求自建后端上传，问答支持 URL 过期后重传；平台切换只修改后端 AGENT_PROVIDER 并重启，前端不再先获取 IAM Token。原页面布局及其他功能保留。

应用版本 1.0.0；发布目录 `regulatory-ai-assistant_v1.0.0_202610211601`。包内包含源码、环境配置、锁文件、测试、文档和本次构建的 dist。

完整对接见 [统一上传及问答 URL 刷新](docs/AGENT_UPLOAD_BACKEND_INTEGRATION.md)，变更见 [UPGRADE_NOTES.md](UPGRADE_NOTES.md)。

## 核心能力

- 后端统一问答/审核上传，用户凭证鉴权；问答提交、追问和重新生成前刷新附件 URL。
- 四类智能体功能：智能问答、智能检索、辅助起草、合规审核。
- 用户问题反馈：从左侧用户菜单提交问题描述、截图和联系方式，由独立管理端统一处理。
- V12.2 任务化流式接口：创建任务、订阅 taskId、刷新/切换后恢复输出。
- `answerEventId` 恢复游标：避免刷新或切换后中间内容被跳过。
- 合规审核原文上下文恢复：刷新、切换后可恢复原文标记和比对能力。
- 合规审核过程提示过滤：仅在审核场景过滤“分段完成”“合规性处理完成1/5”等过程提示。
- 文档预览/下载保留原始逻辑：问答引用、检索详情、范文预览优先通过 `/v1/files/watermark/download` 触发水印服务。
- 起草/审核导出保留原始逻辑：通过 `/v1/markdown-word/convert` 调用 Markdown 转 Word 服务。

## 快速启动

```bash
npm ci --no-audit --no-fund
npm run dev
```

## 生产构建

```bash
npm test
npm run build
```

构建产物位于 `dist/`，部署时将 `dist` 内容挂载或复制到 Nginx 静态目录。

## 重要环境变量

生产环境 `.env.production` 推荐：

```env
VITE_API_BASE_URL=
VITE_AUTH_MODE=platform
VITE_SM2_PUBLIC_KEY=请替换为真实完整公钥
VITE_AGENT_SESSION_EXPIRE_MINUTES=720
VITE_WATERMARK_API_BASE_URL=/v1/files
VITE_CONVERT_API_BASE_URL=/v1/markdown-word
```

`VITE_WATERMARK_API_BASE_URL` 与 `VITE_CONVERT_API_BASE_URL` 配置的是接口路由前缀，代码会自动追加固定路由：

```text
${VITE_WATERMARK_API_BASE_URL}/watermark/download
${VITE_CONVERT_API_BASE_URL}/convert
```

当前生产请求走同源路径，沿用现场 Nginx 文件工具代理：

```text
/v1/files/watermark/download
/v1/markdown-word/convert
```

后期更换服务器时，只需要在 `.env.production` 中替换协议、IP、端口或前缀。若希望走前端 Nginx 同源转发，可设置为 `/v1/files` 与 `/v1/markdown-word`，并沿用现场文件工具反代目标。

## 文档入口

- `docs/AGENT_UPLOAD_BACKEND_INTEGRATION.md`：统一上传、URL 刷新和平台切换。
- `docs/RELEASE_ACCEPTANCE.md`：本次验收与现场联调边界。
- `docs/PROJECT_STRUCTURE.md`：工程目录和核心文件职责。
- `docs/DEPLOYMENT_AND_CONFIG.md`：部署、环境变量、Nginx 和验证命令。
- `docs/CALL_FLOW.md`：四个功能和任务恢复调用流程。
- `docs/CODE_HANDOVER.md`：代码交接说明和维护边界。
- `docs/ENGINEERING_CLEANUP.md`：本次工程整理范围。

## 维护原则

1. 不在页面组件里硬编码大量接口地址，优先走 `src/api/api.ts` 和 `src/services/config.ts`。
2. 文档预览和导出是独立服务逻辑，不走 8000 后端业务代码。
3. 可恢复流式相关逻辑集中在 `src/composables/useAppShell.ts`，修改时需要同时考虑 `taskId / lastEventId / answerEventId / qaId / sessionId`。
4. 合规审核原文恢复依赖前端上下文传递和后端 `/v1/chat/review-context`，不要删除相关 metadata 字段。
