# v12.2.21 前端流式停止与 Markdown 渲染最小修复

## 升级目标

本版本基于 `ai-agent-origin-0623.zip` 做最小增量升级，配合后端 `v12.2.25_stop_task_terminal_fix`。

本次暂不处理“50 轮以上历史性能优化 / 分页 / 虚拟列表”。

## 修复内容

1. 点击“停止回答”后，前端立即将当前消息标记为 `stopped`，并设置 `taskRecoverable=false`。
2. 覆盖“请求已发出但 taskId 还未返回时点击停止”的竞态：taskId 返回后立即调用后端 stop，不再订阅 SSE。
3. 刷新恢复时额外识别 `stopRequested / stop_requested`，只恢复 `pending/running && recoverable !== false && stop_requested !== true` 的任务。
4. 对本地已停止的 task/message 丢弃迟到 SSE、迟到 error、迟到 done，避免旧任务污染当前消息。
5. 补齐历史详情中的 `answerEventId` 映射，降低“快照内容 + SSE 续订游标”不一致导致的重复输出风险。
6. 取消前端打字机逐字播放效果，四个功能页流式展示直接渲染后端 SSE 更新后的 `currentAnswer`。
7. 保留真正的流式输出：后端每推送一个 chunk，`currentAnswer` 仍会增量更新；只是去掉前端二次逐字动画。
8. 增加 Markdown 表格基础样式，避免表格宽度撑破消息区域。

## 修改文件

- `src/composables/useAppShell.ts`
- `src/stores/chat.ts`
- `src/types/chat.ts`
- `src/views/IntelligentQA.vue`
- `src/views/IntelligentRetrieval.vue`
- `src/views/AuxiliaryDraft.vue`
- `src/views/ComplianceReview.vue`
- `src/style.less`

## 验收点

1. 正在流式输出时刷新，仍能继续恢复，不重复拼接旧内容。
2. 点击停止后刷新，不再拉起该任务。
3. 任务刚创建中、尚未输出时点击停止，taskId 返回后会立即 stop，不订阅流。
4. 用户停止后的迟到 SSE/error/done 不再写入当前 UI。
5. Markdown 加粗和表格最终输出后可以正常渲染。

## 构建校验

已执行：

```bash
npm install --force
npm run build
```

构建通过。Vite/Rolldown 第三方依赖 annotation 与 chunk size 警告不影响本次功能。
