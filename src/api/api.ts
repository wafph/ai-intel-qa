import { API_BASE_URL, SCOPES_API_BASE_URL, WATERMARK_API_BASE_URL } from '@/services/config';

const AGENT_APP_BASE = '/v1/1725c43e3fa54828a078fce60f5a3773';

export const API = {
  agent: {
    uploadFile: `${AGENT_APP_BASE}/agent-runtime/upload-file?workspace_id=791044b6d56145abb6f66226b5c78784`,
    workflowConversation: (workflowId: string, conversationId: string, version: string) =>
      `${AGENT_APP_BASE}/workflows/${workflowId}/conversations/${conversationId}?version=${version}`,
    workflows: {
      qa: { id: '36ef6120-e675-4982-9add-4ab960165014', version: '1779182453662' },
      draft: { id: '1808592a-3c09-41a1-b1b6-225c9985ee00', version: '1779096918260' },
      review: { id: '32dd3ef3-2bfb-4ad7-a448-811ddd37924a', version: '1779098225579' },
      reviewRegenerate: { id: '32dd3ef3-2bfb-4ad7-a448-811ddd37924a', version: '1779098225579' },
      search: { id: 'c206107e-ec31-47d8-9aaf-5c1262931168', version: '1779098087856' },
    },
  },
  auth: {
    register: `${API_BASE_URL}/v1/auth/register`,
    login: `${API_BASE_URL}/v1/auth/login`,
    me: `${API_BASE_URL}/v1/auth/me`,
    logout: `${API_BASE_URL}/v1/auth/logout`,
  },
  chat: {
    history: `${API_BASE_URL}/v1/chat/history`,
    historyBatch: `${API_BASE_URL}/v1/chat/history/batch`,
    sessions: (functionId: string, limit = 30) =>
      `${API_BASE_URL}/v1/chat/sessions?functionId=${functionId}&limit=${limit}`,
    title: `${API_BASE_URL}/v1/chat/title`,
    favorite: `${API_BASE_URL}/v1/chat/favorite`,
    status: `${API_BASE_URL}/v1/chat/status`,
    pin: `${API_BASE_URL}/v1/chat/pin`,
    historyDetail: (functionId: string, sessionId: string) =>
      `${API_BASE_URL}/v1/chat/history?functionId=${functionId}&sessionId=${sessionId}`,
    favorites: (limit = 30, functionId?: string) =>
      `${API_BASE_URL}/v1/chat/favorites?limit=${limit}${functionId ? `&functionId=${functionId}` : ''}`,
    favoriteDetail: (functionId: string, sessionId: string) =>
      `${API_BASE_URL}/v1/chat/favorites/detail?functionId=${functionId}&sessionId=${sessionId}`,
  },
  document: {
    convert: 'http://1.94.244.72:11327/convert',
    watermarkBase: WATERMARK_API_BASE_URL.replace(/\/$/, ''),
    watermarkDownload: `${WATERMARK_API_BASE_URL.replace(/\/$/, '')}/watermark/download`,
  },
  scopes: `${SCOPES_API_BASE_URL}/v1/scopes`,
  token: `${API_BASE_URL}/v1/x-subject-token`,
};

export const getWorkflowByTab = (tab: string) => {
  if (tab === '智能问答') return API.agent.workflows.qa;
  if (tab === '辅助起草') return API.agent.workflows.draft;
  if (tab === '合规审核') return API.agent.workflows.review;
  return API.agent.workflows.search;
};
