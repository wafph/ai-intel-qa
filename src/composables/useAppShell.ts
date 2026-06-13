/**
 * 主应用壳组合函数，集中维护会话、流式任务、刷新恢复、文件上传和四类智能体交互。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
import { ref, computed, onMounted, nextTick, onUnmounted, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useChatStore } from '@/stores/chat';
import { useUserStore } from '@/stores/user';
import type { ChatMessage, ChatSession, HistoryItem } from '@/types/chat';
import { ElLoading, ElMessage, ElMessageBox } from 'element-plus';
import { authRequest, getEventStream, isSuccessStatus, request } from '@/services/http';
import { API, getWorkflowCodeByTab } from '@/api/api';
import { getAgentToken } from '@/services/authStorage';
import { getApiData, getApiMessage, isApiSuccessCode } from '@/services/response';
import { extractSourcesFromAny } from '@/services/sourceUtils';
import { stripReviewProgressText } from '@/services/reviewProgress';
import {
  bindReviewPdfFile,
  buildTxtFileFromPdfParsedText,
  isPdfFile,
  prepareReviewPdf,
  detectReviewPdf,
} from '@/services/reviewPdfPrepare';
import {
  containsUpstreamErrorText,
  getFrontendFallbackErrorMessage,
  sanitizeAgentText,
  toUserSafeAgentErrorMessage,
} from '@/services/errorSanitizer';

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
  pdfContextId?: string;
  pdfType?: string;
  sourceFileUrl?: string;
  parsedTxtUrl?: string;
  parsedMarkdownUrl?: string;
  locatorMode?: string;
  locatorAvailable?: boolean;
  locatorUnavailableReason?: string;
  reviewFileUrl?: string;
  textSource?: string;
};



type ComplianceUploadResult = {
  rawResult?: any;
  fileName: string;
  fileUrl: string;
  originalText: string;
  fileType: string;
  fileSize: number;
  uploadFileId?: string;
  pdfContextId?: string;
  pdfType?: string;
  sourceFileUrl?: string;
  parsedTxtUrl?: string;
  parsedMarkdownUrl?: string;
  locatorMode?: string;
  locatorAvailable?: boolean;
  locatorUnavailableReason?: string;
  reviewFileUrl?: string;
  textSource?: string;
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
const uploadedFileExtraMeta = ref<Partial<ComplianceReviewParams>>({});
const selectedDimensions = ref<string[]>([]);
const isComplianceFileProcessing = ref(false);
const complianceFileProcessingText = ref('');
const isComplianceRegenerating = ref(false);
const isComplianceSubmitting = ref(false);
const REVIEW_DIMENSIONS = ['合规性', '冲突性', '文本规范性'];
const SELECT_ALL_DIMENSION = '全选';
const COMPLIANCE_PROCESSING_DISPLAY_TEXT = '文件正在解析中，请稍候...';

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

/** 去掉常见文件后缀，保证刷新前后的审核历史标题格式一致。 */
const stripFileExtension = (fileName = '') => {
  const normalized = String(fileName || '').trim().split('/').pop()?.split('\\').pop() || '';
  return normalized.replace(/\.[A-Za-z0-9]{1,8}$/, '').trim() || '合规审核文件';
};

const buildDimensionText = (dimensions: string[] = selectedDimensions.value) => {
  const displayDimensions = getActualReviewDimensions(dimensions);
  return displayDimensions.length ? displayDimensions.join('、') : '未选择审核维度';
};

/** 构造用于会话标题、历史 preview 和后台 questionContent 的审核展示文本。 */
const buildComplianceQuestionContent = (fileName: string, dimensions: string[] = selectedDimensions.value) => {
  return `${stripFileExtension(fileName)}
审核维度：${buildDimensionText(dimensions)}`;
};

/** 左侧历史标题统一采用“文件名（不含后缀）+ 审核维度”，避免刷新前后显示不一致。 */
const buildComplianceSessionTitle = (fileName: string, dimensions: string[] = selectedDimensions.value) => {
  return `${stripFileExtension(fileName)}｜${buildDimensionText(dimensions)}`;
};

const applySessionTitle = (sessionId: string, title?: string, preview?: string) => {
  const normalizedTitle = String(title || '').trim();
  if (!sessionId || !normalizedTitle) return;
  const session = chatStore.getChatSession(sessionId);
  if (session) session.title = normalizedTitle;
  chatStore.updateHistoryItem(sessionId, {
    title: normalizedTitle,
    sessionTitle: normalizedTitle,
    ...(preview !== undefined ? { preview } : {}),
  } as any);
};

const getSafeAgentErrorMessage = () => getFrontendFallbackErrorMessage();

const toUserSafeErrorMessage = (errorOrMessage: any, fallback = getSafeAgentErrorMessage()) =>
  toUserSafeAgentErrorMessage(errorOrMessage, fallback);

/** 标准化后端/历史数据结构：normalizeComplianceParams。 */
const normalizeComplianceParams = (params: any): ComplianceReviewParams | null => {
  if (!params) return null;

  const reviewContext = params.reviewContext || params.review_context || {};
  const reviewParams = params.reviewParams || params.review_params || reviewContext.reviewParams || reviewContext.review_params || {};
  const source = { ...reviewContext, ...reviewParams, ...params };
  const fileUrl =
    source.file_url ||
    source.fileUrl ||
    source.reviewFileUrl ||
    source.review_file_url ||
    source.url ||
    '';
  const rawQuery =
    source.query ||
    source.reviewDimension ||
    source.review_dimension ||
    source.auditDimension ||
    source.audit_dimension ||
    '';

  const dimensions = Array.isArray(source.dimensions)
    ? getActualReviewDimensions(source.dimensions)
    : String(rawQuery)
        .split(/[,，、]/)
        .map((item) => item.trim())
        .filter(Boolean);
  const query = dimensions.length ? dimensions.join(',') : String(rawQuery || '').trim();

  if (!fileUrl || !query) return null;

  return {
    file_url: fileUrl,
    query,
    dimensions,
    fileName: source.fileName || source.file_name || source.name || '合规审核文件',
    originalText: source.originalText || source.original_text || source.parsedText || source.parsed_text || '',
    fileType: source.fileType || source.file_type,
    fileSize: source.fileSize || source.file_size,
    fileUrl: source.fileUrl || source.file_url || source.url || fileUrl,
    uploadFileId: source.uploadFileId || source.upload_file_id || source.fileId || source.file_id,
    originalHtml: source.originalHtml || source.original_html || '',
    pdfContextId: source.pdfContextId || source.pdf_context_id || source.contextId || source.context_id,
    pdfType: source.pdfType || source.pdf_type,
    sourceFileUrl: source.sourceFileUrl || source.source_file_url || source.originalPdfUrl || source.original_pdf_url,
    parsedTxtUrl: source.parsedTxtUrl || source.parsed_txt_url,
    parsedMarkdownUrl: source.parsedMarkdownUrl || source.parsed_markdown_url,
    locatorMode: source.locatorMode || source.locator_mode,
    locatorAvailable: typeof source.locatorAvailable === 'boolean' ? source.locatorAvailable : source.locator_available,
    locatorUnavailableReason: source.locatorUnavailableReason || source.locator_unavailable_reason,
    reviewFileUrl: source.reviewFileUrl || source.review_file_url || fileUrl,
    textSource: source.textSource || source.text_source,
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
  pdfContextId: params.pdfContextId,
  pdfType: params.pdfType,
  sourceFileUrl: params.sourceFileUrl,
  parsedTxtUrl: params.parsedTxtUrl,
  parsedMarkdownUrl: params.parsedMarkdownUrl,
  locatorMode: params.locatorMode,
  locatorAvailable: params.locatorAvailable,
  locatorUnavailableReason: params.locatorUnavailableReason,
  reviewFileUrl: params.reviewFileUrl,
  textSource: params.textSource,
  reviewParams: { ...params },
});

