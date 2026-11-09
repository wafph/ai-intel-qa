# 合同草稿保存接入

浏览器继续请求 `POST /contract-draft-api/saveZDSingle`；Vite/Nginx 转发自建后端 `POST /v1/contract-drafts/save`，再由后端请求合同中台 `/exchangeAuthCenter/exchangeContractInfo/saveZDSingle`。必须先部署本次后端再发布前端和迁移代理。

```http
Authorization: Bearer <跳转URL中的token>
Content-Type: application/json
```

```json
{"sessionId":"session-A","qaId":"qa-A","taskId":"task-A","zdName":"制度标题"}
```

前端不再包含 appkey/secretkey，不传任意 wordPath 或另一份正文 token。后端检查用户、任务和文件归属，按 qaId 查询真实 DOCX 记录，应用凭据来自后端 .env；data.token 使用本请求 Bearer token。wordPath 使用合同服务器可获取的 DOCX 下载地址，不传浏览器 Blob、查看页面或本地代理 URL；文件源由后端 CONTRACT_DRAFT_FILE_ORIGIN 控制。原文件命名不变。

自建后端成功示例：

```json
{"code":"0000","msg":"请求成功！","data":{"success":true,"message":"请求成功！","draftId":"2113543647637344256","resultUnknown":false}}
```

合同原响应外层与存在的内层 code 都须成功，201 为失败；后端负责解析 data.data 字符串 ID，前端只识别标准业务码加 data.success=true，不将原合同响应误判成功。message 原文经必要凭据脱敏后只用 ElMessage 弹窗，页面不显示其内容。

后端同任务持久保存回执：已成功不再新增；明确业务失败可手动再点；超时/断连/5xx 等未确认结果不自动重发，需先到合同平台核对，前端不得通过更换 qaId 规避。后端如何处理未知回执见后端 docs/EXTERNAL_DRAFT_UPGRADE.md。

超时顺序为后端30秒、Nginx45秒、浏览器50秒。使用 deploy/contract-draft-save.location.conf 替换旧直连合同平台的 location；Authorization 必须保留，不能沿用旧配置清空。其它 location 保持不变。

后端 .env 本次追加：CONTRACT_DRAFT_SAVE_URL、CONTRACT_DRAFT_APPKEY、CONTRACT_DRAFT_SECRETKEY、CONTRACT_DRAFT_TIMEOUT_SECONDS、CONTRACT_DRAFT_FILE_ORIGIN。前端旧 VITE_EXTERNAL_DRAFT_SAVE_SUCCESS_CODES、VITE_EXTERNAL_DRAFT_PUBLIC_FILE_ORIGIN 已注释停用；现有其它生效环境值不改。
