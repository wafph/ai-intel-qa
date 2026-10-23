# 外部起草页面集成与第三方草稿入库

本版 regulatory-ai-assistant_v1.0.0_202610221921 基于 regulatory-ai-assistant_v1.0.0_202610221813 仅升级真实合同保存、消息弹窗及新增页局部样式，后端仍为 regulation_ai_backend_v1.0.0_202610221019。自建后端地址为 10.210.101.117，端口沿用原 8000，可在开发配置修改。没有修改后端代码、权限规则或平台切换逻辑。

## 1. 两种入口

| 入口 | 授权 | 页面 |
|---|---|---|
| 原账号密码/agentToken 业务入口 | 原有登录及权限机制 | 原问答、检索、辅助起草、审核菜单，新增页没有菜单入口 |
| 第三方 iframe 的 /external-draft | 外部页独立校验用户 token | 独立起草页，无 AppLayout；允许输入、流式输出、逐轮文件与草稿保存 |

外部入口不读取或覆盖内部登录缓存，也不依赖 iframe 的 localStorage/sessionStorage。没有 token、校验失败或过期时停留在授权提示，不创建任务、不跳本地登录循环。主系统提供的必须是现有后端认可的用户 token；IAM 上传凭证、工作流密钥或其他体系的任意 token 不适用。

普通登录用户手工打开外部路由也不能借用内部登录态。菜单隐藏并不替代后端授权，每次业务仍由现有后端校验用户权限。

## 2. URL 与消息授权

使用普通路径，不用 /#/external-draft；参数是 token，不是 toekn：

```js
const childUrl = new URL('/external-draft', agentFrontendOrigin);
childUrl.searchParams.set('token', userAccessToken);
iframe.src = childUrl.href;
```

searchParams 自动保留 token 的 +、/、= 等字符。兼容 agentToken；也兼容实际路径 /external-draft 后 hash 查询中的 token，但推荐统一使用上述地址。

也可先打开不含 token 的页面。子页发送 READY 后，父页传入：

```js
iframe.contentWindow.postMessage({
  data: { type: 'SET_AGENTTOKEN', value: userAccessToken }
}, agentFrontendOrigin);
```

监听持续有效，不再只等待 1.2 秒。子页验证消息来自 window.parent，并绑定实际父页面 origin；配置了 VITE_ALLOWED_PARENT_ORIGINS 时进一步按白名单校验。READY 不携带业务内容，未知父源时仅用于发现；token 与文件消息不向 * 广播。无 referrer 的集成可配置准确父源或通过父页消息建立来源绑定。

外部页调用既有接口：

```text
POST /v1/agent-permission/validate
JSON: { "agent_token": "主系统用户token" }
```

只有 allowed=true 才创建独立内存授权。后续任务请求头 Bearer 与正文 agent_token 使用同一个已校验 token，避免混入内部登录用户。GET 任务订阅/详情使用 Authorization，不再将 token 加入查询串。本版不记录 token 本体，也不把 token 放进草稿保存消息。

## 3. 会话、问答、任务和请求 ID

| 字段 | 含义 | 生命周期/用途 |
|---|---|---|
| session_id / sessionId | 一次新建会话的 ID | 同会话所有轮次共用；进入页面或更换授权时初始化，当前不展示新建会话按钮 |
| qaId | 会话中一轮用户提问及对应回答的 ID | 每次提交/重新起草新建；文件转换使用同一个 qa_id |
| taskId | 后端创建的执行任务 ID | 用于该轮 SSE、详情和停止，不能以 qaId 代替 |
| request_id | 一次创建任务请求的 ID | 每次请求独立，用于后端请求追踪，不能以 session_id 代替 |
| requestId | 一次发送给父页面的草稿保存消息 ID | 用于关联本次保存回执；重试是新请求，同一轮仍用原 qaId |
| draftId | 第三方平台保存后的草稿记录 ID | 由第三方真实接口或模拟接口生成，与前述 ID 不混用 |

示例：会话 S1 内先有 Q1/T1，再有 Q2/T2；文件转换分别使用 qa_id=Q1、qa_id=Q2。重新进入页面或更换授权得到 S2，再提交得到 Q3/T3。保存 Q1 与 Q2 时分别携带 S1/Q1/T1 和 S1/Q2/T2。以上短 ID 仅用于解释，实际代码生成独立唯一标识。

