import { ref, computed, onMounted, nextTick, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useChatStore } from '@/stores/chat';
import { useUserStore } from '@/stores/user';
import type { ChatMessage, ChatSession, HistoryItem } from '@/types/chat';
import { ElMessage } from 'element-plus';
import { authRequest, isSuccessStatus, postEventStream, request } from '@/services/http';
import { API, getWorkflowByTab } from '@/api/api';

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
const selectedDimensions = ref<string[]>([]);
const REVIEW_DIMENSIONS = ['合规性', '冲突性', '文本规范性'];
const SELECT_ALL_DIMENSION = '全选';

// 统一获取真正要提交给后端的审核维度，避免把"全选"传给接口或生成空 query
const getActualReviewDimensions = (dimensions: string[] = selectedDimensions.value) => {
  if (dimensions.includes(SELECT_ALL_DIMENSION)) {
    return [...REVIEW_DIMENSIONS];
  }
  return dimensions.filter((item) => REVIEW_DIMENSIONS.includes(item));
};

const getReviewQuery = (dimensions: string[] = selectedDimensions.value) => {
  return getActualReviewDimensions(dimensions).join(',');
};

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
  };
};

const buildComplianceMetadata = (params: ComplianceReviewParams) => ({
  complianceOriginalText: params.originalText,
  complianceFileName: params.fileName,
  complianceParams: { ...params },
});

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

const readUint16 = (view: DataView, offset: number) => view.getUint16(offset, true);
const readUint32 = (view: DataView, offset: number) => view.getUint32(offset, true);

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

