/**
 * 文档水印预览/下载服务封装，按原始逻辑调用独立水印服务。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
import { API } from '@/api/api';
import { parseAxiosResponseError } from './error';
import { getCurrentDownloadUserName, getCurrentDownloadUserId } from './authStorage';
import { isSuccessStatus, request } from './http';

export interface DownloadDocumentResult {
  fileId: string;
  title: string;
  contentType: string;
  /** 当水印服务直接返回文件流或 base64 内容时使用 blob。 */
  blob?: Blob;
  /**
   * 当水印服务返回 JSON: { status: 'success', download_url: '...' } 时使用该地址。
   * 前端直接打开/预览该地址，不再二次 fetch，避免文件服务未配置 CORS 时出现 Network Error。
   */
  downloadUrl?: string;
}

/** 封装当前模块内的业务逻辑：trimTrailingSlash。 */
const trimTrailingSlash = (value: string) => value.replace(/\/$/, '');

/** 判断条件是否成立：isJsonContent。 */
const isJsonContent = (contentType: string) =>
  contentType.includes('application/json') || contentType.includes('text/json');

/** 封装当前模块内的业务逻辑：uniq。 */
const uniq = <T,>(values: T[]) => Array.from(new Set(values.filter(Boolean)));

/** 获取并归一化业务数据：getWatermarkDownloadUrlCandidates。 */
const getWatermarkDownloadUrlCandidates = () =>
  uniq([
    API.document.watermarkDownload,
  ]);

/** 判断条件是否成立：isHtmlErrorText。 */
const isHtmlErrorText = (text = '') => /<html[\s>]/i.test(text) || /<h1>\s*405\s+not\s+allowed\s*<\/h1>/i.test(text);

/** 转换为安全的展示或请求值：toFriendlyServiceError。 */
const toFriendlyServiceError = (error: any, fallback: string) => {
  const raw = String(error?.message || error?.detail || error || '');
  if (isHtmlErrorText(raw) || raw.includes('405 Not Allowed')) {
    return new Error('文件服务返回 405。请确认 VITE_WATERMARK_API_BASE_URL 指向 8005 文件服务路由前缀，例如 http://1.94.244.72:8005/v1/files，最终地址为 /v1/files/watermark/download。');
  }
  return error instanceof Error ? error : new Error(raw || fallback);
};

/** 获取并归一化业务数据：getBaseFromEndpoint。 */
const getBaseFromEndpoint = (endpoint?: string) => {
  if (!endpoint) return trimTrailingSlash(API.document.watermarkBase || window.location.origin);
  try {
    const url = new URL(endpoint, window.location.origin);
    return `${url.origin}${url.pathname.replace(/\/watermark\/download\/?$/, '')}`.replace(/\/$/, '');
  } catch {
    return trimTrailingSlash(API.document.watermarkBase || window.location.origin);
  }
};

/** 构造请求载荷或业务上下文：buildAbsoluteUrl。 */
const buildAbsoluteUrl = (url: string, endpoint?: string) => {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `${window.location.protocol}${url}`;
  // 如果服务返回同源 /v1 路径，按当前站点 origin 打开。
  if (url.startsWith('/v1/')) return `${window.location.origin}${url}`;
  if (url.startsWith('/')) return `${getBaseFromEndpoint(endpoint)}${url}`;
  return `${getBaseFromEndpoint(endpoint)}/${url}`;
};

