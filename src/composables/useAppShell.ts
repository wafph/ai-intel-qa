/**
 * 主应用壳组合函数（编排器）。
 *
 * 组合 useComplianceReview、useStreamTask、useStreamChunk、
 * useSessionManager、useMessageSender 五个子 composable，
 * 管理基础状态、计算属性、Tab 切换、搜索和生命周期。
 * 新增：智能问答/智能检索/辅助起草 模式下的多文件上传管理（依次追加 + 单选删除）。
 */
import { ref, computed, onMounted, nextTick, onUnmounted, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useChatStore } from '@/stores/chat';
import { useUserStore } from '@/stores/user';
import { ElMessage } from 'element-plus';
import { getAgentToken } from '@/services/authStorage';
import type { QAUploadedFile } from '@/components/ChatInput.vue';
import { extractReadableFileText } from '@/composables/useFileParsing';
import {
  detectReviewPdf,
  prepareReviewPdf,
  buildTxtFileFromPdfParsedText,
  isPdfFile,
} from '@/services/reviewPdfPrepare';
import { useComplianceReview } from './useComplianceReview';
import { useStreamTask } from './useStreamTask';
import { useStreamChunk } from './useStreamChunk';
import { useSessionManager } from './useSessionManager';
import { useMessageSender } from './useMessageSender';

