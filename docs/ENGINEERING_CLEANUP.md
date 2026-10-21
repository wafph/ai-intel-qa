# 本次交付范围与原工程保留说明

本版在原版 regulatory-ai-assistant-1021-origin 上增量接入后端统一上传和问答 URL 刷新，不执行旧业务代码或历史文档删减。原 npm/pnpm 锁文件保留，npm 锁文件仅补齐已有声明缺失项，没有升级原锁定版本。

交付含 src、原静态资源、环境配置、锁文件、脚本、文档、新测试及新 dist，不包含 node_modules、运行日志或测试缓存。原外部上传函数、IAM 手动方法及旧代理保留，主流程不调用；旧环境值以注释停用。

所有改动和验证见 [AGENT_UPLOAD_BACKEND_INTEGRATION.md](AGENT_UPLOAD_BACKEND_INTEGRATION.md)、[RELEASE_ACCEPTANCE.md](RELEASE_ACCEPTANCE.md)。历史版本说明仍保留，其上传目标描述以当前接入文档为准。
