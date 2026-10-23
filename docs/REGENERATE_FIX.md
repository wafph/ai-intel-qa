# 重新审核与问答附件最小修复（1512 版记录）

本文记录前版问题及修复，当前版本继续保留这些修复。新增页现已按后续授权升级，当前构建和入口规则以 [EXTERNAL_DRAFT_INTEGRATION.md](EXTERNAL_DRAFT_INTEGRATION.md) 及 [../BUILD_REQUIRED.md](../BUILD_REQUIRED.md) 为准。

前版发布 `regulatory-ai-assistant_v1.0.0_202610221512`，应用版本仍为 1.0.0。以本次上传的 `qa-1022-fix.zip` 为唯一代码基线，未用前版源码覆盖本地改动。后端继续使用 `regulation_ai_backend_v1.0.0_202610221019`，没有新增接口或配置，无需后端重新打包。

## 1. 问题定位与修复结果

| 问题 | 已确认的前端原因 | 本次行为 |
|---|---|---|
| 重新审核新气泡出现旧内容与新内容 | workflow_finished 只提取来源；completed 提前移除任务；done 被丢弃；较短快照因长度门槛不覆盖；重复 eventId 未去重 | 每轮独立正文，按事件游标追加一次，最终快照校准后再保存 |
| 问答重新生成后，普通文字仍携带文档 | handleSendMessage 在未选附件时自动查询最近历史附件；重新生成又将历史附件写入输入区 | 普通发送只取当前选择；重新生成只取被点击轮次快照，保留下一条草稿 |

正常重新审核本就会新增一组独立问答，上一轮报告继续作为历史保留。本次不删除旧报告，不合并历史轮次，也不按字符串相似度裁剪正文。已用旧结果+新结果的临时输出、较短最终新结果的 SSE 顺序回放验证最终内容校准；现场第二次审核的实际上游数据未在本轮直接采集，不能据此前端问题断定平台为何发送旧临时内容。若上游最终快照本身就包含错误旧内容，仍需检查平台会话和工作流输出。

## 2. 问答附件规则

| 用户动作 | 使用的文件 | 刷新规则 | 输入区草稿 |
|---|---|---|---|
| 普通纯文字发送，无当前附件 | 无；不读取历史附件 | 不调用刷新、不传 file_url、不带该轮 uploadedFiles | 文字按原发送逻辑清空 |
| 普通发送，当前选择文件 A | 仅 A | 提交前 force=false | 成功提交后清空本次选择 |
| 重新生成历史有文件 A 的轮次 | 仅该轮 A，即使输入区已选 B | force=true | 保留下一条文字和 B，既不替换也不更新 B |
| 重新生成无附件轮次 | 无，即使其他轮次或输入区有文件 | 不调用刷新 | 保留下一条文字和附件 |
| 旧字符串重新生成入口 | 无明确附件快照，按无附件处理 | 不调用刷新 | 保留草稿 |
| 附件刷新失败 | 不提交任务，不插入占位消息 | 提示原错误，不自动重试整轮业务 | 保留草稿 |

历史 metadata 的 upload_ref/expires_at 继续保存；带附件任务前的历史预保存继续保留。前端不在输入区显示附件但仍使用旧附件的行为已停止。发送纯文字不携带 file_url，不代表删除同一上游会话已有的语义记忆；需要彻底独立问题时可新建会话。

## 3. 流式与恢复契约

1. 校验 taskId、messageId、sessionId 及当前订阅控制器。已停止/被替换的订阅缓冲包不再进入新一轮；不同消息的全局正文和推理互不写入。
2. eventId 不大于已处理游标的增量不重复追加。不同游标出现相同文字仍保留，避免删除合法重复条款。没有事件 ID 的旧协议无法精确判定网络重放，继续兼容追加。
3. workflow_finished 从 outputs.responseContent/answer 读取最终正文，来源独立解析。最终快照可比临时文本短、同长但不同或为空，均可按正文游标覆盖；过期游标不能回滚更新的正文。
4. completed 只通知后台执行结束，暂时保留任务和界面输出占用，继续接收 done。done 使用最终正文和来源更新消息，然后保存本轮历史并清理任务。工作流完成时不再抢先保存临时拼接内容。
5. completed 后没有 done 且连接关闭时：已有 workflow 最终快照则直接收尾；否则 GET 任务详情取得终态 answerContent 后合成 done。详情暂不可用时释放输入占用并提示重新进入会话，不把临时内容保存为最终历史，不重新 POST 智能体任务。
6. 恢复会话时优先按 answerEventId 判断正文新旧；终态详情允许较短/空正文替换本地临时结果并保存修正。检索空正文和 data_json 十条来源仍是有效结果，来源重放继续保留。

## 4. 前版文件范围与保留检查

业务改动仅在 `useMessageSender.ts`、`useStreamChunk.ts`、`useStreamTask.ts`；`agentUpload.ts` 仅更新保留工具的注释。其他变动为测试、构建脚本、相关交付文档及发布清单。

下列本地改动均按附件原字节保留：ExternalDraft.vue；ExternalDraftChat/Composer/Form/Result 四个组件；useExternalDraftDocx/useExternalDraftStream；router/index.ts；services/agentAccess.ts、authStorage.ts；stores/user.ts；vite.config.ts；components.d.ts；tsconfig.tsbuildinfo。全部页面和组件、环境文件、tsconfig.json、package-lock.json 与 pnpm-lock.yaml 同样保留。旧上传实现/配置和历史附件查询工具继续存在。

## 5. 前版构建与已知基线问题（当前版已修复）

```bash
npm ci --no-audit --no-fund
npm test
npm run build:compat
```

本地新页面 ExternalDraft.vue:103 的 authError 未被使用，原附件与升级版严格 `npm run build` 均报 TS6133。为保留新增页面，没有改动该文件或 tsconfig。新增 build:compat 仅关闭 noUnusedLocals 后执行其余类型检查和生产打包；原严格 build 命令保留。包内 dist 按此命令生成，包含原外部起草路由资源。详见 [../BUILD_REQUIRED.md](../BUILD_REQUIRED.md)。

## 6. 现场验收步骤

- 首次上传审核完成后重新审核：上一轮历史报告仍在，新气泡正文以本轮最终结果为准；Network 的 completed 之后继续处理 done；刷新历史与本轮结果一致。
- 上传 A 问答后重新生成：检查只刷新 A，force=true；生成结束后输入纯文字且不选择文件，创建任务请求不含 file_url，也不请求 refresh-file-url。
- 输入区准备文字和文件 B，再重新生成 A：新任务只使用 A，输入区 B 和文字原样保留；随后普通发送应使用 B。
- 对无附件轮次重新生成，不带其他轮次附件；旧附件无引用也不阻塞普通文字发送。
- 回归智能检索的空正文+来源结果、停止/切换后旧包隔离及恢复最终正文。确认本地外部起草页面和登录/路由原行为保持。

以上离线测试未连接现场平台和浏览器，最终部署后按上述步骤验收。回退时整体恢复本地原构建的静态目录，不混用新旧资源。无需回退后端数据库或修改环境变量。
