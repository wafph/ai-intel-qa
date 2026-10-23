/** 合同中台草稿保存。按本次要求临时在前端保留应用凭据，后续迁至自建后端。 */
import { request, isSuccessStatus } from './http';
import { getExternalCredential } from './externalDraftAccess';

// 临时内网接入：这两个值会进入浏览器构建产物；后续仅迁移本适配层的凭据组装。
const CONTRACT_APPKEY = 'f84xQHcL';
const CONTRACT_SECRETKEY = 'Z3WJjUF5PGk5+cepaPhurw==';
export type ExternalDraftSaveMode = 'api' | 'parent';
export interface ContractDraftResult { success: boolean; code?: string | number; message: string; draftId: string; simulated: false }
export const externalDraftSaveMode: ExternalDraftSaveMode = import.meta.env.VITE_EXTERNAL_DRAFT_SAVE_MODE === 'parent' ? 'parent' : 'api';

/** 传原始 DOCX 下载 URL，保留签名参数；公共源可按现场合同服务网络设置。 */
export const resolveContractWordPath = (downloadUrl: string) => {
  let url: URL;
  try { url = new URL(downloadUrl); } catch { throw new Error('缺少完整的 DOCX 下载地址'); }
  const publicOrigin = String(import.meta.env.VITE_EXTERNAL_DRAFT_PUBLIC_FILE_ORIGIN || '').trim();
  if (publicOrigin) {
    const origin = new URL(publicOrigin);
    if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('公共文件地址请仅配置协议、主机和端口');
    url = new URL(url.pathname + url.search, origin.origin);
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', 'host.docker.internal'].includes(url.hostname.toLowerCase()) || url.pathname.startsWith('/external-file-download/')) {
    throw new Error('请配置合同平台可访问的 DOCX 下载地址');
  }
  url.hash = '';
  return url.href;
};

/** 附件原名不变，仅为制度名称去掉 .docx 和原文件名末尾的毫秒时间戳。 */
export const contractDraftName = (fileName: string) =>
  Array.from(fileName.replace(/\.docx$/i, '').replace(/_\d{17}$/, '').trim() || '制度草稿').slice(0, 200).join('');

/** 合同接口独立判定；已知业务 code=201 是失败，不等同 HTTP 201。 */
export const parseContractDraftResult = (status: number, body: any): ContractDraftResult => {
  const accepted = String(import.meta.env.VITE_EXTERNAL_DRAFT_SAVE_SUCCESS_CODES || '200,0,0000').split(',').map(value => value.trim());
  const hasCode = typeof body?.code === 'number' || typeof body?.code === 'string';
  const code = hasCode ? body.code as string | number : undefined;
  const success = isSuccessStatus(status) && hasCode && String(code) !== '201' && accepted.includes(String(code));
  const suppliedMessage = typeof body?.message === 'string' && body.message.trim() ? body.message : '';
  const message = suppliedMessage || (success ? '已保存到草稿箱' : `草稿保存结果未确认（HTTP ${status}${hasCode ? `，code=${code}` : '，缺少业务码'}），请核对后重试`);
  const id = body?.data?.draftId ?? body?.data?.id;
  return { success, code, message, draftId: typeof id === 'string' || typeof id === 'number' ? String(id) : '', simulated: false };
};

export const saveContractDraft = async (fileName: string, downloadUrl: string, signal?: AbortSignal): Promise<ContractDraftResult> => {
  const access = getExternalCredential();
  const endpoint = new URL(String(import.meta.env.VITE_EXTERNAL_DRAFT_SAVE_API || '/contract-draft-api/saveZDSingle'), window.location.origin);
  if (endpoint.origin !== window.location.origin) throw new Error('草稿保存接口请配置为当前站点的同源代理地址');
  const response = await request({ url: endpoint.pathname + endpoint.search, method: 'POST', signal, timeout: 30000,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    data: { appkey: CONTRACT_APPKEY, secretkey: CONTRACT_SECRETKEY,
      data: { token: access.token, wordPath: resolveContractWordPath(downloadUrl), zdName: contractDraftName(fileName) } } });
  return parseContractDraftResult(response.status, response.data);
};