/** 封装当前模块内的业务逻辑：blobFromBase64。 */
const blobFromBase64 = (base64: string, contentType = 'application/octet-stream') => {
  const pureBase64 = base64.includes(',') ? base64.split(',').pop() || '' : base64;
  const binary = window.atob(pureBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
};

/** 封装当前模块内的业务逻辑：safeDecode。 */
const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** 封装当前模块内的业务逻辑：inferContentType。 */
const inferContentType = (fileId: string, title = '', downloadUrl = '') => {
  const text = `${fileId} ${title} ${safeDecode(downloadUrl)}`.toLowerCase();
  if (text.includes('.pdf')) return 'application/pdf';
  if (text.includes('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (text.includes('.doc')) return 'application/msword';
  if (text.includes('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (text.includes('.xls')) return 'application/vnd.ms-excel';
  if (text.includes('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (text.includes('.ppt')) return 'application/vnd.ms-powerpoint';
  return 'application/octet-stream';
};

/** 获取并归一化业务数据：getDownloadUrlFromJson。 */
const getDownloadUrlFromJson = (json: any, endpoint?: string): string => {
  const data = json?.data ?? json;
  const downloadUrl =
    data?.download_url ||
    data?.downloadUrl ||
    data?.file_url ||
    data?.fileUrl ||
    data?.preview_url ||
    data?.previewUrl ||
    data?.url ||
    (typeof data === 'string' && /^https?:\/\//i.test(data) ? data : '');
  return downloadUrl ? buildAbsoluteUrl(downloadUrl, endpoint) : '';
};

/** 封装当前模块内的业务逻辑：assertWatermarkJsonSuccess。 */
const assertWatermarkJsonSuccess = (json: any) => {
  const data = json?.data ?? json;
  const code = json?.code ?? data?.code;
  const status = json?.status ?? data?.status;

  if (code !== undefined && !['0', '200', '0000'].includes(String(code))) {
    throw new Error(json?.message || json?.msg || data?.message || data?.msg || '文件下载失败，请稍后重试');
  }

  if (status !== undefined && !['success', 'ok', '200', '0', '0000'].includes(String(status).toLowerCase())) {
    throw new Error(json?.message || json?.msg || data?.message || data?.msg || '水印生成失败，请稍后重试');
  }
};

const resolveDocumentFromJson = (
  json: any,
  fileId: string,
  title: string,
  endpoint?: string,
): DownloadDocumentResult => {
  assertWatermarkJsonSuccess(json);

  const data = json?.data ?? json;
  const downloadUrl = getDownloadUrlFromJson(json, endpoint);

  if (downloadUrl) {
    return {
      fileId,
      title,
      contentType: inferContentType(fileId, title, downloadUrl),
      downloadUrl,
    };
  }

  const base64 = data?.base64 || data?.file_base64 || data?.fileBase64 || data?.content;
  if (base64) {
    const contentType = data?.content_type || data?.contentType || inferContentType(fileId, title);
    return {
      fileId,
      title,
      contentType,
      blob: blobFromBase64(base64, contentType),
    };
  }

  throw new Error(json?.message || json?.msg || data?.message || data?.msg || '文件下载接口未返回 download_url 或文件内容');
};

const tryResolveJsonFromBlob = async (
  blob: Blob,
  contentType: string,
  fileId: string,
  title: string,
  endpoint?: string,
) => {
  if (isJsonContent(contentType)) {
    return resolveDocumentFromJson(JSON.parse(await blob.text()), fileId, title, endpoint);
  }

  // 有些代理/下载服务会把 JSON 结果以 application/octet-stream 返回。
  // 只对较小响应做文本探测，避免误读大文件。
  if (blob.size > 0 && blob.size <= 1024 * 1024) {
    try {
      const text = (await blob.text()).trim();
      if (text.startsWith('{') || text.startsWith('[')) {
        return resolveDocumentFromJson(JSON.parse(text), fileId, title, endpoint);
      }
    } catch {}
  }
  return null;
};

/** 封装当前模块内的业务逻辑：requestWatermarkDocument。 */
const requestWatermarkDocument = async (endpoint: string, fileId: string, title: string) => {
  const response = await request<Blob>({
    url: endpoint,
    method: 'POST',
    headers: {
      Accept: 'application/json, */*',
      'Content-Type': 'application/json',
    },
    data: {
      file_id: fileId,
      user_name: getCurrentDownloadUserName(),
      user_id: getCurrentDownloadUserId(),
    },
    responseType: 'blob',
  });

  if (!isSuccessStatus(response.status)) {
    const friendly = await parseAxiosResponseError(response, '水印生成失败，请稍后重试');
    throw toFriendlyServiceError(friendly, friendly.message || '水印生成失败，请稍后重试');
  }

  const contentType = String(response.headers['content-type'] || '');
  const jsonResult = await tryResolveJsonFromBlob(response.data, contentType, fileId, title, endpoint);
  if (jsonResult) return jsonResult;

  return {
    fileId,
    title,
    contentType: contentType || inferContentType(fileId, title),
    blob: response.data,
  };
};

// 问答引用/检索详情/范文预览文件下载接口。
// 按历史版本逻辑：优先拿 file_id 请求水印下载服务 POST /v1/files/watermark/download。
// 当前推荐直接配置 8005 文件服务，或通过前端 Nginx 同源转发到 8005，避免 CORS。
export const fetchWatermarkDocument = async (
  fileId: string,
  title = 'document',
): Promise<DownloadDocumentResult> => {
  if (!fileId) {
    throw new Error('文件ID为空，无法查看文档');
  }

  let lastError: any = null;
  for (const endpoint of getWatermarkDownloadUrlCandidates()) {
    try {
      return await requestWatermarkDocument(endpoint, fileId, title);
    } catch (error: any) {
      lastError = error;
      const msg = String(error?.message || '').toLowerCase();
      // Network Error 多数是 CORS/跨端口文件服务不可达，继续尝试同源代理。
      if (!msg.includes('network error') && !msg.includes('failed to fetch') && !msg.includes('cors')) {
        // 非网络错误通常是文件ID错误或服务明确报错，不再盲目重试多个地址。
        break;
      }
    }
  }

  throw toFriendlyServiceError(lastError, '获取文档失败，请稍后重试');
};

/** 判断条件是否成立：isPdfDocument。 */
export const isPdfDocument = (fileId: string, contentType: string, title = '', downloadUrl = '') => {
  const lowerFileId = fileId.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const lowerUrl = safeDecode(downloadUrl).toLowerCase();
  return (
    lowerFileId.endsWith('.pdf') ||
    lowerTitle.endsWith('.pdf') ||
    lowerUrl.includes('.pdf') ||
    contentType.includes('pdf') ||
    contentType.includes('application/pdf')
  );
};

/** 抽取文件、来源或响应字段：extractFileExtension。 */
const extractFileExtension = (fileId: string): string => {
  const parts = fileId.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
};

/** 下载导出文件或 Blob：downloadDocumentBlob。 */
export const downloadDocumentBlob = (fileBlob: Blob, fileName: string, fileId: string) => {
  const extension = extractFileExtension(fileId);
  const fullFileName = extension && !fileName.endsWith(`.${extension}`) ? `${fileName}.${extension}` : fileName;

  const url = window.URL.createObjectURL(fileBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fullFileName || 'document';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

/** 打开预览、链接或弹窗：openDocumentUrl。 */
export const openDocumentUrl = (downloadUrl: string) => {
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
