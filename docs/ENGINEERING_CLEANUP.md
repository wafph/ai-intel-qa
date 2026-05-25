# 工程整理说明

本次整理基于最后可用前端版本 `fix13-review-progress-filter`，不改业务逻辑，只做工程管理处理。

## 清理内容

- 移除历史升级过程说明文件 `V12_*.md`。
- 移除冗余 `pnpm-lock.yaml`，保留当前构建使用的 `package-lock.json`。
- 不打包 `node_modules/`、`dist/`、临时文件和缓存文件。

## 保留内容

- `src/` 最新源码。
- `.env.development`、`.env.production`。
- `package.json`、`package-lock.json`。
- `README.md` 和 `docs/` 交接文档。
- Vite、TypeScript 配置文件。

## 构建验证

整理过程中已执行：

```bash
npm install --no-audit --no-fund
npm run build
```

构建通过。第三方依赖 PURE 注释和 chunk size warning 不影响运行。
