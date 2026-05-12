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

const safeParse = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const getAuthSession = (): StoredAuthSession | null => {
  return safeParse<StoredAuthSession>(localStorage.getItem(AUTH_STORAGE_KEY));
};

export const saveAuthSession = (session: StoredAuthSession) => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
};

export const clearAuthSession = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(AGENT_SCOPES_KEY);
};

export const isSessionExpired = (session?: StoredAuthSession | null) => {
  if (!session?.expiresAt) return true;
  return Date.now() >= session.expiresAt;
};

export const isAuthenticatedByStorage = () => {
  const session = getAuthSession();
  return Boolean(session && session.mode !== 'none' && !isSessionExpired(session));
};

export const getBearerToken = () => {
  const session = getAuthSession();
  if (!session || session.mode !== 'local' || isSessionExpired(session)) return '';
  return session.accessToken || '';
};


const DEFAULT_DOWNLOAD_USER_NAME = '丽丽';

// 文件下载接口新增 user_name 字段时使用。
// 本地账号登录时优先取登录用户昵称/姓名/账号；
// 第三方 agentToken 或 postMessage SET_AGENTTOKEN 访问时，当前项目暂时固定传“丽丽”跑通水印流程，
// 后续可在 /v1/scopes 返回用户名称后替换为动态 user_name。
export const getCurrentDownloadUserName = () => {
  const session = getAuthSession();

  if (session?.mode === 'agent') {
    return DEFAULT_DOWNLOAD_USER_NAME;
  }

  const currentUser = session?.user || {};
  return String(
    currentUser.nickname ||
      currentUser.name ||
      currentUser.username ||
      currentUser.user_id ||
      currentUser.id ||
      DEFAULT_DOWNLOAD_USER_NAME,
  );
};

export const buildAuthHeaders = (base: Record<string, string> = {}) => {
  const token = getBearerToken();
  if (!token) return base;
  return {
    ...base,
    Authorization: `Bearer ${token}`,
  };
};

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

export const saveAgentSession = (agentToken: string, scopesData: any) => {
  const expiresAt = Date.now() + AGENT_SESSION_EXPIRE_MINUTES * 60 * 1000;
  const session: StoredAuthSession = {
    mode: 'agent',
    agentToken,
    expiresAt,
    user: {
      id: scopesData?.user || 'agent-user',
      name: scopesData?.nickname || scopesData?.username || scopesData?.user || '外部授权用户',
      username: scopesData?.username || scopesData?.user || 'agent-user',
    },
  };
  saveAuthSession(session);
  localStorage.setItem(AGENT_SCOPES_KEY, JSON.stringify(scopesData || {}));
  return session;
};

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

export const saveNotFoundError = (info: FriendlyErrorInfo) => {
  sessionStorage.setItem(
    NOT_FOUND_ERROR_KEY,
    JSON.stringify({ ...info, time: info.time || new Date().toLocaleString() }),
  );
};

export const consumeNotFoundError = () => {
  const info = safeParse<FriendlyErrorInfo>(sessionStorage.getItem(NOT_FOUND_ERROR_KEY));
  sessionStorage.removeItem(NOT_FOUND_ERROR_KEY);
  return info;
};
