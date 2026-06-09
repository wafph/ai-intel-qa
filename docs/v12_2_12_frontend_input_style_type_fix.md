# v12-2-12 前端构建类型修复说明

## 修复内容

修复 `npm run build` 阶段 `src/App.vue` 中动态 `style` 绑定的 TypeScript 报错。

报错原因：`inputContainerStyle` 返回对象中的 `boxSizing` 被 TypeScript 推断为普通 `string`，而 Vue `style` 绑定要求符合 `CSSProperties` 的 `BoxSizing` 枚举类型。

## 修改文件

- `src/composables/useAppShell.ts`

## 修改方式

- 新增 `CSSProperties` 类型导入。
- 将 `inputContainerStyle` 显式标注为 `computed<CSSProperties>`。

## 校验

已执行：

```bash
./node_modules/.bin/vue-tsc -b
./node_modules/.bin/vite build
```

类型检查通过，Vite 构建通过。构建过程中仅有第三方依赖 pure annotation 和 chunk size 警告，不影响功能。