/** 构造请求载荷或业务上下文：buildComplianceMetadata。 */
const buildComplianceMetadata = (params: ComplianceReviewParams) => ({
  complianceOriginalText: params.originalText,
  complianceFileName: params.fileName,
  complianceFileNameWithoutExt: stripFileExtension(params.fileName),
  complianceDimensionText: buildDimensionText(params.dimensions),
  complianceParams: { ...params },
  reviewContext: buildReviewContext(params),
  pdfContextId: params.pdfContextId,
  pdfType: params.pdfType,
  sourceFileUrl: params.sourceFileUrl,
  parsedTxtUrl: params.parsedTxtUrl,
  parsedMarkdownUrl: params.parsedMarkdownUrl,
  locatorMode: params.locatorMode,
  locatorAvailable: params.locatorAvailable,
  locatorUnavailableReason: params.locatorUnavailableReason,
  reviewFileUrl: params.reviewFileUrl,
  textSource: params.textSource,
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
  // 重新审核优先复用上次审核已经得到的 file_url，避免 PDF 重新走 mineru 解析。
  if (params.file_url && !isTemporaryFileUrlExpired(params.file_url)) {
    lastComplianceParams.value = params;
    return params;
  }

  const isPdfPreparedText =
    params.fileType === 'pdf' ||
    Boolean(params.pdfContextId) ||
    params.textSource === 'mineru25-pro' ||
    params.locatorMode === 'pdf_text_layer' ||
    params.locatorMode === 'parsed_text_only';

  if (isPdfPreparedText) {
    if (!params.originalText?.trim()) {
      throw new Error('PDF 解析文本不存在，无法重新上传审核文件，请重新上传 PDF');
    }

    complianceFileProcessingText.value = '审核文件链接已过期，正在重新上传 PDF 解析文本...';
    const parsedTxtFile = buildTxtFileFromPdfParsedText(params.originalText, params.fileName || '审核文件.pdf');
    const agentUploadResult = await uploadFileToAgentArts(parsedTxtFile, {
      originalText: params.originalText,
      statusText: '正在重新上传 PDF 解析文本...'
    });

    const refreshedParams: ComplianceReviewParams = {
      ...params,
      file_url: agentUploadResult.fileUrl,
      fileUrl: agentUploadResult.fileUrl,
      uploadFileId: agentUploadResult.uploadFileId || params.uploadFileId,
      reviewFileUrl: agentUploadResult.fileUrl,
    };

    if (params.pdfContextId && agentUploadResult.fileUrl) {
      try {
        await bindReviewPdfFile(params.pdfContextId, {
          review_file_url: agentUploadResult.fileUrl,
          review_file_id: agentUploadResult.uploadFileId,
          review_file_type: 'txt',
          session_id: currentConversationUuid.value || activeChatId.value || undefined,
          user_id: String((userStore.user as any)?.user_id || (userStore.user as any)?.id || '').trim() || undefined,
          agent_upload_response: agentUploadResult.rawResult,
        });
      } catch (error) {
        console.warn('重新审核时绑定 PDF 审核文件 URL 失败:', error);
      }
    }

    lastComplianceParams.value = refreshedParams;
    return refreshedParams;
  }

  const file = uploadedFileRef.value;
  if (!file || file.name !== params.fileName) {
    throw new Error('上传文件链接已过期，请重新上传文件后再审核');
  }

  complianceFileProcessingText.value = '审核文件链接已过期，正在重新上传文件...';
  const uploadResult = await uploadComplianceFile(file);
  const refreshedParams: ComplianceReviewParams = {
    ...params,
    file_url: uploadResult.fileUrl,
    fileName: uploadResult.fileName,
    originalText: uploadResult.originalText || params.originalText,
    fileType: uploadResult.fileType || params.fileType,
    fileSize: uploadResult.fileSize || params.fileSize,
    fileUrl: uploadResult.fileUrl || params.fileUrl,
    uploadFileId: uploadResult.uploadFileId || params.uploadFileId,
    pdfContextId: uploadResult.pdfContextId || params.pdfContextId,
    pdfType: uploadResult.pdfType || params.pdfType,
    sourceFileUrl: uploadResult.sourceFileUrl || params.sourceFileUrl,
    parsedTxtUrl: uploadResult.parsedTxtUrl || params.parsedTxtUrl,
    parsedMarkdownUrl: uploadResult.parsedMarkdownUrl || params.parsedMarkdownUrl,
    locatorMode: uploadResult.locatorMode || params.locatorMode,
    locatorAvailable: typeof uploadResult.locatorAvailable === 'boolean' ? uploadResult.locatorAvailable : params.locatorAvailable,
    locatorUnavailableReason: uploadResult.locatorUnavailableReason || params.locatorUnavailableReason,
    reviewFileUrl: uploadResult.reviewFileUrl || params.reviewFileUrl,
    textSource: uploadResult.textSource || params.textSource,
  };
  lastComplianceParams.value = refreshedParams;
  return refreshedParams;
};

/** 获取并归一化业务数据：getComplianceParamsFromSession。 */
const getComplianceParamsFromSession = (session?: ChatSession | null) => {
  if (!session?.messages) return null;

  for (let index = session.messages.length - 1; index >= 0; index--) {
    const message = session.messages[index] as any;
    const metadata = message.metadata || {};
    const params =
      normalizeComplianceParams(metadata.complianceParams) ||
      normalizeComplianceParams(metadata.reviewContext?.reviewParams || metadata.reviewContext?.review_params) ||
      normalizeComplianceParams(metadata.reviewContext) ||
      normalizeComplianceParams(metadata);
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
const isHistoryListLoading = ref(true);
const historySkeletonShownTabs = new Set<string>();
let skipNextRouteSessionRestore = false;
// 流式相关状态
const isStreaming = ref<boolean>(false);
const currentReasoning = ref<string>('');
const currentAnswer = ref<string>('');
let abortController: AbortController | null = null;
const currentStreamingMessageId = ref<string | null>(null);
let pendingStopSyncPromise: Promise<void> | null = null;

const STREAM_TASK_STORAGE_KEY = 'ai_intel_v12_2_resumable_stream_tasks';
const STOPPED_TASK_STORAGE_KEY = 'ai_intel_v12_2_stopped_stream_tasks';
const LAST_ACTIVE_SESSION_STORAGE_KEY = 'ai_intel_v12_2_last_active_session_by_func';
const STOPPED_TASK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_TASK_STATUSES = ['pending', 'running'];
const TERMINAL_TASK_STATUSES = ['completed', 'error', 'stopped', 'cancelled', 'canceled', 'superseded'];

type ResumableStreamTask = {
  taskId: string;
  sessionId: string;
  qaId: string;
  messageId: string;
  functionId: string;
  tabName: string;
  status: string;
  recoverable?: boolean;
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
// 大模型答案展示控制：若首段存在 <think>...</think>，只展示 </think> 之后的正式内容；没有 think 标签时正常展示。
let answerOutputStarted = false;
let answerPendingText = '';
let locallyStoppedTasksCache: Record<string, number> | null = null;

const getLocallyStoppedTasks = (): Record<string, number> => {
  if (locallyStoppedTasksCache) return locallyStoppedTasksCache;
  try {
    const raw = localStorage.getItem(STOPPED_TASK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    const activeEntries = Object.entries(parsed as Record<string, number>).filter(
      ([taskId, stoppedAt]) =>
        Boolean(taskId) && Number.isFinite(Number(stoppedAt)) && now - Number(stoppedAt) < STOPPED_TASK_TTL_MS,
    );
    const stoppedTasks = Object.fromEntries(activeEntries);
    localStorage.setItem(STOPPED_TASK_STORAGE_KEY, JSON.stringify(stoppedTasks));
    locallyStoppedTasksCache = stoppedTasks;
  } catch {
    locallyStoppedTasksCache = {};
  }
  return locallyStoppedTasksCache;
};

const isTaskLocallyStopped = (taskId?: string) =>
  Boolean(taskId && getLocallyStoppedTasks()[taskId]);

const markTaskLocallyStopped = (taskId: string) => {
  if (!taskId) return;
  locallyStoppedTasksCache = { ...getLocallyStoppedTasks(), [taskId]: Date.now() };
  try {
    localStorage.setItem(STOPPED_TASK_STORAGE_KEY, JSON.stringify(locallyStoppedTasksCache));
  } catch {}
};

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

/** 从 AgentArts 上传接口返回结果中归一化文件 URL。 */
const getFileUrlFromAgentUploadResult = (result: any, fallbackName: string) =>
  result?.url || result?.file_url || result?.fileUrl || result?.data?.url || result?.data?.file_url || fallbackName;

/** 原始 AgentArts 上传逻辑：非 PDF 和 PDF 解析后的 txt 均复用该方法。 */
const uploadFileToAgentArts = async (file: File, options: { originalText?: string; statusText?: string } = {}): Promise<ComplianceUploadResult> => {
  const token = appStore.sharedDataToken;
  if (!token) {
    throw new Error('未找到认证 token');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('is_image', 'false');

  complianceFileProcessingText.value = COMPLIANCE_PROCESSING_DISPLAY_TEXT;
  const localOriginalText =
    options.originalText !== undefined ? options.originalText : await extractReadableFileText(file);

  complianceFileProcessingText.value = COMPLIANCE_PROCESSING_DISPLAY_TEXT;
  const response = await request({
    url: API.agent.uploadFile,
    method: 'POST',
    headers: {
      'X-Auth-Token': token,
    },
    data: formData,
  });

  if (!isSuccessStatus(response.status)) {
    throw new Error(`上传失败: ${response.status}`);
  }

  const result = response.data;
  return {
    rawResult: result,
    fileName: file.name,
    fileUrl: getFileUrlFromAgentUploadResult(result, file.name),
    originalText: getTextFromUploadResult(result) || localOriginalText,
    fileType: file.name.split('.').pop()?.toLowerCase() || file.type || '',
    fileSize: file.size,
    uploadFileId: result?.file_id || result?.fileId || result?.id || result?.data?.file_id || result?.data?.fileId || '',
  };
};

/** PDF 文件预处理：先快速 detect，用户确认后再 mineru 解析文本 -> 前端转 txt -> 复用原 AgentArts 上传获取 file_url。 */
const uploadPdfForComplianceReview = async (file: File): Promise<ComplianceUploadResult> => {
  const sessionId = currentConversationUuid.value || activeChatId.value || undefined;
  const userId = String((userStore.user as any)?.user_id || (userStore.user as any)?.id || '').trim() || undefined;

  complianceFileProcessingText.value = '正在检测 PDF 是否支持原文定位...';
  const detectResult = await detectReviewPdf(file, { sessionId, userId });
  const detectInfo = detectResult?.detect || {};
  const detectPdfInfo = detectResult?.pdf_detect || {};
  const detectLocatorAvailable = Boolean(
    detectInfo.locator_available ?? detectPdfInfo.can_use_pdf_locator,
  );
  const detectReason =
    detectInfo.reason ||
    detectPdfInfo.locator_unavailable_reason ||
    '当前 PDF 为扫描件或非标准 PDF，可能影响原文标记功能。';
  const nonStandardPdfConfirmMessage =
    '当前 PDF 未检测到有效文本层，可能为扫描件或图片型 PDF，无法进行原 PDF 坐标定位，仅支持解析文本展示。';

  if (!detectLocatorAvailable) {
    // 前置检测已结束，弹窗期间不要继续显示“正在检测 PDF 是否支持原文定位”。
    isComplianceFileProcessing.value = false;
    complianceFileProcessingText.value = '';
    await ElMessageBox.confirm(
      nonStandardPdfConfirmMessage,
      'PDF 文件提示',
      {
        confirmButtonText: '继续上传',
        cancelButtonText: '取消重传',
        type: 'warning',
      },
    );
    isComplianceFileProcessing.value = true;
  }

  complianceFileProcessingText.value = COMPLIANCE_PROCESSING_DISPLAY_TEXT;
  const prepareResult = await prepareReviewPdf(file, {
    sessionId,
    userId,
    includeContent: true,
  });

  const parsedText =
    prepareResult?.review_input?.parsed_text ||
    prepareResult?.review_input?.parsed_markdown ||
    '';

  if (!parsedText.trim()) {
    throw new Error('PDF 解析结果为空，无法继续审核');
  }

  const locatorAvailable = Boolean(prepareResult?.original_dispatch?.locator_available);
  const locatorReason = prepareResult?.original_dispatch?.locator_unavailable_reason ||
    detectReason ||
    '当前 PDF 为扫描件或非标准 PDF，无法进行原 PDF 精准定位，仅支持查看原文页面。';

  complianceFileProcessingText.value = COMPLIANCE_PROCESSING_DISPLAY_TEXT;
  const parsedTxtFile = buildTxtFileFromPdfParsedText(parsedText, file.name);
  const agentUploadResult = await uploadFileToAgentArts(parsedTxtFile, {
    originalText: parsedText,
    statusText: COMPLIANCE_PROCESSING_DISPLAY_TEXT
  });
  const contextId = prepareResult?.context_id || '';

  if (contextId && agentUploadResult.fileUrl) {
    try {
      await bindReviewPdfFile(contextId, {
        review_file_url: agentUploadResult.fileUrl,
        review_file_id: agentUploadResult.uploadFileId,
        review_file_type: 'txt',
        session_id: sessionId,
        user_id: userId,
        agent_upload_response: agentUploadResult.rawResult,
      });
    } catch (error) {
      // 绑定失败不阻断审核主流程，但刷新后的审计信息可能缺少 review_file_url。
      console.warn('绑定 PDF 审核文件 URL 失败:', error);
    }
  }

  return {
    fileName: file.name,
    fileUrl: agentUploadResult.fileUrl,
    originalText: parsedText,
    fileType: 'pdf',
    fileSize: file.size,
    uploadFileId: agentUploadResult.uploadFileId,
    pdfContextId: contextId,
    pdfType: prepareResult?.pdf_detect?.pdf_type || '',
    sourceFileUrl:
      prepareResult?.file_info?.source_file_url ||
      prepareResult?.original_dispatch?.source_file_url ||
      '',
    parsedTxtUrl: prepareResult?.review_input?.parsed_txt_url || '',
    parsedMarkdownUrl: prepareResult?.review_input?.parsed_markdown_url || '',
    locatorMode: prepareResult?.original_dispatch?.locator_mode || 'parsed_text_only',
    locatorAvailable,
    locatorUnavailableReason: locatorAvailable ? '' : locatorReason,
    reviewFileUrl: agentUploadResult.fileUrl,
    textSource: prepareResult?.review_input?.text_source || 'mineru25-pro',
  };
};

/** 上传文件并返回远端地址：uploadComplianceFile。 */
const uploadComplianceFile = async (file: File): Promise<ComplianceUploadResult> => {
  if (isPdfFile(file)) {
    return uploadPdfForComplianceReview(file);
  }
  return uploadFileToAgentArts(file);
};

/** 封装当前模块内的业务逻辑：customUpload。 */
const customUpload = async (options: any) => {
  const { file, onSuccess, onError } = options;
  if (isComplianceFileProcessing.value) {
    onError(new Error('当前已有文件正在处理，请稍候'));
    return;
  }

  isComplianceFileProcessing.value = true;
  complianceFileProcessingText.value = isPdfFile(file)
    ? '正在检测 PDF 是否支持原文定位...'
    : COMPLIANCE_PROCESSING_DISPLAY_TEXT;

  try {
    const uploadResult = await uploadComplianceFile(file);
    onSuccess(uploadResult, file);
    uploadedFileRef.value = file;
    uploadedFileName.value = uploadResult.fileName;
    uploadedFileUrl.value = uploadResult.fileUrl;
    uploadedOriginalText.value = uploadResult.originalText;
    uploadedFileExtraMeta.value = { ...uploadResult };
    ElMessage.success({ message: isPdfFile(file) ? 'PDF 解析并上传完成' : '文件上传完成', offset: 72 });
  } catch (error) {
    onError(error);
  } finally {
    isComplianceFileProcessing.value = false;
    complianceFileProcessingText.value = '';
  }
};


/** 清理合规审核已上传文件，允许重新选择文件。 */
const handleRemoveUploadedFile = () => {
  if (isStreaming.value || isComplianceFileProcessing.value || isComplianceSubmitting.value) {
    ElMessage.warning('当前任务处理中，暂不能删除文件');
    return;
  }
  uploadedFileRef.value = null;
  uploadedFileName.value = '';
  uploadedFileUrl.value = '';
  uploadedOriginalText.value = '';
  uploadedFileExtraMeta.value = {};
  lastComplianceParams.value = null;
  complianceFileProcessingText.value = '';
  ElMessage.success({ message: '已删除上传文件，可重新上传', offset: 72 });
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
const normalizeTaskStatus = (status?: any) => String(status || '').toLowerCase();

/** 判断任务是否为后端终态。 */
const isTerminalTaskStatus = (status?: string) =>
  TERMINAL_TASK_STATUSES.includes(normalizeTaskStatus(status));

/** 判断任务是否允许恢复订阅。后端 v12.2.22 会返回 recoverable=false，前端必须尊重。 */
const isRecoverableTaskStatus = (status?: string) =>
  ACTIVE_TASK_STATUSES.includes(normalizeTaskStatus(status));

const getRecoverableFlag = (value: any): boolean | undefined => {
  const raw = value?.recoverable ?? value?.taskRecoverable ?? value?.task_recoverable;
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  }
  return undefined;
};

const isTaskRecoverable = (value: any, fallbackStatus?: string) => {
  const status = normalizeTaskStatus(value?.status ?? value?.taskStatus ?? value?.task_status ?? fallbackStatus);
  if (!isRecoverableTaskStatus(status)) return false;
  return getRecoverableFlag(value) !== false;
};

let persistStreamTasksTimer: number | null = null;

/** 持久化本地缓存：persistStreamTasksNow。 */
const persistStreamTasksNow = () => {
  const runningTasks = Object.fromEntries(
    Object.entries(activeStreamTasks.value).filter(
      ([, task]) => isTaskRecoverable(task),
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
        ([, task]) =>
          task?.taskId &&
          task?.sessionId &&
          !isTaskLocallyStopped(task.taskId) &&
          isTaskRecoverable(task),
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
      (task) => task.sessionId === sessionId && isTaskRecoverable(task),
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
  const isSearchFunction = functionId === 'search';
  /** 封装当前模块内的业务逻辑：candidate。 */
  const candidate = [...assistantMessages].reverse().find((message: any) => {
    if (isTaskLocallyStopped(message.taskId)) return false;
    const status = normalizeTaskStatus(message.taskStatus);
    const messageRecoverable = getRecoverableFlag(message) !== false;
    if (isRecoverableTaskStatus(status) && messageRecoverable) return true;
    // 智能检索刷新后，如果历史 sources 曾被旧版本压缩，允许对 completed/未知状态只查询 task detail 补全 sources。
    // error/stopped/cancelled/superseded 均为明确终态，不再恢复或重放，避免旧异常污染新请求。
    return isSearchFunction && (status === 'completed' || status === '');
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
      recoverable: getRecoverableFlag(candidate),
      // 已完成但缺少引用时，从 0 补读事件，只解析 workflow_finished 中的引用；不重复追加正文。
      lastEventId: Array.isArray(candidate.sources) && candidate.sources.length > 0 ? Number(candidate.streamEventId || 0) : 0,
      answerEventId: getMessageAnswerEventId(candidate),
      updatedAt: Date.now(),
      createdAt: Number(userMessage?.timestamp || candidate.timestamp || Date.now()),
      title: session.title,
      userContent: userMessage?.content || '',
      answerContent: sanitizeAgentText(stripReviewProgressText(candidate.content || '', { functionId, tabName: (session as any).menuType || activeTab.value })),
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
        content: sanitizeAgentText(stripReviewProgressText(task.answerContent || '', { functionId: task.functionId, tabName })),
        reasoning: task.reasoningContent || '',
        timestamp: createdAt as any,
        streaming: isTaskRecoverable(task),
        taskId: task.taskId,
        taskStatus: task.status,
        taskRecoverable: isTaskRecoverable(task),
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
    .filter(
      (message: any) =>
        message.role === 'assistant' &&
        message.taskId &&
        !isTaskLocallyStopped(message.taskId) &&
        isTaskRecoverable(message, message.taskStatus),
    )
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
          recoverable: getRecoverableFlag(message),
          lastEventId: Number(message.streamEventId || 0),
          answerEventId: getMessageAnswerEventId(message),
          updatedAt: Date.now(),
          createdAt: Number(userMessage?.timestamp || message.timestamp || Date.now()),
          title: session.title,
          userContent: userMessage?.content || '',
          answerContent: sanitizeAgentText(stripReviewProgressText(message.content || '', { functionId, tabName: (session as any).menuType || activeTab.value })),
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
  updates: Partial<ChatMessage> & { status?: string; eventId?: number; answerEventId?: number; recoverable?: boolean } = {},
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
  (message as any).taskRecoverable = updates.recoverable ?? task.recoverable ?? isTaskRecoverable(task);
  message.streamEventId = updates.eventId ?? task.lastEventId;
  (message as any).answerEventId = updates.answerEventId ?? task.answerEventId ?? (message as any).answerEventId ?? 0;
  message.streaming = isTaskRecoverable({ ...task, status: message.taskStatus, recoverable: (message as any).taskRecoverable });

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


/** 清理当前会话内旧的本地 active task，避免异常任务继续把错误写入新问题。 */
const clearLocalActiveTasksForSession = (sessionId?: string, functionId?: string) => {
  if (!sessionId) return;
  const taskIds = Object.values(activeStreamTasks.value)
    .filter((task) => task.sessionId === sessionId && (!functionId || task.functionId === functionId) && isTaskRecoverable(task))
    .map((task) => task.taskId);
  if (taskIds.length === 0) return;

  if (abortController) {
    abortController.abort();
    abortController = null;
  }

  const next = { ...activeStreamTasks.value };
  taskIds.forEach((taskId) => {
    delete next[taskId];
  });
  activeStreamTasks.value = next;
  persistStreamTasks(true);
  isStreaming.value = false;
  currentStreamingMessageId.value = null;
  resetStreamState();
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
  if (!isTaskRecoverable(task) && !options.allowTerminalReplay) return;

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
    const recoverable = isTaskRecoverable(detail, status);
    const terminal = isTerminalTaskStatus(status) || !recoverable;
    const detailAnswerContent = sanitizeAgentText(stripReviewProgressText(
      typeof detail.answerContent === 'string' ? detail.answerContent : '',
      { functionId: task.functionId, tabName: task.tabName },
    ));
    const localAnswerContent = sanitizeAgentText(stripReviewProgressText(task.answerContent || '', {
      functionId: task.functionId,
      tabName: task.tabName,
    }));
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

    const taskSources = Array.isArray(task.sources) ? task.sources : [];
    const detailSources = extractSourcesFromTaskDetail(detail);
    const mergedSources = mergeTaskDetailSources(taskSources, detailSources, task.functionId);
    const sourcesWereEnriched = mergedSources.length > taskSources.length;

    const mergedTask: ResumableStreamTask = {
      ...task,
      qaId: detail.qaId || task.qaId,
      messageId: detail.qaId || task.messageId,
      status,
      recoverable,
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
      sources: mergedSources,
      metadata: task.metadata || undefined,
    };

    ensureLocalSessionForTask(mergedTask);
    upsertStreamTask(mergedTask, true);
    updateTaskMessage(mergedTask, {
      content: mergedTask.answerContent,
      reasoning: mergedTask.reasoningContent,
      sources: mergedTask.sources || undefined,
      status: mergedTask.status,
      recoverable: mergedTask.recoverable,
      eventId: resumeEventId,
      answerEventId: mergedAnswerEventId,
    });

    if (terminal && sourcesWereEnriched) {
      void persistCompletedConversationForTask(mergedTask);
    }

    if (terminal) {
      // 后端 v12.2.22 会对 completed/error/stopped/superseded 返回 recoverable=false。
      // 终态任务只使用 task detail 补齐快照和 sources，不再重放 SSE，避免旧异常任务污染后续输入。
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
  const response = await authRequest({
    url: API.agent.taskStop(taskId, getCurrentAgentToken()),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!isSuccessStatus(response.status)) {
    throw new Error(`停止任务失败: ${response.status}`);
  }

  const result = response.data;
  if (result?.code !== undefined && !isApiSuccessCode(result.code)) {
    throw new Error(getApiMessage(result, '停止任务失败'));
  }
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

const stableSourceHash = (value: any) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
};

/**
 * 来源块前端合并键。
 * chunk/段落优先，file_id 只做兜底，避免同一文件多个检索块刷新后被压成一个。
 */
const buildSourceMergeKey = (item: any, index = 0) => {
  if (!item || typeof item !== 'object') return `raw:${stableSourceHash(item)}:${index}`;
  const directKey =
    item.chunk_id ||
    item.chunkId ||
    item.segment_id ||
    item.segmentId ||
    item.paragraph_id ||
    item.paragraphId ||
    item.passage_id ||
    item.passageId ||
    item.slice_id ||
    item.sliceId ||
    item.node_id ||
    item.nodeId;
  if (directKey) return `chunk:${directKey}`;

  const fileKey = item.file_id || item.fileId || item.doc_id || item.docId || item.document_id || item.documentId || item.file_name || item.fileName || item.title || '';
  const pageKey = item.page || item.page_no || item.pageNo || item.page_num || item.pageNum || '';
  const positionKey = item.position || item.offset || item.start || item.start_index || item.startIndex || '';
  const textKey = item.content || item.text || item.snippet || item.summary || item.paragraph || item.answer || '';
  if (fileKey && textKey) return `file-text:${fileKey}:${pageKey}:${positionKey}:${stableSourceHash(String(textKey).slice(0, 800))}`;
  if (item.id || item.source_id || item.sourceId) return `id:${item.id || item.source_id || item.sourceId}`;
  if (fileKey && (pageKey || positionKey)) return `file-pos:${fileKey}:${pageKey}:${positionKey}`;
  if (fileKey) return `file:${fileKey}`;
  return `json:${stableSourceHash(item)}:${index}`;
};

const mergeSourceItems = (...lists: any[][]) => {
  const seen = new Set<string>();
  const result: any[] = [];
  lists.forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((item, index) => {
      const key = buildSourceMergeKey(item, index);
      if (seen.has(key)) return;
      seen.add(key);
      result.push(item);
    });
  });
  return result;
};

const mergeTaskDetailSources = (localSources: any[] = [], detailSources: any[] = [], functionId?: string) => {
  if (!Array.isArray(detailSources) || detailSources.length === 0) return Array.isArray(localSources) ? localSources : [];
  if (!Array.isArray(localSources) || localSources.length === 0) return detailSources;
  // 检索场景优先保留后端 task detail 的完整块顺序；其它功能保持本地展示顺序，只补缺失项。
  return functionId === 'search' && detailSources.length >= localSources.length
    ? mergeSourceItems(detailSources, localSources)
    : mergeSourceItems(localSources, detailSources);
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
  if (completedTaskSaveSignatures.get(task.taskId) === signature) return true;

  const result = await chatStore.saveConversationToServer(
    task.sessionId,
    task.qaId || assistantMessage.id,
    userMessage,
    assistantMessage,
    assistantMessage.vote === 'like' ? 1 : 0,
    assistantMessage.vote === 'dislike' ? 1 : 0,
    getFunctionIdForTask(task),
  );
  if (result.success) {
    completedTaskSaveSignatures.set(task.taskId, signature);
  }
  return result.success;
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
    // 请求完成前保留当前会话内容，加载完成后再一次性切换到目标会话。
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
    await nextTick();
    // 目标历史会话内容完成渲染后，再恢复底部输入框的默认宽度。
    isSourcesPanelVisible.value = false;
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
    return isComplianceFileProcessing.value || isComplianceSubmitting.value || isStreaming.value || !uploadedFileUrl.value || selectedDimensions.value.length === 0;
  }
  return isStreaming.value;
});

const waitForPendingStopSync = async () => {
  if (pendingStopSyncPromise) {
    await pendingStopSyncPromise;
  }
};

/** 处理用户交互或组件事件：handleSendMessage。 */
const handleSendMessage = async (content: string) => {
  await waitForPendingStopSync();

  if (activeTab.value === '合规审核') {
    if (isComplianceSubmitting.value || isStreaming.value) {
      ElMessage.warning('审核任务正在处理中，请勿重复点击');
      return;
    }
    if (!uploadedFileUrl.value || selectedDimensions.value.length === 0) {
      return;
    }
    isComplianceSubmitting.value = true;
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
      isComplianceSubmitting.value = false;
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
      fileType: uploadedFileExtraMeta.value.fileType || uploadedFileRef.value?.name.split('.').pop()?.toLowerCase() || uploadedFileRef.value?.type || '',
      fileSize: uploadedFileExtraMeta.value.fileSize || uploadedFileRef.value?.size,
      fileUrl: uploadedFileUrl.value,
      uploadFileId: uploadedFileExtraMeta.value.uploadFileId,
      pdfContextId: uploadedFileExtraMeta.value.pdfContextId,
      pdfType: uploadedFileExtraMeta.value.pdfType,
      sourceFileUrl: uploadedFileExtraMeta.value.sourceFileUrl,
      parsedTxtUrl: uploadedFileExtraMeta.value.parsedTxtUrl,
      parsedMarkdownUrl: uploadedFileExtraMeta.value.parsedMarkdownUrl,
      locatorMode: uploadedFileExtraMeta.value.locatorMode,
      locatorAvailable: uploadedFileExtraMeta.value.locatorAvailable,
      locatorUnavailableReason: uploadedFileExtraMeta.value.locatorUnavailableReason,
      reviewFileUrl: uploadedFileExtraMeta.value.reviewFileUrl,
      textSource: uploadedFileExtraMeta.value.textSource,
    };
  } else {
    userMessageContent = content.trim();
  }

  if (!activeChatId.value) {
    await createChatForMessage();
  }
  const chat = chatStore.getChatSession(activeChatId.value!);
  if (!chat) {
    if (activeTab.value === '合规审核') isComplianceSubmitting.value = false;
    return;
  }
  if (!currentConversationUuid.value) {
    currentConversationUuid.value = generateUUID();
    (chat as any).conversationUuid = currentConversationUuid.value;
  }

  clearLocalActiveTasksForSession(currentConversationUuid.value || activeChatId.value, getWorkflowCodeByTab(activeTab.value));

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
      activeTab.value === '合规审核' && lastComplianceParams.value
        ? buildComplianceSessionTitle(lastComplianceParams.value.fileName, lastComplianceParams.value.dimensions)
        : content.length > 20
          ? content.substring(0, 20) + '...'
          : content;
    chat.title = newTitle;
    applySessionTitle(chat.id, newTitle, activeTab.value === '合规审核' ? userMessageContent : content);
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
    uploadedFileExtraMeta.value = {};
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
  await startStream(userMessageContent, aiMessageId);
  if (activeTab.value === '合规审核') isComplianceSubmitting.value = false;

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
      const questionContent = params
        ? buildComplianceQuestionContent(params.fileName, params.dimensions)
        : queryText;
      bizParams = {
        file_url: params?.file_url || uploadedFileUrl.value,
        query: params?.query || getReviewQuery(),
        questionContent,
        sessionTitle: params ? buildComplianceSessionTitle(params.fileName, params.dimensions) : undefined,
        fileName: params?.fileName,
        fileNameWithoutExt: params?.fileName ? stripFileExtension(params.fileName) : undefined,
        reviewDimensions: params?.dimensions || getActualReviewDimensions(),
        dimensionText: params ? buildDimensionText(params.dimensions) : buildDimensionText(),
        ancestorScope: scopesData.value.ancestorScope || [],
        descendantScope: scopesData.value.descendantScope || [],
        complianceParams: params ? { ...params } : undefined,
        metadata: params ? buildComplianceMetadata(params) : undefined,
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
      const serverTitle = taskData.sessionTitle || taskData.session_title || taskData.title;
      const localTitle = lastComplianceParams.value
        ? buildComplianceSessionTitle(lastComplianceParams.value.fileName, lastComplianceParams.value.dimensions)
        : '';
      applySessionTitle(currentConversationUuid.value || activeChatId.value, serverTitle || localTitle, queryText);
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
      recoverable: getRecoverableFlag(taskData) ?? isRecoverableTaskStatus(taskData.status || 'pending'),
      lastEventId: Number(taskData.lastEventId || 0),
      answerEventId: Number(taskData.answerEventId || taskData.answer_event_id || 0),
      updatedAt: Date.now(),
      createdAt: Date.now(),
      title: activeTab.value === '合规审核' && lastComplianceParams.value
        ? buildComplianceSessionTitle(lastComplianceParams.value.fileName, lastComplianceParams.value.dimensions)
        : chat?.title,
      userContent: userMessageForTask?.content || queryText,
      answerContent: '',
      reasoningContent: '',
      metadata: activeTab.value === '合规审核' && lastComplianceParams.value
        ? buildComplianceMetadata(lastComplianceParams.value)
        : undefined,
    };

    upsertStreamTask(task, true);
    updateTaskMessage(task, { status: task.status, recoverable: task.recoverable, eventId: task.lastEventId, answerEventId: task.answerEventId });
    await subscribeStreamTask(task.taskId);
  } catch (error: any) {
    console.error('创建或订阅智能体任务失败:', error);
    handleStreamError(messageId, toUserSafeErrorMessage(error, getSafeAgentErrorMessage()));
  }
};

/** 处理用户交互或组件事件：handleRegenerate。 */
const handleRegenerate = async (payload: RegeneratePayload) => {
  if (activeTab.value === '合规审核' && isComplianceRegenerating.value) {
    ElMessage.warning('正在准备重新审核，请稍候');
    return;
  }

  if (isStreaming.value) {
    await stopStream();
  } else {
    await waitForPendingStopSync();
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
      await handleComplianceReview();
    } else {
      ElMessage.error('没有找到审核参数，无法重新审核');
    }
  } else {
    // 非合规审核，正常重新生成
    await handleSendMessage(content);
  }
};

// 处理合规审核的专用函数
const handleComplianceReview = async () => {
  if (!lastComplianceParams.value) {
    ElMessage.warning('没有找到上一次审核的参数');
    return;
  }

  if (isComplianceRegenerating.value) {
    ElMessage.warning('正在准备重新审核，请稍候');
    return;
  }

  isComplianceRegenerating.value = true;
  isComplianceFileProcessing.value = true;
  complianceFileProcessingText.value = COMPLIANCE_PROCESSING_DISPLAY_TEXT;
  const loadingInstance = ElLoading.service({
    lock: false,
    text: COMPLIANCE_PROCESSING_DISPLAY_TEXT,
    background: 'rgba(255, 255, 255, 0.45)',
  });

  try {
    lastComplianceParams.value = await refreshComplianceParamsFileUrl(lastComplianceParams.value);

    const displayDimensions = getActualReviewDimensions(lastComplianceParams.value.dimensions);
    const userMessageContent = buildComplianceQuestionContent(
      lastComplianceParams.value.fileName,
      displayDimensions,
    );

    if (!activeChatId.value) {
      await createChatForMessage();
    }

    const chat = chatStore.getChatSession(activeChatId.value!);
    if (!chat) return;

    if (!currentConversationUuid.value) {
      currentConversationUuid.value = generateUUID();
      (chat as any).conversationUuid = currentConversationUuid.value;
    }

    clearLocalActiveTasksForSession(currentConversationUuid.value || activeChatId.value, getWorkflowCodeByTab(activeTab.value));

    const qaId = generateUUID();

    const userMessage: ChatMessage = {
      id: `user_${qaId}`,
      role: 'user',
      content: userMessageContent,
      timestamp: new Date() as any,
      metadata: buildComplianceMetadata(lastComplianceParams.value),
    };

    chat.messages.push(userMessage);

    if (chat.messages.length === 1) {
      const newTitle = buildComplianceSessionTitle(
        lastComplianceParams.value.fileName,
        lastComplianceParams.value.dimensions,
      );
      chat.title = newTitle;
      applySessionTitle(chat.id, newTitle, userMessageContent);
    }

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
      preview: userMessageContent,
      time: Date.now(),
    });

    resetStreamState();
    currentStreamingMessageId.value = aiMessageId;
    await saveReviewContextSnapshot(qaId, lastComplianceParams.value);

    complianceFileProcessingText.value = '';
    isComplianceFileProcessing.value = false;
    loadingInstance.close();

    await startComplianceStream(aiMessageId);
    scrollToBottom();
  } catch (error) {
    console.error('重新审核失败:', error);
    ElMessage.error(toUserSafeErrorMessage(error, '重新审核失败，请稍后重试'));
  } finally {
    loadingInstance.close();
    isComplianceRegenerating.value = false;
    isComplianceFileProcessing.value = false;
    complianceFileProcessingText.value = '';
  }
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

const POSSIBLE_THINK_PREFIX = '<think';

const isPossibleThinkTagPrefix = (value: string) => {
  const normalized = value.trimStart().toLowerCase();
  if (!normalized) return true;
  return POSSIBLE_THINK_PREFIX.startsWith(normalized) || normalized.startsWith(POSSIBLE_THINK_PREFIX);
};

const resolveInitialStreamDisplayText = (buffer: string) => {
  const openMatch = /<think\b[^>]*>/i.exec(buffer);
  if (openMatch) {
    const closeMatch = /<\/think>/i.exec(buffer.slice(openMatch.index + openMatch[0].length));
    if (!closeMatch) {
      return { ready: false, displayText: '' };
    }
    const closeEnd = openMatch.index + openMatch[0].length + closeMatch.index + closeMatch[0].length;
    return { ready: true, displayText: buffer.slice(closeEnd) };
  }

  if (isPossibleThinkTagPrefix(buffer)) {
    return { ready: false, displayText: '' };
  }

  return { ready: true, displayText: buffer };
};

const appendModelOutputText = async (
  text: string,
  messageId: string,
  context?: { functionId?: string; tabName?: string },
) => {
  if (!text) return;
  if (containsUpstreamErrorText(text)) {
    throw new Error(getSafeAgentErrorMessage());
  }

  let displayText = sanitizeAgentText(text);

  // 首次展示前先判断是否存在 <think>...</think>，仅展示 </think> 之后的正式内容；
  // 如果没有 think 标签，则不再用首个双换行粗暴截断，避免误删正文标题。
  if (!answerOutputStarted) {
    answerPendingText += text;
    const resolved = resolveInitialStreamDisplayText(answerPendingText);
    if (!resolved.ready) {
      return;
    }
    answerOutputStarted = true;
    displayText = sanitizeAgentText(resolved.displayText);
    answerPendingText = '';
  }
  currentAnswer.value += displayText;
  currentAnswer.value = sanitizeAgentText(stripReviewProgressText(currentAnswer.value, context));
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

  const resolved = resolveInitialStreamDisplayText(answerPendingText);
  answerOutputStarted = true;
  currentAnswer.value += resolved.ready ? resolved.displayText : '';
  currentAnswer.value = sanitizeAgentText(stripReviewProgressText(currentAnswer.value, context));
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
      console.error('智能体 SSE 包装响应异常，已使用统一兜底文案展示:', getApiMessage(chunk, '智能体响应异常'), chunk);
      handleStreamError(messageId, getSafeAgentErrorMessage(), taskId);
      return;
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
    const chunkRecoverableFlag = getRecoverableFlag(chunk) ?? getRecoverableFlag(payload) ?? getRecoverableFlag(payloadData);
    const nextTaskRecoverable = chunkRecoverableFlag ?? task.recoverable ?? isRecoverableTaskStatus(normalizedStatus);
    let nextTask: ResumableStreamTask = {
      ...task,
      status: eventType === 'done' ? normalizedStatus : normalizedStatus || task.status,
      recoverable: nextTaskRecoverable,
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
    if (text && containsUpstreamErrorText(text)) {
      console.error('智能体任务输出命中上游原始错误，已使用统一兜底文案展示:', text, payload);
      handleStreamError(messageId, getSafeAgentErrorMessage(), taskId);
      return;
    }

    if (text && !sourceOnlyReplayTaskIds.has(taskId)) {
      await appendModelOutputText(text, messageId, { functionId: task.functionId, tabName: task.tabName });
      nextTask = { ...nextTask, answerContent: currentAnswer.value, answerEventId: eventId || nextTask.answerEventId || task.answerEventId || 0 };
    }

    upsertStreamTask(nextTask);
    updateTaskMessage(nextTask, {
      status: nextTask.status,
      recoverable: nextTask.recoverable,
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
      const rawMessage = payload.message || payload.error_msg || payload.error_reason || '工作流执行失败';
      console.error('智能体任务事件返回错误:', rawMessage, payload);
      handleStreamError(messageId, getSafeAgentErrorMessage(), taskId);
      return;
    }

    if (eventType === 'done' || isTerminalTaskStatus(chunk.status || eventType)) {
      const rawFinalAnswerContent = typeof chunk.answerContent === 'string' ? chunk.answerContent : '';
      if (rawFinalAnswerContent && containsUpstreamErrorText(rawFinalAnswerContent)) {
        console.error('智能体最终快照命中上游原始错误，已使用统一兜底文案展示:', rawFinalAnswerContent, chunk);
        handleStreamError(messageId, getSafeAgentErrorMessage(), taskId);
        return;
      }
      const finalAnswerContent = sanitizeAgentText(stripReviewProgressText(
        rawFinalAnswerContent,
        { functionId: task.functionId, tabName: task.tabName },
      ));
      const finalAnswerEventId = incomingAnswerEventId || nextTask.answerEventId || eventId || task.lastEventId || 0;
      const finalSources = extractSourcesFromWorkflowPayload(payload, payloadData, chunk);
      if (finalSources.length > 0) {
        nextTask = { ...nextTask, sources: finalSources };
        updateTaskMessage(nextTask, { sources: finalSources });
      }
      if (!sourceOnlyReplayTaskIds.has(taskId) && finalAnswerContent && finalAnswerContent.length >= (currentAnswer.value || '').length) {
        currentAnswer.value = finalAnswerContent;
        nextTask = { ...nextTask, answerContent: finalAnswerContent, answerEventId: finalAnswerEventId };
        upsertStreamTask(nextTask, true);
        updateTaskMessage(nextTask, { content: finalAnswerContent, eventId: nextTask.lastEventId, answerEventId: finalAnswerEventId, sources: nextTask.sources });
      } else if (finalSources.length > 0) {
        upsertStreamTask(nextTask, true);
      }
      finishStream(messageId, taskId, chunk.status || eventType);
    }
    return;
  }

  if (chunk.event === 'error') {
    const rawMessage =
      chunk.data?.message ||
      chunk.data?.error_msg ||
      chunk.data?.error_reason ||
      '工作流执行失败';
    console.error('智能体原始流返回错误:', rawMessage, chunk);
    throw new Error(getSafeAgentErrorMessage());
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
    if (containsUpstreamErrorText(chunk.data.text)) {
      console.error('智能体原始流输出命中上游错误，已使用统一兜底文案展示:', chunk.data.text, chunk);
      handleStreamError(messageId, getSafeAgentErrorMessage(), taskId);
      return;
    }
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
    const shouldShowHistorySkeleton = !historySkeletonShownTabs.has(tab);
    if (shouldShowHistorySkeleton) {
      historySkeletonShownTabs.add(tab);
      isHistoryListLoading.value = true;
    }
    skipNextRouteSessionRestore = true;
    try {
      await router.push(targetRoute);
    } catch (error) {
      skipNextRouteSessionRestore = false;
      if (shouldShowHistorySkeleton) {
        historySkeletonShownTabs.delete(tab);
        isHistoryListLoading.value = false;
      }
      throw error;
    }
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
  console.error('智能体请求失败，前端已使用统一兜底文案展示:', errorMessage);
  const safeMessage = toUserSafeErrorMessage(errorMessage, getSafeAgentErrorMessage());
  const task = taskId ? activeStreamTasks.value[taskId] : getTaskByMessageId(messageId);
  const sessionId = task?.sessionId || activeChatId.value;
  const chat = chatStore.getChatSession(sessionId);
  if (chat) {
    /** 封装当前模块内的业务逻辑：message。 */
    const message = chat.messages.find((m: any) => m.id === messageId || m.taskId === taskId);
    if (message) {
      message.content = safeMessage;
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
const stopStream = async () => {
  const messageId = currentStreamingMessageId.value;
  const task = getTaskByMessageId(messageId);

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
        (message as any).taskRecoverable = false;
        if (message.content === '') {
          message.content = '用户停止了生成';
        }
      }
    }
  }
  isStreaming.value = false;
  currentStreamingMessageId.value = null;
  resetStreamState();

  if (!task) return;

  markTaskLocallyStopped(task.taskId);
  removeStreamTask(task.taskId);
  const chat = chatStore.getChatSession(task.sessionId);
  const message = chat?.messages.find(
    (item: any) => item.id === task.messageId || item.taskId === task.taskId,
  );
  const stoppedTask: ResumableStreamTask = {
    ...task,
    status: 'stopped',
    recoverable: false,
    answerContent: message?.content || task.answerContent || '',
    reasoningContent: message?.reasoning || task.reasoningContent || '',
    sources: (message as any)?.sources || task.sources || [],
    updatedAt: Date.now(),
  };

  const syncPromise = (async () => {
    const [stopResult, historyResult] = await Promise.allSettled([
      stopTaskOnServer(task.taskId),
      persistCompletedConversationForTask(stoppedTask),
    ]);
    if (stopResult.status === 'rejected') {
      console.warn('同步后台任务停止状态失败:', stopResult.reason);
    }
    if (historyResult.status === 'rejected' || historyResult.value === false) {
      console.warn(
        '同步暂停状态到会话历史失败:',
        historyResult.status === 'rejected' ? historyResult.reason : '',
      );
    }
  })();
  pendingStopSyncPromise = syncPromise;
  try {
    await syncPromise;
  } finally {
    if (pendingStopSyncPromise === syncPromise) {
      pendingStopSyncPromise = null;
    }
  }
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

// 计算输入框容器样式：与当前会话内容区左右边界保持一致。
// 说明：仅根据右侧来源/原文面板状态调整宽度与 margin，不改变业务逻辑。
const inputContainerStyle = computed<CSSProperties>(() => {
  if (isSourcesPanelVisible.value) {
    if (activeTab.value === '合规审核') {
      // 合规审核打开原文定位后，页面为左右分栏：左侧对话列宽约为 50% - 26px。
      return {
        width: 'calc(50% - 26px)',
        margin: '0 auto 3px 18px',
        boxSizing: 'border-box',
      };
    }

    if (activeTab.value === '智能问答' || activeTab.value === '辅助起草') {
      // 来源面板打开后，输入框与左侧对话内容在剩余区域内保持相同宽度和左右间距。
      return {
        width: 'calc((100% - var(--sources-panel-width, 450px)) * 0.8)',
        margin: '0 0 3px calc((100% - var(--sources-panel-width, 450px)) * 0.1)',
        boxSizing: 'border-box',
      };
    }
  }

  return {
    width: '80%',
    margin: '0 auto 3px',
    boxSizing: 'border-box',
  };
});

// 新增事件处理函数
const handleSourcesPanelToggle = (visible: boolean) => {
  isSourcesPanelVisible.value = visible;
  if (visible && activeTab.value === '合规审核') {
    sidebarCollapsed.value = true;
  }
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
  isHistoryListLoading.value = true;
  try {
    await queryConversationsForCurrentRoute();
  } finally {
    historySkeletonShownTabs.add(activeTab.value);
    await nextTick();
    isHistoryListLoading.value = false;
  }

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
    try {
      await queryConversationsForCurrentRoute();
    } finally {
      await nextTick();
      isHistoryListLoading.value = false;
    }

    if (skipNextRouteSessionRestore) {
      skipNextRouteSessionRestore = false;
      detachStreamSubscription();
      resetCurrentChat();
      return;
    }

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
    handleRemoveUploadedFile,
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
    isHistoryListLoading,
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
    isComplianceFileProcessing,
    complianceFileProcessingText,
    userStore,
  };
}
