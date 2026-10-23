# 后端统一上传与问答 URL 刷新接入

本前端配套后端 `regulation_ai_backend_v1.0.0_202610221019.zip`。发布目录为 `regulatory-ai-assistant_v1.0.0_202610221921`，应用版本保持 1.0.0。本次以 `regulatory-ai-assistant_v1.0.0_202610221813` 为基线接入外部页真实合同保存及局部样式，保留前版消息附件隔离和流式最终正文校准；上传接口和凭证契约不变，原四项功能与上传契约保留；外部起草独立入口和开发代理按本次要求升级。

## 1. 接口与凭证

| 动作 | 固定后端接口 | 请求 | 成功结果 |
|---|---|---|---|
| 问答上传 | POST `/v1/agentarts/workflows/qa/upload-file` | FormData `file`，用户 Bearer Token | 顶层 url、upload_ref、expires_at 和上游业务字段 |
| 审核上传 | POST `/v1/agentarts/workflows/review/upload-file` | FormData `file`，用户 Bearer Token | 顶层 url 和上游业务字段 |
| 问答 URL 刷新 | POST `/v1/agentarts/workflows/qa/refresh-file-url` | JSON `upload_ref`、`force`，用户 Bearer Token | 完整 URL、同一个 upload_ref、到期时间、reuploaded |

三类调用都经过 `authRequest`，复用当前中台用户 Token 或本地 JWT。AgentOS 需要后端 AUTH_MODE=platform。前端不传 X-Auth-Token，不拼 workspace_id，不提交 IAM 用户密码；FormData 仅添加 file，由浏览器生成 boundary。

后端按 AGENT_PROVIDER 选择 AgentArts/AgentOS。AgentArts 使用内部 IAM 缓存和 file/is_image=false 协议；AgentOS 使用对应工作流固定 Authorization。平台凭据、workspace 和外部上传目标均留在后端。API 路径中的 agentarts 是历史兼容前缀。

后续平台切换只修改后端 `.env` 的 AGENT_PROVIDER 并重启，前端无需改代码、改环境变量或重新构建。切换前应等待正在执行的任务结束；两个上游平台的会话记忆不迁移。

## 2. 问答上传和历史

普通文件沿用类型校验及本地文本提取，随后调用 qa/upload-file。PDF 沿用 detect → prepare → parsed_text 包装 TXT → qa/upload-file，不增加二次解析。后端保存的可重传文件是实际上传的文件，因此问答 PDF 的缓存内容为解析后的 TXT。

附件显示字段继续使用 uid/name/size/fileType/fileUrl/uploadFileId，新增：

```json
{
  "upload_ref": "qau_0123456789abcdef0123456789abcdef",
  "expires_at": 1799999999
}
```

expires_at 为 UTC Unix 秒，未知时为 null。upload_ref 是本地后端源文件引用，与平台文件 ID 不同。完整签名 URL 保留百分号编码和查询串，不用 URL.toString() 改写。

继续通过现有 `answer.metadata.uploadedFiles` 保存附件，不修改数据库或单条历史请求的顶层模型，不引入第二套附件历史字段。原始 File 对象和整篇原文不写入该快照。

发送带附件问答时，在创建业务任务之前先使用现有 `/v1/chat/history` 保存用户/回答 metadata。后端按相同 qaId 合并任务占位和最终回答，保留引用；本地可恢复任务快照也携带 uploadedFiles。页面刷新、切换、收藏详情和重新生成继续使用现有历史映射。

## 3. 提交前刷新与重新生成

1. 普通发送仅使用当前输入区选择的附件。未选文件时不继承历史附件，不请求刷新接口，不提交 file_url，也不写该轮附件 metadata。
2. 每次带附件问答提交前，逐个调用刷新接口，普通提交 force=false。同一引用在一次操作内去重，多文件保持原顺序。
3. 后端判断有效 URL 是否可复用；到期、临期、未知有效期或平台/目标改变时，从持久化源文件重新上传。
4. 全部刷新成功后，用新 URL 数组组装原 biz_params.inputs.file_url，同时更新消息 metadata。前端不依据本地过期时间跳过后端判断，以便识别平台切换。
5. 点击重新生成时，使用被点击轮次的明确附件快照，force=true 重新获取 URL；即使该轮没有附件，也不会错误继承别的轮次或输入区文件。重新生成不会覆盖、更新或清空下一条待发文字和新选附件。旧字符串入口没有明确附件快照时按无附件处理。
6. 新文件上传或刷新尚未完成时禁止发送，重复点击不会并发提交同一问题。刷新期间切换会话/功能，或历史保存期间切换/停止，不创建原问题的业务任务。

刷新失败时不新增空问答、不清空待发输入或新选附件，也不自动重复整轮问答。无 upload_ref 的旧外部附件、404/410 或源文件已丢失时，提示重新选择原文件。普通发送选入新文件后只使用这次选择；不会与历史附件合并。历史轮次的引用仍保留供明确重新生成使用。

