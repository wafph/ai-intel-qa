import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ChatSession, HistoryItem, ChatMessage } from '../types/chat';

// API基础配置 - 使用新接口地址
const API_BASE_URL = window.__API_BASE_URL__;

export const useChatStore = defineStore('chat', () => {
  const chatSessions = ref<Record<string, ChatSession>>({});
  const historyList = ref<HistoryItem[]>([]);
  const currentActiveTab = ref<string>('智能问答');
  const currentConversationUuid = ref<string>('');
  const loadingSessionIds = ref<Set<string>>(new Set());

  // 获取功能ID映射
  const getFuncIdByTab = (tab: string): string => {
    const funcIdMap: Record<string, string> = {
      智能问答: 'knowledge_qa',
      智能检索: 'knowledge_search',
      辅助起草: 'knowledge_draft',
      合规审核: 'knowledge_review',
    };
    return funcIdMap[tab] || 'knowledge_qa';
  };

  // 格式化时间为标准格式
  const formatDateTime = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  // 过滤后的历史记录（基于当前菜单）
  const filteredHistory = computed(() => {
    return historyList.value.filter(
      (item: any) => item.menuType === currentActiveTab.value,
    );
  });

  // 收藏的历史记录
  const collectedHistory = computed(() => {
    return historyList.value.filter((item: any) => item.isCollected);
  });

  // 切换当前菜单
  const setCurrentActiveTab = (tab: string) => {
    currentActiveTab.value = tab;
  };

  // 设置当前会话UUID
  const setCurrentConversationUuid = (uuid: string) => {
    currentConversationUuid.value = uuid;
  };

  const addHistoryItem = (item: HistoryItem) => {
    const exists = historyList.value.some((h) => h.id === item.id);
    if (exists) return;

    historyList.value.unshift({
      ...item,
      topStatus: item.topStatus || 0,
    });
  };

  // 更新历史记录
  const updateHistoryItem = (id: string, updates: Partial<HistoryItem>) => {
    const index = historyList.value.findIndex((item) => item.id === id);
    if (index !== -1) {
      historyList.value[index] = { ...historyList.value[index], ...updates };
    }
  };

  // 删除历史记录（只更新内存状态）
  const deleteHistoryItem = (id: string) => {
    const index = historyList.value.findIndex((item) => item.id === id);
    if (index !== -1) {
      historyList.value.splice(index, 1);
    }
  };

  // 切换收藏状态
  const toggleCollect = (id: string) => {
    const index = historyList.value.findIndex((item: any) => item.id === id);
    if (index !== -1) {
      const newCollectStatus = !historyList.value[index].isCollected;
      historyList.value[index].isCollected = newCollectStatus;

      // 同步收藏状态到服务器（接口7）
      syncCollectStatus(id, newCollectStatus);
    }
  };

  // 获取聊天会话
  const getChatSession = (id: string) => {
    return chatSessions.value[id];
  };

  // 添加聊天会话（只更新内存状态）
  const addChatSession = (session: ChatSession) => {
    chatSessions.value[session.id] = session;
  };

  // 接口1：保存/追加单条问答
  const saveConversationToServer = async (
    sessionUuid: string,
    qaId: string,
    userMessage: ChatMessage,
    assistantMessage: ChatMessage,
    likeStatus: number,
    dislikeStatus: number,
  ): Promise<{ success: boolean; insertId?: string }> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);
      const inputTime = formatDateTime(new Date(userMessage.timestamp));
      const outputTime = formatDateTime(new Date(assistantMessage.timestamp));

      if (assistantMessage.vote === 'like') likeStatus = 1;
      if (assistantMessage.vote === 'dislike') dislikeStatus = 1;

      // 确定收藏状态
      const collectStatus = historyList.value.find((item: any) => item.id === sessionUuid)
        ?.isCollected
        ? 1
        : 0;

      // 准备answer对象
      const answer = {
        responseContent: assistantMessage.content || '',
        data_json: assistantMessage.sources || [],
      };

      const payload = {
        sessionId: sessionUuid,
        functionId: funcId,
        questionContent: userMessage.content,
        answer: answer,
        qaId: qaId,
        questionTime: inputTime,
        answerTime: outputTime,
        likeStatus: likeStatus,
        dislikeStatus: dislikeStatus,
        favoriteStatus: collectStatus,
      };
      const response = await fetch(`${API_BASE_URL}/v1/chat/history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      const result = await response.json();
      return { success: true, insertId: result.insert_id };
    } catch (error) {
      return { success: false };
    }
  };

  // 接口2：批量保存问答历史（如果需要）
  const saveBatchConversationToServer = async (
    sessionUuid: string,
    historyJson: any[],
  ): Promise<boolean> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);

      const payload = {
        sessionId: sessionUuid,
        functionId: funcId,
        sessionTitle: '会话标题',
        historyJson: historyJson,
      };

      const response = await fetch(`${API_BASE_URL}/v1/chat/history/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }
      return true;
    } catch (error) {
      return false;
    }
  };

  // 接口3：查询左侧最近会话列表
  const queryConversationsByFunc = async (): Promise<any> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);
      const limit = 30;
      const url = `${API_BASE_URL}/v1/chat/sessions?functionId=${funcId}&limit=${limit}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP错误! 状态: ${response.status}`);

      const result = await response.json();
      if (result && result.code === 0 && Array.isArray(result.data)) {
        historyList.value = [];
        chatSessions.value = {};

        for (const sessionData of result.data) {
          const sessionUuid = sessionData.sessionId;
          const sessionTitle = sessionData.sessionTitle || '新会话';
          const historyCount = sessionData.historyCount || 0;
          const lastMessageTime = sessionData.lastMessageTime;
          const createTime = sessionData.createTime || lastMessageTime;

          const createTimestamp = new Date(createTime).getTime();
          if (isNaN(createTimestamp)) continue;

          // ✅ 创建历史记录项，包含 topStatus
          const historyItem: HistoryItem = {
            id: sessionUuid,
            title: sessionTitle,
            preview: `共 ${historyCount} 条对话`,
            time: createTimestamp,
            type: currentActiveTab.value as any,
            menuType: currentActiveTab.value,
            isCollected: sessionData.favoriteStatus === 1,
            topStatus: sessionData.topStatus || 0, // ✅ 从服务器获取置顶状态
            sessionTitle: sessionTitle,
            historyCount: historyCount,
            lastMessageTime: lastMessageTime,
          };

          // 创建会话对象
          const session: ChatSession = {
            id: sessionUuid,
            title: sessionTitle,
            time: createTimestamp,
            type: currentActiveTab.value as any,
            messages: [],
            menuType: currentActiveTab.value,
            conversationUuid: sessionUuid,
            historyCount: historyCount,
            lastMessageTime: lastMessageTime,
            topStatus: sessionData.topStatus || 0, // ✅ 从服务器获取置顶状态
          };

          chatSessions.value[sessionUuid] = session;
          historyList.value.push(historyItem);
        }

        historyList.value.sort((a, b) => b.time - a.time);
      }

      return result;
    } catch (error) {
      return null;
    }
  };

  // 接口4：修改会话标题
  const updateSessionTitle = async (
    sessionUuid: string,
    newTitle: string,
  ): Promise<boolean> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);

      const payload = {
        sessionId: sessionUuid,
        functionId: funcId,
        sessionTitle: newTitle,
      };
      const response = await fetch(`${API_BASE_URL}/v1/chat/title`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      // 更新本地数据
      const session = chatSessions.value[sessionUuid];
      if (session) {
        session.title = newTitle;
        session.sessionTitle = newTitle;
      }

      const historyItem = historyList.value.find((item: any) => item.id === sessionUuid);
      if (historyItem) {
        historyItem.title = newTitle;
      }

      return true;
    } catch (error) {
      return false;
    }
  };

  // 接口7：更新点赞/点踩/收藏状态
  const syncCollectStatus = async (
    sessionUuid: string,
    isCollected: boolean,
  ): Promise<boolean> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);
      const qaId = '';

      const payload = {
        sessionId: sessionUuid,
        functionId: funcId,
        qaId: qaId,
        favoriteStatus: isCollected ? 1 : 0,
      };

      const response = await fetch(`${API_BASE_URL}/v1/chat/favorite`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }
      return true;
    } catch (error) {
      return false;
    }
  };

  // 接口7：更新点赞/点踩状态
  const syncLikeStatus = async (
    qaId: string,
    likeStatus: number,
    dislikeStatus: number,
    sessionUuid: string,
  ): Promise<boolean> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);

      const payload = {
        sessionId: sessionUuid,
        functionId: funcId,
        qaId: qaId,
        likeStatus: likeStatus,
        dislikeStatus: dislikeStatus,
      };
      const url = `${API_BASE_URL}/v1/chat/status`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态: ${response.status}, URL: ${url}`);
      }
      return true;
    } catch {
      return false;
    }
  };

  // 更新消息的点赞状态
  const updateMessageVote = (
    sessionId: string,
    messageId: string,
    vote: 'like' | 'dislike' | null,
  ) => {
    const session = chatSessions.value[sessionId];
    if (!session) return;

    const message = session.messages.find((msg: any) => msg.id === messageId);
    if (!message) return;

    message.vote = vote;

    // 更新点赞/点踩计数
    if (vote === 'like') {
      message.likeCount = (message.likeCount || 0) + 1;
      message.dislikeCount = 0;
    } else if (vote === 'dislike') {
      message.dislikeCount = (message.dislikeCount || 0) + 1;
      message.likeCount = 0;
    } else {
      message.likeCount = 0;
      message.dislikeCount = 0;
    }

    // 同步到服务器
    const likeStatus = vote === 'like' ? 1 : 0;
    const dislikeStatus = vote === 'dislike' ? 1 : 0;
    syncLikeStatus(messageId, likeStatus, dislikeStatus, sessionId);
  };

  // 删除会话（调用后端接口）
  const deleteConversationBySession = async (sessionUuid: string): Promise<boolean> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);
      const url = `${API_BASE_URL}/v1/chat/history?functionId=${funcId}&sessionId=${sessionUuid}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      const result = await response.json();
      // 假设后端返回格式：{ code: 0, msg: 'success' }
      if (result && result.code === 0) {
        // 从本地删除
        deleteHistoryItem(sessionUuid);
        delete chatSessions.value[sessionUuid];
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  };

  // 在现有的 useChatStore 中添加以下函数：

  // 接口9：查询收藏会话列表
  const queryFavoriteSessions = async (
    functionId?: string, // 可选，不传则查询全部收藏
    limit: number = 30,
  ): Promise<{ success: boolean; data?: any[] }> => {
    try {
      let url = `${API_BASE_URL}/v1/chat/favorites?limit=${limit}`;

      if (functionId && functionId.trim() !== '') {
        url += `&functionId=${functionId}`;
      }
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      const result = await response.json();
      if (result && result.code === 0 && Array.isArray(result.data)) {
        return { success: true, data: result.data };
      } else {
        return { success: false };
      }
    } catch (error) {
      return { success: false };
    }
  };

  // 接口10：查询收藏会话详情
  const queryFavoriteSessionDetail = async (
    sessionUuid: string,
    functionId: string,
  ): Promise<{ success: boolean; data?: any }> => {
    try {
      const url = `${API_BASE_URL}/v1/chat/favorites/detail?functionId=${functionId}&sessionId=${sessionUuid}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      const result = await response.json();
      if (result && result.code === 0 && result.data) {
        return { success: true, data: result.data };
      } else {
        return { success: false };
      }
    } catch (error) {
      return { success: false };
    }
  };

  // 加载会话列表
  const loadConversations = async () => {
    await queryConversationsByFunc();
  };

  // 清空所有会话
  const clearAllConversations = async () => {
    const sessionUuids = Object.keys(chatSessions.value);

    for (const sessionUuid of sessionUuids) {
      await deleteConversationBySession(sessionUuid);
    }
  };

  // 加载会话历史
  const loadSessionHistory = async (sessionUuid: string): Promise<boolean> => {
    try {
      if (loadingSessionIds.value.has(sessionUuid)) {
        return false;
      }

      loadingSessionIds.value.add(sessionUuid);

      const funcId = getFuncIdByTab(currentActiveTab.value);
      const session = chatSessions.value[sessionUuid];

      if (!session) {
        loadingSessionIds.value.delete(sessionUuid);
        return false;
      }

      // 如果已经有消息，则不需要重新加载
      if (session.messages && session.messages.length > 0) {
        loadingSessionIds.value.delete(sessionUuid);
        return true;
      }

      const messages = await querySessionHistory(sessionUuid, funcId);
      if (messages && messages.length > 0) {
        // 创建新的会话对象，确保响应式更新
        const updatedSession = {
          ...session,
          messages: [...messages],
        };

        // 直接替换整个会话对象
        chatSessions.value = {
          ...chatSessions.value,
          [sessionUuid]: updatedSession,
        };

        loadingSessionIds.value.delete(sessionUuid);
        return true;
      } else {
        console.warn('No messages found for session:', sessionUuid);
      }

      loadingSessionIds.value.delete(sessionUuid);
      return false;
    } catch {
      loadingSessionIds.value.delete(sessionUuid);
      return false;
    }
  };

  // 查询会话历史
  const querySessionHistory = async (
    sessionUuid: string,
    funcId: string,
  ): Promise<ChatMessage[]> => {
    try {
      const url = `${API_BASE_URL}/v1/chat/history?functionId=${funcId}&sessionId=${sessionUuid}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      const result = await response.json();
      const messages: ChatMessage[] = [];
      // 适应新的数据结构
      if (
        result &&
        result.code === 0 &&
        result.data &&
        Array.isArray(result.data.historyJson)
      ) {
        const historyJson = result.data.historyJson;

        historyJson.forEach((qa: any) => {
          // 用户消息
          messages.push({
            id: `user_${qa.qaId}`,
            role: 'user',
            content: qa.questionContent,
            timestamp: new Date(qa.questionTime).getTime(),
            vote: null,
          });

          // AI消息
          const sources = qa.answer?.data_json || [];
          const matchScore =
            sources.length > 0
              ? Math.max(...sources.map((s: any) => parseFloat(s.score || '0')))
              : 0;

          messages.push({
            id: qa.qaId,
            role: 'assistant',
            content: qa.answer?.responseContent || '',
            timestamp: new Date(qa.answerTime).getTime(),
            vote:
              qa.likeStatus === 1 ? 'like' : qa.dislikeStatus === 1 ? 'dislike' : null,
            likeCount: qa.likeStatus || 0,
            dislikeCount: qa.dislikeStatus || 0,
            sources: sources,
            match_score: matchScore,
          });
        });
      } else if (
        result &&
        result.code === 0 &&
        result.data &&
        Array.isArray(result.data)
      ) {
        // 兼容旧的数据结构
        result.data.forEach((qa: any) => {
          messages.push({
            id: `user_${qa.qaId}`,
            role: 'user',
            content: qa.questionContent,
            timestamp: new Date(qa.questionTime).getTime(),
            vote: null,
          });

          const sources = qa.answer?.data_json || [];
          const matchScore =
            sources.length > 0
              ? Math.max(...sources.map((s: any) => parseFloat(s.score || '0')))
              : 0;

          messages.push({
            id: qa.qaId,
            role: 'assistant',
            content: qa.answer?.responseContent || '',
            timestamp: new Date(qa.answerTime).getTime(),
            vote:
              qa.likeStatus === 1 ? 'like' : qa.dislikeStatus === 1 ? 'dislike' : null,
            likeCount: qa.likeStatus || 0,
            dislikeCount: qa.dislikeStatus || 0,
            sources: sources,
            match_score: matchScore,
          });
        });
      } else {
        console.error('返回的数据格式不正确:', result);
      }

      return messages;
    } catch (error) {
      console.error('查询会话历史失败:', error);
      return [];
    }
  };

  return {
    chatSessions,
    historyList,
    filteredHistory,
    collectedHistory,
    currentActiveTab,
    currentConversationUuid,
    setCurrentActiveTab,
    setCurrentConversationUuid,
    addHistoryItem,
    updateHistoryItem,
    deleteHistoryItem,
    toggleCollect,
    getChatSession,
    addChatSession,
    saveConversationToServer,
    saveBatchConversationToServer,
    queryConversationsByFunc,
    querySessionHistory,
    updateSessionTitle,
    syncCollectStatus,
    syncLikeStatus,
    updateMessageVote,
    deleteConversationBySession,
    loadConversations,
    clearAllConversations,
    loadSessionHistory,
    getFuncIdByTab,
    queryFavoriteSessions,
    queryFavoriteSessionDetail,
  };
});
