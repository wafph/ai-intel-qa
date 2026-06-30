/**
 * 会话管理组合函数。
 *
 * 负责会话 CRUD（创建、选择、删除、清空）、标题管理、收藏/置顶切换。
 * 从 useAppShell 中拆分而来，保持业务逻辑完全不变。
 */
import { nextTick, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import { authRequest, isSuccessStatus } from '@/services/http';
import { API } from '@/api/api';
import type { ChatSession, HistoryItem } from '@/types/chat';

/** useSessionManager 的依赖注入参数。 */
interface UseSessionManagerDeps {
  chatStore: any;
  activeChatId: Ref<string>;
  activeTab: Ref<string>;
  currentConversationUuid: Ref<string>;
  currentReasoning: Ref<string>;
  currentAnswer: Ref<string>;
  currentStreamingMessageId: Ref<string | null>;
  isHistoryChatActive: Ref<boolean>;
  isSourcesPanelVisible: Ref<boolean>;
  isSelectingHistoryChat: Ref<boolean>;
  sidebarCollapsed: Ref<boolean>;
  hasAutoCreated: { value: boolean };
  generateUUID: () => string;
  scrollToBottom: () => void;
  streamTask: any;
  compliance: any;
}

export const useSessionManager = (deps: UseSessionManagerDeps) => {
  const {
    chatStore, activeChatId, activeTab, currentConversationUuid,
    currentReasoning, currentAnswer, currentStreamingMessageId,
    isHistoryChatActive, isSourcesPanelVisible, isSelectingHistoryChat,
    sidebarCollapsed, hasAutoCreated, generateUUID, scrollToBottom,
    streamTask, compliance,
  } = deps;

  const {
    confirmLeaveStreamingIfNeeded, detachStreamSubscription, resetStreamState,
    persistLastActiveSession, getTaskBySessionId, ensureLocalSessionForTask,
    registerRunningTasksFromSession, registerRecoverableTaskFromSession,
    resumeTaskForSession,
  } = streamTask;
  const { getComplianceParamsFromSession, lastComplianceParams } = compliance;

  /** 统一设置会话标题和预览。 */
  const applySessionTitle = (sessionId: string, title?: string, preview?: string) => {
    const normalizedTitle = String(title || '').trim();
    if (!sessionId || !normalizedTitle) return;
    const session = chatStore.getChatSession(sessionId);
    if (session) session.title = normalizedTitle;
    chatStore.updateHistoryItem(sessionId, {
      title: normalizedTitle, sessionTitle: normalizedTitle,
      ...(preview !== undefined ? { preview } : {}),
    } as any);
  };

  /** 重置当前对话状态。 */
  const resetCurrentChat = () => {
    activeChatId.value = '';
    currentConversationUuid.value = '';
    currentReasoning.value = '';
    currentAnswer.value = '';
    currentStreamingMessageId.value = null;
    isHistoryChatActive.value = false;
  };

  const toggleSidebar = () => { sidebarCollapsed.value = !sidebarCollapsed.value; };

  let isCreatingChat = false;
  let creationPromise: Promise<void> | null = null;

  /** 创建本地/远程会话。 */
  const createChatForMessage = async () => {
    if (creationPromise) { await creationPromise; return; }
    if (isCreatingChat) return;
    isCreatingChat = true;
    creationPromise = (async () => {
      try {
        const newChatId = generateUUID();
        isHistoryChatActive.value = false;
        activeChatId.value = newChatId;
        currentConversationUuid.value = newChatId;
        const chatTitle = activeTab.value;
        const now = Date.now();
        chatStore.addChatSession({
          id: newChatId, title: chatTitle, time: now,
          type: activeTab.value as any, messages: [],
          menuType: activeTab.value, conversationUuid: newChatId,
        } as ChatSession);
        chatStore.addHistoryItem({
          id: newChatId, title: chatTitle, time: now,
          type: activeTab.value as any, preview: '新对话',
          menuType: activeTab.value, isCollected: false,
        } as HistoryItem);
        scrollToBottom();
      } finally { isCreatingChat = false; }
    })();
    await creationPromise;
    creationPromise = null;
  };

  /** 新建对话。 */
  const handleNewChat = async () => {
    const canLeave = await confirmLeaveStreamingIfNeeded('新建对话');
    if (!canLeave) return false;
    detachStreamSubscription();
    resetCurrentChat();
    isSourcesPanelVisible.value = false;
    scrollToBottom();
    return true;
  };

  /** 选择历史会话。 */
  const handleSelectChat = async (chatId: string) => {
    if (chatId !== activeChatId.value) {
      const canLeave = await confirmLeaveStreamingIfNeeded('切换会话');
      if (!canLeave) return false;
    }
    detachStreamSubscription();
    isSelectingHistoryChat.value = true;
    isHistoryChatActive.value = true;
    try {
      hasAutoCreated.value = false;
      const localTask = getTaskBySessionId(chatId);
      let session = chatStore.getChatSession(chatId);
      if (!session && localTask) session = ensureLocalSessionForTask(localTask);
      if (!session) {
        try {
          const funcId = chatStore.getFuncIdByTab(activeTab.value);
          const messages = await chatStore.querySessionHistory(chatId, funcId);
          if (messages && messages.length > 0) {
            const newSession: ChatSession = {
              id: chatId, title: '从收藏加载的会话', time: Date.now(),
              type: activeTab.value as any, messages,
              menuType: activeTab.value, conversationUuid: chatId,
            };
            chatStore.addChatSession(newSession);
            session = newSession;
          } else return;
        } catch { return; }
      }
      if (session && !(session as any).conversationUuid) (session as any).conversationUuid = chatId;
      currentConversationUuid.value = chatId;
      if (session && (!session.messages || session.messages.length === 0))
        await chatStore.loadSessionHistory(chatId).catch(() => {});
      activeChatId.value = chatId;
      await nextTick();
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
    } finally { isSelectingHistoryChat.value = false; }
    return true;
  };

  /** 删除会话。 */
  const handleDeleteChat = async (chatId: string) => {
    await chatStore.deleteConversationBySession(chatId);
    if (activeChatId.value === chatId) {
      if (chatStore.historyList.length > 0) {
        activeChatId.value = chatStore.historyList[0].id;
        isHistoryChatActive.value = true;
        const chat = chatStore.getChatSession(chatStore.historyList[0].id);
        if (chat && (chat as any).conversationUuid)
          currentConversationUuid.value = (chat as any).conversationUuid;
      } else {
        activeChatId.value = '';
        currentConversationUuid.value = '';
        isHistoryChatActive.value = false;
      }
    }
  };

  /** 清空所有历史。 */
  const handleClearHistory = async () => {
    await chatStore.clearAllConversations();
    chatStore.historyList = [];
    chatStore.chatSessions = {};
    activeChatId.value = '';
    currentConversationUuid.value = '';
    isHistoryChatActive.value = false;
    resetStreamState();
  };

  /** 切换收藏状态。 */
  const handleToggleFavorite = (chatId: string) => chatStore.toggleCollect(chatId);

  /** 修改会话标题。 */
  const handleUpdateTitle = async (chatId: string, newTitle: string) => {
    try {
      const success = await chatStore.updateSessionTitle(chatId, newTitle);
      if (success) ElMessage.success('标题修改成功');
      else ElMessage.error('标题更新失败');
    } catch {}
  };

  /** 置顶/取消置顶。 */
  const handleTogglePin = async (chatId: string, topStatus: number) => {
    try {
      const funcId = chatStore.getFuncIdByTab(activeTab.value);
      const response = await authRequest({
        url: API.chat.pin, method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        data: { sessionId: chatId, functionId: funcId, topStatus },
      });
      if (!isSuccessStatus(response.status))
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      const result = response.data;
      const historyItem = chatStore.historyList.find((item: any) => item.id === chatId);
      if (historyItem) historyItem.topStatus = result.data.topStatus;
      const session = chatStore.chatSessions[chatId];
      if (session) session.topStatus = result.data.topStatus;
      ElMessage.success(topStatus === 1 ? '已置顶' : '已取消置顶');
    } catch { ElMessage.error('操作失败，请重试'); }
  };

  return {
    applySessionTitle, resetCurrentChat, toggleSidebar,
    createChatForMessage, handleNewChat, handleSelectChat,
    handleDeleteChat, handleClearHistory, handleToggleFavorite,
    handleTogglePin, handleUpdateTitle,
  };
};
