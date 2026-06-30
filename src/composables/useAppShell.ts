/**
 * 主应用壳组合函数（编排器）。
 *
 * 组合 useComplianceReview、useStreamTask、useStreamChunk、
 * useSessionManager、useMessageSender 五个子 composable，
 * 管理基础状态、计算属性、Tab 切换、搜索和生命周期。
 */
import { ref, computed, onMounted, nextTick, onUnmounted, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useChatStore } from '@/stores/chat';
import { useUserStore } from '@/stores/user';
import { ElMessage } from 'element-plus';
import { getAgentToken } from '@/services/authStorage';
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
  const messageSender = useMessageSender({
    chatStore, activeChatId, activeTab, currentConversationUuid, isStreaming, currentReasoning,
    currentAnswer, currentStreamingMessageId, inputText, scopesData, generateUUID,
    buildUnifiedAgentPayload, scrollToBottom, compliance, streamTask, streamChunk, sessionManager,
  });

  // ---- 从子 composable 解构返回成员 ----
  const { uploadedFileName, uploadedFileUrl, selectedDimensions, isComplianceFileProcessing, complianceFileProcessingText, isComplianceSubmitting, uploadedFileMeta, customUpload, handleRemoveUploadedFile, handleSelectAll, lastComplianceParams } = compliance;
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
  };
};
