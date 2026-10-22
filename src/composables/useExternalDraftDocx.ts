/**
 * 外部嵌套起草页的起草结果文件处理封装（主系统 iframe 场景专用）。
 *
 * 按"轮次"管理 docx 结果：每一轮起草各自持有状态、失败原因、附件与发送标记，互不覆盖，
 * 从而支持多轮对话下每轮文档都能单独下载、单独保存到主系统草稿箱。
 *
 * 两段职责：
 * 1. 起草结束后自动调 8005 文件服务 markdown-word convert 生成 docx（对应"自动保存结果文件"）；
 * 2. 点击"保存到草稿箱"时通过 postMessage 把正文与 docx 一并通知主系统。
 */
import { reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { API } from '@/api/api';
import { isSuccessStatus, request } from '@/services/http';

/** 解析允许的父域白名单（与 agentAccess 共用 VITE_ALLOWED_PARENT_ORIGINS；空数组表示未配置）。 */
const ALLOWED_PARENT_ORIGINS = (import.meta.env.VITE_ALLOWED_PARENT_ORIGINS || '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean);

/** docx 的 MIME 类型，供主系统按类型落库。 */
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** 内联传输文件本体的体积上限：超过 8MB 仅传下载链接，避免 postMessage 卡顿。 */
const MAX_INLINE_FILE_SIZE = 8 * 1024 * 1024;

/** 结果文件生成状态。 */
export type DocxSaveStatus = 'idle' | 'saving' | 'done' | 'error';

/** 起草结果附件信息。 */
export interface DraftAttachment {
  fileName: string;
  downloadUrl: string;
}

/** 单轮起草的 docx 状态。 */
export interface DraftDocxRecord {
  /** docx 生成状态机。 */
  status: DocxSaveStatus;
  /** 生成失败的具体原因（后端响应或异常文案）。 */
  error: string;
  /** 生成成功后的附件信息。 */
  attachment: DraftAttachment | null;
  /** 是否已发送过保存到草稿箱通知。 */
  sentToBox: boolean;
  /** 是否正在发送通知（防止重复点击）。 */
  sending: boolean;
}

/** 组织各轮 docx 生成、附件下载与草稿箱通知能力。 */
export const useExternalDraftDocx = () => {
  /** 每轮 docx 状态：key 为轮次标识，轮次之间互不影响。 */
  const records = reactive<Record<string, DraftDocxRecord>>({});

  /** 取轮次状态（不存在时返回 undefined，供模板判空）。 */
  const getRecord = (key: string) => records[key];

  /** 取轮次状态，不存在则初始化一份。 */
  const ensureRecord = (key: string) => {
    if (!records[key]) {
      records[key] = { status: 'idle', error: '', attachment: null, sentToBox: false, sending: false };
    }
    return records[key];
  };

  /** 计算 postMessage 目标源：优先白名单，其次 document.referrer，兜底 '*'。 */
  const resolveTargetOrigins = (): string[] => {
    if (ALLOWED_PARENT_ORIGINS.length) return ALLOWED_PARENT_ORIGINS;
    try {
      if (document.referrer) return [new URL(document.referrer).origin];
    } catch {
      /* referrer 解析失败时兜底广播 */
    }
    return ['*'];
  };

  /**
   * 把 docx 下载地址读成 data URL（内嵌 base64），供主系统直接拿到文件本体。
   * 超过体积上限或读取失败时返回空串，由主系统回退使用 downloadUrl 自行拉取。
   */
  const fetchAttachmentDataUrl = async (url: string): Promise<string> => {
    try {
      const response = await request<Blob>({
        url,
        method: 'GET',
        headers: { Accept: '*/*' },
        responseType: 'blob',
      });
      const blob = response.data;
      if (!blob || !blob.size || blob.size > MAX_INLINE_FILE_SIZE) return '';
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      });
    } catch {
      return '';
    }
  };

  /** 某一轮流式结束后自动调用：markdown 转 docx 并记录该轮附件信息（不触发浏览器下载）。 */
  const saveDraftDocx = async (key: string, markdown: string, qaId: string) => {
    const record = ensureRecord(key);
    if (!markdown.trim()) {
      record.status = 'error';
      record.error = '没有可保存的起草内容';
      ElMessage.warning('没有可保存的起草内容');
      return;
    }
    record.status = 'saving';
    record.error = '';
    try {
      const convertResponse = await request({
        url: API.document.convert,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { markdown, qa_id: qaId },
      });
      if (!isSuccessStatus(convertResponse.status)) {
        throw new Error(`转换失败: ${convertResponse.status}`);
      }
      const convertResult: any = convertResponse.data;
      if (!convertResult?.download_url) {
        throw new Error('转换结果中没有下载链接');
      }
      record.attachment = {
        fileName: convertResult.file_name || 'draft.docx',
        downloadUrl: convertResult.download_url,
      };
      record.status = 'done';
    } catch (error) {
      record.status = 'error';
      record.error = error instanceof Error ? error.message : '未知错误';
      ElMessage.error(`起草文件保存失败: ${record.error}`);
    }
  };

  /** 点击某一轮附件卡片：按 download_url 拉取文件流并触发浏览器下载。 */
  const downloadAttachment = async (key: string) => {
    const attachment = records[key]?.attachment;
    if (!attachment) return;
    try {
      const response = await request<Blob>({
        url: attachment.downloadUrl,
        method: 'GET',
        headers: { Accept: '*/*' },
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      ElMessage.error('附件下载失败，请稍后重试');
    }
  };

  /**
   * 点击某一轮"保存到草稿箱"：postMessage 通知主系统保存（跨系统数据传输，无需调主系统接口）。
   * 消息协议：
   * {
   *   platform: '制度智能体',
   *   timestamp,
   *   data: {
   *     type: 'SAVE_DRAFT_TO_BOX',
   *     value: {
   *       fileName,     // docx 文件名
   *       downloadUrl,  // docx 下载地址（主系统后端可直接拉取转存）
   *       content,      // 该轮起草正文 Markdown 原文
   *       fileBase64,   // docx 文件本体（data URL，含 base64；超大/读取失败时为 ''）
   *       mimeType,     // docx 的 MIME 类型
   *     }
   *   }
   * }
   * 主系统收到后自行决定入库或转存（它自己的草稿箱接口仍由它自己调）。
   */
  const saveToDraftBox = async (key: string, content = '') => {
    const record = records[key];
    if (!record?.attachment || record.sentToBox || record.sending) return;
    record.sending = true;
    try {
      const fileDataUrl = await fetchAttachmentDataUrl(record.attachment.downloadUrl);
      const message = {
        platform: '制度智能体',
        timestamp: Date.now(),
        data: {
          type: 'SAVE_DRAFT_TO_BOX',
          value: {
            fileName: record.attachment.fileName,
            downloadUrl: record.attachment.downloadUrl,
            content,
            fileBase64: fileDataUrl,
            mimeType: DOCX_MIME,
          },
        },
      };
      resolveTargetOrigins().forEach((origin) => {
        window.parent?.postMessage(message, origin);
      });
      record.sentToBox = true;
      ElMessage.success(fileDataUrl ? '已发送至主系统草稿箱' : '已发送至主系统草稿箱（文件较大，仅传下载链接）');
    } finally {
      record.sending = false;
    }
  };

  /** 清空全部轮次的文件状态（重新起草时调用）。 */
  const reset = () => {
    Object.keys(records).forEach((key) => {
      delete records[key];
    });
  };

  return { records, getRecord, saveDraftDocx, downloadAttachment, saveToDraftBox, reset };
};
