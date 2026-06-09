# v12-2-8 前端最小修复说明

## 修复内容

修复 v12-2-7 构建时报错：

```text
src/composables/useAppShell.ts:868:3 - error TS2322: Type 'null' is not assignable to type 'Partial<ComplianceReviewParams> ...'
```

## 原因

`uploadedFileExtraMeta` 的声明类型为：

```ts
const uploadedFileExtraMeta = ref<Partial<ComplianceReviewParams>>({});
```

该类型不允许赋值为 `null`。v12-2-7 在删除已上传文件时误写为：

```ts
uploadedFileExtraMeta.value = null;
```

## 修改

保持原有业务逻辑不变，仅改为类型允许的空对象：

```ts
uploadedFileExtraMeta.value = {};
```

## 修改文件

```text
src/composables/useAppShell.ts
```