const parseDocxXmlText = (xmlText: string) => {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parserError = xml.querySelector('parsererror');
  if (parserError) return '';

  const paragraphs = Array.from(xml.getElementsByTagNameNS('*', 'p'));
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

const customUpload = async (options: any) => {
  const { file, onSuccess, onError } = options;
  const token = appStore.sharedDataToken;
  if (!token) {
    onError(new Error('未找到认证 token'));
    return;
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('is_image', 'false');
  try {
    const localOriginalText = await extractReadableFileText(file);
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
    onSuccess(result, file);
    uploadedFileName.value = file.name;
    uploadedFileUrl.value = result?.url || file.name;
    uploadedOriginalText.value = getTextFromUploadResult(result) || localOriginalText;
  } catch (error) {
    onError(error);
  }
};

const handleSelectAll = (val: boolean) => {
  if (val) {
    selectedDimensions.value = [SELECT_ALL_DIMENSION, ...REVIEW_DIMENSIONS];
  } else {
    selectedDimensions.value = [];
  }
};

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

const handleNewChat = async () => {
  stopStream();
  resetCurrentChat();
  isSourcesPanelVisible.value = false;
  scrollToBottom();
};

// 修改 handleSelectChat 函数，确保能正确加载会话
const handleSelectChat = async (chatId: string) => {
  if (isStreaming.value) {
    stopStream();
  }
  isSelectingHistoryChat.value = true;
  isHistoryChatActive.value = true;
  try {
    hasAutoCreated = false;
    // 先清空，再设置，确保触发响应式更新
    activeChatId.value = '';
    await nextTick();
    let session = chatStore.getChatSession(chatId);
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
    resetStreamState();
    scrollToBottom();
    lastComplianceParams.value =
      activeTab.value === '合规审核'
        ? getComplianceParamsFromSession(chatStore.getChatSession(chatId))
        : null;
  } finally {
    isSelectingHistoryChat.value = false;
  }
};

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

const handleClearHistory = async () => {
  await chatStore.clearAllConversations();
  chatStore.historyList = [];
  chatStore.chatSessions = {};

  activeChatId.value = '';
  currentConversationUuid.value = '';
  isHistoryChatActive.value = false;
  resetStreamState();
};

const handleToggleFavorite = (chatId: string) => {
  chatStore.toggleCollect(chatId);
};

const isSendDisabled = computed(() => {
  if (activeTab.value === '合规审核') {
    return !uploadedFileUrl.value || selectedDimensions.value.length === 0;
  }
  return isStreaming.value;
});

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

  // 添加用户消息
  const userMessage: ChatMessage = {
    id: Date.now().toString(),
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

    const historyItem = chatStore.historyList.find((h: any) => h.id === chat.id);
    if (historyItem) {
      historyItem.title = newTitle;
      historyItem.preview =
        activeTab.value === '合规审核' ? `${uploadedFileName.value}的审核` : content;
    }
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
  const aiMessageId = (Date.now() + 1).toString();
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
  currentStreamingMessageId.value = aiMessageId;
  chatStore.updateHistoryItem(activeChatId.value!, {
    preview: userMessageContent, // 使用新的消息内容作为预览
    time: Date.now(),
  });
  resetStreamState();

  // 开始流式输出
  await startStream(content, aiMessageId);

  scrollToBottom();
};

const REQUEST_TIMEOUT_MAP: Record<string, number> = {
  智能问答: 120000,
  智能检索: 120000,
  辅助起草: 300000,
  合规审核: 15 * 60 * 1000,
};

// 流式请求
const startStream = async (queryText: string, messageId: string) => {
  isStreaming.value = true;
  currentReasoning.value = '';
  currentAnswer.value = '';
  abortController = new AbortController();
  const requestTimeout = REQUEST_TIMEOUT_MAP[activeTab.value] || 120000;
  const id = setTimeout(() => {
    abortController?.abort();
  }, requestTimeout);

  try {
    let params: any = {};

    if (activeTab.value === '合规审核') {
      // 使用保存的参数（如果有），否则使用当前值
      if (lastComplianceParams.value) {
        params = {
          inputs: {
            file_url: lastComplianceParams.value.file_url,
            query: lastComplianceParams.value.query,
            // 使用从接口获取的 scopes 数据
            ancestorScope: scopesData.value.ancestorScope || [],
            descendantScope: scopesData.value.descendantScope || [],
          },
        };
      } else {
        params = {
          inputs: {
            file_url: uploadedFileUrl.value,
            query: getReviewQuery(),
            // 使用从接口获取的 scopes 数据
            ancestorScope: scopesData.value.ancestorScope || [],
            descendantScope: scopesData.value.descendantScope || [],
          },
        };
      }
    } else if (activeTab.value === '辅助起草') {
      params = {
        inputs: {
          query: queryText,
          // 使用从接口获取的 scopes 数据
          ancestorScope: scopesData.value.ancestorScope || [],
          descendantScope: scopesData.value.descendantScope || [],
        },
      };
    } else {
      // 智能问答和智能检索
      params = {
        inputs: {
          query: queryText,
          // 使用从接口获取的 scopes 数据和 user
          ancestorScope: scopesData.value.ancestorScope || [],
          descendantScope: scopesData.value.descendantScope || [],
          user: scopesData.value.user || '1', // 使用从接口获取的 user
        },
      };
    }

    const token = appStore.sharedDataToken;
    if (!token) {
      throw new Error('未找到认证token，请先登录');
    }

    const workflow = getWorkflowByTab(activeTab.value);
    const apiUrl = API.agent.workflowConversation(
      workflow.id,
      currentConversationUuid.value,
      workflow.version,
    );
    const response = await postEventStream(apiUrl, params, {
      headers: {
        'X-Auth-Token': token,
        'Content-Type': 'application/json',
      },
      signal: abortController.signal,
    });

    clearTimeout(id); // 清除定时器

    if (!isSuccessStatus(response.status) || !response.data?.getReader) {
      throw new Error(`网络响应异常: ${response.status}`);
    }

    const reader = response.data.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.startsWith('data:')) {
          const data = line.substring(5).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed: any = JSON.parse(data);
            await processStreamChunk(parsed, messageId);
          } catch (error) {
            console.error('解析流数据失败:', error);
          }
        }
      }
    }
  } catch (error: any) {
    clearTimeout(id); // 清除定时器
    if (error.name === 'AbortError') {
      return;
    } else {
      handleStreamError(messageId, error.message);
    }
  } finally {
    finishStream(messageId);
  }
};

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

  // 添加用户消息
  const userMessage: ChatMessage = {
    id: Date.now().toString(),
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

    const historyItem = chatStore.historyList.find((h: any) => h.id === chat.id);
    if (historyItem) {
      historyItem.title = newTitle;
      historyItem.preview = `${lastComplianceParams.value.fileName}的重新审核`;
    }
  }

  // 添加AI消息占位符
  const aiMessageId = (Date.now() + 1).toString();
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
  currentStreamingMessageId.value = aiMessageId;
  chatStore.updateHistoryItem(activeChatId.value!, {
    preview: userMessageContent, // 使用新的消息内容作为预览
    time: Date.now(),
  });
  resetStreamState();
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

  isStreaming.value = true;
  currentReasoning.value = '';
  currentAnswer.value = '';
  abortController = new AbortController();
  const requestTimeout = REQUEST_TIMEOUT_MAP[activeTab.value] || 15 * 60 * 1000;
  const id = setTimeout(() => {
    abortController?.abort();
  }, requestTimeout);

  try {
    const params = {
      inputs: {
        file_url: lastComplianceParams.value.file_url,
        query: lastComplianceParams.value.query,
        // 使用从接口获取的 scopes 数据
        ancestorScope: scopesData.value.ancestorScope || [],
        descendantScope: scopesData.value.descendantScope || [],
      },
    };

    const token = appStore.sharedDataToken;
    if (!token) {
      throw new Error('未找到认证token，请先登录');
    }

    const workflow = API.agent.workflows.reviewRegenerate;
    const apiUrl = API.agent.workflowConversation(
      workflow.id,
      currentConversationUuid.value,
      workflow.version,
    );
    const response = await postEventStream(apiUrl, params, {
      headers: {
        'X-Auth-Token': token,
        'Content-Type': 'application/json',
      },
      signal: abortController.signal,
    });

    clearTimeout(id);

    if (!isSuccessStatus(response.status) || !response.data?.getReader) {
      throw new Error(`网络响应异常: ${response.status}`);
    }

    const reader = response.data.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.startsWith('data:')) {
          const data = line.substring(5).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed: any = JSON.parse(data);
            await processStreamChunk(parsed, messageId);
          } catch (error) {
            console.error('解析流数据失败:', error);
          }
        }
      }
    }
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      return;
    } else {
      handleStreamError(messageId, error.message);
    }
  } finally {
    finishStream(messageId);
  }
};

