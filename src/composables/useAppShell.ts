/**
 * 主应用壳组合函数，集中维护会话、流式任务、刷新恢复、文件上传和四类智能体交互。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
import { ref, computed, onMounted, nextTick, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useChatStore } from '@/stores/chat';
import { useUserStore } from '@/stores/user';
import type { ChatMessage, ChatSession, HistoryItem } from '@/types/chat';
import { ElMessage, ElMessageBox } from 'element-plus';
import { authRequest, getEventStream, isSuccessStatus, request } from '@/services/http';
import { API, getWorkflowCodeByTab } from '@/api/api';
import { getAgentToken } from '@/services/authStorage';
import { getApiData, getApiMessage, isApiSuccessCode } from '@/services/response';
import { extractSourcesFromAny } from '@/services/sourceUtils';
import { stripReviewProgressText } from '@/services/reviewProgress';

/** 封装当前模块内的业务逻辑：useAppShell。 */
export const useAppShell = () => {
const appStore = useAppStore();
const chatStore = useChatStore();
const userStore = useUserStore();
const router = useRouter();
const route = useRoute();

// 新增：从全局获取 scopes 数据
const scopesData = computed(() => {
  return (
    window.__SCOPES_DATA__ || {
      ancestorScope: [],
      descendantScope: [],
      user: '1',
      query: '',
    }
  );
});

// 在已有状态之后添加
const inputText = ref('');
type ComplianceReviewParams = {
  file_url: string;
  query: string;
  dimensions: string[];
  fileName: string;
  originalText: string;
  fileType?: string;
  fileSize?: number;
  fileUrl?: string;
  uploadFileId?: string;
  originalHtml?: string;
};

type RegeneratePayload =
  | string
  | {
      content: string;
      complianceParams?: ComplianceReviewParams | null;
    };

const lastComplianceParams = ref<ComplianceReviewParams | null>(null);
const uploadedFileName = ref('');
const uploadedFileUrl = ref('');
const uploadedOriginalText = ref('');
const uploadedFileRef = ref<File | null>(null);
const selectedDimensions = ref<string[]>([]);
const REVIEW_DIMENSIONS = ['合规性', '冲突性', '文本规范性'];
const SELECT_ALL_DIMENSION = '全选';

/** 格式化展示内容：formatFileSize。 */
const formatFileSize = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)}KB`;
  return `${(size / 1024 / 1024).toFixed(2)}MB`;
};

/** 上传文件并返回远端地址：uploadedFileMeta。 */
const uploadedFileMeta = computed(() => {
  const file = uploadedFileRef.value;
  if (!file) return '';

  const extension = file.name.split('.').pop()?.toUpperCase() || 'FILE';
  const sizeText = formatFileSize(file.size);
  return sizeText ? `${extension} | ${sizeText}` : extension;
});

// 统一获取真正要提交给后端的审核维度，避免把"全选"传给接口或生成空 query
const getActualReviewDimensions = (dimensions: string[] = selectedDimensions.value) => {
  if (dimensions.includes(SELECT_ALL_DIMENSION)) {
    return [...REVIEW_DIMENSIONS];
  }
  return dimensions.filter((item) => REVIEW_DIMENSIONS.includes(item));
};

/** 获取并归一化业务数据：getReviewQuery。 */
const getReviewQuery = (dimensions: string[] = selectedDimensions.value) => {
  return getActualReviewDimensions(dimensions).join(',');
};

/** 标准化后端/历史数据结构：normalizeComplianceParams。 */
const normalizeComplianceParams = (params: any): ComplianceReviewParams | null => {
  if (!params || !params.file_url || !params.query) return null;

  const dimensions = Array.isArray(params.dimensions)
    ? getActualReviewDimensions(params.dimensions)
    : String(params.query)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  return {
    file_url: params.file_url,
    query: params.query,
    dimensions,
    fileName: params.fileName || params.file_name || params.name || '合规审核文件',
    originalText: params.originalText || params.original_text || '',
    fileType: params.fileType || params.file_type,
    fileSize: params.fileSize || params.file_size,
    fileUrl: params.fileUrl || params.file_url || params.url,
    uploadFileId: params.uploadFileId || params.upload_file_id || params.fileId || params.file_id,
    originalHtml: params.originalHtml || params.original_html || '',
  };
};

/** 构造请求载荷或业务上下文：buildReviewContext。 */
const buildReviewContext = (params: ComplianceReviewParams) => ({
  fileName: params.fileName,
  fileType: params.fileType,
  fileSize: params.fileSize,
  fileUrl: params.fileUrl || params.file_url,
  uploadFileId: params.uploadFileId,
  originalText: params.originalText,
  originalHtml: params.originalHtml,
  reviewParams: { ...params },
});

/** 构造请求载荷或业务上下文：buildComplianceMetadata。 */
const buildComplianceMetadata = (params: ComplianceReviewParams) => ({
  complianceOriginalText: params.originalText,
  complianceFileName: params.fileName,
  complianceParams: { ...params },
  reviewContext: buildReviewContext(params),
});

const saveReviewContextSnapshot = async (
  qaId: string,
  params: ComplianceReviewParams | null,
  options: { taskId?: string } = {},
) => {
  if (!qaId || !params) return;
  const sessionId = currentConversationUuid.value || activeChatId.value;
  if (!sessionId) return;

  try {
    await authRequest({
      url: API.chat.reviewContext,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {
        sessionId,
        functionId: 'review',
        qaId,
        taskId: options.taskId,
        ...buildReviewContext(params),
        metadata: buildComplianceMetadata(params),
      },
    });
  } catch {
    // 审核上下文保存失败不阻断主流程；后端历史保存仍会尝试兜底合并 metadata。
  }
};

/** 判断条件是否成立：isTemporaryFileUrlExpired。 */
const isTemporaryFileUrlExpired = (fileUrl: string) => {
  try {
    const url = new URL(fileUrl);
    const expires = Number(url.searchParams.get('Expires'));
    if (!expires) return false;
    return expires <= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
};

/** 封装当前模块内的业务逻辑：refreshComplianceParamsFileUrl。 */
const refreshComplianceParamsFileUrl = async (params: ComplianceReviewParams) => {
  const file = uploadedFileRef.value;
  if (!file || file.name !== params.fileName) {
    if (isTemporaryFileUrlExpired(params.file_url)) {
      throw new Error('上传文件链接已过期，请重新上传文件后再审核');
    }
    return params;
  }

  const uploadResult = await uploadComplianceFile(file);
  const refreshedParams = {
    ...params,
    file_url: uploadResult.fileUrl,
    fileName: uploadResult.fileName,
    originalText: uploadResult.originalText || params.originalText,
    fileType: uploadResult.fileType || params.fileType,
    fileSize: uploadResult.fileSize || params.fileSize,
    fileUrl: uploadResult.fileUrl || params.fileUrl,
    uploadFileId: uploadResult.uploadFileId || params.uploadFileId,
  };
  lastComplianceParams.value = refreshedParams;
  return refreshedParams;
};

/** 获取并归一化业务数据：getComplianceParamsFromSession。 */
const getComplianceParamsFromSession = (session?: ChatSession | null) => {
  if (!session?.messages) return null;

  for (let index = session.messages.length - 1; index >= 0; index--) {
    const message = session.messages[index] as any;
    const params = normalizeComplianceParams(message.metadata?.complianceParams);
    if (params) return params;
  }

  return null;
};

const sidebarCollapsed = ref(false);

// 状态管理
const activeTab = ref<string>('智能问答');
const activeChatId = ref<string>('');
const currentConversationUuid = ref<string>('');
const isSourcesPanelVisible = ref(false);
const isHistoryChatActive = ref(false);
const isSelectingHistoryChat = ref(false);
// 流式相关状态
const isStreaming = ref<boolean>(false);
const currentReasoning = ref<string>('');
const currentAnswer = ref<string>('');
let abortController: AbortController | null = null;
const currentStreamingMessageId = ref<string | null>(null);

const STREAM_TASK_STORAGE_KEY = 'ai_intel_v12_2_resumable_stream_tasks';
const LAST_ACTIVE_SESSION_STORAGE_KEY = 'ai_intel_v12_2_last_active_session_by_func';
const TERMINAL_TASK_STATUSES = ['completed', 'error', 'stopped'];

type ResumableStreamTask = {
  taskId: string;
  sessionId: string;
  qaId: string;
  messageId: string;
  functionId: string;
  tabName: string;
  status: string;
  lastEventId: number;
  /** 当前 answerContent 已覆盖到的后端事件游标；用于刷新/切换恢复时避免旧快照配新游标导致中间内容被跳过。 */
  answerEventId?: number;
  updatedAt: number;
  createdAt?: number;
  title?: string;
  userContent?: string;
  answerContent?: string;
  reasoningContent?: string;
  sources?: any[];
  metadata?: Record<string, any>;
};

const activeStreamTasks = ref<Record<string, ResumableStreamTask>>({});
const historySearchKeyword = ref('');
const historySearchResults = ref<any[]>([]);
const historySearchLoading = ref(false);
// 大模型答案展示控制：首次检测到双换行后才开始把 text 展示到页面，且保留双换行本身
let answerOutputStarted = false;
let answerPendingText = '';

// 计算属性
const currentChatData = computed(() => {
  if (!activeChatId.value) {
    return null;
  }
  const session = chatStore.getChatSession(activeChatId.value);
  if (!session) {
    return null;
  }
  return {
    ...session,
    messages: session.messages ? [...session.messages] : [],
  };
});

// 判断是否显示完整布局
const showFullLayout = computed(() => {
  const excludeRoutes = ['/feedback', '/my-collections', '/not-found', '/login'];
  return !excludeRoutes.includes(route.path);
});

// 过滤后的历史记录
const filteredHistory = computed(() => {
  return chatStore.filteredHistory;
});

/** 获取并归一化业务数据：getTextFromUploadResult。 */
const getTextFromUploadResult = (result: any) => {
  return (
    result?.content ||
    result?.text ||
    result?.document_content ||
    result?.documentContent ||
    result?.data?.content ||
    result?.data?.text ||
    ''
  );
};

/** 封装当前模块内的业务逻辑：readUint16。 */
const readUint16 = (view: DataView, offset: number) => view.getUint16(offset, true);
/** 封装当前模块内的业务逻辑：readUint32。 */
const readUint32 = (view: DataView, offset: number) => view.getUint32(offset, true);

/** 封装当前模块内的业务逻辑：decompressDeflateRaw。 */
const decompressDeflateRaw = async (data: Uint8Array) => {
  const DecompressionStreamConstructor = (window as any).DecompressionStream;
  if (!DecompressionStreamConstructor) {
    throw new Error('当前浏览器不支持解压 docx 内容');
  }

  const compressedBuffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(compressedBuffer).set(data);
  const stream = new Blob([compressedBuffer]).stream().pipeThrough(
    new DecompressionStreamConstructor('deflate-raw'),
  );
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
};

/** 解析文件、响应或富文本内容：parseDocxXmlText。 */
const parseDocxXmlText = (xmlText: string) => {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parserError = xml.querySelector('parsererror');
  if (parserError) return '';

  const paragraphs = Array.from(xml.getElementsByTagNameNS('*', 'p'));
  /** 封装当前模块内的业务逻辑：readNodeText。 */
  const readNodeText = (node: Element) => {
    let text = '';
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent || '';
        return;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const childElement = child as Element;
      if (childElement.localName === 't') {
        text += childElement.textContent || '';
      } else if (childElement.localName === 'tab') {
        text += '\t';
      } else if (childElement.localName === 'br' || childElement.localName === 'cr') {
        text += '\n';
      } else {
        text += readNodeText(childElement);
      }
    });
    return text;
  };

  return paragraphs
    .map((paragraph) => readNodeText(paragraph).trim())
    .filter(Boolean)
    .join('\n');
};

/** 抽取文件、来源或响应字段：extractDocxText。 */
const extractDocxText = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-8');
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;

  for (let offset = bytes.length - 22; offset >= 0; offset--) {
    if (readUint32(view, offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset === -1) return '';

  const centralDirectoryEntries = readUint16(view, eocdOffset + 10);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  let centralOffset = centralDirectoryOffset;

  for (let index = 0; index < centralDirectoryEntries; index++) {
    if (readUint32(view, centralOffset) !== 0x02014b50) break;

    const compressionMethod = readUint16(view, centralOffset + 10);
    const compressedSize = readUint32(view, centralOffset + 20);
    const fileNameLength = readUint16(view, centralOffset + 28);
    const extraLength = readUint16(view, centralOffset + 30);
    const commentLength = readUint16(view, centralOffset + 32);
    const localHeaderOffset = readUint32(view, centralOffset + 42);
    const fileName = decoder.decode(
      bytes.slice(centralOffset + 46, centralOffset + 46 + fileNameLength),
    );

    if (fileName === 'word/document.xml') {
      if (readUint32(view, localHeaderOffset) !== 0x04034b50) return '';

      const localFileNameLength = readUint16(view, localHeaderOffset + 26);
      const localExtraLength = readUint16(view, localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressedData = bytes.slice(dataStart, dataStart + compressedSize);
      const xmlBytes =
        compressionMethod === 0
          ? compressedData
          : compressionMethod === 8
            ? await decompressDeflateRaw(compressedData)
            : new Uint8Array();

      return parseDocxXmlText(decoder.decode(xmlBytes));
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return '';
};

/** 抽取文件、来源或响应字段：extractReadableFileText。 */
const extractReadableFileText = async (file: File): Promise<string> => {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (extension === 'docx') {
    try {
      return await extractDocxText(file);
    } catch {
      return '';
    }
  }

  const readableExtensions = [
    'txt',
    'md',
    'markdown',
    'csv',
    'json',
    'xml',
    'html',
    'htm',
    'log',
    'yml',
    'yaml',
  ];

  if (file.type.startsWith('text/') || readableExtensions.includes(extension)) {
    try {
      return await file.text();
    } catch {
      return '';
    }
  }

  return '';
};

/** 上传文件并返回远端地址：uploadComplianceFile。 */
const uploadComplianceFile = async (file: File) => {
  const token = appStore.sharedDataToken;
  if (!token) {
    throw new Error('未找到认证 token');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('is_image', 'false');

  const [localOriginalText, response] = await Promise.all([
    extractReadableFileText(file),
    request({
      url: API.agent.uploadFile,
      method: 'POST',
      headers: {
        'X-Auth-Token': token,
      },
      data: formData,
    }),
  ]);

  if (!isSuccessStatus(response.status)) {
    throw new Error(`上传失败: ${response.status}`);
  }

  const result = response.data;
  return {
    fileName: file.name,
    fileUrl: result?.url || file.name,
    originalText: getTextFromUploadResult(result) || localOriginalText,
    fileType: file.name.split('.').pop()?.toLowerCase() || file.type || '',
    fileSize: file.size,
    uploadFileId: result?.file_id || result?.fileId || result?.id || result?.data?.file_id || result?.data?.fileId || '',
  };
};

/** 封装当前模块内的业务逻辑：customUpload。 */
const customUpload = async (options: any) => {
  const { file, onSuccess, onError } = options;
  try {
    const uploadResult = await uploadComplianceFile(file);
    onSuccess(uploadResult, file);
    uploadedFileRef.value = file;
    uploadedFileName.value = uploadResult.fileName;
    uploadedFileUrl.value = uploadResult.fileUrl;
    uploadedOriginalText.value = uploadResult.originalText;
  } catch (error) {
    onError(error);
  }
};

/** 处理用户交互或组件事件：handleSelectAll。 */
const handleSelectAll = (val: boolean) => {
  if (val) {
    selectedDimensions.value = [SELECT_ALL_DIMENSION, ...REVIEW_DIMENSIONS];
  } else {
    selectedDimensions.value = [];
  }
};

/** 封装当前模块内的业务逻辑：inputPlaceholder。 */
const inputPlaceholder = computed(() => {
  if (activeTab.value === '智能问答') {
    return '请输入你的问题';
  } else if (activeTab.value === '辅助起草') {
    return '您好，请描述你的制度要求，包括使用范围、核心条款、特殊要求等...';
  } else if (activeTab.value === '合规审核') {
    if (uploadedFileName.value) {
      return '';
    }
    return '请上传文件并选择审核维度';
  } else {
    return '请输入你的内容';
  }
});

// 生成UUID的函数
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/** 获取并归一化业务数据：getCurrentAgentToken。 */
const getCurrentAgentToken = () => getAgentToken() || window.__AGENT_TOKEN__ || '';

/** 构造请求载荷或业务上下文：buildUnifiedAgentPayload。 */
const buildUnifiedAgentPayload = (workflowCode: string, bizParams: Record<string, any>) => {
  const agentToken = getCurrentAgentToken();
  if (!agentToken) throw new Error('未找到 agent_token，请先登录或通过平台授权进入');

  return {
    request_id: generateUUID(),
    session_id: currentConversationUuid.value,
    timestamp: Date.now(),
    agent_token: agentToken,
    intent_tag: workflowCode,
    context: {
      activeTab: activeTab.value,
      routePath: route.path,
    },
    biz_params: {
      inputs: bizParams,
    },
  };
};

/** 判断条件是否成立：isTerminalTaskStatus。 */
const isTerminalTaskStatus = (status?: string) =>
  TERMINAL_TASK_STATUSES.includes(String(status || '').toLowerCase());

let persistStreamTasksTimer: number | null = null;

/** 持久化本地缓存：persistStreamTasksNow。 */
const persistStreamTasksNow = () => {
  const runningTasks = Object.fromEntries(
    Object.entries(activeStreamTasks.value).filter(
      ([, task]) => !isTerminalTaskStatus(task.status),
    ),
  );
  localStorage.setItem(STREAM_TASK_STORAGE_KEY, JSON.stringify(runningTasks));
};

/** 持久化本地缓存：persistStreamTasks。 */
const persistStreamTasks = (immediate = false) => {
  if (immediate) {
    if (persistStreamTasksTimer) {
      window.clearTimeout(persistStreamTasksTimer);
      persistStreamTasksTimer = null;
    }
    persistStreamTasksNow();
    return;
  }

  if (persistStreamTasksTimer) return;
  persistStreamTasksTimer = window.setTimeout(() => {
    persistStreamTasksTimer = null;
    persistStreamTasksNow();
  }, 800);
};

/** 持久化本地缓存：persistLastActiveSession。 */
const persistLastActiveSession = (functionId: string, sessionId: string) => {
  if (!functionId || !sessionId) return;
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_SESSION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    localStorage.setItem(
      LAST_ACTIVE_SESSION_STORAGE_KEY,
      JSON.stringify({ ...parsed, [functionId]: sessionId }),
    );
  } catch {}
};

/** 获取并归一化业务数据：getLastActiveSession。 */
const getLastActiveSession = (functionId: string) => {
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_SESSION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed?.[functionId] || '';
  } catch {
    return '';
  }
};

/** 加载本地缓存或远端数据：loadPersistedStreamTasks。 */
const loadPersistedStreamTasks = () => {
  try {
    const raw = localStorage.getItem(STREAM_TASK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return;

    activeStreamTasks.value = Object.fromEntries(
      Object.entries(parsed as Record<string, ResumableStreamTask>).filter(
        ([, task]) => task?.taskId && task?.sessionId && !isTerminalTaskStatus(task.status),
      ),
    );
  } catch {
    activeStreamTasks.value = {};
  }
};

/** 封装当前模块内的业务逻辑：upsertStreamTask。 */
const upsertStreamTask = (task: ResumableStreamTask, immediatePersist = false) => {
  activeStreamTasks.value = {
    ...activeStreamTasks.value,
    [task.taskId]: {
      ...task,
      updatedAt: Date.now(),
    },
  };
  persistStreamTasks(immediatePersist);
};

/** 删除本地缓存或状态：removeStreamTask。 */
const removeStreamTask = (taskId: string) => {
  if (!activeStreamTasks.value[taskId]) return;
  const next = { ...activeStreamTasks.value };
  delete next[taskId];
  activeStreamTasks.value = next;
  persistStreamTasks(true);
};

/** 获取并归一化业务数据：getTaskBySessionId。 */
const getTaskBySessionId = (sessionId?: string) => {
  if (!sessionId) return null;
  return (
    Object.values(activeStreamTasks.value).find(
      (task) => task.sessionId === sessionId && !isTerminalTaskStatus(task.status),
    ) || null
  );
};

/** 获取并归一化业务数据：getCurrentActiveRunningTask。 */
const getCurrentActiveRunningTask = () => getTaskBySessionId(activeChatId.value);

/** 确认用户操作并返回是否继续：confirmLeaveStreamingIfNeeded。 */
const confirmLeaveStreamingIfNeeded = async (actionText = '离开当前会话') => {
  const runningTask = getCurrentActiveRunningTask();
  if (!runningTask) return true;

  try {
    await ElMessageBox.confirm(
      `当前会话仍在生成中，${actionText}不会中断后台任务，但可能需要稍后再切回来恢复查看。建议等待当前回答完成后再操作。是否仍要继续？`,
      '当前会话正在输出',
      {
        confirmButtonText: '继续操作',
        cancelButtonText: '留在当前会话',
        type: 'warning',
        distinguishCancelAndClose: true,
      },
    );
    return true;
  } catch {
    return false;
  }
};

/** 获取并归一化业务数据：getAnyTaskBySessionId。 */
const getAnyTaskBySessionId = (sessionId?: string) => {
  if (!sessionId) return null;
  return (
    Object.values(activeStreamTasks.value).find((task) => task.sessionId === sessionId) || null
  );
};

/** 转换为安全的展示或请求值：toSafeEventId。 */
const toSafeEventId = (value: any) => {
  const num = Number(value || 0);
  return Number.isFinite(num) && num > 0 ? num : 0;
};

/** 获取并归一化业务数据：getTaskAnswerEventId。 */
const getTaskAnswerEventId = (task: Partial<ResumableStreamTask> | null | undefined) =>
  toSafeEventId(task?.answerEventId);

/** 获取并归一化业务数据：getDetailAnswerEventId。 */
const getDetailAnswerEventId = (detail: any) =>
  toSafeEventId(detail?.answerEventId ?? detail?.answer_event_id ?? detail?.answerContentEventId ?? detail?.answer_content_event_id);

/** 获取并归一化业务数据：getDetailLastEventId。 */
const getDetailLastEventId = (detail: any) =>
  toSafeEventId(detail?.lastEventId ?? detail?.last_event_id ?? detail?.eventCount ?? detail?.streamEventCount);

/** 获取并归一化业务数据：getMessageAnswerEventId。 */
const getMessageAnswerEventId = (message: any) =>
  toSafeEventId(message?.answerEventId ?? message?.answer_event_id ?? message?.answerContentEventId ?? message?.answer_content_event_id);

/** 判断是否应执行指定逻辑：shouldUseServerAnswerSnapshot。 */
const shouldUseServerAnswerSnapshot = (serverContent: string, localContent = '') => {
  if (!serverContent) return false;
  if (!localContent) return true;
  return serverContent.length >= localContent.length;
};


/** 注册可恢复任务或历史状态：registerRecoverableTaskFromSession。 */
const registerRecoverableTaskFromSession = (sessionId: string) => {
  const session = chatStore.getChatSession(sessionId);
  if (!session) return;
  const functionId = chatStore.getFuncIdByTab((session as any).menuType || activeTab.value);
  /** 封装当前模块内的业务逻辑：assistantMessages。 */
  const assistantMessages = session.messages.filter((message: any) => message.role === 'assistant' && message.taskId);
  /** 封装当前模块内的业务逻辑：candidate。 */
  const candidate = [...assistantMessages].reverse().find((message: any) => {
    const status = String(message.taskStatus || '').toLowerCase();
    const hasSources = Array.isArray(message.sources) && message.sources.length > 0;
    return ['pending', 'running'].includes(status) || (!hasSources && ['completed', 'stopped', 'error', ''].includes(status));
  }) as any;
  if (!candidate || activeStreamTasks.value[candidate.taskId]) return;
  /** 封装当前模块内的业务逻辑：messageIndex。 */
  const messageIndex = session.messages.findIndex((item: any) => item.id === candidate.id);
  const userMessage = messageIndex > 0 ? session.messages[messageIndex - 1] : null;
  upsertStreamTask(
    {
      taskId: candidate.taskId,
      sessionId,
      qaId: candidate.id,
      messageId: candidate.id,
      functionId,
      tabName: (session as any).menuType || activeTab.value,
      status: candidate.taskStatus || 'completed',
      // 已完成但缺少引用时，从 0 补读事件，只解析 workflow_finished 中的引用；不重复追加正文。
      lastEventId: Array.isArray(candidate.sources) && candidate.sources.length > 0 ? Number(candidate.streamEventId || 0) : 0,
      answerEventId: getMessageAnswerEventId(candidate),
      updatedAt: Date.now(),
      createdAt: Number(userMessage?.timestamp || candidate.timestamp || Date.now()),
      title: session.title,
      userContent: userMessage?.content || '',
      answerContent: stripReviewProgressText(candidate.content || '', { functionId, tabName: (session as any).menuType || activeTab.value }),
      reasoningContent: candidate.reasoning || '',
      sources: candidate.sources || [],
      metadata: candidate.metadata || userMessage?.metadata || undefined,
    },
    true,
  );
};

/** 获取并归一化业务数据：getTaskByMessageId。 */
const getTaskByMessageId = (messageId?: string | null) => {
  if (!messageId) return null;
  return (
    Object.values(activeStreamTasks.value).find(
      (task) => task.messageId === messageId || task.qaId === messageId,
    ) || null
  );
};

/** 封装当前模块内的业务逻辑：ensureLocalSessionForTask。 */
const ensureLocalSessionForTask = (task: ResumableStreamTask) => {
  let session = chatStore.getChatSession(task.sessionId);
  const tabName = task.tabName || getTabByFunctionId(task.functionId);
  const createdAt = task.createdAt || task.updatedAt || Date.now();
  const title =
    task.title ||
    (task.userContent
      ? task.userContent.length > 20
        ? `${task.userContent.substring(0, 20)}...`
        : task.userContent
      : tabName);

  if (!session) {
    const newSession: ChatSession = {
      id: task.sessionId,
      title,
      time: createdAt,
      type: tabName as any,
      messages: [],
      menuType: tabName,
      conversationUuid: task.sessionId,
      preview: task.userContent || '生成中',
    };
    chatStore.addChatSession(newSession);
    chatStore.addHistoryItem({
      id: task.sessionId,
      title,
      time: createdAt,
      type: tabName as any,
      preview: task.userContent || '生成中',
      menuType: tabName,
      isCollected: false,
    });
    session = newSession;
  }

  if (!session.messages || session.messages.length === 0) {
    session.messages = [
      {
        id: `user_${task.qaId}`,
        role: 'user',
        content: task.userContent || '正在恢复上一条提问...',
        timestamp: createdAt as any,
        vote: null,
        metadata: task.metadata,
      },
      {
        id: task.messageId,
        role: 'assistant',
        content: stripReviewProgressText(task.answerContent || '', { functionId: task.functionId, tabName }),
        reasoning: task.reasoningContent || '',
        timestamp: createdAt as any,
        streaming: !isTerminalTaskStatus(task.status),
        taskId: task.taskId,
        taskStatus: task.status,
        streamEventId: task.lastEventId || 0,
        answerEventId: task.answerEventId || 0,
        sources: task.sources || [],
        metadata: task.metadata,
      },
    ];
  }

  return session;
};

/** 注册可恢复任务或历史状态：registerRunningTasksFromSession。 */
const registerRunningTasksFromSession = (sessionId: string) => {
  const session = chatStore.getChatSession(sessionId);
  if (!session) return;

  session.messages
    .filter((message: any) => message.role === 'assistant' && message.taskId && !isTerminalTaskStatus(message.taskStatus))
    .forEach((message: any) => {
      /** 封装当前模块内的业务逻辑：messageIndex。 */
      const messageIndex = session.messages.findIndex((item: any) => item.id === message.id);
      const userMessage = messageIndex > 0 ? session.messages[messageIndex - 1] : null;
      const functionId = chatStore.getFuncIdByTab((session as any).menuType || activeTab.value);
      upsertStreamTask(
        {
          taskId: message.taskId,
          sessionId,
          qaId: message.id,
          messageId: message.id,
          functionId,
          tabName: (session as any).menuType || activeTab.value,
          status: message.taskStatus || 'running',
          lastEventId: Number(message.streamEventId || 0),
          answerEventId: getMessageAnswerEventId(message),
          updatedAt: Date.now(),
          createdAt: Number(userMessage?.timestamp || message.timestamp || Date.now()),
          title: session.title,
          userContent: userMessage?.content || '',
          answerContent: stripReviewProgressText(message.content || '', { functionId, tabName: (session as any).menuType || activeTab.value }),
          reasoningContent: message.reasoning || '',
          sources: message.sources || [],
          metadata: message.metadata || userMessage?.metadata || undefined,
        },
        true,
      );
    });
};

const updateTaskMessage = (
  task: ResumableStreamTask,
  updates: Partial<ChatMessage> & { status?: string; eventId?: number; answerEventId?: number } = {},
) => {
  const session = chatStore.getChatSession(task.sessionId) || ensureLocalSessionForTask(task);
  if (!session) return;

  const message = session.messages.find(
    (item: any) =>
      item.id === task.messageId || item.id === task.qaId || item.taskId === task.taskId,
  ) as ChatMessage | undefined;
  if (!message) return;

  message.id = task.messageId;
  message.taskId = task.taskId;
  message.taskStatus = updates.status || task.status;
  message.streamEventId = updates.eventId ?? task.lastEventId;
  (message as any).answerEventId = updates.answerEventId ?? task.answerEventId ?? (message as any).answerEventId ?? 0;
  message.streaming = !isTerminalTaskStatus(message.taskStatus);

  if (typeof updates.content === 'string') {
    message.content = stripReviewProgressText(updates.content, { functionId: task.functionId, tabName: task.tabName });
  }
  if (typeof updates.reasoning === 'string') message.reasoning = updates.reasoning;
  if (Object.prototype.hasOwnProperty.call(updates, 'sources')) message.sources = updates.sources as any;
  if (task.metadata && !message.metadata) message.metadata = task.metadata as any;

  if (activeChatId.value === task.sessionId) {
    currentStreamingMessageId.value = message.streaming ? task.messageId : null;
    isStreaming.value = Boolean(message.streaming);
    currentAnswer.value = message.content || '';
    currentReasoning.value = message.reasoning || '';
  }
};

/** 同步当前 UI 与任务状态：syncCurrentStreamUi。 */
const syncCurrentStreamUi = () => {
  const task = getTaskBySessionId(activeChatId.value);
  if (!task) {
    isStreaming.value = false;
    currentStreamingMessageId.value = null;
    currentReasoning.value = '';
    currentAnswer.value = '';
    return;
  }

  const session = chatStore.getChatSession(task.sessionId);
  const message = session?.messages.find(
    (item: any) => item.id === task.messageId || item.taskId === task.taskId,
  );
  isStreaming.value = true;
  currentStreamingMessageId.value = task.messageId;
  currentAnswer.value = stripReviewProgressText(message?.content || '', { functionId: task.functionId, tabName: task.tabName });
  currentReasoning.value = message?.reasoning || '';
};

/** 封装当前模块内的业务逻辑：detachStreamSubscription。 */
const detachStreamSubscription = (resetUi = true) => {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  if (resetUi) {
    isStreaming.value = false;
    currentStreamingMessageId.value = null;
    resetStreamState();
  }
};

/** 查询远端数据并更新页面：queryStreamTaskDetail。 */
const queryStreamTaskDetail = async (taskId: string) => {
  const response = await authRequest({
    url: API.agent.taskDetail(taskId, getCurrentAgentToken()),
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!isSuccessStatus(response.status)) {
    throw new Error(`任务状态查询失败: ${response.status}`);
  }

  const result = response.data;
  if (!isApiSuccessCode(result?.code)) {
    throw new Error(getApiMessage(result, '任务状态查询失败'));
  }
  return getApiData(result) || {};
};

const createWorkflowTask = async (
  workflowCode: string,
  bizParams: Record<string, any>,
  messageId: string,
) => {
  const response = await authRequest({
    url: API.agent.workflowTask(workflowCode),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: buildUnifiedAgentPayload(workflowCode, { ...bizParams, qaId: messageId }),
  });

  if (!isSuccessStatus(response.status)) {
    throw new Error(`创建流式任务失败: ${response.status}`);
  }

  const result = response.data;
  if (!isApiSuccessCode(result?.code)) {
    throw new Error(getApiMessage(result, '创建流式任务失败'));
  }

  const data = getApiData(result) || {};
  if (!data.taskId) {
    throw new Error('创建流式任务失败：后端未返回 taskId');
  }
  return data;
};

const consumeEventStream = async (
  stream: ReadableStream<Uint8Array>,
  onData: (payload: any) => Promise<void>,
) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  /** 处理用户交互或组件事件：handleLine。 */
  const handleLine = async (line: string) => {
    if (line.trim() === '' || !line.startsWith('data:')) return;
    const data = line.substring(5).trim();
    if (!data || data === '[DONE]') return;
    try {
      await onData(JSON.parse(data));
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.error('解析流数据失败:', error);
      } else {
        throw error;
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      await handleLine(line);
    }
  }

  if (buffer.trim()) {
    await handleLine(buffer);
  }
};

/** 封装当前模块内的业务逻辑：subscribeStreamTask。 */
const subscribeStreamTask = async (taskId: string, options: { allowTerminalReplay?: boolean; silent?: boolean } = {}) => {
  const task = activeStreamTasks.value[taskId];
  if (!task || activeChatId.value !== task.sessionId) return;
  if (isTerminalTaskStatus(task.status) && !options.allowTerminalReplay) return;

  detachStreamSubscription(false);
  ensureLocalSessionForTask(task);
  persistLastActiveSession(task.functionId, task.sessionId);
  if (!options.silent && !isTerminalTaskStatus(task.status)) {
    resetStreamState();
    syncCurrentStreamUi();
    // 恢复订阅时页面上可能已经有后端 answerContent 或本地缓存内容。
    // 此时后续 token 都是正文续写，不能再走“首次双换行前置内容过滤”，否则会把恢复后的第一段正文误缓存/丢弃。
    if (currentAnswer.value) {
      answerOutputStarted = true;
      answerPendingText = '';
    }
  }

  const controller = new AbortController();
  abortController = controller;

  try {
    const response = await getEventStream(
      API.agent.taskStream(task.taskId, task.lastEventId || 0, getCurrentAgentToken()),
      { signal: controller.signal },
    );

    if (!isSuccessStatus(response.status) || !response.data?.getReader) {
      throw new Error(`任务流订阅失败: ${response.status}`);
    }

    await consumeEventStream(response.data, (payload) =>
      processStreamChunk(payload, task.messageId, task.taskId),
    );
  } catch (error: any) {
    if (error?.name !== 'AbortError' && activeStreamTasks.value[taskId]) {
      syncCurrentStreamUi();
      if (!options.silent) {
        ElMessage.warning('当前流式订阅连接中断，任务仍在后台生成，可重新进入会话或刷新后继续恢复');
      }
    }
  } finally {
    if (abortController === controller) {
      abortController = null;
    }
  }
};

/** 恢复流式任务订阅：resumeTaskForSession。 */
const resumeTaskForSession = async (sessionId: string) => {
  const task = getAnyTaskBySessionId(sessionId);
  if (!task) {
    syncCurrentStreamUi();
    return;
  }

  try {
    const localLastEventId = toSafeEventId(task.lastEventId);
    const localAnswerEventId = getTaskAnswerEventId(task);
    const detail = await queryStreamTaskDetail(task.taskId);
    const status = detail.status || task.status;
    const terminal = isTerminalTaskStatus(status);
    const detailAnswerContent = stripReviewProgressText(
      typeof detail.answerContent === 'string' ? detail.answerContent : '',
      { functionId: task.functionId, tabName: task.tabName },
    );
    const localAnswerContent = stripReviewProgressText(task.answerContent || '', {
      functionId: task.functionId,
      tabName: task.tabName,
    });
    const detailAnswerEventId = getDetailAnswerEventId(detail);
    const detailLastEventId = getDetailLastEventId(detail);
    const useServerSnapshot = shouldUseServerAnswerSnapshot(detailAnswerContent, localAnswerContent);
    const resumeEventId = useServerSnapshot
      ? (detailAnswerEventId || detailLastEventId || localLastEventId)
      : localLastEventId;
    const mergedAnswerContent = useServerSnapshot ? detailAnswerContent : localAnswerContent;
    const mergedAnswerEventId = useServerSnapshot
      ? (detailAnswerEventId || detailLastEventId || getTaskAnswerEventId(task))
      : (localAnswerEventId || localLastEventId);

    const mergedTask: ResumableStreamTask = {
      ...task,
      qaId: detail.qaId || task.qaId,
      messageId: detail.qaId || task.messageId,
      status,
      // 保持“内容快照”和“续订游标”一致：
      // 采用后端 answerContent 时，从 answerEventId 继续；
      // 保留本地更完整内容时，继续使用本地 lastEventId。
      lastEventId: resumeEventId,
      answerEventId: mergedAnswerEventId,
      updatedAt: Date.now(),
      answerContent: mergedAnswerContent,
      reasoningContent:
        typeof detail.reasoningContent === 'string' ? detail.reasoningContent : task.reasoningContent,
      userContent: detail.questionContent || detail.query || task.userContent,
      title: detail.sessionTitle || detail.title || task.title,
      sources: task.sources && task.sources.length > 0 ? task.sources : extractSourcesFromTaskDetail(detail),
      metadata: task.metadata || undefined,
    };

    ensureLocalSessionForTask(mergedTask);
    upsertStreamTask(mergedTask, true);
    updateTaskMessage(mergedTask, {
      content: mergedTask.answerContent,
      reasoning: mergedTask.reasoningContent,
      sources: mergedTask.sources || undefined,
      status: mergedTask.status,
      eventId: resumeEventId,
      answerEventId: mergedAnswerEventId,
    });

    if (terminal) {
      // 任务已完成时也要补读漏掉的事件，尤其是 workflow_finished 中的引用文献。
      sourceOnlyReplayTaskIds.add(mergedTask.taskId);
      try {
        await subscribeStreamTask(mergedTask.taskId, { allowTerminalReplay: true, silent: true });
      } finally {
        sourceOnlyReplayTaskIds.delete(mergedTask.taskId);
      }
      removeStreamTask(mergedTask.taskId);
      syncCurrentStreamUi();
      return;
    }

    await subscribeStreamTask(mergedTask.taskId);
  } catch {
    syncCurrentStreamUi();
  }
};

/** 停止当前输出或任务：stopTaskOnServer。 */
const stopTaskOnServer = async (taskId: string) => {
  try {
    await authRequest({
      url: API.agent.taskStop(taskId, getCurrentAgentToken()),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {}
};

const sourceOnlyReplayTaskIds = new Set<string>();


/**
 * 从任务详情、workflow_finished 或 done 事件中提取结构化结果。
 *
 * 后端 v12.2.7 会把前端断开期间错过的 workflow_finished 结果持久化到
 * data_json / sources / recommendations / templates / workflowOutputs / userFields。
 * 前端统一从这些字段恢复问答引用、检索详情和起草推荐范文。
 */
const extractSourcesFromWorkflowPayload = (payload: any, payloadData: any, chunk?: any): any[] => {
  return extractSourcesFromAny(
    payloadData?.outputs,
    payload?.outputs,
    chunk?.outputs,
    payloadData?.data_json,
    payloadData?.sources,
    payloadData?.recommendations,
    payloadData?.templates,
    payloadData?.workflowOutputs,
    payloadData?.workflow_outputs,
    payloadData?.userFields,
    payloadData?.user_fields,
    payload?.data_json,
    payload?.sources,
    payload?.recommendations,
    payload?.templates,
    payload?.workflowOutputs,
    payload?.workflow_outputs,
    payload?.userFields,
    payload?.user_fields,
    chunk?.data_json,
    chunk?.sources,
    chunk?.recommendations,
    chunk?.templates,
    chunk?.workflowOutputs,
    chunk?.workflow_outputs,
    chunk?.userFields,
    chunk?.user_fields,
    payloadData,
    payload,
    chunk,
  );
};

/** 抽取文件、来源或响应字段：extractSourcesFromTaskDetail。 */
const extractSourcesFromTaskDetail = (detail: any): any[] => {
  return extractSourcesFromWorkflowPayload(detail, detail?.payload || detail?.data || detail, detail);
};

/** 判断条件是否成立：isWorkflowFinishedEvent。 */
const isWorkflowFinishedEvent = (eventType?: string, payloadEvent?: string, payload?: any) => {
  const values = [eventType, payloadEvent, payload?.event, payload?.event_type, payload?.data?.event]
    .map((item) => String(item || '').toLowerCase());
  return values.some((item) => item === 'workflow_finished' || item === 'workflow-finished');
};

/** 获取并归一化业务数据：getFunctionIdForTask。 */
const getFunctionIdForTask = (task: ResumableStreamTask) => {
  if (task.functionId) return task.functionId;
  return chatStore.getFuncIdByTab(task.tabName || activeTab.value);
};

const completedTaskSaveSignatures = new Map<string, string>();

/** 持久化本地缓存：persistCompletedConversationForTask。 */
const persistCompletedConversationForTask = async (task: ResumableStreamTask) => {
  const session = chatStore.getChatSession(task.sessionId);
  if (!session?.messages?.length) return;

  const assistantMessage = session.messages.find(
    (message: any) => message.role === 'assistant' && (message.id === task.messageId || message.id === task.qaId || message.taskId === task.taskId),
  ) as ChatMessage | undefined;
  if (!assistantMessage) return;

  /** 封装当前模块内的业务逻辑：assistantIndex。 */
  const assistantIndex = session.messages.findIndex((message: any) => message === assistantMessage);
  const userMessage = [...session.messages.slice(0, assistantIndex)]
    .reverse()
    .find((message: any) => message.role === 'user') as ChatMessage | undefined;
  if (!userMessage) return;

  if (task.metadata && !assistantMessage.metadata) assistantMessage.metadata = task.metadata as any;
  if (task.sources && task.sources.length > 0) assistantMessage.sources = task.sources as any;
  if (task.answerContent && !assistantMessage.content) {
    assistantMessage.content = stripReviewProgressText(task.answerContent, { functionId: task.functionId, tabName: task.tabName });
  }
  assistantMessage.content = stripReviewProgressText(assistantMessage.content || '', {
    functionId: task.functionId,
    tabName: task.tabName,
  });
  if (task.reasoningContent && !assistantMessage.reasoning) assistantMessage.reasoning = task.reasoningContent;

  const signature = JSON.stringify({
    status: assistantMessage.taskStatus || task.status,
    content: assistantMessage.content || '',
    sourcesCount: assistantMessage.sources?.length || 0,
    metadata: assistantMessage.metadata || null,
  });
  if (completedTaskSaveSignatures.get(task.taskId) === signature) return;
  completedTaskSaveSignatures.set(task.taskId, signature);

  await chatStore.saveConversationToServer(
    task.sessionId,
    task.qaId || assistantMessage.id,
    userMessage,
    assistantMessage,
    assistantMessage.vote === 'like' ? 1 : 0,
    assistantMessage.vote === 'dislike' ? 1 : 0,
    getFunctionIdForTask(task),
  );
};

// 重置当前对话
const resetCurrentChat = () => {
  activeChatId.value = '';
  currentConversationUuid.value = '';
  currentReasoning.value = '';
  currentAnswer.value = '';
  currentStreamingMessageId.value = null;
  isHistoryChatActive.value = false;
};

// 切换侧边栏折叠状态
const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
};
let isCreatingChat = false;
let creationPromise: Promise<void> | null = null;
/** 创建本地/远程业务对象：createChatForMessage。 */
const createChatForMessage = async () => {
  if (creationPromise) {
    await creationPromise;
    return;
  }
  if (isCreatingChat) {
    return;
  }
  isCreatingChat = true;
  creationPromise = (async () => {
    try {
      const newChatId = generateUUID();
      isHistoryChatActive.value = false;
      activeChatId.value = newChatId;
      currentConversationUuid.value = newChatId;
      const chatTitle = activeTab.value;
      const now = Date.now();
      const newSession: ChatSession = {
        id: newChatId,
        title: chatTitle,
        time: now,
        type: activeTab.value as any,
        messages: [],
        menuType: activeTab.value,
        conversationUuid: newChatId,
      };

      const newHistory: HistoryItem = {
        id: newChatId,
        title: chatTitle,
        time: now,
        type: activeTab.value as any,
        preview: '新对话',
        menuType: activeTab.value,
        isCollected: false,
      };
      chatStore.addChatSession(newSession);
      chatStore.addHistoryItem(newHistory);
      scrollToBottom();
    } finally {
      isCreatingChat = false;
    }
  })();
  await creationPromise;
  creationPromise = null;
};

/** 处理用户交互或组件事件：handleNewChat。 */
const handleNewChat = async () => {
  const canLeave = await confirmLeaveStreamingIfNeeded('新建对话');
  if (!canLeave) return false;

  detachStreamSubscription();
  resetCurrentChat();
  isSourcesPanelVisible.value = false;
  scrollToBottom();
  return true;
};

// 修改 handleSelectChat 函数，确保能正确加载会话
const handleSelectChat = async (chatId: string) => {
  if (chatId !== activeChatId.value) {
    const canLeave = await confirmLeaveStreamingIfNeeded('切换会话');
    if (!canLeave) return false;
  }

  detachStreamSubscription();
  isSelectingHistoryChat.value = true;
  isHistoryChatActive.value = true;
  try {
    hasAutoCreated = false;
    // 先清空，再设置，确保触发响应式更新。只断开当前浏览器订阅，不停止后端任务。
    activeChatId.value = '';
    await nextTick();
    const localTask = getTaskBySessionId(chatId);
    let session = chatStore.getChatSession(chatId);
    if (!session && localTask) {
      session = ensureLocalSessionForTask(localTask);
    }
    if (!session) {
      try {
        const funcId = chatStore.getFuncIdByTab(activeTab.value);
        const messages = await chatStore.querySessionHistory(chatId, funcId);
        if (messages && messages.length > 0) {
          // 创建新的会话对象
          const newSession: ChatSession = {
            id: chatId,
            title: '从收藏加载的会话',
            time: Date.now(),
            type: activeTab.value as any,
            messages: messages,
            menuType: activeTab.value,
            conversationUuid: chatId,
          };

          chatStore.addChatSession(newSession);
          session = newSession;
        } else {
          return;
        }
      } catch (error) {
        return;
      }
    }
    // 设置当前会话UUID
    if (session && !(session as any).conversationUuid) {
      (session as any).conversationUuid = chatId;
    }
    currentConversationUuid.value = chatId;
    // 加载会话历史
    if (session && (!session.messages || session.messages.length === 0)) {
      await chatStore.loadSessionHistory(chatId).catch(() => {});
    }
    activeChatId.value = chatId;
    persistLastActiveSession(chatStore.getFuncIdByTab(activeTab.value), chatId);
    resetStreamState();
    scrollToBottom();
    lastComplianceParams.value =
      activeTab.value === '合规审核'
        ? getComplianceParamsFromSession(chatStore.getChatSession(chatId))
        : null;
    registerRunningTasksFromSession(chatId);
    registerRecoverableTaskFromSession(chatId);
    await resumeTaskForSession(chatId);
  } finally {
    isSelectingHistoryChat.value = false;
  }
  return true;
};

/** 处理用户交互或组件事件：handleDeleteChat。 */
const handleDeleteChat = async (chatId: string) => {
  await chatStore.deleteConversationBySession(chatId);
  if (activeChatId.value === chatId) {
    if (chatStore.historyList.length > 0) {
      activeChatId.value = chatStore.historyList[0].id;
      isHistoryChatActive.value = true;
      const chat = chatStore.getChatSession(chatStore.historyList[0].id);
      if (chat && (chat as any).conversationUuid) {
        currentConversationUuid.value = (chat as any).conversationUuid;
      }
    } else {
      activeChatId.value = '';
      currentConversationUuid.value = '';
      isHistoryChatActive.value = false;
    }
  }
};

/** 处理用户交互或组件事件：handleClearHistory。 */
const handleClearHistory = async () => {
  await chatStore.clearAllConversations();
  chatStore.historyList = [];
  chatStore.chatSessions = {};

  activeChatId.value = '';
  currentConversationUuid.value = '';
  isHistoryChatActive.value = false;
  resetStreamState();
};

/** 处理用户交互或组件事件：handleToggleFavorite。 */
const handleToggleFavorite = (chatId: string) => {
  chatStore.toggleCollect(chatId);
};

/** 判断条件是否成立：isSendDisabled。 */
const isSendDisabled = computed(() => {
  if (activeTab.value === '合规审核') {
    return !uploadedFileUrl.value || selectedDimensions.value.length === 0;
  }
  return isStreaming.value;
});

/** 处理用户交互或组件事件：handleSendMessage。 */
const handleSendMessage = async (content: string) => {
  if (activeTab.value === '合规审核') {
    if (!uploadedFileUrl.value || selectedDimensions.value.length === 0) {
      return;
    }
  } else {
    if (!content.trim() || isStreaming.value) return;
  }
  let userMessageContent = '';
  if (activeTab.value === '合规审核') {
    // 获取实际的审核维度：全选时展开为三个真实维度，不把“全选”传给后端
    const displayDimensions = getActualReviewDimensions();
    const reviewQuery = getReviewQuery();

    if (!reviewQuery) {
      ElMessage.warning('请选择有效的审核维度');
      return;
    }

    // 格式：文件名 + 换行 + 审核维度
    userMessageContent = `${uploadedFileName.value}\n审核维度：${displayDimensions.join('、')}`;

    // 保存合规审核的参数，用于重新审核
    lastComplianceParams.value = {
      file_url: uploadedFileUrl.value,
      query: reviewQuery,
      dimensions: displayDimensions,
      fileName: uploadedFileName.value, // 新增：保存文件名
      originalText: uploadedOriginalText.value,
      fileType: uploadedFileRef.value?.name.split('.').pop()?.toLowerCase() || uploadedFileRef.value?.type || '',
      fileSize: uploadedFileRef.value?.size,
      fileUrl: uploadedFileUrl.value,
    };
  } else {
    userMessageContent = content.trim();
  }

  if (!activeChatId.value) {
    await createChatForMessage();
  }
  const chat = chatStore.getChatSession(activeChatId.value!);
  if (!chat) return;
  if (!currentConversationUuid.value) {
    currentConversationUuid.value = generateUUID();
    (chat as any).conversationUuid = currentConversationUuid.value;
  }

  const qaId = generateUUID();

  // 添加用户消息
  const userMessage: ChatMessage = {
    id: `user_${qaId}`,
    role: 'user',
    content: userMessageContent, // 使用新的消息内容
    timestamp: new Date() as any,
    metadata:
      activeTab.value === '合规审核' && lastComplianceParams.value
        ? buildComplianceMetadata(lastComplianceParams.value)
        : undefined,
  };

  chat.messages.push(userMessage);

  // 如果是第一条消息，更新标题
  if (chat.messages.length === 1) {
    const newTitle =
      activeTab.value === '合规审核'
        ? `审核: ${uploadedFileName.value}`
        : content.length > 20
          ? content.substring(0, 20) + '...'
          : content;
    chat.title = newTitle;

    /** 封装当前模块内的业务逻辑：historyItem。 */
    const historyItem = chatStore.historyList.find((h: any) => h.id === chat.id);
    if (historyItem) {
      historyItem.title = newTitle;
      historyItem.preview =
        activeTab.value === '合规审核' ? `${uploadedFileName.value}的审核` : content;
    }
  }

  if (activeTab.value === '合规审核') {
    // 审核原文必须在开始任务前稳定保存到后端，避免刷新/切换后丢失原文比对上下文。
    await saveReviewContextSnapshot(qaId, lastComplianceParams.value);
  }

  // 清空输入框（针对合规审核，清空上传状态和选择状态）
  if (activeTab.value === '合规审核') {
    // 清空上传文件状态
    uploadedFileName.value = '';
    uploadedFileUrl.value = '';
    uploadedOriginalText.value = '';
    // 清空多选框状态
    selectedDimensions.value = [];
    // 重置"全选"状态
    const selectAllCheckbox = document.querySelector(
      '.el-checkbox-group .el-checkbox:first-child input',
    ) as HTMLInputElement;
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
    }
  } else {
    // 清空普通输入框
    inputText.value = '';
  }

  // 添加AI消息占位符
  const aiMessageId = qaId;
  const aiMessage: ChatMessage = {
    id: aiMessageId,
    role: 'assistant',
    content: '',
    reasoning: '',
    timestamp: new Date() as any,
    streaming: true,
    metadata:
      activeTab.value === '合规审核' && lastComplianceParams.value
        ? buildComplianceMetadata(lastComplianceParams.value)
        : undefined,
  };
  chat.messages.push(aiMessage);
  chatStore.updateHistoryItem(activeChatId.value!, {
    preview: userMessageContent, // 使用新的消息内容作为预览
    time: Date.now(),
  });
  resetStreamState();
  currentStreamingMessageId.value = aiMessageId;

  // 开始流式输出
  await startStream(content, aiMessageId);

  scrollToBottom();
};

// 创建 V12.2 后台任务并订阅 taskId 事件流。
const startStream = async (queryText: string, messageId: string) => {
  isStreaming.value = true;
  currentReasoning.value = '';
  currentAnswer.value = '';

  try {
    let bizParams: Record<string, any> = {};

    if (activeTab.value === '合规审核') {
      const params = lastComplianceParams.value;
      bizParams = {
        file_url: params?.file_url || uploadedFileUrl.value,
        query: params?.query || getReviewQuery(),
        ancestorScope: scopesData.value.ancestorScope || [],
        descendantScope: scopesData.value.descendantScope || [],
        reviewContext: params ? buildReviewContext(params) : undefined,
      };
    } else if (activeTab.value === '辅助起草') {
      bizParams = {
        query: queryText,
        ancestorScope: scopesData.value.ancestorScope || [],
        descendantScope: scopesData.value.descendantScope || [],
      };
    } else {
      bizParams = {
        query: queryText,
        ancestorScope: scopesData.value.ancestorScope || [],
        descendantScope: scopesData.value.descendantScope || [],
        user: scopesData.value.user || '1',
      };
    }

    const workflowCode = getWorkflowCodeByTab(activeTab.value);
    const taskData = await createWorkflowTask(workflowCode, bizParams, messageId);
    if (activeTab.value === '合规审核') {
      void saveReviewContextSnapshot(messageId, lastComplianceParams.value, { taskId: taskData.taskId });
    }
    const chat = chatStore.getChatSession(activeChatId.value!);
    /** 封装当前模块内的业务逻辑：userMessageForTask。 */
    const userMessageForTask = chat?.messages.find((message: any) => message.id === `user_${messageId}`);
    const task: ResumableStreamTask = {
      taskId: taskData.taskId,
      sessionId: taskData.sessionId || currentConversationUuid.value,
      qaId: taskData.qaId || messageId,
      messageId: taskData.qaId || messageId,
      functionId: taskData.functionId || workflowCode,
      tabName: activeTab.value,
      status: taskData.status || 'pending',
      lastEventId: Number(taskData.lastEventId || 0),
      answerEventId: Number(taskData.answerEventId || taskData.answer_event_id || 0),
      updatedAt: Date.now(),
      createdAt: Date.now(),
      title: chat?.title,
      userContent: userMessageForTask?.content || queryText,
      answerContent: '',
      reasoningContent: '',
      metadata: activeTab.value === '合规审核' && lastComplianceParams.value
        ? buildComplianceMetadata(lastComplianceParams.value)
        : undefined,
    };

    upsertStreamTask(task, true);
    updateTaskMessage(task, { status: task.status, eventId: task.lastEventId, answerEventId: task.answerEventId });
    await subscribeStreamTask(task.taskId);
  } catch (error: any) {
    handleStreamError(messageId, error?.message || '创建流式任务失败');
  }
};

/** 处理用户交互或组件事件：handleRegenerate。 */
const handleRegenerate = (payload: RegeneratePayload) => {
  if (isStreaming.value) {
    stopStream();
  }

  const content = typeof payload === 'string' ? payload : payload.content;

  if (activeTab.value === '合规审核') {
    const payloadParams =
      typeof payload === 'string'
        ? null
        : normalizeComplianceParams(payload.complianceParams);
    const sessionParams = getComplianceParamsFromSession(
      chatStore.getChatSession(activeChatId.value),
    );
    const params = payloadParams || lastComplianceParams.value || sessionParams;

    if (params) {
      lastComplianceParams.value = params;
      handleComplianceReview();
    } else {
      ElMessage.error('没有找到审核参数，无法重新审核');
    }
  } else {
    // 非合规审核，正常重新生成
    handleSendMessage(content);
  }
};

// 处理合规审核的专用函数
const handleComplianceReview = async () => {
  if (!lastComplianceParams.value) {
    ElMessage.warning('没有找到上一次审核的参数');
    return;
  }

  try {
    lastComplianceParams.value = await refreshComplianceParamsFileUrl(
      lastComplianceParams.value,
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '重新上传文件失败');
    return;
  }

  // 修改：为重新审核生成详细的用户消息内容
  const displayDimensions = getActualReviewDimensions(
    lastComplianceParams.value.dimensions,
  );

  const userMessageContent = `${lastComplianceParams.value.fileName}\n审核维度：${displayDimensions.join('、')}`;

  if (!activeChatId.value) {
    await createChatForMessage();
  }

  const chat = chatStore.getChatSession(activeChatId.value!);
  if (!chat) return;

  if (!currentConversationUuid.value) {
    currentConversationUuid.value = generateUUID();
    (chat as any).conversationUuid = currentConversationUuid.value;
  }

  const qaId = generateUUID();

  // 添加用户消息
  const userMessage: ChatMessage = {
    id: `user_${qaId}`,
    role: 'user',
    content: userMessageContent, // 使用新的消息内容
    timestamp: new Date() as any,
    metadata: buildComplianceMetadata(lastComplianceParams.value),
  };

  chat.messages.push(userMessage);

  // 如果是第一条消息，更新标题
  if (chat.messages.length === 1) {
    const newTitle = `重新审核: ${lastComplianceParams.value.fileName}`;
    chat.title = newTitle;

    /** 封装当前模块内的业务逻辑：historyItem。 */
    const historyItem = chatStore.historyList.find((h: any) => h.id === chat.id);
    if (historyItem) {
      historyItem.title = newTitle;
      historyItem.preview = `${lastComplianceParams.value.fileName}的重新审核`;
    }
  }

  // 添加AI消息占位符
  const aiMessageId = qaId;
  const aiMessage: ChatMessage = {
    id: aiMessageId,
    role: 'assistant',
    content: '',
    reasoning: '',
    timestamp: new Date() as any,
    streaming: true,
    metadata: buildComplianceMetadata(lastComplianceParams.value),
  };
  chat.messages.push(aiMessage);
  chatStore.updateHistoryItem(activeChatId.value!, {
    preview: userMessageContent, // 使用新的消息内容作为预览
    time: Date.now(),
  });
  resetStreamState();
  currentStreamingMessageId.value = aiMessageId;
  await saveReviewContextSnapshot(qaId, lastComplianceParams.value);
  // 使用保存的参数开始流式输出
  await startComplianceStream(aiMessageId);
  scrollToBottom();
};

// 审核的流式请求函数
const startComplianceStream = async (messageId: string) => {
  if (!lastComplianceParams.value) {
    ElMessage.error('没有找到审核参数，无法重新审核');
    handleStreamError(messageId, '审核参数缺失');
    return;
  }

  await startStream(lastComplianceParams.value.query, messageId);
};

const appendModelOutputText = async (
  text: string,
  messageId: string,
  context?: { functionId?: string; tabName?: string },
) => {
  if (!text) return;

  let displayText = text;

  // 首次展示前先缓存模型 text，直到累计内容中出现 "\n\n"
  if (!answerOutputStarted) {
    answerPendingText += text;
    const firstDoubleNewlineIndex = answerPendingText.indexOf('\n\n');
    if (firstDoubleNewlineIndex === -1) {
      return;
    }
    answerOutputStarted = true;
    // 从首次 "\n\n" 位置开始展示，保留 "\n\n" 本身，丢弃其前面的模型前置内容
    displayText = answerPendingText.slice(firstDoubleNewlineIndex);
    answerPendingText = '';
  }
  currentAnswer.value += displayText;
  currentAnswer.value = stripReviewProgressText(currentAnswer.value, context);
  const chat = chatStore.getChatSession(activeChatId.value!);
  if (chat) {
    /** 封装当前模块内的业务逻辑：msg。 */
    const msg = chat.messages.find((m: any) => m.id === messageId);
    if (msg) msg.content = currentAnswer.value;
  }

  await nextTick();
  scrollToBottom();
};

const flushPendingModelOutput = (
  messageId: string,
  context?: { functionId?: string; tabName?: string },
) => {
  if (answerOutputStarted || !answerPendingText) return;

  answerOutputStarted = true;
  currentAnswer.value += answerPendingText;
  currentAnswer.value = stripReviewProgressText(currentAnswer.value, context);
  answerPendingText = '';

  const chat = chatStore.getChatSession(activeChatId.value!);
  if (chat) {
    /** 封装当前模块内的业务逻辑：msg。 */
    const msg = chat.messages.find((m: any) => m.id === messageId);
    if (msg) msg.content = currentAnswer.value;
  }
};

/** 封装当前模块内的业务逻辑：processStreamChunk。 */
const processStreamChunk = async (chunk: any, messageId: string, taskId?: string) => {
  // V12 后端会将每条 SSE data 包装为 { code,msg,request_id,trace_id,data }；
  // 这里先解包，兼容旧 AgentArts 原始 event 格式。
  if (chunk && Object.prototype.hasOwnProperty.call(chunk, 'code')) {
    if (!isApiSuccessCode(chunk.code)) {
      throw new Error(getApiMessage(chunk, '智能体响应异常'));
    }
    chunk = chunk.data || {};
  }

  if (taskId) {
    const task = activeStreamTasks.value[taskId];
    if (!task) return;

    const payload = chunk.payload || {};
    const payloadData = payload.data || {};
    const eventId = Number(chunk.eventId || task.lastEventId || 0);
    const incomingAnswerEventId = toSafeEventId(
      chunk.answerEventId ??
        chunk.answer_event_id ??
        payload.answerEventId ??
        payload.answer_event_id ??
        payloadData.answerEventId ??
        payloadData.answer_event_id,
    );
    const payloadEvent = payload.event || payload.event_type || '';
    const eventType = chunk.eventType || payloadEvent || '';
    const normalizedStatus = chunk.status || payload.status || task.status;
    let nextTask: ResumableStreamTask = {
      ...task,
      status: eventType === 'done' ? normalizedStatus : normalizedStatus || task.status,
      lastEventId: eventId || task.lastEventId,
      answerEventId: incomingAnswerEventId || task.answerEventId || 0,
      updatedAt: Date.now(),
    };

    const reasoningText = payloadData.reasoning_content || payload.reasoning_content || '';
    if (reasoningText) {
      currentReasoning.value += reasoningText;
      nextTask = { ...nextTask, reasoningContent: currentReasoning.value };
      updateTaskMessage(nextTask, { reasoning: currentReasoning.value });
      await nextTick();
      scrollToBottom();
    }

    const text =
      typeof chunk.content === 'string'
        ? chunk.content
        : payloadData.text || payloadData.content || payload.text || payload.content || '';
    if (text && !sourceOnlyReplayTaskIds.has(taskId)) {
      await appendModelOutputText(text, messageId, { functionId: task.functionId, tabName: task.tabName });
      nextTask = { ...nextTask, answerContent: currentAnswer.value, answerEventId: eventId || nextTask.answerEventId || task.answerEventId || 0 };
    }

    upsertStreamTask(nextTask);
    updateTaskMessage(nextTask, {
      status: nextTask.status,
      eventId: nextTask.lastEventId,
      answerEventId: nextTask.answerEventId,
      content: nextTask.answerContent,
      reasoning: nextTask.reasoningContent,
    });

    if (isWorkflowFinishedEvent(eventType, payloadEvent, payload)) {
      const sources = extractSourcesFromWorkflowPayload(payload, payloadData, chunk);
      if (sources.length > 0) {
        nextTask = { ...nextTask, sources };
        updateTaskMessage(nextTask, { sources });
        upsertStreamTask(nextTask, true);
      }
      void persistCompletedConversationForTask(nextTask);
    }

    if (eventType === 'error') {
      const message = payload.message || payload.error_msg || payload.error_reason || '工作流执行失败';
      handleStreamError(messageId, message, taskId);
      return;
    }

    if (eventType === 'done' || isTerminalTaskStatus(chunk.status || eventType)) {
      const finalAnswerContent = stripReviewProgressText(
        typeof chunk.answerContent === 'string' ? chunk.answerContent : '',
        { functionId: task.functionId, tabName: task.tabName },
      );
      const finalAnswerEventId = incomingAnswerEventId || nextTask.answerEventId || eventId || task.lastEventId || 0;
      const finalSources = extractSourcesFromWorkflowPayload(payload, payloadData, chunk);
      if (finalSources.length > 0) {
        nextTask = { ...nextTask, sources: finalSources };
        updateTaskMessage(nextTask, { sources: finalSources });
      }

      // 结束事件里的 answerContent 是后端最终快照，正文已在前面的流式 text 事件中逐字追加。
      // 这里只同步事件游标和来源，不再回写最终快照，避免流式输出完成后又显示一遍最终回复。
      if (!sourceOnlyReplayTaskIds.has(taskId) && finalAnswerContent) {
        nextTask = {
          ...nextTask,
          answerContent: currentAnswer.value || nextTask.answerContent,
          answerEventId: finalAnswerEventId,
        };
        upsertStreamTask(nextTask, true);
        updateTaskMessage(nextTask, {
          eventId: nextTask.lastEventId,
          answerEventId: finalAnswerEventId,
          sources: nextTask.sources,
        });
      } else if (finalSources.length > 0) {
        upsertStreamTask(nextTask, true);
      }
      finishStream(messageId, taskId, chunk.status || eventType);
    }
    return;
  }

  if (chunk.event === 'error') {
    const message =
      chunk.data?.message ||
      chunk.data?.error_msg ||
      chunk.data?.error_reason ||
      '工作流执行失败';
    throw new Error(message);
  }

  if (chunk.event === 'message' && chunk.data?.reasoning_content) {
    currentReasoning.value += chunk.data.reasoning_content;
    const chat = chatStore.getChatSession(activeChatId.value!);
    if (chat) {
      /** 封装当前模块内的业务逻辑：msg。 */
      const msg = chat.messages.find((m: any) => m.id === messageId);
      if (msg) msg.reasoning = currentReasoning.value;
    }
    await nextTick();
    scrollToBottom();
  }

  if (chunk.event === 'message' && chunk.data?.text) {
    await appendModelOutputText(chunk.data.text, messageId, { tabName: activeTab.value });
  }

  if (chunk.event === 'workflow_finished') {
    try {
      flushPendingModelOutput(messageId, { tabName: activeTab.value });
      const chat = chatStore.getChatSession(activeChatId.value!);
      if (!chat || chat.messages.length < 2) return;
      const userMessage = chat.messages[chat.messages.length - 2];
      const assistantMessage = chat.messages[chat.messages.length - 1];
      const sources = extractSourcesFromWorkflowPayload(chunk, chunk.data || {}, chunk);
      if (sources.length > 0) {
        assistantMessage.sources = sources;
      }
      if ((chunk as any).taskId && !assistantMessage.taskId) {
        assistantMessage.taskId = (chunk as any).taskId;
      }
      await chatStore.saveConversationToServer(
        currentConversationUuid.value,
        messageId,
        userMessage,
        assistantMessage,
        assistantMessage.vote === 'like' ? 1 : 0,
        assistantMessage.vote === 'dislike' ? 1 : 0,
      );
    } catch {}
  }
};

/** 处理用户交互或组件事件：handleLogout。 */
const handleLogout = async () => {
  detachStreamSubscription();
  await userStore.logout();
  router.replace({ path: '/login', query: { redirect: route.fullPath } });
};

/** 处理用户交互或组件事件：handleTabChange。 */
const handleTabChange = async (tab: string) => {
  if (tab !== activeTab.value) {
    const canLeave = await confirmLeaveStreamingIfNeeded('切换功能窗口');
    if (!canLeave) return false;
  }

  detachStreamSubscription();
  activeTab.value = tab;
  chatStore.setCurrentActiveTab(tab);
  resetCurrentChat();
  isSourcesPanelVisible.value = false;
  if (tab !== '合规审核') {
    lastComplianceParams.value = null;
  }

  const routeMap: Record<string, string> = {
    智能问答: '/intelligent-qa',
    智能检索: '/intelligent-retrieval',
    辅助起草: '/auxiliary-draft',
    合规审核: '/compliance-review',
  };

  const targetRoute = routeMap[tab];
  if (targetRoute && route.path !== targetRoute) {
    await router.push(targetRoute);
  }
  return true;
};
/** 封装当前模块内的业务逻辑：finishStream。 */
const finishStream = (messageId: string, taskId?: string, status = 'completed') => {
  const task = taskId ? activeStreamTasks.value[taskId] : getTaskByMessageId(messageId);
  flushPendingModelOutput(messageId, { functionId: task?.functionId, tabName: task?.tabName });
  const sessionId = task?.sessionId || activeChatId.value;
  const chat = chatStore.getChatSession(sessionId);
  if (chat) {
    /** 封装当前模块内的业务逻辑：message。 */
    const message = chat.messages.find((m: any) => m.id === messageId || m.taskId === taskId);
    if (message) {
      message.streaming = false;
      message.taskStatus = status;
      if (taskId) message.taskId = taskId;

      /** 封装当前模块内的业务逻辑：historyItem。 */
      const historyItem = chatStore.historyList.find((h: any) => h.id === sessionId);
      if (historyItem && chat.messages.length === 2) {
        const firstQuestion = chat.messages[0].content;
        historyItem.preview =
          firstQuestion.length > 50 ? firstQuestion.substring(0, 50) + '...' : firstQuestion;
      }
    }
  }

  if (task) {
    void persistCompletedConversationForTask({ ...task, status, answerContent: chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId)?.content || task.answerContent || '', reasoningContent: chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId)?.reasoning || task.reasoningContent || '', sources: (chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId) as any)?.sources || task.sources || [] });
  }
  if (taskId) removeStreamTask(taskId);
  isStreaming.value = false;
  currentStreamingMessageId.value = null;
  resetStreamState();
  scrollToBottom();
};

/** 处理用户交互或组件事件：handleStreamError。 */
const handleStreamError = (messageId: string, errorMessage: string, taskId?: string) => {
  const task = taskId ? activeStreamTasks.value[taskId] : getTaskByMessageId(messageId);
  const sessionId = task?.sessionId || activeChatId.value;
  const chat = chatStore.getChatSession(sessionId);
  if (chat) {
    /** 封装当前模块内的业务逻辑：message。 */
    const message = chat.messages.find((m: any) => m.id === messageId || m.taskId === taskId);
    if (message) {
      message.content = `抱歉，回答过程中出现错误：${errorMessage}`;
      message.streaming = false;
      message.taskStatus = 'error';
      if (taskId) message.taskId = taskId;
    }
  }
  if (task) {
    void persistCompletedConversationForTask({ ...task, status: 'error', answerContent: chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId)?.content || task.answerContent || '', reasoningContent: chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId)?.reasoning || task.reasoningContent || '', sources: (chat?.messages.find((m: any) => m.id === messageId || m.taskId === taskId) as any)?.sources || task.sources || [] });
  }
  if (taskId) removeStreamTask(taskId);
  isStreaming.value = false;
  currentStreamingMessageId.value = null;
  resetStreamState();
};

/** 停止当前输出或任务：stopStream。 */
const stopStream = () => {
  const messageId = currentStreamingMessageId.value;
  const task = getTaskByMessageId(messageId);
  if (task) {
    void stopTaskOnServer(task.taskId);
    removeStreamTask(task.taskId);
  }

  if (abortController) {
    abortController.abort();
  }
  if (messageId) {
    const sessionId = task?.sessionId || activeChatId.value;
    const chat = chatStore.getChatSession(sessionId);
    if (chat) {
      /** 封装当前模块内的业务逻辑：message。 */
      const message = chat.messages.find((m: any) => m.id === messageId || m.taskId === task?.taskId);
      if (message) {
        message.streaming = false;
        message.taskStatus = 'stopped';
        if (message.content === '') {
          message.content = '用户停止了生成';
        }
      }
    }
  }
  isStreaming.value = false;
  currentStreamingMessageId.value = null;
  resetStreamState();
};

/** 重置组件状态：resetStreamState。 */
const resetStreamState = () => {
  currentReasoning.value = '';
  currentAnswer.value = '';
  answerOutputStarted = false;
  answerPendingText = '';
  abortController = null;
};

/** 封装当前模块内的业务逻辑：scrollToBottom。 */
const scrollToBottom = () => {
  nextTick(() => {
    /** 封装当前模块内的业务逻辑：scrollContainers。 */
    const scrollContainers = () => {
      const containers = [
        document.querySelector('.dynamic-content'),
        document.querySelector('.conversation-history'),
        document.querySelector('.intelligent-qa'),
      ];

      for (const container of containers) {
        if (!container) continue;
        try {
          container.scrollTop = container.scrollHeight;
        } catch {}
      }

      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'auto',
      });
    };

    requestAnimationFrame(() => {
      scrollContainers();
      requestAnimationFrame(scrollContainers);
    });
  });
};

/** 查询远端数据并更新页面：queryConversationsForCurrentRoute。 */
const queryConversationsForCurrentRoute = async () => {
  const routeToTabMap: Record<string, string> = {
    '/intelligent-qa': '智能问答',
    '/intelligent-retrieval': '智能检索',
    '/auxiliary-draft': '辅助起草',
    '/compliance-review': '合规审核',
  };

  const matchedTab = routeToTabMap[route.path];
  if (matchedTab) {
    activeTab.value = matchedTab;
    chatStore.setCurrentActiveTab(matchedTab);
    await chatStore.queryConversationsByFunc();
  }
};

/** 获取并归一化业务数据：getTabByFunctionId。 */
const getTabByFunctionId = (functionId?: string) => {
  const map: Record<string, string> = {
    qa: '智能问答',
    search: '智能检索',
    draft: '辅助起草',
    review: '合规审核',
  };
  return map[functionId || ''] || activeTab.value;
};

/** 获取并归一化业务数据：getRouteByTabName。 */
const getRouteByTabName = (tabName: string) => {
  const routeMap: Record<string, string> = {
    智能问答: '/intelligent-qa',
    智能检索: '/intelligent-retrieval',
    辅助起草: '/auxiliary-draft',
    合规审核: '/compliance-review',
  };
  return routeMap[tabName] || '/intelligent-qa';
};

/** 处理用户交互或组件事件：handleSearchHistory。 */
const handleSearchHistory = async (keyword: string) => {
  historySearchKeyword.value = keyword;
  if (!keyword.trim()) {
    historySearchResults.value = [];
    return;
  }

  historySearchLoading.value = true;
  try {
    const result = await chatStore.searchHistoryMessages(
      keyword,
      chatStore.getFuncIdByTab(activeTab.value),
      1,
      20,
    );
    historySearchResults.value = result.success ? result.data : [];
    if (!result.success && result.message) ElMessage.warning(result.message);
  } finally {
    historySearchLoading.value = false;
  }
};

/** 处理用户交互或组件事件：handleClearHistorySearch。 */
const handleClearHistorySearch = () => {
  historySearchKeyword.value = '';
  historySearchResults.value = [];
};

/** 封装当前模块内的业务逻辑：scrollToMessage。 */
const scrollToMessage = (messageId?: string) => {
  if (!messageId) return;
  nextTick(() => {
    const node = document.querySelector(`[data-message-id="${messageId}"]`);
    if (node) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      node.classList.add('history-search-hit');
      window.setTimeout(() => node.classList.remove('history-search-hit'), 1600);
    }
  });
};

/** 处理用户交互或组件事件：handleSelectSearchResult。 */
const handleSelectSearchResult = async (result: any) => {
  const sessionId = result.sessionId || result.session_id || result.id;
  if (!sessionId) return;
  const targetTab = getTabByFunctionId(result.functionId || result.function_id);
  const targetRoute = getRouteByTabName(targetTab);

  if (activeTab.value !== targetTab) {
    activeTab.value = targetTab;
    chatStore.setCurrentActiveTab(targetTab);
  }

  if (route.path !== targetRoute) {
    await router.push({ path: targetRoute, query: { id: sessionId, qaId: result.qaId || result.qa_id || '' } });
  }

  await handleSelectChat(sessionId);
  scrollToMessage(result.qaId || result.qa_id);
};

/** 处理用户交互或组件事件：handleUpdateTitle。 */
const handleUpdateTitle = async (chatId: string, newTitle: string) => {
  try {
    const success = await chatStore.updateSessionTitle(chatId, newTitle);
    if (success) {
      ElMessage.success('标题修改成功');
    } else {
      ElMessage.error('标题更新失败');
    }
  } catch {}
};

// 计算输入框容器样式
const inputContainerStyle = computed(() => {
  if (isSourcesPanelVisible.value) {
    return {
      width: '62%',
      marginRight: '30%',
      // 不设置 margin: auto，通过移除 auto 类来实现
    };
  } else {
    return {
      width: '80%',
      margin: '0 auto 30px',
    };
  }
});

// 新增事件处理函数
const handleSourcesPanelToggle = (visible: boolean) => {
  isSourcesPanelVisible.value = visible;
};

// 处理置顶/取消置顶
const handleTogglePin = async (chatId: string, topStatus: number) => {
  try {
    const funcId = chatStore.getFuncIdByTab(activeTab.value);
    const payload = {
      sessionId: chatId,
      functionId: funcId,
      topStatus: topStatus,
    };
    const response = await authRequest({
      url: API.chat.pin,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      data: payload,
    });

    if (!isSuccessStatus(response.status)) {
      throw new Error(`HTTP错误! 状态: ${response.status}`);
    }
    const result = response.data;
    // 更新本地数据
    const historyItem = chatStore.historyList.find((item: any) => item.id === chatId);
    if (historyItem) {
      historyItem.topStatus = result.data.topStatus;
    }
    const session = chatStore.chatSessions[chatId];
    if (session) {
      session.topStatus = result.data.topStatus;
    }
    ElMessage.success(topStatus === 1 ? '已置顶' : '已取消置顶');
  } catch (error) {
    ElMessage.error('操作失败，请重试');
  }
};

/** 获取并归一化业务数据：getLatestResumableTaskForFunction。 */
const getLatestResumableTaskForFunction = (functionId: string) =>
  Object.values(activeStreamTasks.value)
    .filter((task) => task.functionId === functionId && !isTerminalTaskStatus(task.status))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;

/** 封装当前模块内的业务逻辑：restorePreferredSessionForCurrentRoute。 */
const restorePreferredSessionForCurrentRoute = async () => {
  const currentFunctionId = chatStore.getFuncIdByTab(activeTab.value);
  const resumableTask = getLatestResumableTaskForFunction(currentFunctionId);
  if (resumableTask) {
    await handleSelectChat(resumableTask.sessionId);
    return true;
  }

  const lastSessionId = getLastActiveSession(currentFunctionId);
  if (lastSessionId && chatStore.getChatSession(lastSessionId)) {
    await handleSelectChat(lastSessionId);
    return true;
  }

  return false;
};

// 修改：使用标志位确保只自动创建一次
let hasAutoCreated = false;

/** 处理用户交互或组件事件：handleBeforeUnload。 */
const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  persistStreamTasks(true);
  if (getCurrentActiveRunningTask()) {
    event.preventDefault();
    event.returnValue = '';
  }
};

onMounted(async () => {
  if (!showFullLayout.value) return;
  window.addEventListener('beforeunload', handleBeforeUnload);
  loadPersistedStreamTasks();
  await queryConversationsForCurrentRoute();

  const sessionId = route.query.id as string;
  const fromCollections = route.query.from === 'collections';

  if (sessionId && fromCollections) {
    await handleSelectChat(sessionId);
  } else if (sessionId) {
    await handleSelectChat(sessionId);
  } else {
    await restorePreferredSessionForCurrentRoute();
  }

  if (
    chatStore.historyList.length === 0 &&
    !activeChatId.value &&
    !hasAutoCreated
  ) {
    hasAutoCreated = true; // 设置标志位
    handleNewChat();
  }
});

watch(
  () => route.fullPath,
  async () => {
    if (!showFullLayout.value) return;
    await queryConversationsForCurrentRoute();

    const sessionId = route.query.id as string;
    const fromCollections = route.query.from === 'collections';

    if (sessionId && fromCollections) {
      await handleSelectChat(sessionId);
    } else if (sessionId) {
      await handleSelectChat(sessionId);
    } else {
      detachStreamSubscription();
      resetCurrentChat();

      const restored = await restorePreferredSessionForCurrentRoute();
      if (!restored &&
        route.path === '/intelligent-qa' &&
        chatStore.historyList.length === 0 &&
        !activeChatId.value &&
        !hasAutoCreated // 检查标志位
      ) {
        hasAutoCreated = true; // 设置标志位
        handleNewChat();
      }
    }
  },
  { immediate: false },
);

onUnmounted(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    persistStreamTasks(true);
    detachStreamSubscription(false);
  });
  return {
    activeChatId,
    activeTab,
    currentAnswer,
    currentChatData,
    currentReasoning,
    currentStreamingMessageId,
    customUpload,
    filteredHistory,
    handleClearHistory,
    handleDeleteChat,
    handleLogout,
    handleNewChat,
    handleRegenerate,
    handleSelectAll,
    handleSelectChat,
    handleSendMessage,
    handleSearchHistory,
    handleClearHistorySearch,
    handleSelectSearchResult,
    handleSourcesPanelToggle,
    handleTabChange,
    handleToggleFavorite,
    handleTogglePin,
    handleUpdateTitle,
    inputContainerStyle,
    historySearchKeyword,
    historySearchResults,
    historySearchLoading,
    inputPlaceholder,
    isHistoryChatActive,
    isSendDisabled,
    isSelectingHistoryChat,
    isSourcesPanelVisible,
    isStreaming,
    selectedDimensions,
    showFullLayout,
    sidebarCollapsed,
    stopStream,
    toggleSidebar,
    uploadedFileMeta,
    uploadedFileName,
    userStore,
  };
}
