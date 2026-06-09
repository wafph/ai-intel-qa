# v12-2-19 前端最小增量说明

本次只做 UI 一致性调整，不改业务请求、关闭逻辑、复制逻辑、流式恢复、PDF 审核流程。

## 变更内容

1. 用户问题复制按钮样式统一为模型回答复制按钮样式：
   - 四个页面的用户问题复制按钮从文本符号 `⧉` 改为 `/images/copy.svg` 图标。
   - 复制逻辑仍使用原有 `copyUserQuestion(item.content)`。

2. 问答 / 起草右侧面板关闭按钮统一为合规审核原文定位关闭按钮风格：
   - 智能问答参考来源面板仍调用 `closeSourcesPanel`。
   - 辅助起草推荐范文面板仍调用 `closeSourcesPanel`。
   - 合规审核原文定位面板仍调用 `closeOriginalPanel`。
   - 仅统一样式和点击区域，不改打开/关闭状态逻辑。

## 修改文件

- `src/views/IntelligentQA.vue`
- `src/views/IntelligentRetrieval.vue`
- `src/views/AuxiliaryDraft.vue`
- `src/views/ComplianceReview.vue`
- `src/style.less`
