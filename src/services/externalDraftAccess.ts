/** 外部起草专用授权：只保存已校验的内存凭证，不读写内部登录 localStorage。 */
import { reactive, readonly } from 'vue';
import type { AxiosRequestConfig } from 'axios';
import { API } from '@/api/api';
import { AGENT_SESSION_EXPIRE_MINUTES } from './config';
import { request, isSuccessStatus } from './http';
import { getApiData, getApiMessage, isApiSuccessCode } from './response';

export const isExternalDraftLocation = () => window.location.pathname.replace(/\/+$/, '') === '/external-draft';
export const createExternalId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
const allowedOrigins = String(import.meta.env.VITE_ALLOWED_PARENT_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const state = reactive({ status: 'waiting' as 'waiting' | 'validating' | 'ready' | 'error', message: '等待主系统提供访问授权', parentOrigin: '', revision: 0 });
export const externalDraftAccess = readonly(state);
export interface ExternalCredential { token: string; scopes: Record<string, any>; expiresAt: number; revision: number }
let credential: ExternalCredential | null = null;
let validationController: AbortController | null = null;
let removeListener: (() => void) | null = null;
let currentToken = '';

const originOf = (value: string) => { try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? u.origin : ''; } catch { return ''; } };
const permitted = (origin: string) => Boolean(originOf(origin)) && (!allowedOrigins.length || allowedOrigins.includes(origin));

/** 请求始终使用本次外部授权，不能被内部登录头覆盖。 */
export const externalDraftRequest = <T = any>(config: AxiosRequestConfig, access = getExternalCredential()) =>
  request<T>({ ...config, headers: { ...config.headers, Authorization: `Bearer ${access.token}` } });

export const getExternalCredential = (): ExternalCredential => {
  if (!credential || state.status !== 'ready' || Date.now() >= credential.expiresAt) {
    if (credential && Date.now() >= credential.expiresAt) {
      credential = null; state.status = 'error'; state.message = '访问授权已过期，请从主系统重新进入'; state.revision++;
    }
    throw new Error(state.message || '未获取到访问授权，请从主系统重新进入');
  }
  return credential;
};

const acceptToken = async (incoming: string) => {
  const token = incoming.trim().replace(/^Bearer\s+/i, '');
  if (!token || token === currentToken && (state.status === 'ready' || state.status === 'validating')) return;
  validationController?.abort();
  const controller = new AbortController(); validationController = controller;
  const revision = ++state.revision;
  currentToken = token; credential = null; state.status = 'validating'; state.message = '正在校验主系统访问授权';
  try {
    const response = await request({ url: API.agentPermission.validate, method: 'POST', timeout: 30000, signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, data: { agent_token: token } });
    if (controller.signal.aborted || revision !== state.revision) return;
    if (!isSuccessStatus(response.status) || !isApiSuccessCode(response.data?.code)) {
      const fallback = response.status === 401 ? '访问授权已失效，请从主系统重新进入' : response.status === 403 ? '当前用户没有智能体访问权限' : `授权校验失败（HTTP ${response.status}），请检查业务后端配置`;
      throw new Error(String(getApiMessage(response.data, fallback)));
    }
    const scopes = getApiData(response.data) || {};
    if (scopes.allowed !== true) throw new Error('当前用户没有智能体访问权限');
    const ttl = Number.isFinite(AGENT_SESSION_EXPIRE_MINUTES) && AGENT_SESSION_EXPIRE_MINUTES > 0 ? AGENT_SESSION_EXPIRE_MINUTES : 720;
    credential = { token, scopes, expiresAt: Date.now() + ttl * 60000, revision };
    state.status = 'ready'; state.message = '';
  } catch (error: any) {
    if (controller.signal.aborted || revision !== state.revision) return;
    credential = null; state.status = 'error';
    state.message = error?.response ? '授权校验失败，请从主系统重新进入' : error?.code === 'ERR_NETWORK' || error?.code === 'ECONNABORTED'
      ? '授权服务连接失败，请检查业务后端地址和网络后重试' : error?.message || '授权校验失败，请从主系统重新进入';
  } finally { if (validationController === controller) validationController = null; }
};

/** 接收当前父窗口消息；配置白名单时进一步限制 origin，始终绑定到单一父源。 */
export const isExternalParentMessage = (event: MessageEvent) =>
  window.parent !== window && event.source === window.parent && permitted(event.origin) &&
  (!state.parentOrigin || state.parentOrigin === event.origin);

export const getExternalParentOrigin = () => {
  if (window.parent === window || !state.parentOrigin || !permitted(state.parentOrigin)) throw new Error('尚未连接主系统，请在主系统 iframe 中保存草稿');
  return state.parentOrigin;
};

/** 独立入口初始化；监听持续有效，父页面晚于 READY 传 token 也能恢复。 */
export const initializeExternalDraftAccess = async () => {
  disposeExternalDraftAccess();
  state.status = 'waiting'; state.message = '未获取到访问授权，请从主系统进入或等待主系统传入 token';
  const referrer = originOf(typeof document === 'undefined' ? '' : document.referrer);
  if (window.parent !== window && referrer) {
    if (!permitted(referrer)) { state.status = 'error'; state.message = '当前主系统来源未被允许，请检查父页面域名配置'; return; }
    state.parentOrigin = referrer;
  } else if (window.parent !== window && allowedOrigins.length === 1) state.parentOrigin = allowedOrigins[0]!;
  const handler = (event: MessageEvent) => {
    if (!isExternalParentMessage(event)) return;
    const data = event.data?.data || event.data;
    if (data?.type !== 'SET_AGENTTOKEN' || typeof data.value !== 'string' || !data.value.trim()) return;
    state.parentOrigin = event.origin;
    void acceptToken(data.value);
  };
  window.addEventListener('message', handler);
  removeListener = () => window.removeEventListener('message', handler);
  if (window.parent !== window) {
    // READY 不携带凭证或文件；未获得父源时仅用于发现，实际数据发送始终使用准确 origin。
    window.parent.postMessage({ platform: '制度智能体', timestamp: Date.now(), data: { type: 'READY', value: '' } }, state.parentOrigin || '*');
  }
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash || '';
  const hashParams = new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '');
  const token = params.get('token') || params.get('agentToken') || hashParams.get('token') || hashParams.get('agentToken');
  if (token?.trim()) await acceptToken(token);
};

/** 只清理外部授权，不影响用户原有登录状态。 */
export const disposeExternalDraftAccess = () => {
  validationController?.abort(); validationController = null; removeListener?.(); removeListener = null;
  credential = null; currentToken = ''; state.parentOrigin = ''; state.status = 'waiting'; state.message = '等待主系统提供访问授权'; state.revision++;
};
