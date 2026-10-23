# 前端升级记录

版本 `regulatory-ai-assistant_v1.0.0_202610221921`，应用版本仍为 1.0.0；基线 `regulatory-ai-assistant_v1.0.0_202610221813`，按用户最后要求重新从此基线升级。配套后端保持 regulation_ai_backend_v1.0.0_202610221019，10.210.101.117:8000。

## 本次范围

- 默认 api 模式接入合同中台 POST /exchangeAuthCenter/exchangeContractInfo/saveZDSingle。同源 /contract-draft-api/saveZDSingle 代理转发，原 parent 消息/模拟方式保留，可通过环境配置选择。
- 按要求 appkey/secretkey 临时直接写在 src/services/contractDraft.ts，用户 token 每次来自本页面已校验的外部凭证。仅保存点击时请求，JSON 结构与提供的接口一致；不携带内部登录头、不混淆会话/轮次 ID。
- wordPath 使用本轮原始 DOCX 下载地址，保留签名与中文编码；不传查看器、blob 或本地开发代理。可选公共文件 origin 用于合同平台的访问网络，不引入永中。
- 接口返回 message 原文只做消息弹窗，页面不展示其文本。HTTP 状态和业务码共同判断；201 是已知失败；成功码暂兼容 200/0/0000，可按实际成功响应配置。成功 data=null 不强制 draftId；未知码保持未确认，不猜成功。
- 保存失败保留附件，可手动重试；超时提示结果未确认，不自动重试写操作。保存中禁用重复提交与本轮重新起草。
- 两个操作按钮统一高度/圆角，蓝色主按钮及白底次按钮，宽屏并排、窄屏换行。修复新增页 deep 多选择器漏掉 ol/th 的编译问题，改善表格/代码块溢出；共享 Markdown 渲染器及原业务样式不改。
- 补充相关配置注释、专用 Nginx location、说明文档、回归和新 dist。

## 保留与发布

原四项页面、发送/流式/上传核心、鉴权、外部任务流、路由、原父页面消息模块、模拟存储、DOCX 转换下载命名、依赖/锁文件和严格 TypeScript 配置保持基线；原 .env 生效值保留，只新增本接口项。后端、数据库和镜像不改。生产发布需要新增单一合同代理 location，其余 Nginx 段不变。

应用密钥会进入浏览器构建产物，这是本次明确要求的临时方式，不能视为保密配置；后期将本适配层的凭据组装移至自建后端即可。接口提供的下游 500 由合同平台处理，本版如实弹窗，未实际向现场接口写草稿。

详见 [合同接入](docs/CONTRACT_DRAFT_SAVE.md)、[外部页集成](docs/EXTERNAL_DRAFT_INTEGRATION.md)、[验收](docs/RELEASE_ACCEPTANCE.md)。
