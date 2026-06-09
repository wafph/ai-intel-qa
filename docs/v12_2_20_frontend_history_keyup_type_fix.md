# v12-2-20 前端构建修复说明

## 修复问题

构建时报错：

```text
src/components/HistoryPanel.vue:138:20 - error TS1117: An object literal cannot have multiple properties with the same name.
```

原因是 `el-input` 上同时声明了 `@keyup.enter` 和 `@keyup.esc`，在 `vue-tsc` 编译模板时被归一化成重复的 `onKeyup` 属性。

## 修复方式

将两个 keyup 修饰符合并为一个统一键盘事件处理函数：

```vue
@keyup="handleTitleInputKeyup($event, history.id)"
```

函数内部按 `event.key` 判断：

- `Enter`：保存标题
- `Escape` / `Esc`：取消编辑

## 修改文件

```text
src/components/HistoryPanel.vue
```

## 校验

已执行：

```bash
npm run build
```

构建通过。Vite 仅有第三方依赖 annotation 与 chunk size 警告，不影响功能。
