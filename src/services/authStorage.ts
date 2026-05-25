/**
 * 登录态、token 与用户信息本地存储工具。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
import { AGENT_SESSION_EXPIRE_MINUTES } from './config';

export type AuthMode = 'local' | 'agent' | 'none';

export interface StoredAuthSession {
  mode: AuthMode;
  accessToken?: string;
  tokenType?: string;
  agentToken?: string;
  expiresAt?: number;
  user?: any;
}

const AUTH_STORAGE_KEY = 'ai_intel_auth_session';
const AGENT_SCOPES_KEY = 'ai_intel_agent_scopes';
const NOT_FOUND_ERROR_KEY = 'ai_intel_not_found_error';

/** 封装当前模块内的业务逻辑：safeParse。 */
const safeParse = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

/** 获取并归一化业务数据：getAuthSession。 */
export const getAuthSession = (): StoredAuthSession | null => {
  return safeParse<StoredAuthSession>(localStorage.getItem(AUTH_STORAGE_KEY));
};

/** 保存会话、标题或业务上下文：saveAuthSession。 */
export const saveAuthSession = (session: StoredAuthSession) => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
};

/** 清理输入、搜索或缓存状态：clearAuthSession。 */
export const clearAuthSession = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(AGENT_SCOPES_KEY);
};

/** 判断条件是否成立：isSessionExpired。 */
export const isSessionExpired = (session?: StoredAuthSession | null) => {
  if (!session?.expiresAt) return true;
  return Date.now() >= session.expiresAt;
};

/** 判断条件是否成立：isAuthenticatedByStorage。 */
export const isAuthenticatedByStorage = () => {
  const session = getAuthSession();
  return Boolean(session && session.mode !== 'none' && !isSessionExpired(session));
};

/** 获取并归一化业务数据：getBearerToken。 */
export const getBearerToken = () => {
  const session = getAuthSession();
  if (!session || isSessionExpired(session)) return '';
  if (session.mode === 'local') return session.accessToken || '';
  if (session.mode === 'agent') return session.agentToken || session.accessToken || '';
  return '';
};

/** 获取并归一化业务数据：getAgentToken。 */
export const getAgentToken = () => {
  const session = getAuthSession();
  if (!session || isSessionExpired(session)) return '';
  return session.agentToken || session.accessToken || '';
};


const DEFAULT_DOWNLOAD_USER_NAME = '用户';

// 文件下载接口新增 user_name 字段时使用。
// 水印服务不在当前前端/后端工程内，仍由前端传 user_name。
// 统一优先使用后台通过 agentToken / platform-login 返回的 mainUserInfo.nickName，
// 再按 nickname/name/username/userId 兜底，避免继续使用固定水印名。
export const getCurrentDownloadUserName = () => {
  const session = getAuthSession();
  const currentUser = session?.user || {};
  const mainUserInfo = currentUser.mainUserInfo || currentUser.userInfo || currentUser;

  return String(
    mainUserInfo.nickName ||
      mainUserInfo.nickname ||
      currentUser.nickName ||
      currentUser.nickname ||
      mainUserInfo.name ||
      currentUser.name ||
      mainUserInfo.userName ||
      mainUserInfo.username ||
      currentUser.username ||
      mainUserInfo.userId ||
      currentUser.userId ||
      currentUser.user_id ||
      currentUser.id ||
      DEFAULT_DOWNLOAD_USER_NAME,
  );
};

/** 构造请求载荷或业务上下文：buildAuthHeaders。 */
export const buildAuthHeaders = (base: Record<string, string> = {}) => {
  const token = getBearerToken();
  if (!token) return base;
  return {
    ...base,
    Authorization: `Bearer ${token}`,
  };
};

/** 保存会话、标题或业务上下文：saveLocalLoginSession。 */
export const saveLocalLoginSession = (payload: any) => {
  const data = payload?.data || payload || {};
  const expiresIn = Number(data.expires_in || 0);
  const expiresAt = expiresIn > 0 ? Date.now() + expiresIn * 1000 : Date.now() + 12 * 60 * 60 * 1000;
  const session: StoredAuthSession = {
    mode: 'local',
    accessToken: data.access_token,
    tokenType: data.token_type || 'Bearer',
    expiresAt,
    user: data.user || {},
  };
  saveAuthSession(session);
  return session;
};

/** 保存会话、标题或业务上下文：saveAgentSession。 */
export const saveAgentSession = (agentToken: string, scopesData: any) => {
  const expiresAt = Date.now() + AGENT_SESSION_EXPIRE_MINUTES * 60 * 1000;
  const mainUserInfo = scopesData?.mainUserInfo || scopesData?.userInfo || {};
  const userId = mainUserInfo.userId || mainUserInfo.user_id || scopesData?.userId || scopesData?.user || 'agent-user';
  const nickName = mainUserInfo.nickName || mainUserInfo.nickname || scopesData?.nickName || scopesData?.nickname;
  const username = mainUserInfo.username || mainUserInfo.userName || scopesData?.username || userId;
  const session: StoredAuthSession = {
    mode: 'agent',
    agentToken,
    accessToken: agentToken,
    tokenType: 'Bearer',
    expiresAt,
    user: {
      ...mainUserInfo,
      id: userId,
      user_id: userId,
      userId,
      name: nickName || username || '外部授权用户',
      nickname: nickName || username || '外部授权用户',
      username,
    },
  };
  saveAuthSession(session);
  localStorage.setItem(AGENT_SCOPES_KEY, JSON.stringify(scopesData || {}));
  return session;
};

/** 获取并归一化业务数据：getStoredAgentScopes。 */
export const getStoredAgentScopes = () => {
  return safeParse<any>(localStorage.getItem(AGENT_SCOPES_KEY));
};

export interface FriendlyErrorInfo {
  code: string;
  title: string;
  message: string;
  detail?: string;
  status?: number;
  path?: string;
  time?: string;
}

/** 保存会话、标题或业务上下文：saveNotFoundError。 */
export const saveNotFoundError = (info: FriendlyErrorInfo) => {
  sessionStorage.setItem(
    NOT_FOUND_ERROR_KEY,
    JSON.stringify({ ...info, time: info.time || new Date().toLocaleString() }),
  );
};

/** 封装当前模块内的业务逻辑：consumeNotFoundError。 */
export const consumeNotFoundError = () => {
  const info = safeParse<FriendlyErrorInfo>(sessionStorage.getItem(NOT_FOUND_ERROR_KEY));
  sessionStorage.removeItem(NOT_FOUND_ERROR_KEY);
  return info;
};
