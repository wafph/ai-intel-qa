# 规章制度智能体前端

本版以用户最新附件 `qa-20261023.zip` 为基线，仅升级新增跳转页 `/external-draft` 的 URL token 独立鉴权、停止确认与草稿保存后端封装。附件中的页面标题、输入文案、布局及按钮样式保留；其它问答、检索、起草、审核逻辑不改。版本号沿用 1.0.0，以包名时间戳区分发布。

**先部署本次后端，再更新代理和本前端。** 草稿保存浏览器路径 `/contract-draft-api/saveZDSingle` 保持，代理改为自建后端 `/v1/contract-drafts/save`，不再直连合同平台，前端无应用密钥。后端 .env 已补齐新增配置。

单独入口 `/external-draft?token=<编码后的用户token>` 不进入普通登录页、不增加原菜单。只认跳转 URL token，不接受父消息或内部登录凭据替换。每个业务会话 sessionId 稳定，每轮 qaId/taskId 独立。

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

## 运行与发布

```bash
npm ci --include=dev --no-audit --no-fund
npm run dev
npm test
npm run build
```

开发地址 `http://localhost:5100/external-draft?token=...`。vite.config.ts 继续使用显式 IP，业务目标为 `http://10.210.101.117:8000`；旧 DEV_* 变量保留但不读取。无依赖升级，严格类型检查保持，包内含本次构建 dist，部署时整体发布 dist。

将 [合同代理片段](deploy/contract-draft-save.location.conf) 替换原同名 location；其它 Nginx 配置保留，执行 nginx -t 后重载。examples 为测试页面已移除，测试辅助程序移入 tests/helpers；deploy 是生产配置，保留。

## 说明

- [本次升级记录](UPGRADE_NOTES.md)
- [跳转身份、ID、停止与 iframe](docs/EXTERNAL_DRAFT_INTEGRATION.md)
- [后端草稿保存契约](docs/CONTRACT_DRAFT_SAVE.md)
- [部署与配置](docs/DEPLOYMENT_AND_CONFIG.md)
- [验证及现场边界](docs/RELEASE_ACCEPTANCE.md)
- [测试运行](tests/README.md)

文件生成、获取、原文件名及 Markdown 展示保持附件版本；message 仅弹窗。公网父页 iframe 直接访问私网被 Chrome 整页拦截，需要父平台/网关配合，子页面无法自行解除。更多现场验收见部署说明。