签名在平台侧提前失效时，用户可点击原轮次“重新生成”，前端先 force 刷新，再明确创建一轮新任务。没有无限重试或静默重复业务执行。

## 4. 审核兼容

审核上传统一走 review/upload-file，重新审核需要上传时也使用该接口。原 PDF prepare、TXT 生成、bind-review-file、review-context 保存和定位字段保留。审核已有的 URL 有效期判断、原件/解析文本重新上传策略不变；本次后端的 upload_ref 刷新接口只适用于问答。

后端切换平台后，新审核文件上传随当前平台执行。已经打开的旧审核会话可能仍持有旧平台 URL；重新选择原文件经当前平台上传再审核，可避免依赖跨平台 URL 可达性。不得用 qa/refresh-file-url 刷新审核文件。

## 5. 配置与旧实现保留

- 生产 VITE_API_BASE_URL 留空，走当前站点 `/v1/...`；开发为 `/api`，由 Vite 转发到自建后端 10.210.101.117:8000（在 vite.config.ts 中显式填写各 target）。
- Vite 的 `/v1` 入口也已指向自建后端，避免留空 API 基础地址时误发原平台。
- VITE_AGENT_UPLOAD_API_BASE_URL、VITE_AGENT_UPLOAD_WORKSPACE_ID 的原值已注释停用，保留作比对；不用于主流程。
- 开发环境原 VITE_IAM_* 配置已注释停用，不参与 Vite 编译。不要在新前端配置平台密钥或恢复 IAM 自动获取。
- 原 fetchTokenFromBackend 和 sharedDataToken 保留，移除了初始化自动调用；uploadFileToAgentArtsLegacy 和旧代理配置保留且没有主流程调用。
- 为减少调用方变动，原 uploadFileToAgentArts 函数名保留，但其实际实现改为后端统一上传。问答显式传 workflowCode=qa，审核默认 review。
- 文件工具与 PDF 默认指向集成后端 10.210.101.117:8000，独立部署时分别修改 vite.config.ts 对应文件工具/PDF target，DEV_* 旧值仅保留。

生产 Nginx 原 `/v1/agentarts/` 代理已覆盖新接口。若需接受接近后端 500 MiB 的文件，该 location 的 client_max_body_size 应至少为 512m，且网关上层也应允许；如果保留更小限制，浏览器上传上限仍由该网关决定。无需再为本次主流程新增外部上传代理。

## 6. 验证

```bash
npm ci --include=dev --no-audit --no-fund
npm test
npm run build
```

Node.js 使用 22.12+ 或满足现有 Vite 8 要求的版本。本次未新增或升级运行依赖，package-lock.json 和 pnpm-lock.yaml 均与本次附件一致。标准严格构建已通过，构建说明见 [../BUILD_REQUIRED.md](../BUILD_REQUIRED.md)。

专项测试使用真实前端服务、组合函数、历史保存/恢复代码与 Axios 替身，覆盖认证、上传选路、完整 URL、引用、刷新失败、追问、重新生成、会话切换、重复点击、保存顺序、纯文本兼容和停用 IAM 初始化。目标内网需继续验证实际平台上传和问答；离线测试不能确认真实密钥或平台下载可达性。

生产验收时检查浏览器 Network：新上传和问答刷新只访问自建后端，不出现 x-subject-token、外部 agent-runtime/upload-file 或 X-Auth-Token 上传请求。再验证页面刷新后的引用恢复、签名到期重传、后端切换 AgentArts/AgentOS 后的新上传和问答。

## 7. 本次流式结果契约

`workflow_finished` 的 outputs.responseContent/answer 或任务 `done.answerContent` 为最终正文快照；允许最终值比增量短或为空，检索来源独立解析。`completed` 是完成状态通知，前端保留任务直到 done，防止遗漏快照。只有 completed 没有 done 时，断流后优先使用已收到的 workflow 最终快照，否则 GET 任务详情补齐后收尾，不再 POST 新业务任务。

问答不携带 file_url 并不清空上游同一会话的记忆。需要隔离历史语义时应新建会话。重新审核保留上一轮报告作为历史，新一轮气泡只展示本轮最终结果；前端不按字符串相似度删减报告。详见 [REGENERATE_FIX.md](REGENERATE_FIX.md)。


## 本次外部起草入口

新增页不改变 qa/review 上传或刷新 API，也不增加后端草稿接口。开发代理已默认指向 10.210.101.117:8000，PDF/文件工具可独立配置。外部授权和第三方保存协议见 [EXTERNAL_DRAFT_INTEGRATION.md](EXTERNAL_DRAFT_INTEGRATION.md)。

当前新增页草稿保存仅增加独立合同代理，不改上传接口或平台切换。默认 api，原 parent 方式保留；详见 [CONTRACT_DRAFT_SAVE.md](CONTRACT_DRAFT_SAVE.md)。
