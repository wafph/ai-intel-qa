# 前端回归验证

```bash
npm ci --include=dev --no-audit --no-fund
npm test
npm run build
```

无新增测试依赖，使用 Node.js 原生 test 和 Vite SSR 加载真实服务/组合函数。当前共 90 项：上传/问答 34，原任务流 18，外部起草 37，开发代理 1。HTTP/SSE 与父窗口采用替身，开发代理测试启动本机 HTTP 服务验证真实转发，不访问部署内网。

外部覆盖：URL 正确编码、独立凭证、存储受限、迟到 token、错误窗口/来源、授权失败/过期/晚响应；同会话多轮 ID、新会话更换 ID、请求/任务各自身份；SSE 分包、游标去重、短/空终稿、断流查询、创建失败、停止及旧任务迟到；DOCX 缓存键、无效 HTML/错误文件；父窗口成功/失败/超时回执、轮次关联、文件实际传递、模拟幂等和独立重试。tests/fixtures/external-draft.docx 是有效最小 DOCX 测试文件。

dev-proxy.test.mjs 使用本机替身验证 /api、/v1、qa/review multipart 上传、PDF 前缀、Word 转换与 DOCX 下载转发；先检查实际配置各 target 为显式 10.210.101.117:8000，再仅在测试内替换目标为本机服务，保留实际 rewrite 规则。

原四项功能回归保留，标准 vue-tsc 严格检查与生产构建通过。没有现场浏览器或真实内网凭证联调结论，部署后使用 [../examples/external-draft-host.html](../examples/external-draft-host.html) 验证实际平台。协议见 [../docs/EXTERNAL_DRAFT_INTEGRATION.md](../docs/EXTERNAL_DRAFT_INTEGRATION.md)。


本次新增 10 项：真实结果组件依次显示生成/获取/附件、后台原名及按钮顺序、失败后更新和重试、无效文件重试只 GET、转换/获取超时、未就绪禁止保存、缓存附件下载、多轮文件与模拟草稿保存隔离、重置后迟到文件隔离、真实输入组件隐藏旧选项及必填校验、真实结果组件保存回执更新。helpers/external-component-renderer.mjs 使用项目已有 Vue 编译器、运行时和 TypeScript，将实际 .vue 模板编译后挂载至内存渲染器；验证真实组件更新，不只断言最终对象值。该验证不替代现场浏览器视觉与内网联调。
