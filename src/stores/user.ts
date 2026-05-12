import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { API_BASE_URL } from '@/services/config';
import {
  clearAuthSession,
  getAuthSession,
  getStoredAgentScopes,
  isSessionExpired,
  saveLocalLoginSession,
  type AuthMode,
} from '@/services/authStorage';
import { initAgentAccess, resolveIncomingAgentToken, setDefaultScopes } from '@/services/agentAccess';
import { parseResponseError } from '@/services/error';
import { authFetch } from '@/services/http';

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
  avatar: '/images/user.png',
  email: '',
  phone: '',
  is_admin: false,
};

export const useUserStore = defineStore('user', () => {
  const user = ref({ ...defaultUser });
  const authMode = ref<AuthMode>('none');
  const accessToken = ref('');
  const expiresAt = ref<number | null>(null);
  const initialized = ref(false);
  const loading = ref(false);

  const isLoggedIn = computed(() => {
    return Boolean(authMode.value !== 'none' && expiresAt.value && Date.now() < expiresAt.value);
  });

  const isLocalLogin = computed(() => authMode.value === 'local');
  const isAgentLogin = computed(() => authMode.value === 'agent');

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
      const response = await fetch(`${API_BASE_URL}/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw await parseResponseError(response, '注册失败，请稍后重试');
      }

      const result = await response.json();
      if (result?.code && String(result.code) !== '200' && Number(result.code) !== 0) {
        throw new Error(result?.message || result?.msg || '注册失败，请稍后重试');
      }
      return result;
    } finally {
      loading.value = false;
    }
  };

  const loginByPassword = async (form: LoginForm) => {
    loading.value = true;
    try {
      const response = await fetch(`${API_BASE_URL}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw await parseResponseError(response, '登录失败，请检查账号或密码');
      }

      const result = await response.json();
      if (result?.code && String(result.code) !== '200' && Number(result.code) !== 0) {
        throw new Error(result?.message || '登录失败，请检查账号或密码');
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

  const fetchCurrentUser = async () => {
    const response = await authFetch(`${API_BASE_URL}/v1/auth/me`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) return false;
    const result = await response.json();
    const data = result?.data || result;
    if (data?.user) applyUser(data.user);
    else applyUser(data);
    return true;
  };

  const logout = async () => {
    const currentMode = authMode.value;
    if (currentMode === 'local' && accessToken.value) {
      try {
        await authFetch(`${API_BASE_URL}/v1/auth/logout`, {
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