任务请求仍采用现有后端模型：

```json
{
  "request_id": "本次请求的独立ID",
  "session_id": "当前会话ID",
  "timestamp": 1790000000000,
  "agent_token": "已校验的用户token",
  "intent_tag": "draft",
  "context": {
    "activeTab": "辅助起草",
    "routePath": "/external-draft",
    "externalSource": "external-draft"
  },
  "biz_params": {
    "inputs": {
      "query": "本轮起草要求",
      "ancestorScope": [],
      "descendantScope": [],
      "qaId": "本轮问答ID"
    }
  }
}
```

组织范围来自授权结果，后端仍按既有权限规则处理。合同长度/强弱势及其选项不再展示，兼容旧属性但不参与请求；描述框与开始按钮间隔 24px。sessionId 稳定使上游获得同一会话标识，平台是否启用具体会话记忆仍由其既有配置决定。

## 4. 流式结果与文件

创建任务后按 taskId 订阅，按 eventId 去重。workflow_finished/done 最终快照允许短于临时文本或为空；completed 只表示执行状态，不提前释放输入。缺最终快照时查询既有任务详情确认完成；未确认完成、异常或停止的输出不自动生成结果文件。较早任务的迟到包不进入新一轮。

主动停止调用现有 stop，创建中停止则在获得 taskId 后补发 stop。离开页面只断开订阅，后台按原规则处理；本版不增加前端持久化恢复功能。重新进入页面创建独立的新会话，已保存的后台历史遵循原规则。

正常完成后自动 POST /v1/markdown-word/convert：

```json
{ "markdown": "本轮最终正文", "qa_id": "本轮qaId" }
```

DOCX 文件由现有自建文件服务生成并保存，接口不改。转换返回后立即 GET download_url，检查 HTTP 状态、非空文件与 ZIP 文件头，通过后才显示完成提示、后台原名附件卡片和下方的操作区；保存与重新起草宽屏并排、窄屏换行。原命名为“标题_年月日时分秒毫秒.docx”，前端使用 file_name，不生成另一个时间戳。

文件 Blob 按 qaId 缓存在当前页面内存。点击附件才触发浏览器下载，点击保存到草稿箱复用该文件；文件读取失败保留转换结果，重试只 GET，不重复转换。未点击保存不发草稿消息。页面离开/授权切换清空缓存并取消旧请求，迟到文件不写回新会话。

文件阶段为生成中→获取中→已就绪/失败，与第三方保存状态独立。首次记录创建后重新读取 records[key] 取得 Vue 代理，避免内部 done/error 已变化而组件停在等待。转换 120 秒、读取 60 秒；失败保留正文并提供重试。

开发时文件读取走 /external-file-download，转发到 vite.config.ts 中显式配置的文件服务 target；给父平台的 downloadUrl 仍是文件服务公共地址，不把 localhost 开发代理链接当公共下载地址。生产沿用文件服务返回地址，配置正确的 Host/转发头及 /download/ 路由。

## 5. 真实合同草稿保存（默认 api）

VITE_EXTERNAL_DRAFT_SAVE_MODE=api 时，新页面点击保存后直接 POST 同源 /contract-draft-api/saveZDSingle，经 Vite/Nginx 转发到 10.100.10.19:18100/exchangeAuthCenter/exchangeContractInfo/saveZDSingle。appkey/secretkey 按本次要求在前端适配文件临时写死；data.token 使用跳转传入的当前同一 token，data.wordPath 使用本轮原始 DOCX 下载 URL，data.zdName 使用去掉扩展名及自动时间戳的制度名。具体请求和部署见 [CONTRACT_DRAFT_SAVE.md](CONTRACT_DRAFT_SAVE.md)。

接口 message 只消息弹窗，页面不展示该文本；业务 201 按失败、成功不强制草稿编号。原附件缓存、命名和下载保留，api 模式不依赖父页面 SAVE_DRAFT_RESULT。每次保存仍由 qaId 对应记录管理，并保留离开/换授权后旧请求隔离。

## 5.1 原父页面草稿协议（仅 parent 兼容模式）

生成 DOCX 与第三方草稿入库是两步：文件已生成不等于第三方草稿记录已保存。本段保留前版 parent 消息/模拟方式；当前真实接口使用上一节 api 方式。自建后端未增加草稿接口。