export const useAppShell = () => {
  const appStore = useAppStore();
  const chatStore = useChatStore();
  const userStore = useUserStore();
  const router = useRouter();
  const route = useRoute();

  // ---- 基础状态 ----
  const scopesData = computed(() => window.__SCOPES_DATA__ || { ancestorScope: [], descendantScope: [], user: '1', query: '' });
  const inputText = ref('');
  const sidebarCollapsed = ref(false);
  const activeTab = ref('智能问答');
  const activeChatId = ref('');
  const currentConversationUuid = ref('');
  const isSourcesPanelVisible = ref(false);
  const isHistoryChatActive = ref(false);
  const isSelectingHistoryChat = ref(false);
  const isHistoryListLoading = ref(true);
  const historySkeletonShownTabs = new Set<string>();
  let skipNextRouteSessionRestore = false;
  const isStreaming = ref(false);
  const currentReasoning = ref('');
  const currentAnswer = ref('');
  const currentStreamingMessageId = ref<string | null>(null);
  const historySearchKeyword = ref('');
  const historySearchResults = ref<any[]>([]);
  const historySearchLoading = ref(false);
  const hasAutoCreated = ref(false);

  // ---- 智能问答/智能检索/辅助起草 多文件上传状态 ----
  /** 已上传文件列表：用户依次选择的文件按顺序追加，发送后清空。 */
  const qaUploadedFileList = ref<QAUploadedFile[]>([]);
  /** 是否有 QA 文件正在上传：避免删除正在处理中的文件。 */
  const isQAFileProcessing = ref(false);
  /** QA 文件处理中展示文案（PDF 检测/解析、普通文件上传等不同阶段不同提示）。 */
  const qaFileProcessingText = ref('');
  /** 正在上传的文件计数：并发多文件时，全部完成后才将 processing 标记复位。 */
  let qaUploadPendingCount = 0;

  // ---- 计算属性 ----
  const currentChatData = computed(() => {
    if (!activeChatId.value) return null;
    const session = chatStore.getChatSession(activeChatId.value);
    return session ? { ...session, messages: session.messages ? [...session.messages] : [] } : null;
  });
  const showFullLayout = computed(() => !['/feedback', '/my-collections', '/not-found', '/login'].includes(route.path));
  const filteredHistory = computed(() => chatStore.filteredHistory);

  // ---- 工具函数 ----
  const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
  const getCurrentAgentToken = () => getAgentToken() || window.__AGENT_TOKEN__ || '';
  const buildUnifiedAgentPayload = (workflowCode: string, bizParams: Record<string, any>) => {
    const agentToken = getCurrentAgentToken();
    if (!agentToken) throw new Error('未找到 agent_token，请先登录或通过平台授权进入');
    return { request_id: generateUUID(), session_id: currentConversationUuid.value, timestamp: Date.now(), agent_token: agentToken, intent_tag: workflowCode, context: { activeTab: activeTab.value, routePath: route.path }, biz_params: { inputs: bizParams } };
  };
  const scrollToBottom = () => {
    nextTick(() => {
      const scroll = () => {
        for (const sel of ['.dynamic-content', '.conversation-history', '.intelligent-qa']) {
          const el = document.querySelector(sel);
          if (el) try { el.scrollTop = el.scrollHeight; } catch {}
        }
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
      };
      requestAnimationFrame(() => { scroll(); requestAnimationFrame(scroll); });
    });
  };
  const getTabByFunctionId = (fid?: string) => ({ qa: '智能问答', search: '智能检索', draft: '辅助起草', review: '合规审核' }[fid || ''] || activeTab.value);
  const getRouteByTabName = (tab: string) => ({ '智能问答': '/intelligent-qa', '智能检索': '/intelligent-retrieval', '辅助起草': '/auxiliary-draft', '合规审核': '/compliance-review' }[tab] || '/intelligent-qa');

  // ---- 初始化子 composable ----
  const compliance = useComplianceReview({ appStore, userStore, chatStore, activeChatId, currentConversationUuid, isStreaming });
  const streamTask = useStreamTask({ chatStore, activeChatId, activeTab, isStreaming, currentAnswer, currentReasoning, currentStreamingMessageId, getCurrentAgentToken, getTabByFunctionId });
  const streamChunk = useStreamChunk({ chatStore, activeChatId, activeTab, currentConversationUuid, isStreaming, currentAnswer, currentReasoning, currentStreamingMessageId, scrollToBottom, streamTask });
  streamTask.setProcessStreamChunk(streamChunk.processStreamChunk);

  const sessionManager = useSessionManager({
    chatStore, activeChatId, activeTab, currentConversationUuid, currentReasoning, currentAnswer,
    currentStreamingMessageId, isHistoryChatActive, isSourcesPanelVisible, isSelectingHistoryChat,
    sidebarCollapsed, hasAutoCreated, generateUUID, scrollToBottom, streamTask, compliance,
  });

  // ---- 从子 composable 解构返回成员 ----
  const { uploadedFileName, uploadedFileUrl, selectedDimensions, isComplianceFileProcessing, complianceFileProcessingText, isComplianceSubmitting, uploadedFileMeta, uploadFileToAgentArts, customUpload, handleRemoveUploadedFile, handleSelectAll, lastComplianceParams } = compliance;

  // ---- 智能问答多文件上传处理函数 ----

  /**
   * 智能问答允许的文件扩展名白名单。
   * 后端 AgentArts 目前支持：PDF / Word / Excel / PPT / 文本类 / 图片类。
   * 不在列表中的类型会被前端直接拦截，给出"不支持该文件类型上传"提示。
   */
  const QA_SUPPORTED_EXTENSIONS = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv',
  ];

  /**
   * 校验文件扩展名是否在白名单内。
   * @param file - 待上传文件
   * @returns true 表示允许上传
   */
  const isQASupportedFile = (file: File): boolean => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    return QA_SUPPORTED_EXTENSIONS.includes(ext);
  };

  /**
   * QA 模式下 PDF 文件上传处理：detectReviewPdf + prepareReviewPdf + buildTxtFile + uploadFile。
   * 与合规审核不同，QA 静默调用 detectReviewPdf（不展示检测阶段文案），用户只看到解析和上传进度。
   *
   * @param file - PDF 文件
   * @returns 上传结果（含 fileUrl、originalText 等）
   */
  const uploadPdfForQA = async (file: File) => {
    const sessionId = currentConversationUuid.value || activeChatId.value || undefined;
    const userId = String((userStore.user as any)?.user_id || (userStore.user as any)?.id || '').trim() || undefined;

    // 1. 静默调用 detectReviewPdf（后端需要该检测结果，但 QA 模式不展示此阶段文案）
    const detectResult = await detectReviewPdf(file, { sessionId, userId });
    const detectInfo = detectResult?.detect || {};
    const detectPdfInfo = detectResult?.pdf_detect || {};
    const locatorAvailable = Boolean(
      detectInfo.locator_available ?? detectPdfInfo.can_use_pdf_locator,
    );
    const detectReason =
      detectInfo.reason ||
      detectPdfInfo.locator_unavailable_reason ||
      '';

    // 2. mineru25-pro 解析 PDF 文本（展示解析进度文案）
    qaFileProcessingText.value = `正在解析 PDF（${file.name}）文件内容，请稍候...`;
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
      throw new Error('PDF 解析结果为空，无法继续上传');
    }

    // 3. 将解析文本转为 txt 文件，复用 AgentArts 上传
    qaFileProcessingText.value = `正在上传解析后的 PDF（${file.name}）文本...`;
    const parsedTxtFile = buildTxtFileFromPdfParsedText(parsedText, file.name);
    const uploadResult = await uploadFileToAgentArts(parsedTxtFile, {
      originalText: parsedText,
    });

    return {
      fileName: file.name,
      fileUrl: uploadResult.fileUrl,
      uploadFileId: uploadResult.uploadFileId,
      originalText: parsedText,
      fileType: 'pdf',
      fileSize: file.size,
      pdfContextId: prepareResult?.context_id || '',
      pdfType: prepareResult?.pdf_detect?.pdf_type || detectPdfInfo.pdf_type || '',
      locatorAvailable,
      locatorReason: detectReason,
    };
  };

  /**
   * 生成 QA 文件唯一 ID（内部用，不依赖后端）。
   * 格式：qa_ + 时间戳 + 6位随机数。
   */
  const genQAFileUid = (): string =>
    `qa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  /**
   * 智能问答模式的 Element Plus 自定义上传回调。
   * 特点：
   *  - 支持多文件依次追加（el-upload multiple=true 时按文件逐个回调）。
   *  - 上传前先校验文件类型，不支持则直接 ElMessage 报错且不插入卡片。
   *  - 校验通过后立即插入 status=uploading 卡片让用户看到。
   *  - PDF 文件：复用合规审核的 detect + prepare + buildTxtFile + upload 流程（mineru25-pro 解析）。
   *  - 非 PDF 文件：直接调用 uploadFileToAgentArts 上传，前端轻量提取可读文本。
   *  - 全部上传结束后统一恢复 isQAFileProcessing=false。
   *
   * @param options - Element Plus Upload 回调参数 { file, onSuccess, onError }
   */
  const customUploadQA = async (options: any) => {
    const { file, onSuccess, onError } = options;
    const rawFile: File = file;
    if (!rawFile) { onError?.(new Error('文件对象为空')); return; }

    // 校验文件类型：不支持则直接报 ElMessage 且不插入卡片、不调用 onError（避免组件二次报错）
    if (!isQASupportedFile(rawFile)) {
      ElMessage.warning({ message: '不支持该文件类型上传', offset: 72 });
      return;
    }

    // 进入上传前：计数 +1，标记处理中，立即插入 uploading 卡片
    qaUploadPendingCount += 1;
    isQAFileProcessing.value = true;
    qaFileProcessingText.value = isPdfFile(rawFile)
      ? `正在解析 PDF（${rawFile.name}）文件内容，请稍候...`
      : `正在上传文件（${rawFile.name}），请稍候...`;
    const uid = genQAFileUid();
    const pendingItem: QAUploadedFile = {
      uid,
      name: rawFile.name,
      size: rawFile.size,
      fileType: rawFile.name.split('.').pop()?.toLowerCase() || rawFile.type || '',
      status: 'uploading',
      raw: rawFile,
    };
    qaUploadedFileList.value.push(pendingItem);

    try {
      let fileUrl = '';
      let uploadFileId = '';
      let parsedOriginalText = '';
      let successResult: any = null;

      if (isPdfFile(rawFile)) {
        // PDF 文件：走 detect → prepare → buildTxtFile → upload 流程，复用合规审核解析逻辑
        const pdfResult = await uploadPdfForQA(rawFile);
        fileUrl = pdfResult.fileUrl || '';
        uploadFileId = pdfResult.uploadFileId || '';
        parsedOriginalText = pdfResult.originalText || '';
        successResult = pdfResult;
      } else {
        // 非 PDF 文件：直接上传，前端轻量提取可读文本用于后端参考
        qaFileProcessingText.value = `正在上传文件（${rawFile.name}）...`;
        const text = (await extractReadableFileText(rawFile)) || '';
        const result = await uploadFileToAgentArts(rawFile, { originalText: text });
        fileUrl = result.fileUrl || '';
        uploadFileId = result.uploadFileId || '';
        parsedOriginalText = result.originalText || text;
        successResult = result;
      }

      // 找到列表中对应位置，更新为 success + 上传结果
      const idx = qaUploadedFileList.value.findIndex((it) => it.uid === uid);
      if (idx >= 0) {
        qaUploadedFileList.value[idx] = {
          ...qaUploadedFileList.value[idx],
          fileUrl,
          uploadFileId,
          originalText: parsedOriginalText,
          status: 'success',
        };
      }
      onSuccess?.(successResult, rawFile);
    } catch (error: any) {
      // 上传失败：直接从列表中移除该文件卡片，不保留 error 状态
      const idx = qaUploadedFileList.value.findIndex((it) => it.uid === uid);
      if (idx >= 0) {
        qaUploadedFileList.value.splice(idx, 1);
      }
      ElMessage.warning({
        message: `文件「${rawFile.name}」上传失败`,
        offset: 72,
      });
      onError?.(error);
    } finally {
      // 计数 -1，全部并发任务都结束后才恢复 processing=false，并清空文案
      qaUploadPendingCount = Math.max(0, qaUploadPendingCount - 1);
      if (qaUploadPendingCount === 0) {
        isQAFileProcessing.value = false;
        qaFileProcessingText.value = '';
      }
    }
  };

  /**
   * 智能问答模式：删除单个已上传文件（卡片右上 ×）。
   * 流式输出或上传处理中禁止删除，避免与发送流程冲突。
   *
   * @param uid - 文件唯一标识
   */
  const handleRemoveQAFile = (uid: string) => {
    if (isStreaming.value) {
      ElMessage.warning('当前任务正在生成中，暂不能删除上传文件');
      return;
    }
    const target = qaUploadedFileList.value.find((it) => it.uid === uid);
    if (!target) return;
    if (target.status === 'uploading') {
      ElMessage.warning('文件正在上传中，请稍候再删除');
      return;
    }
    qaUploadedFileList.value = qaUploadedFileList.value.filter((it) => it.uid !== uid);
    ElMessage.success({ message: `已删除文件「${target.name}」`, offset: 72 });
  };

  /** 工具：清空 QA 已上传文件列表（消息发送成功后由 messageSender 调用）。 */
  const clearQAUploadeFileList = () => {
    qaUploadedFileList.value = [];
    qaUploadPendingCount = 0;
    isQAFileProcessing.value = false;
    qaFileProcessingText.value = '';
  };

  // ---- messageSender：必须放在 QA 上传函数与 clearQAUploadeFileList 之后（依赖它们） ----
  const messageSender = useMessageSender({
    chatStore, activeChatId, activeTab, currentConversationUuid, isStreaming, currentReasoning,
    currentAnswer, currentStreamingMessageId, inputText, scopesData, generateUUID,
    buildUnifiedAgentPayload, scrollToBottom, compliance, streamTask, streamChunk, sessionManager,
    // 智能问答多文件上传：消息发送时读取文件列表、发送后清空
    qaUploadedFileList,
    clearQAUploadeFileList,
  });

  const { detachStreamSubscription, persistStreamTasks, loadPersistedStreamTasks, getCurrentActiveRunningTask, getLatestResumableTaskForFunction, getLastActiveSession, confirmLeaveStreamingIfNeeded } = streamTask;
  const { stopStream } = streamChunk;
  const { resetCurrentChat, toggleSidebar, handleNewChat, handleSelectChat, handleDeleteChat, handleClearHistory, handleToggleFavorite, handleTogglePin, handleUpdateTitle } = sessionManager;
  const { handleSendMessage, handleRegenerate } = messageSender;

  // ---- Tab 切换 ----
  const handleLogout = async () => {
    detachStreamSubscription();
    await userStore.logout();
    router.replace({ path: '/login', query: { redirect: route.fullPath } });
  };

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
    if (tab !== '合规审核') lastComplianceParams.value = null;
    const routeMap: Record<string, string> = { '智能问答': '/intelligent-qa', '智能检索': '/intelligent-retrieval', '辅助起草': '/auxiliary-draft', '合规审核': '/compliance-review' };
    const targetRoute = routeMap[tab];
    if (targetRoute && route.path !== targetRoute) {
      const showSkeleton = !historySkeletonShownTabs.has(tab);
      if (showSkeleton) { historySkeletonShownTabs.add(tab); isHistoryListLoading.value = true; }
      skipNextRouteSessionRestore = true;
      try { await router.push(targetRoute); } catch (error) {
        skipNextRouteSessionRestore = false;
        if (showSkeleton) { historySkeletonShownTabs.delete(tab); isHistoryListLoading.value = false; }
        throw error;
      }
    }
    return true;
  };

  const queryConversationsForCurrentRoute = async () => {
    const map: Record<string, string> = { '/intelligent-qa': '智能问答', '/intelligent-retrieval': '智能检索', '/auxiliary-draft': '辅助起草', '/compliance-review': '合规审核' };
    const tab = map[route.path];
    if (tab) { activeTab.value = tab; chatStore.setCurrentActiveTab(tab); await chatStore.queryConversationsByFunc(); }
  };

  // ---- 搜索 ----
  const handleSearchHistory = async (keyword: string) => {
    historySearchKeyword.value = keyword;
    if (!keyword.trim()) { historySearchResults.value = []; return; }
    historySearchLoading.value = true;
    try {
      const result = await chatStore.searchHistoryMessages(keyword, chatStore.getFuncIdByTab(activeTab.value), 1, 20);
      historySearchResults.value = result.success ? result.data : [];
      if (!result.success && result.message) ElMessage.warning(result.message);
    } finally { historySearchLoading.value = false; }
  };

  const handleClearHistorySearch = () => { historySearchKeyword.value = ''; historySearchResults.value = []; };

  const scrollToMessage = (messageId?: string) => {
    if (!messageId) return;
    nextTick(() => {
      const node = document.querySelector(`[data-message-id="${messageId}"]`);
      if (node) { node.scrollIntoView({ block: 'center', behavior: 'smooth' }); node.classList.add('history-search-hit'); window.setTimeout(() => node.classList.remove('history-search-hit'), 1600); }
    });
  };

  const handleSelectSearchResult = async (result: any) => {
    const sessionId = result.sessionId || result.session_id || result.id;
    if (!sessionId) return;
    const targetTab = getTabByFunctionId(result.functionId || result.function_id);
    const targetRoute = getRouteByTabName(targetTab);
    if (activeTab.value !== targetTab) { activeTab.value = targetTab; chatStore.setCurrentActiveTab(targetTab); }
    if (route.path !== targetRoute) await router.push({ path: targetRoute, query: { id: sessionId, qaId: result.qaId || result.qa_id || '' } });
    await handleSelectChat(sessionId);
    scrollToMessage(result.qaId || result.qa_id);
  };

  // ---- 恢复会话 ----
  const restorePreferredSessionForCurrentRoute = async () => {
    const fid = chatStore.getFuncIdByTab(activeTab.value);
    const task = getLatestResumableTaskForFunction(fid);
    if (task) { await handleSelectChat(task.sessionId); return true; }
    const last = getLastActiveSession(fid);
    if (last && chatStore.getChatSession(last)) { await handleSelectChat(last); return true; }
    return false;
  };

  const handleSourcesPanelToggle = (visible: boolean) => {
    isSourcesPanelVisible.value = visible;
    if (visible && activeTab.value === '合规审核') sidebarCollapsed.value = true;
  };

  // ---- 计算属性（依赖 composable 状态） ----
  const inputPlaceholder = computed(() => {
    if (activeTab.value === '智能问答') return '请输入你的问题';
    if (activeTab.value === '辅助起草') return '您好，请描述你的制度要求，包括使用范围、制度等级、核心条款、特殊要求等...';
    if (activeTab.value === '合规审核') return uploadedFileName.value ? '' : '请上传文件并选择审核维度';
    return '请输入你的内容';
  });
  const isSendDisabled = computed(() => {
    if (activeTab.value === '合规审核')
      return isComplianceFileProcessing.value || isComplianceSubmitting.value || isStreaming.value || !uploadedFileUrl.value || selectedDimensions.value.length === 0;
    return isStreaming.value;
  });
  const inputContainerStyle = computed<CSSProperties>(() => {
    if (isSourcesPanelVisible.value) {
      if (activeTab.value === '合规审核') return { width: 'calc(50% - 26px)', margin: '0 auto 3px 18px', boxSizing: 'border-box' };
      if (activeTab.value === '智能问答' || activeTab.value === '辅助起草')
        return { width: 'calc((100% - var(--sources-panel-width, 450px)) * 0.8)', margin: '0 0 3px calc((100% - var(--sources-panel-width, 450px)) * 0.1)', boxSizing: 'border-box' };
    }
    return { width: '80%', margin: '0 auto 3px', boxSizing: 'border-box' };
  });

  // ---- 生命周期 ----
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    persistStreamTasks(true);
    if (getCurrentActiveRunningTask()) { event.preventDefault(); event.returnValue = ''; }
  };

  onMounted(async () => {
    if (!showFullLayout.value) return;
    window.addEventListener('beforeunload', handleBeforeUnload);
    loadPersistedStreamTasks();
    isHistoryListLoading.value = true;
    try { await queryConversationsForCurrentRoute(); } finally {
      historySkeletonShownTabs.add(activeTab.value);
      await nextTick();
      isHistoryListLoading.value = false;
    }
    const sessionId = route.query.id as string;
    if (sessionId) await handleSelectChat(sessionId);
    else await restorePreferredSessionForCurrentRoute();
    if (chatStore.historyList.length === 0 && !activeChatId.value && !hasAutoCreated.value) {
      hasAutoCreated.value = true;
      handleNewChat();
    }
  });

  watch(() => route.fullPath, async () => {
    if (!showFullLayout.value) return;
    try { await queryConversationsForCurrentRoute(); } finally { await nextTick(); isHistoryListLoading.value = false; }
    if (skipNextRouteSessionRestore) { skipNextRouteSessionRestore = false; detachStreamSubscription(); resetCurrentChat(); return; }
    const sessionId = route.query.id as string;
    if (sessionId) await handleSelectChat(sessionId);
    else {
      detachStreamSubscription();
      resetCurrentChat();
      const restored = await restorePreferredSessionForCurrentRoute();
      if (!restored && route.path === '/intelligent-qa' && chatStore.historyList.length === 0 && !activeChatId.value && !hasAutoCreated.value) {
        hasAutoCreated.value = true;
        handleNewChat();
      }
    }
  }, { immediate: false });

  onUnmounted(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    persistStreamTasks(true);
    detachStreamSubscription(false);
  });

  return {
    activeChatId, activeTab, currentAnswer, currentChatData, currentReasoning,
    currentStreamingMessageId, customUpload, filteredHistory, handleClearHistory,
    handleDeleteChat, handleLogout, handleNewChat, handleRegenerate, handleSelectAll,
    handleSelectChat, handleSendMessage, handleRemoveUploadedFile, handleSearchHistory,
    handleClearHistorySearch, handleSelectSearchResult, handleSourcesPanelToggle,
    handleTabChange, handleToggleFavorite, handleTogglePin, handleUpdateTitle,
    inputContainerStyle, historySearchKeyword, historySearchResults, historySearchLoading,
    inputPlaceholder, isHistoryChatActive, isHistoryListLoading, isSendDisabled,
    isSelectingHistoryChat, isSourcesPanelVisible, isStreaming, selectedDimensions,
    showFullLayout, sidebarCollapsed, stopStream, toggleSidebar, uploadedFileMeta,
    uploadedFileName, isComplianceFileProcessing, complianceFileProcessingText, userStore,
    // ---- 智能问答多文件上传新增导出 ----
    customUploadQA,
    qaUploadedFileList,
    isQAFileProcessing,
    qaFileProcessingText,
    handleRemoveQAFile,
    clearQAUploadeFileList,
  };
};
