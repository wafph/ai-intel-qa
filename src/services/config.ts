// 统一接口基础地址。
// 开发环境建议配置 VITE_API_BASE_URL=/api，由 Vite 代理到 8000；
// 生产环境建议留空，走当前 Nginx 同源代理。
// 注意：该配置不绑定具体前端部署 IP，因此从 1.94.244.72 迁移到 101.245.75.75 时无需改前端代码。
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

// agentToken 权限范围接口基础地址。
// 默认跟随 API_BASE_URL；如 /v1/scopes 不在登录管理服务中，可单独配置 VITE_SCOPES_API_BASE_URL。
// 生产环境通常留空，通过 Nginx 将 /v1/scopes 转发到真正实现该接口的后端服务。
export const SCOPES_API_BASE_URL = (
  import.meta.env.VITE_SCOPES_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? ''
).replace(/\/$/, '');

// 第三方 agentToken 的前端会话有效期，默认与后端登录 token 12 小时保持一致。
export const AGENT_SESSION_EXPIRE_MINUTES = Number(
  import.meta.env.VITE_AGENT_SESSION_EXPIRE_MINUTES || 720,
);

// 水印文件下载接口基础地址。
// 生产环境按原有逻辑直接配置到文件下载服务，例如 http://101.245.75.75:11328，
// 最终请求为 http://101.245.75.75:11328/watermark/download，不要求当前 Nginx 映射 /watermark/download。
// 这部分按文件下载服务实际地址直接访问，不通过当前 Nginx 转发。
export const WATERMARK_API_BASE_URL = (
  import.meta.env.VITE_WATERMARK_API_BASE_URL || ''
).replace(/\/$/, '');
