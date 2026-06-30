/**
 * agentToken 与平台鉴权相关服务封装。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
import router from '@/router';
import { API } from '@/api/api';
import { parseAxiosResponseError, toFriendlyError } from './error';
import { saveAgentSession, saveNotFoundError, type FriendlyErrorInfo } from './authStorage';
import { isSuccessStatus, request } from './http';
import { getApiData, getApiMessage, isApiSuccessCode } from './response';

const DEFAULT_SCOPES = {
  ancestorScope: [],
  descendantScope: [],
  user: '1',
  query: '',
  mainUserInfo: {},
};

/** 解析允许的父域白名单，空数组表示不限制。 */
const ALLOWED_PARENT_ORIGINS = (import.meta.env.VITE_ALLOWED_PARENT_ORIGINS || '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean);

/** 获取并归一化业务数据：getAgentTokenFromUrl。 */
const getAgentTokenFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  // 第三方 URL 入参只保留标准写法：/intelligent-qa?agentToken=xxxx。
  // 历史兼容参数 agent_token/token 不再启用，避免普通业务 token 与 agentToken 混淆。
  return params.get('agentToken');
};

/** 封装当前模块内的业务逻辑：waitAgentTokenFromParent。 */
const waitAgentTokenFromParent = (timeoutMs = 1200): Promise<string | null> => {
  if (window.parent === window) return Promise.resolve(null);

  return new Promise((resolve) => {
    let done = false;
    let targetOrigin = '*';

    /** 封装当前模块内的业务逻辑：finish。 */
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', handler);
      resolve(value);
    };

    /** 封装当前模块内的业务逻辑：timer。 */
    const timer = window.setTimeout(() => finish(null), timeoutMs);

    /** 处理用户交互或组件事件：handler。 */
    const handler = (event: MessageEvent) => {
      // 校验父域白名单，防止恶意第三方页面注入伪造 agentToken
      if (ALLOWED_PARENT_ORIGINS.length && !ALLOWED_PARENT_ORIGINS.includes(event.origin)) {
        return;
      }
      targetOrigin = event.origin || '*';
      const data = event.data?.data || event.data;
      if (data?.type === 'SET_AGENTTOKEN' && data?.value) {
        window.clearTimeout(timer);
        finish(String(data.value));
      }
    };

    window.addEventListener('message', handler);

    // 保持原有第三方平台 ready 通知逻辑。
    window.parent.postMessage(
      {
        platform: '制度智能体',
        timestamp: Date.now(),
        data: {
          type: 'READY',
          value: '',
        },
      },
      targetOrigin === '*' && ALLOWED_PARENT_ORIGINS.length
        ? ALLOWED_PARENT_ORIGINS[0]
        : targetOrigin,
    );
  });
};

/** 封装当前模块内的业务逻辑：resolveIncomingAgentToken。 */
export const resolveIncomingAgentToken = async () => {
  return getAgentTokenFromUrl() || (await waitAgentTokenFromParent());
};

/** 标准化后端/历史数据结构：normalizePermissionPayload。 */
const normalizePermissionPayload = (raw: any, agentToken: string) => {
  const data = getApiData(raw) || raw || {};
  const organization = data.organization || data.org || {};
  return {
    ...data,
    agentToken,
    ancestorScope: data.ancestorScope || organization.ancestorScope || [],
    descendantScope: data.descendantScope || organization.descendantScope || [],
    user: data.user ?? data.userFlag ?? '1',
    mainUserInfo: data.mainUserInfo || data.userInfo || {},
  };
};

/** 标准化后端/历史数据结构：normalizePermissionError。 */
const normalizePermissionError = (errorInfo: FriendlyErrorInfo, status?: number) => {
  if (status === 404) {
    return {
      ...errorInfo,
      title: 'agentToken 授权接口不存在',
      message: '/v1/agent-permission/validate 未找到，请检查 Nginx 是否统一转发到 V12 后端服务',
      detail:
        '后端返回 404 Not Found。agentToken 本身可能有效，但当前前端调用的 V12 鉴权接口没有命中正确服务。',
    };
  }
  return errorInfo;
};

/** 封装当前模块内的业务逻辑：requestPermissionByAgentToken。 */
const requestPermissionByAgentToken = async (agentToken: string) => {
  const response = await request({
    url: API.agentPermission.validate,
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    data: {
      agent_token: agentToken,
    },
  });

  if (!isSuccessStatus(response.status)) {
    const errorInfo = await parseAxiosResponseError(response, 'agentToken 校验失败');
    throw normalizePermissionError(errorInfo, response.status);
  }

  const result = response.data;
  if (!isApiSuccessCode(result?.code)) {
    throw new Error(getApiMessage(result, 'agentToken 校验失败'));
  }

  return normalizePermissionPayload(result, agentToken);
};

/** 封装当前模块内的业务逻辑：initAgentAccess。 */
export const initAgentAccess = async (agentToken: string) => {
  window.__AGENT_TOKEN__ = agentToken;

  try {
    const scopesData = await requestPermissionByAgentToken(agentToken);
    window.__SCOPES_DATA__ = scopesData || DEFAULT_SCOPES;
    saveAgentSession(agentToken, window.__SCOPES_DATA__);
    return { ok: true, scopesData: window.__SCOPES_DATA__ };
  } catch (error) {
    const errorInfo = (error as FriendlyErrorInfo)?.title
      ? (error as FriendlyErrorInfo)
      : toFriendlyError(error, 'agentToken 校验异常');
    saveNotFoundError(errorInfo);
    window.__SCOPES_DATA__ = DEFAULT_SCOPES;
    await router.replace('/not-found');
    return { ok: false, error: errorInfo };
  }
};

/** 设置本地状态或配置：setDefaultScopes。 */
export const setDefaultScopes = () => {
  window.__SCOPES_DATA__ = DEFAULT_SCOPES;
};
