# v12-2-10 前端最小增量说明

本次只围绕右侧面板打开/关闭时的布局对齐和滚动锚点做最小改动，不改变四个功能的业务请求、流式逻辑、PDF detect/prepare、引用预览旧逻辑和后端接口。

## 更新点

1. 四个功能的底部会话输入框与历史对话内容区左右边界统一。
   - 普通状态：输入框保持 80% 宽度居中，与历史内容区一致。
   - 问答/起草打开右侧来源面板：输入框按来源面板预留空间重新计算，和左侧历史内容区对齐。
   - 合规审核打开原文定位：输入框对齐左侧审核结果分栏。

2. 问答 / 起草右侧来源面板关闭按钮增强。
   - 保留原 closeSourcesPanel 业务逻辑。
   - 只增强按钮可见性、点击面积和 hover 状态。
   - 点击关闭后自动回到当前消息附近，不跳到第一个对话。

3. 合规审核关闭原文定位后恢复滚动锚点。
   - 关闭前记录 activeOriginalMessageId。
   - 关闭后等待布局恢复，再 scrollIntoView 到原消息操作区。

## 修改文件

- src/composables/useAppShell.ts
- src/views/IntelligentQA.vue
- src/views/AuxiliaryDraft.vue
- src/views/ComplianceReview.vue
