/** 合同草稿保存只调用自建后端；应用凭据及 wordPath 在后端组装。 */
import { isSuccessStatus } from './http';
import { externalDraftRequest, getExternalCredential } from './externalDraftAccess';
import type { DraftIdentity } from './externalDraftBridge';

export type ExternalDraftSaveMode = 'api' | 'parent';
export interface ContractDraftResult { success: boolean; code?: string | number; message: string; draftId: string; simulated: false; resultUnknown: boolean }
export const externalDraftSaveMode: ExternalDraftSaveMode = import.meta.env.VITE_EXTERNAL_DRAFT_SAVE_MODE === 'parent' ? 'parent' : 'api';

/** 附件原名不变，仅为制度名称去掉 .docx 和原文件名末尾的毫秒时间戳。 */
export const contractDraftName = (fileName: string) =>
  Array.from(fileName.replace(/\.docx$/i, '').replace(/_\d{17}$/, '').trim() || '制度草稿').slice(0, 200).join('');

/** 自建后端已校验合同内外层业务码；前端同时核验标准码与明确的 success。 */
export const parseContractDraftResult = (status: number, body: any): ContractDraftResult => {
  const code = typeof body?.code === 'string' || typeof body?.code === 'number' ? body.code as string | number : undefined;
  const data = body?.data;
  const success = isSuccessStatus(status) && ['0000', '0', '200'].includes(String(code)) && data?.success === true;
  const supplied = data?.message || body?.msg || body?.message || body?.detail;
  const message = typeof supplied === 'string' && supplied.trim() ? supplied : success ? '已保存到草稿箱' : '草稿保存结果未确认，请先在合同平台核对';
  return { success, code, message, draftId: success && typeof data?.draftId === 'string' ? data.draftId : '', simulated: false, resultUnknown: data?.resultUnknown === true };
};

export const saveContractDraft = async (fileName: string, identity: DraftIdentity, signal?: AbortSignal): Promise<ContractDraftResult> => {
  const access = getExternalCredential(); // 仅跳转 URL token；禁止内部登录凭据或另一份正文 token。
  if (!identity.sessionId || !identity.qaId || !identity.taskId) throw new Error('本轮起草的会话、问答和任务 ID 不完整');
  const endpoint = new URL(String(import.meta.env.VITE_EXTERNAL_DRAFT_SAVE_API || '/contract-draft-api/saveZDSingle'), window.location.origin);
  if (endpoint.origin !== window.location.origin) throw new Error('草稿保存接口请配置为当前站点的同源代理地址');
  const response = await externalDraftRequest({ url: endpoint.pathname + endpoint.search, method: 'POST', signal, timeout: 50000,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    data: { sessionId: identity.sessionId, qaId: identity.qaId, taskId: identity.taskId, zdName: contractDraftName(fileName) } }, access);
  return parseContractDraftResult(response.status, response.data);
};
