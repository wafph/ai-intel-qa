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
// 当前统一文件服务为 8005，推荐配置到路由前缀，例如：
//   http://1.94.244.72:8005/v1/files
// 最终请求为：
//   ${VITE_WATERMARK_API_BASE_URL}/watermark/download
// 如后期更换服务器，仅替换协议、IP、端口或前缀即可；若留空则默认走当前站点同源 /v1/files。
export const WATERMARK_API_BASE_URL = (
  import.meta.env.VITE_WATERMARK_API_BASE_URL || '/v1/files'
).replace(/\/$/, '');

// Markdown 转 Word 接口基础地址。
// 当前统一文件服务为 8005，推荐配置到路由前缀，例如：
//   http://1.94.244.72:8005/v1/markdown-word
// 最终请求为：
//   ${VITE_CONVERT_API_BASE_URL}/convert
// 如后期更换服务器，仅替换协议、IP、端口或前缀即可；若留空则默认走当前站点同源 /v1/markdown-word。
export const CONVERT_API_BASE_URL = (
  import.meta.env.VITE_CONVERT_API_BASE_URL || '/v1/markdown-word'
).replace(/\/$/, '');
