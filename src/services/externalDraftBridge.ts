/** 外部草稿消息协议。真实入库由第三方父页面负责，本项目只等待与本轮匹配的回执。 */
import { createExternalId, getExternalCredential, getExternalParentOrigin, isExternalParentMessage } from './externalDraftAccess';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export interface DraftIdentity { sessionId: string; qaId: string; taskId: string }
export interface DraftTransfer extends DraftIdentity { requestId: string; fileName: string; downloadUrl: string; content: string; fileBase64: string; mimeType: string }
export interface DraftReceipt extends DraftIdentity { requestId: string; success: boolean; draftId?: string; message?: string; simulated?: boolean }

export const sendDraftToParent = (payload: Omit<DraftTransfer, 'requestId' | 'mimeType'>, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<DraftReceipt> => {
  getExternalCredential();
  const origin = getExternalParentOrigin();
  const requestId = createExternalId();
  const configured = Number(import.meta.env.VITE_EXTERNAL_DRAFT_ACK_TIMEOUT_MS || 30000);
  const timeout = options.timeoutMs ?? (Number.isFinite(configured) && configured > 0 ? configured : 30000);
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', handler); options.signal?.removeEventListener('abort', abort); };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const abort = () => fail(new DOMException('草稿保存等待已取消', 'AbortError'));
    const handler = (event: MessageEvent) => {
      if (!isExternalParentMessage(event) || event.origin !== origin) return;
      const data = event.data?.data || event.data;
      const value = data?.value;
      if (data?.type !== 'SAVE_DRAFT_RESULT' || !value || value.requestId !== requestId || value.sessionId !== payload.sessionId || value.qaId !== payload.qaId || value.taskId !== payload.taskId) return;
      if (value.success !== true) { fail(new Error(String(value.message || '主系统草稿入库失败，请重试'))); return; }
      if (typeof value.draftId !== 'string' || !value.draftId.trim()) { fail(new Error('主系统回执缺少草稿编号，尚不能确认入库成功')); return; }
      cleanup(); resolve(value as DraftReceipt);
    };
    window.addEventListener('message', handler);
    options.signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => fail(new Error('主系统尚未确认草稿保存结果，请核对后重试')), timeout);
    if (options.signal?.aborted) { abort(); return; }
    try { window.parent.postMessage({ platform: '制度智能体', timestamp: Date.now(), data: { type: 'SAVE_DRAFT_TO_BOX', value: { ...payload, requestId, mimeType: DOCX_MIME } } }, origin); }
    catch { fail(new Error('无法向主系统发送草稿，请检查嵌入来源配置')); }
  });
};
