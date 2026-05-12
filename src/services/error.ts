import type { AxiosResponse } from 'axios';
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

const getAxiosHeader = (response: AxiosResponse, key: string) => {
  const headers: any = response.headers || {};
  if (typeof headers.get === 'function') return headers.get(key) || '';
  return headers[key] || headers[key.toLowerCase()] || '';
};

const normalizeAxiosBody = async (response: AxiosResponse) => {
  const body = response.data;
  if (body instanceof Blob) {
    const text = await body.text();
    const contentType = getAxiosHeader(response, 'content-type');
    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return text;
  }
  if (body instanceof ArrayBuffer) {
    const text = new TextDecoder().decode(body);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return body;
};

export const parseAxiosResponseError = async (
  response: AxiosResponse,
  fallback = '请求失败，请稍后重试',
): Promise<FriendlyErrorInfo> => {
  const body = await normalizeAxiosBody(response).catch(() => null);
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
