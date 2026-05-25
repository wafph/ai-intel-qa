# 规章制度智能体前端工程交付版

本工程是湖北交投规章制度智能体前端最新版交付代码，基于 `QA-new0522-v12-2-2-refresh-switch-frontend-fix13-review-progress-filter` 整理。业务逻辑保持最后联调通过版本不变，本次仅做工程管理、注释和文档完善。

## 核心能力

- 四类智能体功能：智能问答、智能检索、辅助起草、合规审核。
- V12.2 任务化流式接口：创建任务、订阅 taskId、刷新/切换后恢复输出。
- `answerEventId` 恢复游标：避免刷新或切换后中间内容被跳过。
- 合规审核原文上下文恢复：刷新、切换后可恢复原文标记和比对能力。
- 合规审核过程提示过滤：仅在审核场景过滤“分段完成”“合规性处理完成1/5”等过程提示。
- 文档预览/下载保留原始逻辑：问答引用、检索详情、范文预览优先通过 `/watermark/download` 触发独立水印服务。
- 起草/审核导出保留原始逻辑：通过 `/convert` 调用独立转换服务。

## 快速启动

```bash
npm install
npm run dev
```

## 生产构建

```bash
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
VITE_WATERMARK_API_BASE_URL=
VITE_CONVERT_API_BASE_URL=
```

`VITE_WATERMARK_API_BASE_URL` 与 `VITE_CONVERT_API_BASE_URL` 留空时，前端请求同源路径：

```text
/watermark/download
/convert
```

建议由前端 Nginx 直转到独立服务：

```text
/watermark/download -> http://1.94.244.72:11328/watermark/download
/convert            -> http://1.94.244.72:11327/convert
```

## 文档入口

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
