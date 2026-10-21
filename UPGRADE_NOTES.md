# 后端统一上传前端最小升级记录

配套后端：`regulation_ai_backend_v1.0.0_202610211516.zip`。

## 本次变更

- 问答/审核由浏览器外部直传改为请求后端各自的 upload-file 接口，复用用户 Bearer Token。
- 页面初始化不再获取 IAM Token；平台上传凭证由后端持有。旧实现与旧配置保留并标记停用。
- 问答附件新增 upload_ref/expires_at，发送前刷新 URL，创建任务前通过原历史接口保存引用，本地任务快照同步携带引用。
- 追问沿用最近一组附件；重新生成使用原轮次附件并强制刷新。刷新失败保留待发内容，不自动重复问答任务。
- `.env.development`、`.env.production` 注释停用原直传配置；开发 IAM 配置不参与编译；更新必要代理注释。
- 修正 package-lock.json 缺少已声明 @types/dompurify 的问题，没有升级已锁定依赖版本。
- 新增 npm test，同步说明、部署、接口、交接和发布文件；重建 dist 及完整性清单。

## 保留范围

四功能页布局、认证登录、检索/起草输入、原流式正文与停止/恢复机制、收藏/置顶/重命名、PDF 解析及定位、审核上下文绑定、文件工具预览/下载/导出、用户问题反馈保持原有实现。

## 构建与发布

```bash
npm ci --no-audit --no-fund
npm test
npm run build
```

交付包含本次源码构建的 dist。上传、刷新契约和阶段边界见 [docs/AGENT_UPLOAD_BACKEND_INTEGRATION.md](docs/AGENT_UPLOAD_BACKEND_INTEGRATION.md)，验证记录见 [docs/RELEASE_ACCEPTANCE.md](docs/RELEASE_ACCEPTANCE.md)。

## 原问题反馈功能

原用户菜单问题反馈、模块选择、最多 5 张截图及联系方式逻辑保留。功能说明继续见 [docs/USER_FEEDBACK_FRONTEND.md](docs/USER_FEEDBACK_FRONTEND.md)。
