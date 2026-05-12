import router from '@/router';
import { SCOPES_API_BASE_URL } from './config';
import { parseResponseError, toFriendlyError } from './error';
import { saveAgentSession, saveNotFoundError, type FriendlyErrorInfo } from './authStorage';

const DEFAULT_SCOPES = {
  ancestorScope: [],
  descendantScope: [],
  user: '1',
  query: '',
};

const getAgentTokenFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  // 第三方 URL 入参只保留标准写法：/intelligent-qa?agentToken=xxxx。
  // 明确取消历史兼容参数 agent_token 和 token，避免普通业务 token 与 agentToken 混淆。
  // postMessage 的 SET_AGENTTOKEN 方式仍保留。
  return params.get('agentToken');
};

const waitAgentTokenFromParent = (timeoutMs = 1200): Promise<string | null> => {
  if (window.parent === window) return Promise.resolve(null);

  return new Promise((resolve) => {
    let done = false;
    let targetOrigin = '*';

    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', handler);
      resolve(value);
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);

    const handler = (event: MessageEvent) => {
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
      targetOrigin,
    );
  });
};

export const resolveIncomingAgentToken = async () => {
  return getAgentTokenFromUrl() || (await waitAgentTokenFromParent());
};

const scopesUrl = () => `${SCOPES_API_BASE_URL}/v1/scopes`;

const normalizeScopesError = (errorInfo: FriendlyErrorInfo, status?: number) => {
  // 常见误配：/v1/scopes 被 Nginx 转发到了只包含登录管理接口的 8000 服务，
  // FastAPI 会返回 {"detail":"Not Found"}。这里把裸 JSON 改成更容易定位的中文提示。
  if (status === 404) {
    return {
      ...errorInfo,
      title: 'agentToken 授权接口不存在',
      message: '/v1/scopes 未找到，请检查 Nginx 是否转发到了实现权限范围接口的后端服务',
      detail:
        '后端返回 404 Not Found。agentToken 本身可能有效，但当前前端调用的 /v1/scopes 路由没有命中正确服务。请确认 deploy/nginx.conf.example 中 location = /v1/scopes 的 proxy_pass 指向正确后端。',
    };
  }
  return errorInfo;
};

const requestScopesByAgentToken = async (agentToken: string) => {
  const url = scopesUrl();

  // 保持原始前端工程的 /v1/scopes 调用方式：
  // POST /v1/scopes
  // Content-Type: application/json
  // body: { access_token: agentToken }
  // 注意：这里不要改成 GET + Authorization Bearer，否则会和原始后端接口约定不一致，
  // 可能出现 agentToken 有效但前端校验失败或跳转 404 的问题。
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      access_token: agentToken,
    }),
  });

  if (response.ok) {
    return await response.json();
  }

  const errorInfo = await parseResponseError(response, 'agentToken 校验失败');
  throw normalizeScopesError(errorInfo, response.status);
};

export const initAgentAccess = async (agentToken: string) => {
  window.__AGENT_TOKEN__ = agentToken;

  try {
    const scopesData = await requestScopesByAgentToken(agentToken);
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

export const setDefaultScopes = () => {
  window.__SCOPES_DATA__ = DEFAULT_SCOPES;
};
