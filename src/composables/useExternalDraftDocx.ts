/** 每轮 DOCX 独立生成；草稿保存走合同接口，原父页面方式兼容保留。 */
import { reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { API } from '@/api/api';
import { isSuccessStatus, request } from '@/services/http';
import { getApiData, getApiMessage, isApiSuccessCode } from '@/services/response';
import { DOCX_MIME, sendDraftToParent, type DraftIdentity } from '@/services/externalDraftBridge';
import { externalDraftSaveMode, saveContractDraft, type ExternalDraftSaveMode } from '@/services/contractDraft';

const MAX_INLINE_FILE_SIZE = 8 * 1024 * 1024;
export type DocxSaveStatus = 'idle' | 'saving' | 'done' | 'error';
export interface DraftAttachment { fileName: string; downloadUrl: string; fetchUrl: string }
export interface DraftDocxRecord extends DraftIdentity {
  status: DocxSaveStatus; error: string; attachment: DraftAttachment | null;
  phase: 'converting' | 'downloading' | '';
  sentToBox: boolean; sending: boolean; boxError: string; draftId: string; simulated: boolean;
}

/** 公共下载地址供父系统使用，开发代理地址只用于当前浏览器取文件。 */
export const resolveExternalFileUrls = (raw: string) => {
  const endpoint = new URL(API.document.convert, window.location.origin);
  const url = new URL(raw, endpoint);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error('文件服务返回了无效下载地址');
  const prefix = import.meta.env.DEV ? String(import.meta.env.VITE_EXTERNAL_DOWNLOAD_PROXY || '').replace(/\/$/, '') : '';
  const downloadUrl = /^https?:\/\//i.test(raw) ? raw : url.href;
  const fetchUrl = prefix && url.pathname.startsWith('/download/') ? `${prefix}${url.pathname}${url.search}` : downloadUrl;
  return { downloadUrl, fetchUrl };
};

/** 防止 HTML 错误页被当成 DOCX 下载或传给父平台。 */
export const fetchExternalDocx = async (url: string, signal?: AbortSignal): Promise<Blob> => {
  const response = await request<Blob>({ url, method: 'GET', headers: { Accept: DOCX_MIME }, responseType: 'blob', signal, timeout: 60000 });
  if (!isSuccessStatus(response.status)) throw new Error(`文件下载失败（HTTP ${response.status}）`);
  const blob = response.data;
  if (!(blob instanceof Blob) || !blob.size) throw new Error('文件服务未返回有效 DOCX');
  const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) throw new Error('下载内容不是有效 DOCX，请检查文件服务或下载代理');
  return blob;
};
const asDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(new Error('文件读取失败')); reader.readAsDataURL(blob);
});

