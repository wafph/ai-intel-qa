/**
 * 前端错误对象、错误提示和可读化文案工具。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
import type { AxiosResponse } from 'axios';
import type { FriendlyErrorInfo } from './authStorage';

/** 封装当前模块内的业务逻辑：pickMessage。 */
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

/** 获取并归一化业务数据：getAxiosHeader。 */
const getAxiosHeader = (response: AxiosResponse, key: string) => {
  const headers: any = response.headers || {};
  if (typeof headers.get === 'function') return headers.get(key) || '';
  return headers[key] || headers[key.toLowerCase()] || '';
};

/** 标准化后端/历史数据结构：normalizeAxiosBody。 */
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
  /** 封装当前模块内的业务逻辑：body。 */
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

/** 转换为安全的展示或请求值：toFriendlyError。 */
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
