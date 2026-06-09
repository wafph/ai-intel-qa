# v12-2-11 前端最小增量说明

## 改动范围

本次仅改前端展示层与输入层，不修改业务请求、后端接口、PDF 审核流程、错误兜底和任务恢复逻辑。

## 1. 输入框与历史问答左右边界对齐

- 保持四个功能主体高度不变。
- 普通状态下，输入框继续使用 80% 宽度居中，与历史内容区左右边界一致。
- 右侧来源/原文面板打开时，沿用当前分栏状态计算输入框宽度和 margin。
- 修正历史用户问题气泡右侧存在额外 margin 的问题，使用户问题右边界与输入框右边界保持一致。
- 输入框增加 `box-sizing: border-box`，避免边框/内边距导致视觉边界偏差。

## 2. 历史问题超过 5 行折叠

- 新增 `src/utils/messageCollapse.ts`。
- 四个功能的用户历史问题统一支持折叠展示。
- 默认超过 5 行或长文本会折叠，点击“展开全文”后完整展示，可再次点击“收起”。
- 仅影响展示，不影响发送内容、历史保存和后端请求。

## 3. 长文本输入能力

- 原输入限制为 2000 字符。
- 本次提升为 50000 字符，支持几万字输入。
- 前端仍保留上限保护，避免超大输入导致浏览器卡死。

## 修改文件

- `src/components/ChatInput.vue`
- `src/composables/useAppShell.ts`
- `src/views/IntelligentQA.vue`
- `src/views/IntelligentRetrieval.vue`
- `src/views/AuxiliaryDraft.vue`
- `src/views/ComplianceReview.vue`
- `src/style.less`
- `src/utils/messageCollapse.ts`
