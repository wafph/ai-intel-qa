import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { buildAuthHeaders } from './authStorage';

export const http = axios.create({
  timeout: 0,
  validateStatus: () => true,
});

const mergeAuthHeaders = (headers?: AxiosRequestConfig['headers']) =>
  buildAuthHeaders({
    ...(headers as Record<string, string> | undefined),
  });

export const request = <T = any>(config: AxiosRequestConfig) =>
  http.request<T>({
    ...config,
    validateStatus: () => true,
  });

export const authRequest = <T = any>(config: AxiosRequestConfig) =>
  request<T>({
    ...config,
    headers: mergeAuthHeaders(config.headers),
  });

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
