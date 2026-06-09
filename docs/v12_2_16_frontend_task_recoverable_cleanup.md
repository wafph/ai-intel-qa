# v12-2-16 前端任务恢复同步升级

本版本基于后端 v12.2.22 的任务生命周期调整做最小同步升级。

## 修改目标

- 尊重后端新增的 `recoverable=false` 字段。
- 只恢复 `pending` / `running` 状态的任务。
- `completed` / `error` / `stopped` / `cancelled` / `superseded` 不再恢复订阅。
- 在同一会话发送新问题前，先清理本地旧 active task，避免旧异常任务继续写入新消息。
- 保留智能检索已完成任务的 task detail 查询补全能力，但不再重放终态 SSE。

## 修改文件

- `src/composables/useAppShell.ts`
- `src/stores/chat.ts`
- `src/types/chat.ts`

## 不变内容

- 不改 PDF detect / prepare / 原文定位业务逻辑。
- 不改错误兜底文案。
- 不改标题生成、检索来源展示、导出、布局样式。
- 不改后端接口地址。

## 恢复策略

- `pending` / `running` 且 `recoverable !== false`：允许刷新或切换后恢复订阅。
- `completed`：只展示已有结果；智能检索可通过 task detail 补齐 sources，但不重放 SSE。
- `error` / `stopped` / `cancelled` / `superseded`：不再恢复订阅，不再写入后续新问题。
