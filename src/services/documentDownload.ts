import { WATERMARK_API_BASE_URL } from './config';
import { parseResponseError } from './error';
import { getCurrentDownloadUserName } from './authStorage';

export interface DownloadDocumentResult {
  fileId: string;
  title: string;
  contentType: string;
  /**
   * 当水印服务直接返回文件流或 base64 内容时使用 blob。
   */
  blob?: Blob;
  /**
   * 当水印服务返回 JSON: { status: 'success', download_url: '...' } 时使用该地址。
   * 注意：不要再用 fetch 二次拉取 download_url，否则如果 8001 文件服务未配置 CORS，浏览器会报 Failed to fetch。
   */
  downloadUrl?: string;
}

const trimTrailingSlash = (value: string) => value.replace(/\/$/, '');

const buildWatermarkDownloadUrl = () => {
  const base = trimTrailingSlash(WATERMARK_API_BASE_URL);
  return `${base}/watermark/download`;
};

const isJsonContent = (contentType: string) =>
  contentType.includes('application/json') || contentType.includes('text/json');

const buildAbsoluteUrl = (url: string) => {
  if (/^https?:\/\//i.test(url)) return url;
  const base = trimTrailingSlash(WATERMARK_API_BASE_URL);
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
};

const blobFromBase64 = (base64: string, contentType = 'application/octet-stream') => {
  const pureBase64 = base64.includes(',') ? base64.split(',').pop() || '' : base64;
  const binary = window.atob(pureBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
};

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

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

const getDownloadUrlFromJson = (json: any): string => {
  const data = json?.data ?? json;
  const downloadUrl =
    data?.download_url ||
    data?.downloadUrl ||
    data?.file_url ||
    data?.fileUrl ||
    data?.url ||
    (typeof data === 'string' && /^https?:\/\//i.test(data) ? data : '');
  return downloadUrl ? buildAbsoluteUrl(downloadUrl) : '';
};

const assertWatermarkJsonSuccess = (json: any) => {
  const code = json?.code;
  const status = json?.status;

  if (code !== undefined && !['0', '200'].includes(String(code))) {
    throw new Error(json?.message || json?.msg || '文件下载失败，请稍后重试');
  }

  if (status !== undefined && !['success', 'ok', '200', '0'].includes(String(status).toLowerCase())) {
    throw new Error(json?.message || json?.msg || '水印生成失败，请稍后重试');
  }
};

const resolveDocumentFromJson = (json: any, fileId: string, title: string): DownloadDocumentResult => {
  assertWatermarkJsonSuccess(json);

  const data = json?.data ?? json;
  const downloadUrl = getDownloadUrlFromJson(json);

  // 关键修复：水印服务返回 download_url 时，直接交给浏览器打开/下载，
  // 不再使用 fetch(download_url) 二次取文件，避免跨端口文件服务 8001 未开启 CORS 时出现 Failed to fetch。
  if (downloadUrl) {
    return {
      fileId,
      title,
      contentType: inferContentType(fileId, title, downloadUrl),
      downloadUrl,
    };
  }

  const base64 = data?.base64 || data?.file_base64 || data?.content;
  if (base64) {
    const contentType = data?.content_type || data?.contentType || inferContentType(fileId, title);
    return {
      fileId,
      title,
      contentType,
      blob: blobFromBase64(base64, contentType),
    };
  }

  throw new Error(json?.message || json?.msg || '文件下载接口未返回 download_url 或文件内容');
};

// 问答引用文件下载接口：调用水印服务 POST /watermark/download，
// 请求体严格使用后端要求的 { file_id, user_name }。
// 当前水印服务返回 JSON: { status, download_url, message, file_id, user_name }，
// 前端拿到 download_url 后直接打开/预览，不再二次 fetch 文件 URL。
// user_name：本地账号登录优先取登录用户昵称/账号；agentToken 或 SET_AGENTTOKEN 场景暂时固定为“丽丽”。
export const fetchWatermarkDocument = async (
  fileId: string,
  title = 'document',
): Promise<DownloadDocumentResult> => {
  if (!fileId) {
    throw new Error('文件ID为空，无法查看文档');
  }

  const response = await fetch(buildWatermarkDownloadUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json, */*',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_id: fileId,
      user_name: getCurrentDownloadUserName(),
    }),
  });

  if (!response.ok) {
    throw await parseResponseError(response, '水印生成失败，请稍后重试');
  }

  const contentType = response.headers.get('content-type') || '';

  if (isJsonContent(contentType)) {
    const json = await response.json();
    return resolveDocumentFromJson(json, fileId, title);
  }

  return {
    fileId,
    title,
    contentType,
    blob: await response.blob(),
  };
};

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

const extractFileExtension = (fileId: string): string => {
  const parts = fileId.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
};

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

export const openDocumentUrl = (downloadUrl: string) => {
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
