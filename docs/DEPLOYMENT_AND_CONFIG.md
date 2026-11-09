# 本次发布与配置

1. 先部署配套后端，加载 .env 末尾合同接口配置。当前 compose 挂载源码，无依赖变化，执行 docker compose up -d --force-recreate regulation-ai-backend，不需要重建基础镜像。
2. 将 deploy/contract-draft-save.location.conf 合入原前端 server，替换旧同名 location，不可重复定义。代理目标改为 10.210.101.117:8000/v1/contract-drafts/save 并保留 Authorization；其它业务、流式、DOCX 下载及 /external-draft 的 SPA 回退保持。
3. nginx -t 通过后重载；发布本包 dist 全部文件，避免旧 index.html 与新资源混用。
4. 默认 api 模式；浏览器 /contract-draft-api/saveZDSingle 路径不变。开发代理仍在 vite.config.ts 显式填写 IP，当前指向 10.210.101.117:8000。DEV_* 历史变量继续保留且不读取，原其它代理 target/rewrite 不变。
5. 公网父平台嵌入应使用实际可达网关地址，避免 iframe 与下载地址跳回私网。内网场景可继续原地址，但不保证公网父页在各 Chrome 策略下直连内网通行。

## 构建

```bash
npm ci --include=dev --no-audit --no-fund
npm test
npm run build
```

Node.js 22.12+；无新增/升级依赖，package.json、锁文件、严格 tsconfig 保留。源码包不含 node_modules，包含本次生产 dist。配置中的 VITE_ 值在构建时注入，修改需重建前端；后端环境配置修改需重新创建容器。

## 现场验收

检查 URL token A 与内部登录 B、父消息 C 同时存在时只使用 A。缺少 A 必须拒绝；直接访问与父平台 iframe 分别验证开始、首字前停止、输出后停止、再次输入、重新起草、附件下载和保存。停止门禁不能提前解除，同会话 sessionId 不变，轮次 qaId/taskId 不复用。

文件生成/获取失败应结束等待并允许重试；保存不重新执行起草/转换。合同双层成功只弹 message，内层失败不能标记成功；并发/重复保存不能重复上游 POST。Chrome 整页拦截需父平台/网关调整，不能归因于按钮。

原问答上传、纯文字发送不继承旧文件、审核重新执行不叠加、检索结构化结果与普通起草需按原流程回归。
