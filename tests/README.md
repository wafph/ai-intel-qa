# 前端回归

```bash
npm ci --include=dev --no-audit --no-fund
npm test
npm run build
```

105项Node原生回归，覆盖原上传/问答34项、原任务流18项、外部起草51项、开发代理1项、Markdown scoped编译1项。使用已有Vite SSR、Vue编译器及内存渲染器，无新增项目依赖。

本次增加URL token不被父消息覆盖、停止后等待释放、迟到taskId、停止失败保留门禁/重试、真实输入按钮状态、自建后端保存身份及未知回执用例。前端合同接口测试不再发送应用凭据或任意wordPath，真实Vite代理测试验证 /contract-draft-api/saveZDSingle → /v1/contract-drafts/save 且Bearer保留。

原示例测试页面移除。模拟存储在helpers/mock-draft-store.mjs，仅被测试引用，不打入dist；生产代理在deploy保留。fixtures/external-draft.docx为最小有效DOCX。

本地HTTP/SSE/父窗口替身及组件渲染测试不代替现场iframe、AgentOS、合同文件抓取和Chrome策略验收，见../docs/RELEASE_ACCEPTANCE.md。
