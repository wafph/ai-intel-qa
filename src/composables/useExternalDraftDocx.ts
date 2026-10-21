/**
 * 外部嵌套起草页的起草结果文件处理封装（主系统 iframe 场景专用）。
 *
 * 两段职责：
 * 1. 起草结束后自动调 8005 文件服务 markdown-word convert 生成 docx（对应"自动保存结果文件"）；
 * 2. 点击"保存到草稿箱"时通过 postMessage 通知主系统保存，由主系统自行调其草稿箱接口（跨系统约定）。
 */
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { API } from '@/api/api';
import { isSuccessStatus, request } from '@/services/http';

/** 解析允许的父域白名单（与 agentAccess 共用 VITE_ALLOWED_PARENT_ORIGINS；空数组表示未配置）。 */
const ALLOWED_PARENT_ORIGINS = (import.meta.env.VITE_ALLOWED_PARENT_ORIGINS || '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean);

/** 结果文件生成状态。 */
export type DocxSaveStatus = 'idle' | 'saving' | 'done' | 'error';

/** 起草结果附件信息。 */
export interface DraftAttachment {
  fileName: string;
  downloadUrl: string;
}

/** 组织 docx 生成、附件下载与草稿箱通知能力。 */
export const useExternalDraftDocx = () => {
  /** docx 生成状态机。 */
  const docxStatus = ref<DocxSaveStatus>('idle');
  /** 生成失败的具体原因（后端响应或异常文案，便于页面直接展示诊断）。 */
  const docxError = ref('');
  /** 生成成功后的附件信息。 */
  const attachment = ref<DraftAttachment | null>(null);
  /** 是否已发送过保存到草稿箱通知。 */
  const hasSentToBox = ref(false);

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

  /** 流式结束后自动调用：markdown 转 docx 并记录附件信息（不触发浏览器下载）。 */
  const saveDraftDocx = async (markdown: string, qaId: string) => {
    if (!markdown.trim()) {
      docxStatus.value = 'error';
      docxError.value = '没有可保存的起草内容';
      ElMessage.warning('没有可保存的起草内容');
      return;
    }
    docxStatus.value = 'saving';
    docxError.value = '';
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
      attachment.value = {
        fileName: convertResult.file_name || 'draft.docx',
        downloadUrl: convertResult.download_url,
      };
      docxStatus.value = 'done';
    } catch (error) {
      docxStatus.value = 'error';
      docxError.value = error instanceof Error ? error.message : '未知错误';
      ElMessage.error(`起草文件保存失败: ${docxError.value}`);
    }
  };

  /** 点击附件卡片：按 download_url 拉取文件流并触发浏览器下载（沿用导出链路的 blob 下载方式）。 */
  const downloadAttachment = async () => {
    if (!attachment.value) return;
    try {
      const response = await request<Blob>({
        url: attachment.value.downloadUrl,
        method: 'GET',
        headers: { Accept: '*/*' },
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = attachment.value.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      ElMessage.error('附件下载失败，请稍后重试');
    }
  };

  /**
   * 点击"保存到草稿箱"：postMessage 通知主系统保存。
   * 消息协议：{ platform: '制度智能体', timestamp, data: { type: 'SAVE_DRAFT_TO_BOX', value: { fileName, downloadUrl } } }
   * 主系统收到后自行调其草稿箱接口；如需保存回执，可约定主系统回发消息扩展。
   */
  const saveToDraftBox = () => {
    if (!attachment.value || hasSentToBox.value) return;
    const message = {
      platform: '制度智能体',
      timestamp: Date.now(),
      data: {
        type: 'SAVE_DRAFT_TO_BOX',
        value: {
          fileName: attachment.value.fileName,
          downloadUrl: attachment.value.downloadUrl,
        },
      },
    };
    resolveTargetOrigins().forEach((origin) => {
      window.parent?.postMessage(message, origin);
    });
    hasSentToBox.value = true;
    ElMessage.success('已发送至主系统草稿箱');
  };

  /** 重置结果文件状态（重新起草时调用）。 */
  const reset = () => {
    docxStatus.value = 'idle';
    docxError.value = '';
    attachment.value = null;
    hasSentToBox.value = false;
  };

  return { docxStatus, docxError, attachment, hasSentToBox, saveDraftDocx, downloadAttachment, saveToDraftBox, reset };
};
