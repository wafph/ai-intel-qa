# 新增起草页附件获取与界面修复

版本：regulatory-ai-assistant_v1.0.0_202610221813；基线：regulatory-ai-assistant_v1.0.0_202610221623；配套后端保持 regulation_ai_backend_v1.0.0_202610221019。

## 触发与原因

现场后台已输出 Word 文件生成并入库成功，但新增页持续显示“正在保存起草文件”。记录首次初始化使用 const record = records[key] ||= 初始对象，局部 record 为原始对象；接口返回后修改该对象不会触发 Vue 组件更新。此前只断言最终数据，漏掉真实界面更新。本版拆分赋值与读取，补充真实组件回归。

## 本次流程

1. 已确认的 SSE 最终正文及本轮 qaId 请求 POST /v1/markdown-word/convert，JSON 为 markdown、qa_id。
2. 使用返回的 download_url 自动 GET DOCX，验证 2xx、非空和 ZIP 文件头。转换阶段提示生成中，GET 阶段提示获取中，获取有效文件后才显示附件。
3. 沿用 file_name 展示后台原名，例如 标题_20261022174940971.docx；按 qaId 缓存文件 Blob。点击附件触发同名下载，保存到草稿箱复用同一文件。这里的自动获取不会强制向用户电脑保存一份文件。
4. 用户点击保存到草稿箱后，沿用 SAVE_DRAFT_TO_BOX/SAVE_DRAFT_RESULT 父窗口协议。真实接口暂未提供，联调使用既有 examples 父页面模拟；成功且有 draftId 才确认，模拟明确标记，失败/超时不冒充保存成功。
5. 附件卡片、保存按钮、重新起草纵向排列；长名称可换行。隐藏右上角新建会话，以及输入表单合同长度、强弱势及全部选项。描述框到开始按钮间隔 24px。

## 失败与身份

转换 120 秒、文件获取 60 秒、第三方回执默认 30 秒。转换成功但 GET 失败，重试只 GET；第三方失败保留正文、附件并允许重试，不重新起草/转换/获取文件。新轮次各自 qaId/taskId，同一页面会话的 sessionId 不变。原授权切换及退出清理仍有效，迟到结果不能写入新会话。

## 配置和发布

vite.config.ts 恢复各 target 显式 IP http://10.210.101.117:8000，保留正确 rewrite。DEV_* 旧值仅保留不读取；原 VITE_* 生效值不变，生产继续同源 Nginx，现场配置无需因本修复调整。重新部署完整 dist，避免旧首页和资源混用。

原四项业务页、发送与流式核心、上传、内部/外部鉴权和协议不变；后端代码、镜像、数据库和 Nginx 未修改。examples 文件仍是源码联调样例，不进入生产 dist。测试边界及结果见 [RELEASE_ACCEPTANCE.md](RELEASE_ACCEPTANCE.md)。
