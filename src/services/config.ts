// 统一接口基础地址。
// 开发环境建议配置 VITE_API_BASE_URL=/api，由 Vite 代理到 V12 后端 8000；
// 生产环境建议留空，走当前 Nginx 同源代理。
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

// 前端认证模式：
// platform：默认模式，账号密码登录走 /v1/agent-permission/platform-login，密码由前端 SM2 加密后传给后端；
// local：保留早期本地账号登录逻辑，走 /v1/auth/login。
export const FRONTEND_AUTH_MODE =
  import.meta.env.VITE_AUTH_MODE === 'local' ? 'local' : 'platform';

// SM2 公钥：用于 platform 登录时加密 password。
// 注意：后端 V12 不再二次加密 password，会直接把前端加密后的结果向中台传输。
export const SM2_PUBLIC_KEY = String(import.meta.env.VITE_SM2_PUBLIC_KEY || '').trim();

// 第三方 agentToken 的前端会话有效期，默认与后端登录 token 12 小时保持一致。
export const AGENT_SESSION_EXPIRE_MINUTES = Number(
  import.meta.env.VITE_AGENT_SESSION_EXPIRE_MINUTES || 720,
);

// 水印文件下载接口基础地址。
// 当前统一文件服务已集成到自建后端 8000，推荐配置到路由前缀，例如：
//   http://10.210.101.117:8000/v1/files
// 最终请求为：
//   ${VITE_WATERMARK_API_BASE_URL}/watermark/download
// 如后期更换服务器，仅替换协议、IP、端口或前缀即可；若留空则默认走当前站点同源 /v1/files。
export const WATERMARK_API_BASE_URL = (
  import.meta.env.VITE_WATERMARK_API_BASE_URL || '/v1/files'
).replace(/\/$/, '');

// Markdown 转 Word 接口基础地址。
// 当前统一文件服务已集成到自建后端 8000，推荐配置到路由前缀，例如：
//   http://10.210.101.117:8000/v1/markdown-word
// 最终请求为：
//   ${VITE_CONVERT_API_BASE_URL}/convert
// 如后期更换服务器，仅替换协议、IP、端口或前缀即可；若留空则默认走当前站点同源 /v1/markdown-word。
export const CONVERT_API_BASE_URL = (
  import.meta.env.VITE_CONVERT_API_BASE_URL || '/v1/markdown-word'
).replace(/\/$/, '');

// 以下两个常量仅供保留的旧直传实现使用，主上传流程不读取它们。
// 新统一上传和问答 URL 刷新使用 API_BASE_URL，后端 AGENT_PROVIDER 决定平台。
export const AGENT_UPLOAD_API_BASE_URL = (
  import.meta.env.VITE_AGENT_UPLOAD_API_BASE_URL ||
  '/review-upload-api/v1/b2eb6baae0e349538172fcb9a4401145/agent-runtime/upload-file'
).replace(/\/$/, '');
export const AGENT_UPLOAD_WORKSPACE_ID = String(
  import.meta.env.VITE_AGENT_UPLOAD_WORKSPACE_ID || 'ea92d52f11e74688ae50854f42f4f74f',
).trim();

// 智能审核 PDF 预处理接口基础地址。
// 仅 PDF 文件走该接口：后端保存原始 PDF、调用 mineru25-pro 返回 parsed_text、返回 context_id 供刷新后恢复。
// 开发环境推荐配置 /review-pdf-api/v1/review/pdf，由 Vite proxy 转发到 自建后端集成 PDF 服务；
// 生产环境推荐同源 Nginx 代理，或直接配置为 http://10.210.101.117:8000/v1/review/pdf。
export const REVIEW_PDF_PREPARE_API_BASE_URL = (
  import.meta.env.VITE_REVIEW_PDF_PREPARE_API_BASE_URL || '/review-pdf-api/v1/review/pdf'
).replace(/\/$/, '');

// 智能体请求失败时前端展示的统一兜底文案。
// 后端 v12.2.18 已支持 AGENTARTS_FRONTEND_ERROR_MESSAGE；前端这里用于本地异常、SSE 断开或旧后端错误兜底，避免把上游 Redis/AgentArts 原始异常暴露给用户。
export const FRONTEND_FALLBACK_ERROR_MESSAGE = String(
  import.meta.env.VITE_FRONTEND_FALLBACK_ERROR_MESSAGE || '抱歉，当前智能体服务繁忙或请求处理失败，请稍后重试。',
).trim();
