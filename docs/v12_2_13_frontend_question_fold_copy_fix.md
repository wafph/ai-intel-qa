# v12-2-13 前端最小升级说明

本次基于 v12-2-12 做最小展示层修复，不改业务请求、历史保存、流式输出、PDF 检测和原文定位逻辑。

## 变更内容

1. 修复历史问题折叠时第 6 行露出一半的问题。
   - 折叠区域改为固定 5 行内容高度。
   - 通过 `box-sizing: border-box` + 固定 `line-height/max-height` 控制裁剪边界。

2. 历史问题折叠按钮改为图标按钮。
   - 展开：`▾`
   - 收起：`▴`
   - 不再显示“展开全文 / 收起”汉字。

3. 历史问题新增复制图标按钮。
   - 图标：`⧉`
   - 点击复制当前用户问题原文。
   - 只影响前端交互，不改变消息内容和后端保存。

## 修改文件

- `src/utils/messageCollapse.ts`
- `src/style.less`
- `src/views/IntelligentQA.vue`
- `src/views/IntelligentRetrieval.vue`
- `src/views/AuxiliaryDraft.vue`
- `src/views/ComplianceReview.vue`

## 构建结果

已执行：

```bash
npm install --force
npm run build
```

构建通过。Vite 仅有第三方依赖 pure annotation 和 chunk size 警告，不影响功能。
