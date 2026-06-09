# v12-2-14 历史问题折叠高度修复

## 修复内容

- 修复历史问题折叠为 5 行时，第 6 行露出半截的问题。
- 保留上一版的图标折叠/复制交互，不改变消息内容、历史保存和请求逻辑。

## 技术原因

上一版直接在带 padding 的 `pre.user-message-content` 上通过 `max-height` 控制 5 行高度。由于该元素本身同时承担气泡 padding、边框、字体行高，浏览器在不同字体/缩放下会出现第 6 行半截露出。

## 修复方案

- 在用户问题气泡内部新增 `.user-message-content-inner`。
- 外层气泡继续负责背景、圆角、padding。
- 内层文本负责 5 行裁剪，使用 `-webkit-line-clamp: 5` 和 `max-height: 120px` 双保险。
- 避免 padding 参与行数裁剪计算。

## 修改文件

- `src/style.less`
- `src/views/IntelligentQA.vue`
- `src/views/IntelligentRetrieval.vue`
- `src/views/AuxiliaryDraft.vue`
- `src/views/ComplianceReview.vue`

## 校验

已执行：

```bash
npm install --force
npm run build
```

构建通过。Vite 仅有第三方依赖 pure annotation 和 chunk size 警告，不影响功能。
