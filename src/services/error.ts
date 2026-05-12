import type { FriendlyErrorInfo } from './authStorage';

const pickMessage = (body: any, fallback: string) => {
  if (!body) return fallback;
  if (typeof body === 'string') return body;
  return (
    body.message ||
    body.msg ||
    body.error_description ||
    body.error ||
    body.detail ||
    body.reason ||
    fallback
  );
};

export const parseResponseError = async (
  response: Response,
  fallback = '请求失败，请稍后重试',
): Promise<FriendlyErrorInfo> => {
  let body: any = null;
  const contentType = response.headers.get('content-type') || '';
  try {
    body = contentType.includes('application/json') ? await response.json() : await response.text();
  } catch {
    body = null;
  }

  const message = pickMessage(body, fallback);
  const detail = typeof body === 'string' ? body : body ? JSON.stringify(body, null, 2) : '';

  return {
    code: String(response.status || 404),
    status: response.status,
    title: response.status === 401 || response.status === 403 ? '授权校验失败' : '访问异常',
    message,
    detail,
    path: window.location.href,
    time: new Date().toLocaleString(),
  };
};

export const toFriendlyError = (error: any, fallback = '请求失败，请稍后重试'): FriendlyErrorInfo => {
  return {
    code: '404',
    title: '访问异常',
    message: error?.message || fallback,
    detail: typeof error === 'string' ? error : error?.stack || '',
    path: window.location.href,
    time: new Date().toLocaleString(),
  };
};
