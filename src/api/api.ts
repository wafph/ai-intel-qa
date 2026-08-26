/**
 * 统一 API 地址、工作流编码和功能页映射定义。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
import {
  API_BASE_URL,
  WATERMARK_API_BASE_URL,
  CONVERT_API_BASE_URL,
  AGENT_UPLOAD_API_BASE_URL,
  AGENT_UPLOAD_WORKSPACE_ID,
  REVIEW_PDF_PREPARE_API_BASE_URL,
} from '@/services/config';


export const API = {
  agent: {
    // 审核文件上传保持原有 AgentArts 上传逻辑：上传成功后将返回 url 作为 file_url 传给 review 工作流。
    // 上传接口地址和 workspace_id 已改为配置化，后期切换环境只需修改 .env 配置。
    uploadFile: `${AGENT_UPLOAD_API_BASE_URL}?workspace_id=${encodeURIComponent(AGENT_UPLOAD_WORKSPACE_ID)}`,
    // V12 后端统一智能体流式代理接口。
    workflowStream: (workflowCode: string) =>
      `${API_BASE_URL}/v1/agentarts/workflows/${workflowCode}/stream`,
    // V12.2 可恢复任务化流式接口：先创建任务，再按 taskId 订阅事件。
    workflowTask: (workflowCode: string) =>
      `${API_BASE_URL}/v1/agentarts/workflows/${workflowCode}/tasks`,
    taskDetail: (taskId: string, agentToken?: string) => {
      const params = new URLSearchParams();
      if (agentToken) params.set('agentToken', agentToken);
      const query = params.toString();
      return `${API_BASE_URL}/v1/agentarts/tasks/${encodeURIComponent(taskId)}${query ? `?${query}` : ''}`;
    },
    taskStream: (taskId: string, fromEventId = 0, agentToken?: string) => {
      const params = new URLSearchParams({ fromEventId: String(Math.max(0, fromEventId || 0)) });
      if (agentToken) params.set('agentToken', agentToken);
      return `${API_BASE_URL}/v1/agentarts/tasks/${encodeURIComponent(taskId)}/stream?${params.toString()}`;
    },
    taskStop: (taskId: string, agentToken?: string) => {
      const params = new URLSearchParams();
      if (agentToken) params.set('agentToken', agentToken);
      const query = params.toString();
      return `${API_BASE_URL}/v1/agentarts/tasks/${encodeURIComponent(taskId)}/stop${query ? `?${query}` : ''}`;
    },
    workflows: {
      qa: { code: 'qa' },
      search: { code: 'search' },
      draft: { code: 'draft' },
      review: { code: 'review' },
      reviewRegenerate: { code: 'review' },
    },
  },
  auth: {
    register: `${API_BASE_URL}/v1/auth/register`,
    login: `${API_BASE_URL}/v1/auth/login`,
    me: `${API_BASE_URL}/v1/auth/me`,
    logout: `${API_BASE_URL}/v1/auth/logout`,
  },
  agentPermission: {
    platformLogin: `${API_BASE_URL}/v1/agent-permission/platform-login`,
    validate: `${API_BASE_URL}/v1/agent-permission/validate`,
    mode: `${API_BASE_URL}/v1/agent-permission/mode`,
  },
  chat: {
    history: `${API_BASE_URL}/v1/chat/history`,
    historyBatch: `${API_BASE_URL}/v1/chat/history/batch`,
    sessions: (functionId: string, limit = 100, offset = 0) =>
      `${API_BASE_URL}/v1/chat/sessions?functionId=${encodeURIComponent(functionId)}&limit=${limit}&offset=${offset}`,
    search: (keyword: string, functionId?: string, page = 1, pageSize = 20) => {
      const params = new URLSearchParams({ keyword, page: String(page), pageSize: String(pageSize) });
      if (functionId) params.set('functionId', functionId);
      return `${API_BASE_URL}/v1/chat/search?${params.toString()}`;
    },
    title: `${API_BASE_URL}/v1/chat/title`,
    favorite: `${API_BASE_URL}/v1/chat/favorite`,
    status: `${API_BASE_URL}/v1/chat/status`,
    pin: `${API_BASE_URL}/v1/chat/pin`,
    historyDetail: (functionId: string, sessionId: string) =>
      `${API_BASE_URL}/v1/chat/history?functionId=${encodeURIComponent(functionId)}&sessionId=${encodeURIComponent(sessionId)}`,
    reviewContext: `${API_BASE_URL}/v1/chat/review-context`,
    reviewContextDetail: (functionId: string, sessionId: string, qaId: string) =>
      `${API_BASE_URL}/v1/chat/review-context?functionId=${encodeURIComponent(functionId)}&sessionId=${encodeURIComponent(sessionId)}&qaId=${encodeURIComponent(qaId)}`,
    favorites: (limit = 30, functionId?: string) =>
      `${API_BASE_URL}/v1/chat/favorites?limit=${limit}${functionId ? `&functionId=${encodeURIComponent(functionId)}` : ''}`,
    favoriteDetail: (functionId: string, sessionId: string) =>
      `${API_BASE_URL}/v1/chat/favorites/detail?functionId=${encodeURIComponent(functionId)}&sessionId=${encodeURIComponent(sessionId)}`,
  },
  feedback: {
    // 普通用户沿用当前登录凭证提交问题反馈；管理查询仍由独立管理端负责。
    submit: `${API_BASE_URL}/v1/feedback`,
  },
  reviewPdf: {
    detect: `${REVIEW_PDF_PREPARE_API_BASE_URL}/detect`,
    prepare: `${REVIEW_PDF_PREPARE_API_BASE_URL}/prepare`,
    context: (contextId: string, includeContent = true) =>
      `${REVIEW_PDF_PREPARE_API_BASE_URL}/context/${encodeURIComponent(contextId)}?include_content=${includeContent ? 'true' : 'false'}`,
    bindReviewFile: (contextId: string) =>
      `${REVIEW_PDF_PREPARE_API_BASE_URL}/context/${encodeURIComponent(contextId)}/bind-review-file`,
    bySession: (sessionId: string, includeContent = false, limit = 20) =>
      `${REVIEW_PDF_PREPARE_API_BASE_URL}/context/by-session/${encodeURIComponent(sessionId)}?include_content=${includeContent ? 'true' : 'false'}&limit=${limit}`,
  },
  document: {
    // 文档转换/水印预览沿用早期逻辑：前端调用独立文档服务接口，不走 8000 后端业务接口。
    // 当前统一走 8005 文件服务：/v1/files/watermark/download、/v1/markdown-word/convert。
    convert: `${CONVERT_API_BASE_URL.replace(/\/$/, '')}/convert`,
    watermarkBase: WATERMARK_API_BASE_URL.replace(/\/$/, ''),
    watermarkDownload: `${WATERMARK_API_BASE_URL.replace(/\/$/, '')}/watermark/download`,
  },
  token: `${API_BASE_URL}/v1/x-subject-token`,
};

/** 获取并归一化业务数据：getWorkflowByTab。 */
export const getWorkflowByTab = (tab: string) => {
  if (tab === '智能问答') return API.agent.workflows.qa;
  if (tab === '辅助起草') return API.agent.workflows.draft;
  if (tab === '合规审核') return API.agent.workflows.review;
  return API.agent.workflows.search;
};

/** 获取并归一化业务数据：getWorkflowCodeByTab。 */
export const getWorkflowCodeByTab = (tab: string) => getWorkflowByTab(tab).code;
