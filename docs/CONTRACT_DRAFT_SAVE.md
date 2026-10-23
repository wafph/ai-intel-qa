# 合同中台制度草稿保存接入

版本 regulatory-ai-assistant_v1.0.0_202610221921；基线 regulatory-ai-assistant_v1.0.0_202610221813。本次按最新要求重新从基线升级：wordPath 使用原 DOCX 下载地址，message 仅弹窗，appkey/secretkey 暂时前端写死，暂不接入永中。

## 1. 实际接口和报文

POST http://10.100.10.19:18100/exchangeAuthCenter/exchangeContractInfo/saveZDSingle。文档中的 informationAddZNT 不用于本次保存。

浏览器 POST /contract-draft-api/saveZDSingle，Content-Type/Accept 均为 application/json：

```json
{
  "appkey": "源码中的应用值",
  "secretkey": "源码中的应用值",
  "data": {
    "token": "本次跳转传入并已校验的用户token",
    "wordPath": "https://文件服务/download/制度标题_20261022174940971.docx",
    "zdName": "制度标题"
  }
}
```

src/services/contractDraft.ts 已填入用户提供的应用凭据，无需手工替换示例；未写死任何用户 JWT。token 从 externalDraftAccess 当前凭证取得，与 URL/父页面授权的智能体 token 为同一个值，不加 Bearer 前缀，不借用内部登录。zdName 去掉附件 .docx 及末尾 17 位时间戳并最多 200 字；附件本身原名不变。不擅自给合同接口增加 sessionId/qaId/taskId 等未知参数。

## 2. wordPath 选择

使用已在流式结束后 GET 并验证为 DOCX 的原始 download_url，不使用查看器页面、浏览器 blob、宿主机文件路径或 localhost 开发代理。下载 URL 返回原始 DOCX 文件流，更适合作为合同服务端取文件的路径，中文自动 URL 编码、签名 query 保留，不接入永中转换。

VITE_EXTERNAL_DRAFT_PUBLIC_FILE_ORIGIN 留空沿用完整后台 URL。如果合同网络无法访问返回的主机，可填它能访问的源，例如 https://jcx.hbjttz.com:21136；仅替换源，保留原路径与 query。该配置在构建时生效。已拒绝 localhost/127.0.0.1/host.docker.internal、blob/data/file 和 /external-file-download 作为合同下载地址。

浏览器取到文件不能证明合同服务器也能取到；现场应在合同平台所在网络对最终 wordPath 执行 GET，并确认 2xx、文件非空且可作为 DOCX 打开。该地址应无需浏览器会话 Cookie/前端 Authorization 即可读取。不要把某次测试的固定 URL 写死给后续轮次。

## 3. 返回与弹窗

- 接口 message 有非空字符串时原文传入 ElMessage 消息弹窗，不拼接额外文字、不 HTML 渲染，页面不展示该文本。
- 已知 JSON code=201 为业务失败，即使 HTTP 2xx 也不标记保存成功。
- 用户尚未提供成功响应，本版默认暂兼容 200/0/0000；VITE_EXTERNAL_DRAFT_SAVE_SUCCESS_CODES 可按真实合同约定调整。HTTP 必须为 2xx，缺码或未知码保持未确认，同时仍弹窗原 message；不按 message 文字猜测成功。
- 已确认成功时允许 data=null 或无 draftId；如有 data.id/data.draftId 则仅内部保留。
- 没有 message 时使用网络、状态码或结果未确认的兜底。超时不自动重试写操作，提示先在合同平台核对。
- 保存失败保留本轮正文和附件，手动重试只重复保存，不重新起草/转换/下载。成功后禁用重复保存，保存中禁用本轮重新起草。

应用密钥临时前端硬编码会进入浏览器构建产物，不能视为保密方案；这是本次明确要求。后期迁至自建后端时将凭据组装移走，接口适配和业务模块分开维护。

## 4. 开发与生产

开发：npm ci --include=dev --no-audit --no-fund，然后 npm run dev。Vite 为合同路径显式代理到 10.100.10.19:18100；业务/PDF/文件仍按原 target 到 10.210.101.117:8000。

生产：整体发布新 dist，并将 [专用代理片段](../deploy/contract-draft-save.location.conf) 合入现有 Nginx server，执行 nginx -t 成功后按现场方式重载。片段仅新增一个精确 location，不能覆盖整个 nginx.conf。不需要重建 117 后端镜像。浏览器保持同源 HTTPS，Nginx 到合同中台走提供的 HTTP，保留 JSON 原文。

环境默认：

```env
VITE_EXTERNAL_DRAFT_SAVE_MODE=api
VITE_EXTERNAL_DRAFT_SAVE_API=/contract-draft-api/saveZDSingle
VITE_EXTERNAL_DRAFT_SAVE_SUCCESS_CODES=200,0,0000
VITE_EXTERNAL_DRAFT_PUBLIC_FILE_ORIGIN=
```

原父页面协议和 examples 模拟没有删除；设 SAVE_MODE=parent、重启 Vite/重新构建后才使用。该模式的模拟开关不影响默认真实 api 保存。

## 5. 本次局部界面与 Markdown

保存蓝色主按钮、重新起草白底描边，统一高度/圆角，宽屏并排、窄屏换行；只展示按钮状态，message 仅弹窗。保留上一版隐藏的新建会话、合同长度/强弱势及描述框间距。

外部流式和完成正文仍使用原共享 markdown-it+DOMPurify。仅修正 ExternalDraftChat.vue 的 deep 多选择器，分别编译 ul/ol、td/th；增强表格/代码块溢出和代码字体，不改共享解析器、原始 Markdown 或其他业务页。

## 6. 检查边界

本地使用真实模块、Vue 组件编译/更新和本机 Vite 代理替身检查；未向现场合同接口写入测试草稿，没有验证其下游 500 已修复。完整结果见 [RELEASE_ACCEPTANCE.md](RELEASE_ACCEPTANCE.md)。
