import { buildAuthHeaders } from './authStorage';

// 后端管理接口统一请求封装：若当前是本地账号登录模式，会自动携带 Authorization。
export const authFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = buildAuthHeaders({
    ...(init.headers as Record<string, string> | undefined),
  });

  return fetch(input, {
    ...init,
    headers,
  });
};
