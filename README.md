# 规章制度智能体前端工程交付版

本版基于 `regulatory-ai-assistant_v1.0.0_202610221813` 仅升级新增页的真实合同草稿保存、message 弹窗、操作按钮和 Markdown 局部样式。原 DOCX 生成/获取/命名和 ID 规则保留。自建后端为 `10.210.101.117:8000`（端口沿用原 8000，可配置）；后端代码继续使用 `regulation_ai_backend_v1.0.0_202610221019`。原问答、检索、起草、审核及上版修复保留。新增页独立校验主系统 token，草稿保存默认调用合同中台 saveZDSingle；按本次要求临时在前端写入应用凭据，原父页面模拟以 parent 模式兼容保留。自建后端不增加草稿接口。

应用版本 1.0.0；发布目录 `regulatory-ai-assistant_v1.0.0_202610221921`。包内包含源码、环境配置、锁文件、测试、文档和本次构建的 dist。

完整对接见 [统一上传及问答 URL 刷新](docs/AGENT_UPLOAD_BACKEND_INTEGRATION.md)，变更见 [UPGRADE_NOTES.md](UPGRADE_NOTES.md)。

## 外部页面本地联调

安装依赖并运行 `npm run dev` 后打开：

```text
http://localhost:5100/examples/external-draft-host.html
```

输入现有后端认可的用户 token，可验证 URL/消息两种授权、流式起草和每轮 DOCX。默认 api 模式点击保存会请求真实合同接口；需要原父页面模拟时，将 .env.development 的 VITE_EXTERNAL_DRAFT_SAVE_MODE 改为 parent 并重启 Vite。模拟记录仅在父页面内存，刷新清空；鉴权、起草和文件生成仍为真实服务。

单独入口为 `/external-draft?token=...`，正常登录后原菜单不增加该入口。同一页面会话内多轮共用 session_id，每轮 qaId/taskId 独立；不展示新建会话按钮，重新进入或更换授权时初始化独立会话。输入区不展示合同长度、强弱势及选项。完整协议和 ID 示例见 [外部起草对接](docs/EXTERNAL_DRAFT_INTEGRATION.md)。

## 核心能力

- 后端统一问答/审核上传，用户凭证鉴权；带附件的普通发送在提交前刷新 URL；重新生成只刷新被点击轮次的附件。普通纯文字不继承历史附件。
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
npm ci --include=dev --no-audit --no-fund
npm run dev
```

## 生产构建

```bash
npm test
npm run build
```

标准构建保留严格类型检查。部署前运行上述测试与构建；本版检查结果见 docs/RELEASE_ACCEPTANCE.md。开发代理目标直接在 vite.config.ts 各 target 中修改，当前均为 http://10.210.101.117:8000；历史 DEV_* 环境值不再读取。

构建产物位于 `dist/`，部署时整体发布其内容。本次必须将 [合同保存代理片段](deploy/contract-draft-save.location.conf) 合入现有 Nginx server；原业务、文件和流式 location 保留。详见 [合同保存接入说明](docs/CONTRACT_DRAFT_SAVE.md)。

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

- `docs/CONTRACT_DRAFT_SAVE.md`：本次真实保存、参数/返回、临时凭据、代理和现场检查。
- `docs/EXTERNAL_DRAFT_ATTACHMENT_FIX.md`：1813 版附件获取与状态修复历史。
- `docs/EXTERNAL_DRAFT_INTEGRATION.md`：新增页、独立授权、会话 ID、文件与第三方入库模拟。
- `docs/REGENERATE_FIX.md`：本次定位、变更范围、流式契约与现场验收。
- `docs/AGENT_UPLOAD_BACKEND_INTEGRATION.md`：统一上传、URL 刷新和平台切换。
- `docs/RELEASE_ACCEPTANCE.md`：本次验收与现场联调边界。
- `docs/PROJECT_STRUCTURE.md`：工程目录和核心文件职责。
- `docs/DEPLOYMENT_AND_CONFIG.md`：部署、环境变量、Nginx 和验证命令。
- `docs/CALL_FLOW.md`：四个功能和任务恢复调用流程。
- `docs/CODE_HANDOVER.md`：代码交接说明和维护边界。
- `docs/ENGINEERING_CLEANUP.md`：本次工程整理范围。

## 维护原则

1. 不在页面组件里硬编码大量接口地址，优先走 `src/api/api.ts` 和 `src/services/config.ts`。
2. 文档预览和导出由文件工具模块处理，当前集成在自建后端 8000，与智能体工作流分开。
3. 可恢复流式由 `src/composables/useAppShell.ts` 组装，具体逻辑在 `useStreamTask.ts`、`useStreamChunk.ts`，修改时需要同时考虑 `taskId / lastEventId / answerEventId / qaId / sessionId`。
4. 合规审核原文恢复依赖前端上下文传递和后端 `/v1/chat/review-context`，不要删除相关 metadata 字段。