点击保存时，子页向绑定父源发送原 SAVE_DRAFT_TO_BOX 消息并增加关联 ID：

```js
{
  platform: '制度智能体',
  timestamp: Date.now(),
  data: {
    type: 'SAVE_DRAFT_TO_BOX',
    value: {
      requestId, sessionId, qaId, taskId,
      fileName, downloadUrl, content,
      fileBase64, // data URL；超过 8MiB 时为空，由父系统按 downloadUrl 下载
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
  }
}
```

父页面接收后调用自己的草稿入库接口，完成后发送：

```js
iframe.contentWindow.postMessage({
  platform: '第三方业务平台',
  timestamp: Date.now(),
  data: {
    type: 'SAVE_DRAFT_RESULT',
    value: {
      requestId, sessionId, qaId, taskId,
      success: true,
      draftId: '第三方返回的草稿记录ID',
      simulated: false,
      message: '保存成功'
    }
  }
}, agentFrontendOrigin);
```

失败时 success=false，message 为可展示原因。子页要求窗口/来源和四个关联 ID 均匹配，success=true 且有 draftId 后才显示保存成功。超时、失败或编号缺失均保留本轮文件，允许独立重试，不重新执行起草或转换。父平台应按已认证用户及 sessionId/qaId 控制重复入库，不能把每次保存 requestId 当成新的业务草稿。

父页面校验 event.source===iframe.contentWindow 与 event.origin===agentFrontendOrigin 后再处理消息。实际入库鉴权属于第三方平台自己的登录/接口协议，不使用自建后台替代它。

## 6. 原父页面模拟联调（需显式配置 parent）

```bash
npm ci --include=dev --no-audit --no-fund
npm run dev
```

先把 .env.development 的 VITE_EXTERNAL_DRAFT_SAVE_MODE 设为 parent，重启开发服务，再打开 http://localhost:5100/examples/external-draft-host.html。默认 api 模式点击保存调用真实合同接口，父页面的模拟开关不控制它。parent 模式步骤：

1. 输入实际前端地址及现有后端认可的用户 token；选择 URL 或 READY 消息授权。
2. 点击进入，输入要求并起草。自建后端授权、平台生成及文件转换均为真实调用。
3. 点击本轮保存到草稿箱。父页面模拟接口实际接收 DOCX，生成 mock 草稿编号并回执；子页明确显示已模拟保存。
4. 父页面列出会话/问答 ID、正文和实际收到的文件，可下载核对。
5. 连续提交两轮或重新起草，检查 sessionId 相同、qaId/taskId 不同且附件不串轮；重新进入页面后 sessionId 变化。
6. 勾选模拟失败或不返回回执，检查失败/超时提示，再取消勾选重试；同一轮模拟记录不重复创建。

模拟代码仅在 examples 父页面，记录和 Blob 放在该页内存，刷新清空。无需在自建后端启动任何模拟接口；也不会对外部起草页启用匿名访问或假 token。源码示例不进入生产 dist。

真实接口提供后，第三方将 examples 中 store.save(value) 替换为自身实际请求，按真实结果映射回执，保持协议及逐轮幂等即可。普通前端和自建后端均不需要增加草稿入库业务。

## 7. 配置与验收边界

开发代理在 vite.config.ts 中逐项显式配置 target，当前均为 http://10.210.101.117:8000。修改相应 target 后重启 Vite；历史 DEV_* 值仅兼容保留，不再读取。前端路径仍为 /api；PDF 代理去掉 /review-pdf-api 后访问后端 /v1/review/pdf/...

VITE_ALLOWED_PARENT_ORIGINS 留空时按实际父窗口绑定，生产建议填真实主系统 origin；VITE_EXTERNAL_DRAFT_ACK_TIMEOUT_MS 默认 30000。生产 API 仍走同源，部署要求见 [DEPLOYMENT_AND_CONFIG.md](DEPLOYMENT_AND_CONFIG.md)。

本版测试与构建结果见 RELEASE_ACCEPTANCE.md；新增真实 Vue 结果组件、输入组件更新验证，代理转发使用本机 HTTP 替身验证。未连接现场 117 服务器、真实平台或浏览器，不据此宣称现场网络/用户权限已验证。后端现有历史规则保留：externalSource 不构成新的历史分区，外部 draft 任务仍可按原规则进入该用户 draft 历史。
