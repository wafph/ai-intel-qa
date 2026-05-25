/**
 * Axios 与 fetch SSE 请求封装，统一处理 API 基础路径和认证头。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { buildAuthHeaders } from './authStorage';

export const http = axios.create({
  timeout: 0,
  validateStatus: () => true,
});

/** 封装当前模块内的业务逻辑：mergeAuthHeaders。 */
const mergeAuthHeaders = (headers?: AxiosRequestConfig['headers']) =>
  buildAuthHeaders({
    ...(headers as Record<string, string> | undefined),
  });

/** 封装当前模块内的业务逻辑：request。 */
export const request = <T = any>(config: AxiosRequestConfig) =>
  http.request<T>({
    ...config,
    validateStatus: () => true,
  });

/** 封装当前模块内的业务逻辑：authRequest。 */
export const authRequest = <T = any>(config: AxiosRequestConfig) =>
  request<T>({
    ...config,
    headers: mergeAuthHeaders(config.headers),
  });

/** 判断条件是否成立：isSuccessStatus。 */
export const isSuccessStatus = (status: number) => status >= 200 && status < 300;

export const postEventStream = (
  url: string,
  data: unknown,
  config: AxiosRequestConfig = {},
): Promise<AxiosResponse<ReadableStream<Uint8Array>>> =>
  request<ReadableStream<Uint8Array>>({
    ...config,
    url,
    data,
    method: 'POST',
    adapter: 'fetch',
    responseType: 'stream',
  });

export const getEventStream = (
  url: string,
  config: AxiosRequestConfig = {},
): Promise<AxiosResponse<ReadableStream<Uint8Array>>> =>
  authRequest<ReadableStream<Uint8Array>>({
    ...config,
    url,
    method: 'GET',
    adapter: 'fetch',
    responseType: 'stream',
  });
