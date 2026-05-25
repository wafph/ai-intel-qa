# 代码交接说明

## 维护边界

| 模块 | 修改边界 |
| --- | --- |
| 任务化流式 | 集中在 `useAppShell.ts`，修改时必须考虑 taskId、lastEventId、answerEventId。 |
| 会话历史 | `stores/chat.ts` 负责历史映射，`useAppShell.ts` 负责保存和恢复。 |
| 文档预览 | `documentDownload.ts` 与 `sourceUtils.ts`，不要改到 8000 后端代理逻辑。 |
| 文档导出 | `exportDocument.ts`，保持 `/convert -> download_url -> Blob 下载` 原始链路。 |
| 合规审核原文 | `review-context` 接口、metadata、reviewContext 字段不能删除。 |
| 审核过程过滤 | `reviewProgress.ts`，只作用于 review 场景。 |

## 常见排障

### 1. 文档预览 Network Error

优先检查 Nginx `/watermark/` 是否转发到 11328，或者 11328 是否可达。

### 2. 导出后显示前端 404

说明 `/convert` 返回的 `download_url` 是相对地址，但 Nginx 没有代理对应下载路径。补充 `/download/`、`/outputs/`、`/storage/` 等路径代理到 11327。

### 3. 刷新后内容缺一段

检查后端是否返回 `answerEventId`，前端恢复时是否从 `answerEventId` 继续订阅。

### 4. 审核原文标记为空

检查审核发起时是否调用 `/v1/chat/review-context`，历史接口返回中是否包含 `metadata.reviewContext` 或 `metadata.complianceOriginalText`。

### 5. 审核过程提示重新出现

确认当前消息 functionId 是否为 `review`，并检查 `reviewProgress.ts` 是否在历史回显、流式追加和最终校准阶段被调用。

## 代码注释策略

本整理版已为脚本添加文件级说明，并为核心函数补充注释。后续新增函数时请延续：

```ts
/** 处理用户发送消息并创建可恢复任务。 */
const handleSend = async () => {}
```
