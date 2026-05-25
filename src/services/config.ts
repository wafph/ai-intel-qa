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
// 生产环境按原有逻辑直接配置到文件下载服务，例如 http://1.94.244.72:11328，
// 最终请求为 ${VITE_WATERMARK_API_BASE_URL}/watermark/download。
export const WATERMARK_API_BASE_URL = (
  import.meta.env.VITE_WATERMARK_API_BASE_URL || ''
).replace(/\/$/, '');


// 文档转换接口基础地址。
// 推荐生产环境留空，最终请求 /convert，由 11316 Nginx 直转 11327；
// 如果不配置 Nginx 直转，也可以显式设置为 http://1.94.244.72:11327。
export const CONVERT_API_BASE_URL = (
  import.meta.env.VITE_CONVERT_API_BASE_URL || ''
).replace(/\/$/, '');
