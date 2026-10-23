# 本次前端交付验收

版本 `regulatory-ai-assistant_v1.0.0_202610221921`；基线 regulatory-ai-assistant_v1.0.0_202610221813。应用版本保持 1.0.0，配套后端仍为 regulation_ai_backend_v1.0.0_202610221019。

## 本次限定范围

默认真实合同草稿保存、DOCX 下载 URL 参数、同一跳转 token、前端临时应用凭据、message 仅弹窗、操作按钮局部美化、Markdown 列表/表头及溢出样式。原父页面模式保留，其他业务与依赖不变。

## 已执行检查

| 项目 | 结果 |
|---|---|
| npm test | 101 项通过、0 失败：上传/问答 34、原任务流 18、外部起草 47、真实本机 Vite 代理 1、Markdown scoped 编译 1 |
| 本次新增验证 | 合同参数/token/URL/名称、201 失败、成功 data=null、未知码/HTTP 失败、message 仅弹窗、缓存重试、并发禁用、超时、旧响应隔离；ol/th 编译规则 |
| npm run build | 标准 vue-tsc -b 严格类型检查及 Vite 生产构建通过 |
| 依赖/锁文件/tsconfig | 沿用基线，无新增依赖，无降低检查 |
| 身份隔离 | 内部登录和独立外部授权不混用；合同 token 与本次跳转校验后的凭证一致，sessionId/qaId/taskId 不变 |
| JSON 转发 | Vite 对本机 HTTP 替身验证完整报文与 /exchangeAuthCenter/exchangeContractInfo/saveZDSingle 路径 |
| 结果展示 | 真实 Vue 组件检查成功/失败消息不进入页面 DOM，只进入消息弹窗；附件与按钮正常保留 |
| Markdown | 原共享渲染器保持，实际 scoped 编译检查 ul/ol/td/th、表格/代码块溢出规则 |
| 发布范围 | 基线逐文件比较、原核心源码字节保留、原 .env 生效值保留并新增合同项 |
| 打包完整性 | 发布阶段校验 ZIP CRC、SHA256 清单及 dist 首页资源引用 |

原依赖仍有 PURE 注释和大 chunk 构建提醒，未扩大依赖升级范围。appkey/secretkey 按用户最后要求临时进入前端构建产物，未写死用户 JWT；message 不在页面可视化。

## 现场边界

HTTP/SSE/合同响应使用替身，真实 .vue 通过现有 Vue 编译器和运行时的内存渲染器检查。未向现场合同服务写入草稿，未验证其下游 500 已修复，未在现场浏览器进行视觉验收。环境没有 Nginx 二进制，专用 location 需在现场合入现有 server 后执行 nginx -t；该检查未冒充已执行。

生产必须部署新 dist 并新增 [合同代理 location](../deploy/contract-draft-save.location.conf)，原业务/SSE/文件/PDF/SPA 路由不变。合同平台所在网络须能 GET wordPath 原始 DOCX；浏览器获取成功不等于合同服务可达。用户未提供成功响应，暂兼容 200/0/0000，可按真实约定配置；已知 201 永远按失败处理。

后端、镜像、数据库、平台开关不变。详细部署和接口说明见 [CONTRACT_DRAFT_SAVE.md](CONTRACT_DRAFT_SAVE.md)。
