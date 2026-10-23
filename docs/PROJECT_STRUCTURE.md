# 工程目录说明

```text
.
├── public/                         # 静态图片资源
├── src/
│   ├── api/                        # API 地址和工作流配置
│   ├── components/                 # 通用组件：输入框、顶部菜单、历史面板等
│   ├── composables/                # 组合式业务逻辑，核心为 useAppShell
│   ├── router/                     # Vue Router 路由配置
│   ├── services/                   # HTTP、认证、文档下载、导出、来源解析等服务封装
│   ├── stores/                     # Pinia 状态仓库
│   ├── styles/                     # 页面和布局样式
│   ├── types/                      # TypeScript 类型定义
│   ├── views/                      # 业务页面：问答、检索、起草、审核、登录、收藏
│   ├── App.vue                     # 根组件
│   └── main.ts                     # 应用入口
├── docs/                           # 工程交接和部署文档
├── .env.development                # 开发环境配置
├── .env.production                 # 生产环境配置
├── package.json                    # 依赖和脚本
└── vite.config.ts                  # Vite 构建和开发代理配置
```

## 核心文件职责

### `src/composables/useAppShell.ts`

前端最核心的业务组合函数，负责：

- 当前功能页、当前会话和输入状态。
- V12.2 任务化流式调用。
- `taskId`、`lastEventId`、`answerEventId` 的保存和恢复。
- 切换会话、切换功能页、刷新浏览器后的恢复订阅。
- 合规审核文件上传、原文上下文保存和恢复。
- 消息保存、历史加载、引用来源解析和最终答案校准。

### `src/stores/chat.ts`

会话和消息状态仓库，负责：

- 会话列表和当前会话消息。
- 历史消息映射到前端展示结构。
- 收藏、置顶、标题编辑等会话操作。
- 合规审核过程提示的历史回显兜底清洗。

### `src/components/FeedbackDialog.vue`

用户问题反馈弹窗，负责所属模块、问题描述、截图和联系方式的输入校验。入口位于左侧用户菜单中的“我的收藏”上方，不影响现有点踩反馈。

### `src/services/userFeedback.ts`

将问题反馈字段和截图组装为 `multipart/form-data`，复用当前用户登录凭证提交到 `/v1/feedback`。

### `src/services/documentDownload.ts`

文档水印预览/下载服务，按原始逻辑：

```text
file_id + user_name -> POST /v1/files/watermark/download -> 获取 download_url 或 Blob -> PDF 预览/下载
```

### `src/services/exportDocument.ts`

起草和审核导出服务，按原始逻辑：

```text
POST /v1/markdown-word/convert -> 获取 download_url -> GET download_url -> Blob 下载
```

### `src/services/reviewProgress.ts`

仅在合规审核场景过滤工作流过程提示，例如：

```text
分段完成！
合规性处理完成1/5
冲突性处理完成1/5
```

该工具只过滤独立成行的过程提示，不按 `\n\n` 截断正文。

## 本次上传升级涉及文件

- src/services/agentUpload.ts：后端统一上传、问答刷新、安全错误、附件快照。
- src/composables/useComplianceReview.ts：沿用函数名，主上传转后端；旧直传函数未调用。
- src/composables/useAppShell.ts：问答显式 qa 上传，保留引用，发送期间处理状态。
- src/composables/useMessageSender.ts：本轮附件刷新、历史预保存、重新生成独立快照和本地任务 metadata；普通发送不继承历史附件。
- src/types/chat.ts、src/components/ChatInput.vue：引用/到期字段类型。
- src/stores/app.ts：停用 IAM 初始化调用，保留旧手动方法。
- tests/agent-upload.test.mjs：离线契约与真实组合函数测试。
- dist/：本次生产静态资源。

详细接口见 [AGENT_UPLOAD_BACKEND_INTEGRATION.md](AGENT_UPLOAD_BACKEND_INTEGRATION.md)。


## 上一版最小修复（1512 版）

`useStreamChunk.ts` 负责增量去重、最终快照覆盖和 completed/done 顺序；`useStreamTask.ts` 负责订阅隔离、断流收尾与详情恢复校准；`tests/stream-results.test.mjs` 为流式回归。新增 ExternalDraft 文件和用户路由/认证/代理改动均原样保留，本次不调整其实现。详见 [REGENERATE_FIX.md](REGENERATE_FIX.md)。


## 外部起草本次升级

- services/externalDraftAccess.ts：独立授权、父窗口来源与外部请求头。
- services/externalDraftBridge.ts：第三方草稿请求/回执，按四类 ID 关联。
- composables/useExternalDraftStream.ts：稳定会话 ID、独立问答 ID、任务流及停止。
- composables/useExternalDraftDocx.ts：逐轮转换、自动获取及校验真实文件、Blob 缓存与第三方保存回执。
- examples/external-draft-host.html / mock-draft-store.mjs：第三方父页面及草稿接口模拟；不进入生产 dist。
- tests/external-draft.test.mjs / dev-proxy.test.mjs：外部契约及真实开发代理回归。

前一节关于“新增 ExternalDraft 不修改”的说明属于 1512 版范围；本次已获得授权按上述范围升级，原四项业务页和主业务组合函数仍保留。

本次附件修复增加 tests/helpers/external-component-renderer.mjs，以真实 Vue 编译器及组件更新验证结果区和简化输入表单；没有新增运行或测试依赖。详见 [EXTERNAL_DRAFT_ATTACHMENT_FIX.md](EXTERNAL_DRAFT_ATTACHMENT_FIX.md)。


## 当前合同保存增量

- src/services/contractDraft.ts：真实保存、用户 token/下载地址/制度名和响应适配；临时应用凭据。
- deploy/contract-draft-save.location.conf：合入现有 server 的独立合同代理，不是完整 Nginx 配置。
- tests/external-markdown.test.mjs：真实 scoped 样式编译，验证 ol/th 规则不丢失。
- docs/CONTRACT_DRAFT_SAVE.md：本次参数、消息弹窗、配置和现场验证。

前述原父页面消息模式保留为 parent，默认 api 使用新合同接口；原四项功能不变。
