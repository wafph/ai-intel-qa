/**
 * Pinia 用户仓库，维护登录用户、权限和登出逻辑。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { API } from '@/api/api';
import {
  clearAuthSession,
  getAuthSession,
  getStoredAgentScopes,
  isSessionExpired,
  saveLocalLoginSession,
  saveAgentSession,
  type AuthMode,
} from '@/services/authStorage';
import { initAgentAccess, resolveIncomingAgentToken, setDefaultScopes } from '@/services/agentAccess';
import { FRONTEND_AUTH_MODE } from '@/services/config';
import { encryptPasswordBySm2 } from '@/services/crypto';
import { getApiData, getApiMessage, isApiSuccessCode } from '@/services/response';
import { parseAxiosResponseError } from '@/services/error';
import { authRequest, isSuccessStatus, request } from '@/services/http';

interface LoginForm {
  username: string;
  password: string;
}

interface RegisterForm {
  username: string;
  password: string;
  nickname?: string;
  phone?: string;
  email?: string;
}

const defaultUser = {
  id: '1',
  user_id: '1',
  username: 'testuser',
  name: 'testuser',
  nickname: '测试用户',
  avatar: '/images/default-avatar.svg',
  email: '',
  phone: '',
  is_admin: false,
};

/** 封装当前模块内的业务逻辑：useUserStore。 */
export const useUserStore = defineStore('user', () => {
  const user = ref({ ...defaultUser });
  const authMode = ref<AuthMode>('none');
  const accessToken = ref('');
  const expiresAt = ref<number | null>(null);
  const initialized = ref(false);
  const loading = ref(false);

  /** 判断条件是否成立：isLoggedIn。 */
  const isLoggedIn = computed(() => {
    return Boolean(authMode.value !== 'none' && expiresAt.value && Date.now() < expiresAt.value);
  });

  /** 判断条件是否成立：isLocalLogin。 */
  const isLocalLogin = computed(() => authMode.value === 'local');
  /** 判断条件是否成立：isAgentLogin。 */
  const isAgentLogin = computed(() => authMode.value === 'agent');

  /** 封装当前模块内的业务逻辑：applyUser。 */
  const applyUser = (raw: any = {}) => {
    const userId = raw.user_id || raw.id || raw.userId || defaultUser.id;
    user.value = {
      ...defaultUser,
      ...raw,
      id: userId,
      user_id: userId,
      username: raw.username || raw.name || defaultUser.username,
      name: raw.nickname || raw.name || raw.username || defaultUser.name,
      nickname: raw.nickname || raw.name || raw.username || defaultUser.nickname,
      avatar: raw.avatar || defaultUser.avatar,
      email: raw.email || '',
      phone: raw.phone || '',
      is_admin: Boolean(raw.is_admin || raw.isAdmin),
    };
  };

  /** 封装当前模块内的业务逻辑：restoreFromSession。 */
  const restoreFromSession = () => {
    const session = getAuthSession();
    if (!session || isSessionExpired(session)) {
      clearLocalState();
      return false;
    }

    authMode.value = session.mode;
    accessToken.value = session.accessToken || '';
    expiresAt.value = session.expiresAt || null;
    applyUser(session.user || {});

    if (session.mode === 'agent') {
      window.__AGENT_TOKEN__ = session.agentToken || null;
      window.__SCOPES_DATA__ = getStoredAgentScopes() || {
        ancestorScope: [],
        descendantScope: [],
        user: '1',
        query: '',
      };
    }
    return true;
  };

  /** 清理输入、搜索或缓存状态：clearLocalState。 */
  const clearLocalState = () => {
    clearAuthSession();
    authMode.value = 'none';
    accessToken.value = '';
    expiresAt.value = null;
    user.value = { ...defaultUser };
    window.__AGENT_TOKEN__ = null;
    setDefaultScopes();
  };

  // 应用启动时统一初始化：优先识别 URL/postMessage 传入的 agentToken；没有则恢复本地账号登录态。
  const initializeAuth = async () => {
    initialized.value = false;
    const agentToken = await resolveIncomingAgentToken();

    if (agentToken) {
      const result = await initAgentAccess(agentToken);
      if (result.ok) {
        const session = getAuthSession();
        authMode.value = 'agent';
        expiresAt.value = session?.expiresAt || null;
        applyUser(session?.user || {});
      }
      initialized.value = true;
      return result;
    }

    setDefaultScopes();
    const restored = restoreFromSession();

    if (restored && authMode.value === 'local') {
      // 本地登录态需要向后端 /v1/auth/me 再校验一次，避免 token 已被后端注销但前端仍认为有效。
      const ok = await fetchCurrentUser().catch(() => false);
      if (!ok) clearLocalState();
    }

    initialized.value = true;
    return { ok: true };
  };

  // 新增：对接后端 /v1/auth/register 公开注册接口。
  // 如果后端 ALLOW_PUBLIC_REGISTER=false，该接口会按后端返回提示注册失败；
  // 前端不绕过后端策略，只负责提交账号、密码、昵称、手机号、邮箱等字段。
  const registerUser = async (form: RegisterForm) => {
    loading.value = true;
    try {
      const response = await request({
        url: API.auth.register,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: form,
      });

      if (!isSuccessStatus(response.status)) {
        throw await parseAxiosResponseError(response, '注册失败，请稍后重试');
      }

      const result = response.data;
      if (result?.code && String(result.code) !== '200' && Number(result.code) !== 0) {
        throw new Error(result?.message || result?.msg || '注册失败，请稍后重试');
      }
      return result;
    } finally {
      loading.value = false;
    }
  };

  /** 封装当前模块内的业务逻辑：loginByPassword。 */
  const loginByPassword = async (form: LoginForm) => {
    loading.value = true;
    try {
      if (FRONTEND_AUTH_MODE === 'platform') {
        // V12 统一入口要求：前端先使用 SM2 加密 password，后端不再二次加密，直接透传给中台 token 接口。
        const encryptedPassword = encryptPasswordBySm2(form.password);
        const response = await request({
          url: API.agentPermission.platformLogin,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: {
            username: form.username,
            password: encryptedPassword,
          },
        });

        if (!isSuccessStatus(response.status)) {
          throw await parseAxiosResponseError(response, '登录失败，请检查账号或密码');
        }

        const result = response.data;
        if (!isApiSuccessCode(result?.code)) {
          throw new Error(getApiMessage(result, '登录失败，请检查账号或密码'));
        }

        const data = getApiData(result) || {};
        const agentToken = data.accessToken || data.access_token || data.agent_token || data.agentToken;
        if (!agentToken) {
          throw new Error('登录成功但未返回 accessToken');
        }

        const session = saveAgentSession(agentToken, data);
        authMode.value = 'agent';
        accessToken.value = agentToken;
        expiresAt.value = session.expiresAt || null;
        applyUser(session.user || {});
        window.__AGENT_TOKEN__ = agentToken;
        window.__SCOPES_DATA__ = data;
        return result;
      }

      // local 模式保留早期本地账号登录逻辑，密码不做 SM2 加密，避免影响本地 auth_users 校验。
      const response = await request({
        url: API.auth.login,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: form,
      });

      if (!isSuccessStatus(response.status)) {
        throw await parseAxiosResponseError(response, '登录失败，请检查账号或密码');
      }

      const result = response.data;
      if (!isApiSuccessCode(result?.code)) {
        throw new Error(getApiMessage(result, '登录失败，请检查账号或密码'));
      }

      const session = saveLocalLoginSession(result);
      authMode.value = 'local';
      accessToken.value = session.accessToken || '';
      expiresAt.value = session.expiresAt || null;
      applyUser(session.user || {});
      setDefaultScopes();
      return result;
    } finally {
      loading.value = false;
    }
  };

  /** 请求后端接口并返回数据：fetchCurrentUser。 */
  const fetchCurrentUser = async () => {
    const response = await authRequest({
      url: API.auth.me,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!isSuccessStatus(response.status)) return false;
    const result = response.data;
    const data = result?.data || result;
    if (data?.user) applyUser(data.user);
    else applyUser(data);
    return true;
  };

  /** 封装当前模块内的业务逻辑：logout。 */
  const logout = async () => {
    const currentMode = authMode.value;
    if (currentMode === 'local' && accessToken.value) {
      try {
        await authRequest({
          url: API.auth.logout,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
      } catch {
        // 退出失败不阻塞前端清理本地登录态。
      }
    }
    clearLocalState();
  };

  // 保留旧方法名称，避免现有代码引用 login(username) 时失效。
  const login = (username: string) => {
    applyUser({ username, nickname: username, name: username });
    authMode.value = 'local';
  };

  /** 更新状态、消息或远端记录：updateUserInfo。 */
  const updateUserInfo = (info: Partial<typeof user.value>) => {
    user.value = { ...user.value, ...info };
  };

  return {
    user,
    authMode,
    accessToken,
    expiresAt,
    initialized,
    loading,
    isLoggedIn,
    isLocalLogin,
    isAgentLogin,
    initializeAuth,
    loginByPassword,
    registerUser,
    fetchCurrentUser,
    login,
    logout,
    updateUserInfo,
  };
});