export const useExternalDraftDocx = (options: { saveMode?: ExternalDraftSaveMode } = {}) => {
  const records = reactive<Record<string, DraftDocxRecord>>({});
  // 每轮只读取一次文件；附件下载和第三方保存复用同一份真实文件流。
  const files = new Map<string, Blob>();
  const pending = new Map<string, AbortController>();
  let epoch = 0;
  const getRecord = (key: string) => records[key];
  const saveDraftDocx = async (key: string, markdown: string, identity: DraftIdentity) => {
    if (key !== identity.qaId || !identity.sessionId || !identity.qaId || !identity.taskId) throw new Error('文件所属会话或问答 ID 不完整');
    if (records[key]?.status === 'saving' || records[key]?.sending) return;
    records[key] ||= { ...identity, status: 'idle', phase: '', error: '', attachment: null, sentToBox: false, sending: false, boxError: '', draftId: '', simulated: false };
    // 首次赋值表达式返回原始对象，必须重新读取以取得 Vue 代理，确保完成/失败会刷新界面。
    const record = records[key];
    if (record.status === 'done' && files.has(key)) return;
    if (!markdown.trim()) { record.status = 'error'; record.error = '没有可保存的起草内容'; return; }
    const currentEpoch = epoch, controller = new AbortController(); pending.set(key, controller);
    record.status = 'saving'; record.error = ''; record.phase = record.attachment ? 'downloading' : 'converting';
    try {
      if (!record.attachment) {
        const response = await request({ url: API.document.convert, method: 'POST', headers: { 'Content-Type': 'application/json' },
          data: { markdown, qa_id: identity.qaId }, signal: controller.signal, timeout: 120000 });
        if (!isSuccessStatus(response.status) || !isApiSuccessCode(response.data?.code)) throw new Error(String(getApiMessage(response.data, `转换失败（HTTP ${response.status}）`)));
        const result = getApiData(response.data) || {};
        if (!result.download_url) throw new Error('转换结果中没有下载链接');
        if (epoch !== currentEpoch || controller.signal.aborted) return;
        record.attachment = { fileName: result.file_name || 'draft.docx', ...resolveExternalFileUrls(result.download_url) };
      }
      record.phase = 'downloading';
      const blob = await fetchExternalDocx(record.attachment.fetchUrl, controller.signal);
      if (epoch !== currentEpoch || controller.signal.aborted) return;
      files.set(key, blob);
      record.phase = ''; record.status = 'done';
    } catch (error: any) {
      if (epoch !== currentEpoch || controller.signal.aborted) return;
      const timedOut = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT';
      record.error = timedOut ? (record.phase === 'converting' ? '文件生成超时，请重试' : '文件获取超时，请重试') : error?.message || '文件准备失败';
      record.phase = ''; record.status = 'error'; ElMessage.error(`起草附件准备失败：${record.error}`);
    } finally { if (pending.get(key) === controller) pending.delete(key); }
  };
  const downloadAttachment = async (key: string) => {
    const record = records[key], attachment = record?.attachment; if (record?.status !== 'done' || !attachment) return;
    try {
      const blob = files.get(key);
      if (!blob) throw new Error('本轮附件尚未就绪，请重新获取文件');
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = attachment.fileName; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) { ElMessage.error(error?.message || '附件下载失败，请稍后重试'); }
  };
  const saveToDraftBox = async (key: string, content = '') => {
    const record = records[key]; if (record?.status !== 'done' || !record.attachment || record.sentToBox || record.sending) return;
    const controller = new AbortController(), currentEpoch = epoch; pending.set(key, controller);
    record.sending = true; record.boxError = '';
    try {
      // 附件已获取并校验；api 仅传下载 URL，parent 模式保留原文件传递规则。
      const blob = files.get(key);
      if (!blob) throw new Error('本轮附件尚未就绪，请重新获取文件');
      const mode = options.saveMode || externalDraftSaveMode;
      let receipt;
      if (mode === 'parent') {
        const fileBase64 = blob.size > MAX_INLINE_FILE_SIZE ? '' : await asDataUrl(blob);
        if (epoch !== currentEpoch || controller.signal.aborted) return;
        receipt = await sendDraftToParent({ sessionId: record.sessionId, qaId: record.qaId, taskId: record.taskId,
          fileName: record.attachment.fileName, downloadUrl: record.attachment.downloadUrl, content, fileBase64 }, { signal: controller.signal });
      } else {
        receipt = await saveContractDraft(record.attachment.fileName, record.attachment.downloadUrl, controller.signal);
      }
      if (epoch !== currentEpoch || controller.signal.aborted) return;
      if (!receipt.success) { record.boxError = receipt.message || '草稿保存失败'; ElMessage.error(record.boxError); return; }
      record.sentToBox = true; record.draftId = receipt.draftId || ''; record.simulated = receipt.simulated === true;
      ElMessage.success(receipt.message || (record.simulated ? '第三方草稿入库模拟成功' : '已保存到草稿箱'));
    } catch (error: any) {
      if (epoch !== currentEpoch || controller.signal.aborted) return;
      record.boxError = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT'
        ? '草稿保存请求超时，结果尚未确认，请先在合同平台核对' : error?.message || '草稿保存失败'; ElMessage.error(record.boxError);
    } finally { if (pending.get(key) === controller) pending.delete(key); if (epoch === currentEpoch) record.sending = false; }
  };
  const reset = () => { epoch++; pending.forEach(controller => controller.abort()); pending.clear(); files.clear(); Object.keys(records).forEach(key => delete records[key]); };
  return { records, getRecord, saveDraftDocx, downloadAttachment, saveToDraftBox, reset };
};