const appendModelOutputText = async (text: string, messageId: string) => {
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
  const chat = chatStore.getChatSession(activeChatId.value!);
  if (chat) {
    const msg = chat.messages.find((m: any) => m.id === messageId);
    if (msg) msg.content = currentAnswer.value;
  }

  await nextTick();
  scrollToBottom();
};

const flushPendingModelOutput = (messageId: string) => {
  if (answerOutputStarted || !answerPendingText) return;

  answerOutputStarted = true;
  currentAnswer.value += answerPendingText;
  answerPendingText = '';

  const chat = chatStore.getChatSession(activeChatId.value!);
  if (chat) {
    const msg = chat.messages.find((m: any) => m.id === messageId);
    if (msg) msg.content = currentAnswer.value;
  }
};

const processStreamChunk = async (chunk: any, messageId: string) => {
  if (chunk.event === 'message' && chunk.data?.reasoning_content) {
    currentReasoning.value += chunk.data.reasoning_content;
    const chat = chatStore.getChatSession(activeChatId.value!);
    if (chat) {
      const msg = chat.messages.find((m: any) => m.id === messageId);
      if (msg) msg.reasoning = currentReasoning.value;
    }
    await nextTick();
    scrollToBottom();
  }

  if (chunk.event === 'message' && chunk.data?.text) {
    await appendModelOutputText(chunk.data.text, messageId);
  }

  if (chunk.event === 'workflow_finished') {
    try {
      flushPendingModelOutput(messageId);
      const chat = chatStore.getChatSession(activeChatId.value!);
      if (!chat || chat.messages.length < 2) return;
      const userMessage = chat.messages[chat.messages.length - 2];
      const assistantMessage = chat.messages[chat.messages.length - 1];
      const outputs = chunk.data?.outputs || {};

      let sources: any[] = [];
      if (outputs.user_fields?.data_json) {
        sources = outputs.user_fields.data_json.map((item: any) => ({
          file_id: item.file_id,
          chunk_id: item.chunk_id,
          title: item.title,
          content: item.content,
          subtitle: item.subtitle,
          update_date_time: item.update_date_time,
          tags: item.tags,
          repo_id: item.repo_id,
          score: parseFloat(item.score) || 0,
          match_score: parseFloat(item.score) || 0,
        }));
        //
      }

      assistantMessage.sources = sources;
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

const handleLogout = async () => {
  stopStream();
  await userStore.logout();
  router.replace({ path: '/login', query: { redirect: route.fullPath } });
};

const handleTabChange = (tab: string) => {
  stopStream();
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
    router.push(targetRoute);
  }
};
const finishStream = (messageId: string) => {
  flushPendingModelOutput(messageId);
  isStreaming.value = false;
  currentStreamingMessageId.value = null;
  currentReasoning.value = '';
  currentAnswer.value = '';

  const chat = chatStore.getChatSession(activeChatId.value!);
  if (chat) {
    const message = chat.messages.find((m: any) => m.id === messageId);
    if (message) {
      message.streaming = false;

      const historyItem = chatStore.historyList.find(
        (h: any) => h.id === activeChatId.value,
      );
      if (historyItem && chat.messages.length === 2) {
        const firstQuestion = chat.messages[0].content;
        historyItem.preview =
          firstQuestion.length > 50
            ? firstQuestion.substring(0, 50) + '...'
            : firstQuestion;
      }
    }
  }
  resetStreamState();
  scrollToBottom();
};

const handleStreamError = (messageId: string, errorMessage: string) => {
  const chat = chatStore.getChatSession(activeChatId.value!);
  if (chat) {
    const message = chat.messages.find((m: any) => m.id === messageId);
    if (message) {
      message.content = `抱歉，回答过程中出现错误：${errorMessage}`;
      message.streaming = false;
    }
  }
  isStreaming.value = false;
  currentStreamingMessageId.value = null;
  resetStreamState();
};

const stopStream = () => {
  if (abortController) {
    abortController.abort();
  }
  if (currentStreamingMessageId.value) {
    const chat = chatStore.getChatSession(activeChatId.value!);
    if (chat) {
      const message = chat.messages.find((m: any) => m.id === currentStreamingMessageId.value);
      if (message) {
        message.streaming = false;
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

const resetStreamState = () => {
  currentReasoning.value = '';
  currentAnswer.value = '';
  answerOutputStarted = false;
  answerPendingText = '';
  abortController = null;
};

const scrollToBottom = () => {
  nextTick(() => {
    const container = document.querySelector('.dynamic-content');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });
};

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

// 修改：使用标志位确保只自动创建一次
let hasAutoCreated = false;

onMounted(async () => {
  if (!showFullLayout.value) return;
  await queryConversationsForCurrentRoute();

  const sessionId = route.query.id as string;
  const fromCollections = route.query.from === 'collections';

  if (sessionId && fromCollections) {
    await handleSelectChat(sessionId);
  } else if (sessionId) {
    await handleSelectChat(sessionId);
  } else if (
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
      resetCurrentChat();

      if (
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
    if (isStreaming.value) {
      stopStream();
    }
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
    handleSourcesPanelToggle,
    handleTabChange,
    handleToggleFavorite,
    handleTogglePin,
    handleUpdateTitle,
    inputContainerStyle,
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
    uploadedFileName,
    userStore,
  };
}

