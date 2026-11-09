# 构建与部署

本包包含源码、环境文件、锁文件、测试、文档和本次生产 dist，不含 node_modules。应用版本1.0.0，以时间戳包名区分发布。基线为用户 qa-20261023.zip。

```bash
npm ci --include=dev --no-audit --no-fund
npm test
npm run build
```

Node.js22.12+，本次测试Node24，依赖和锁文件未改。标准构建保留PDF worker复制与vue-tsc严格检查。

先部署本次后端及.env配置，替换deploy/contract-draft-save.location.conf对应的原location，nginx -t通过后重载，再发布dist全部内容。当前compose挂载源码，本次无依赖变化，无需重建基础镜像；后端需force-recreate加载新增环境变量。

开发代理在vite.config.ts显式填写10.210.101.117:8000。生产VITE_变量构建时注入；修改后必须重新build。旧examples测试页面已删除，deploy为生产配置，不可删除。详见docs/DEPLOYMENT_AND_CONFIG.md。
