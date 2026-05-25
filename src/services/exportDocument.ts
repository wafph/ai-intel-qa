/**
 * 辅助起草和合规审核导出服务封装，按原始逻辑调用转换服务。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
import { API } from '@/api/api';
import { isSuccessStatus, request } from '@/services/http';

/** 判断条件是否成立：isJsonContent。 */
const isJsonContent = (contentType: string) =>
  contentType.includes('application/json') || contentType.includes('text/json');

/** 封装当前模块内的业务逻辑：uniq。 */
const uniq = <T,>(values: T[]) => Array.from(new Set(values.filter(Boolean)));

/** 获取并归一化业务数据：getConvertEndpointCandidates。 */
const getConvertEndpointCandidates = () =>
  uniq([
    API.document.convert,
  ]);

/** 判断条件是否成立：isHtmlErrorText。 */
const isHtmlErrorText = (text = '') => /<html[\s>]/i.test(text) || /<h1>\s*405\s+not\s+allowed\s*<\/h1>/i.test(text);

/** 标准化后端/历史数据结构：normalizeExportError。 */
const normalizeExportError = (error: any) => {
  const raw = String(error?.message || error?.detail || error || '');
  if (isHtmlErrorText(raw) || raw.includes('405 Not Allowed')) {
    return new Error('文档转换服务返回 405。请确认 /convert 已由 11316 Nginx 直转到 11327，或 VITE_CONVERT_API_BASE_URL 指向独立转换服务。');
  }
  return error instanceof Error ? error : new Error(raw || '转换失败');
};

/** 构造请求载荷或业务上下文：buildAbsoluteExportUrl。 */
const buildAbsoluteExportUrl = (downloadUrl: string, endpoint?: string) => {
  if (/^https?:\/\//i.test(downloadUrl)) return downloadUrl;
  if (downloadUrl.startsWith('//')) return `${window.location.protocol}${downloadUrl}`;
  try {
    return new URL(downloadUrl, endpoint || API.document.convert || window.location.origin).href;
  } catch {
    return downloadUrl;
  }
};

/** 打开预览、链接或弹窗：openDownloadUrl。 */
const openDownloadUrl = (downloadUrl: string, fileName?: string, endpoint?: string) => {
  const a = document.createElement('a');
  a.href = buildAbsoluteExportUrl(downloadUrl, endpoint);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  if (fileName) a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

/** 下载导出文件或 Blob：downloadBlob。 */
const downloadBlob = (blob: Blob, fileName = 'report.docx') => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

/** 封装当前模块内的业务逻辑：resolveJsonResult。 */
const resolveJsonResult = (json: any, endpoint?: string) => {
  const data = json?.data ?? json;
  const code = json?.code ?? data?.code;
  const status = json?.status ?? data?.status;

  if (code !== undefined && !['0', '200', '0000'].includes(String(code))) {
    throw new Error(json?.message || json?.msg || data?.message || data?.msg || '转换失败');
  }
  if (status !== undefined && !['success', 'ok', '200', '0', '0000'].includes(String(status).toLowerCase())) {
    throw new Error(json?.message || json?.msg || data?.message || data?.msg || '转换失败');
  }

  const downloadUrl =
    data?.download_url ||
    data?.downloadUrl ||
    data?.file_url ||
    data?.fileUrl ||
    data?.url ||
    (typeof data === 'string' && /^https?:\/\//i.test(data) ? data : '');
  const fileName = data?.file_name || data?.fileName || data?.name || 'report.docx';

  if (!downloadUrl) {
    throw new Error(json?.message || json?.msg || data?.message || data?.msg || '转换结果中没有下载链接');
  }

  openDownloadUrl(downloadUrl, fileName, endpoint);
};

/** 封装当前模块内的业务逻辑：tryResolveJsonBlob。 */
const tryResolveJsonBlob = async (blob: Blob, contentType: string, endpoint: string) => {
  if (isJsonContent(contentType)) {
    resolveJsonResult(JSON.parse(await blob.text()), endpoint);
    return true;
  }

  // 部分转换服务会用 octet-stream 返回 JSON。
  if (blob.size > 0 && blob.size <= 1024 * 1024) {
    try {
      const text = (await blob.text()).trim();
      if (text.startsWith('{') || text.startsWith('[')) {
        resolveJsonResult(JSON.parse(text), endpoint);
        return true;
      }
    } catch (error) {
      if (isJsonContent(contentType)) throw error;
    }
  }

  return false;
};

/** 封装当前模块内的业务逻辑：requestExport。 */
const requestExport = async (endpoint: string, markdown: string, qaId: string, defaultFileName: string) => {
  const response = await request<Blob>({
    url: endpoint,
    method: 'POST',
    headers: {
      Accept: 'application/json, */*',
      'Content-Type': 'application/json',
    },
    data: {
      markdown,
      qa_id: qaId || 'unknown',
    },
    responseType: 'blob',
  });

  if (!isSuccessStatus(response.status)) {
    /** 封装当前模块内的业务逻辑：text。 */
    const text = response.data instanceof Blob ? await response.data.text().catch(() => '') : '';
    throw normalizeExportError(new Error(text || `转换失败: ${response.status}`));
  }

  const contentType = String(response.headers['content-type'] || '');
  const blob = response.data;

  const handledJson = await tryResolveJsonBlob(blob, contentType, endpoint);
  if (handledJson) return;

  downloadBlob(blob, defaultFileName);
};

/** 封装当前模块内的业务逻辑：exportMarkdownDocument。 */
export const exportMarkdownDocument = async (markdown: string, qaId: string, defaultFileName = 'report.docx') => {
  let lastError: any = null;
  for (const endpoint of getConvertEndpointCandidates()) {
    try {
      await requestExport(endpoint, markdown, qaId, defaultFileName);
      return;
    } catch (error: any) {
      lastError = error;
      const msg = String(error?.message || '').toLowerCase();
      if (!msg.includes('network error') && !msg.includes('failed to fetch') && !msg.includes('cors')) {
        break;
      }
    }
  }

  throw normalizeExportError(lastError || new Error('转换失败'));
};
