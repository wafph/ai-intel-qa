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

### `src/services/documentDownload.ts`

文档水印预览/下载服务，按原始逻辑：

```text
file_id + user_name -> POST /watermark/download -> 获取 download_url 或 Blob -> PDF 预览/下载
```

### `src/services/exportDocument.ts`

起草和审核导出服务，按原始逻辑：

```text
POST /convert -> 获取 download_url -> GET download_url -> Blob 下载
```

### `src/services/reviewProgress.ts`

仅在合规审核场景过滤工作流过程提示，例如：

```text
分段完成！
合规性处理完成1/5
冲突性处理完成1/5
```

该工具只过滤独立成行的过程提示，不按 `\n\n` 截断正文。
