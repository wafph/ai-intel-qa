import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ChatSession, HistoryItem, ChatMessage, SourceInfo } from '../types/chat';

// API基础配置 - 使用新接口地址
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const useChatStore = defineStore('chat', () => {
  const chatSessions = ref<Record<string, ChatSession>>({});
  const historyList = ref<HistoryItem[]>([]);
  const currentActiveTab = ref<string>('智能问答');
  const currentConversationUuid = ref<string>(''); // 当前会话UUID

  // 获取功能ID映射
  const getFuncIdByTab = (tab: string): string => {
    const funcIdMap: Record<string, string> = {
      智能问答: 'knowledge_qa', // 根据接口文档示例
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

  // 添加历史记录
  const addHistoryItem = (item: HistoryItem) => {
    historyList.value.unshift(item);
    saveToLocalStorage();
  };

  // 更新历史记录
  const updateHistoryItem = (id: string, updates: Partial<HistoryItem>) => {
    const index = historyList.value.findIndex((item) => item.id === id);
    if (index !== -1) {
      historyList.value[index] = { ...historyList.value[index], ...updates };
      saveToLocalStorage();
    }
  };

  // 删除历史记录
  const deleteHistoryItem = (id: string) => {
    const index = historyList.value.findIndex((item) => item.id === id);
    if (index !== -1) {
      historyList.value.splice(index, 1);
      saveToLocalStorage();
    }
  };

  // 切换收藏状态
  const toggleCollect = (id: string) => {
    const index = historyList.value.findIndex((item: any) => item.id === id);
    if (index !== -1) {
      const newCollectStatus = !historyList.value[index].isCollected;
      historyList.value[index].isCollected = newCollectStatus;
      saveToLocalStorage();

      // 同步收藏状态到服务器（接口7）
      syncCollectStatus(id, newCollectStatus);
    }
  };

  // 获取聊天会话
  const getChatSession = (id: string) => {
    return chatSessions.value[id];
  };

  // 添加聊天会话
  const addChatSession = (session: ChatSession) => {
    chatSessions.value[session.id] = session;
    saveToLocalStorage();
  };

  // 保存到localStorage
  const saveToLocalStorage = () => {
    try {
      localStorage.setItem('chatSessions', JSON.stringify(chatSessions.value));
      localStorage.setItem('historyList', JSON.stringify(historyList.value));
    } catch (error) {
      console.error('保存到localStorage失败:', error);
    }
  };

  // 从localStorage加载
  const loadFromLocalStorage = () => {
    try {
      const savedSessions = localStorage.getItem('chatSessions');
      const savedHistory = localStorage.getItem('historyList');

      if (savedSessions) {
        chatSessions.value = JSON.parse(savedSessions);
      }
      if (savedHistory) {
        historyList.value = JSON.parse(savedHistory);
      }
    } catch (error) {
      console.error('从localStorage加载失败:', error);
    }
  };

  // 接口1：保存/追加单条问答
  const saveConversationToServer = async (
    sessionUuid: string,
    qaId: string,
    userMessage: ChatMessage,
    assistantMessage: ChatMessage,
    referenceSource: string = '',
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

      console.log('保存对话记录到服务器:', payload);
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
      console.log('对话记录保存成功:', result);
      return { success: true, insertId: result.insert_id };
    } catch (error) {
      console.error('保存对话记录到服务器失败:', error);
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
        sessionTitle: '会话标题', // 可以从会话中获取
        historyJson: historyJson,
      };

      console.log('批量保存对话记录:', payload);
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

      const result = await response.json();
      console.log('批量保存成功:', result);
      return true;
    } catch (error) {
      console.error('批量保存失败:', error);
      return false;
    }
  };

  // 接口3：查询左侧最近会话列表
  const queryConversationsByFunc = async (): Promise<any> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);
      const limit = 30;

      console.log('查询会话列表，功能ID:', funcId);
      const url = `${API_BASE_URL}/v1/chat/sessions?functionId=${funcId}&limit=${limit}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP错误! 状态: ${response.status}`);

      const result = await response.json();
      console.log('会话列表查询结果:', result);

      if (result && Array.isArray(result)) {
        historyList.value = [];
        chatSessions.value = {};

        for (const sessionData of result) {
          const sessionUuid = sessionData.sessionId;
          const sessionTitle = sessionData.sessionTitle || '新会话';
          const historyCount = sessionData.historyCount || 0;
          const lastMessageTime = sessionData.lastMessageTime;
          const createTime = sessionData.createTime || lastMessageTime;
          
          const createTimestamp = new Date(createTime).getTime();
          if (isNaN(createTimestamp)) continue;

          // 创建历史记录项
          const historyItem: HistoryItem = {
            id: sessionUuid,
            title: sessionTitle, // ✅ 使用 sessionTitle
            preview: `共 ${historyCount} 条对话`, // ✅ 使用 historyCount
            time: createTimestamp,
            type: currentActiveTab.value as any,
            menuType: currentActiveTab.value,
            isCollected: sessionData.favoriteStatus === 1,
            sessionTitle: sessionTitle,
            historyCount: historyCount,
            lastMessageTime: lastMessageTime,
          };

          // 查询该会话的完整历史
          const messages = await querySessionHistory(sessionUuid, funcId);
          
          // 创建会话对象
          const session: ChatSession = {
            id: sessionUuid,
            title: sessionTitle,
            time: createTimestamp,
            type: currentActiveTab.value as any,
            messages: messages,
            menuType: currentActiveTab.value,
            conversationUuid: sessionUuid,
            historyCount: historyCount,
            lastMessageTime: lastMessageTime,
          };

          chatSessions.value[sessionUuid] = session;
          historyList.value.push(historyItem);
        }

        historyList.value.sort((a, b) => b.time - a.time);
        console.log('historyList', historyList.value);
        saveToLocalStorage();
      }

      return result;
    } catch (error) {
      console.error('查询会话列表失败:', error);
      return null;
    }
  };

  // 查询单个会话的完整历史
// stores/chat.ts
const querySessionHistory = async (sessionUuid: string, funcId: string): Promise<ChatMessage[]> => {
  try {
    console.log('查询会话完整历史:', sessionUuid, funcId);
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
    console.log('会话历史查询结果:', result);

    const messages: ChatMessage[] = [];
    
    if (result && Array.isArray(result)) {
      result.forEach((qa: any) => {
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
        const matchScore = sources.length > 0 
          ? Math.max(...sources.map((s: any) => parseFloat(s.score || '0')))
          : 0;

        messages.push({
          id: qa.qaId,
          role: 'assistant',
          content: qa.answer?.responseContent || '',
          timestamp: new Date(qa.answerTime).getTime(),
          vote: qa.likeStatus === 1 ? 'like' : (qa.dislikeStatus === 1 ? 'dislike' : null),
          likeCount: qa.likeStatus || 0,
          dislikeCount: qa.dislikeStatus || 0,
          sources: sources,
          match_score: matchScore,
        });
      });
    }

    return messages;
  } catch (error) {
    console.error('查询会话历史失败:', error);
    return [];
  }
};


  // 接口4：修改会话标题
  const updateSessionTitle = async (sessionUuid: string, newTitle: string): Promise<boolean> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);

      const payload = {
        sessionId: sessionUuid,
        functionId: funcId,
        sessionTitle: newTitle,
      };

      console.log('修改会话标题:', payload);
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

      const result = await response.json();
      console.log('会话标题修改成功:', result);

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

      saveToLocalStorage();
      return true;
    } catch (error) {
      console.error('修改会话标题失败:', error);
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
      const qaId = ''; // 需要传入具体的qaId

      const payload = {
        sessionId: sessionUuid,
        functionId: funcId,
        qaId: qaId,
        favoriteStatus: isCollected ? 1 : 0,
      };

      console.log('同步收藏状态:', payload);
      const response = await fetch(`${API_BASE_URL}/v1/chat/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      const result = await response.json();
      console.log('收藏状态同步成功:', result);
      return true;
    } catch (error) {
      console.error('同步收藏状态失败:', error);
      return false;
    }
  };

  // 接口7：更新点赞/点踩状态
  const syncLikeStatus = async (
    qaId: string,
    likeStatus: number,
    dislikeStatus: number,
  ): Promise<boolean> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);
      const sessionUuid = currentConversationUuid.value;

      const payload = {
        sessionId: sessionUuid,
        functionId: funcId,
        qaId: qaId,
        likeStatus: likeStatus,
        dislikeStatus: dislikeStatus,
      };

      console.log('同步点赞状态:', payload);
      const response = await fetch(`${API_BASE_URL}/v1/chat/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      const result = await response.json();
      console.log('点赞状态同步成功:', result);
      return true;
    } catch (error) {
      console.error('同步点赞状态失败:', error);
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
      message.dislikeCount = 0; // 清除点踩
    } else if (vote === 'dislike') {
      message.dislikeCount = (message.dislikeCount || 0) + 1;
      message.likeCount = 0; // 清除点赞
    } else {
      // 取消投票
      message.likeCount = 0;
      message.dislikeCount = 0;
    }

    saveToLocalStorage();

    // 同步到服务器（接口7）
    const likeStatus = vote === 'like' ? 1 : 0;
    const dislikeStatus = vote === 'dislike' ? 1 : 0;
    syncLikeStatus(messageId, likeStatus, dislikeStatus);
  };

  // 删除会话（本地删除，因为没有删除接口）
  const deleteConversationBySession = async (sessionUuid: string): Promise<boolean> => {
    try {
      // 由于没有删除接口，我们只做本地删除
      deleteHistoryItem(sessionUuid);
      delete chatSessions.value[sessionUuid];
      saveToLocalStorage();
      
      console.log('会话已本地删除:', sessionUuid);
      return true;
    } catch (error) {
      console.error('删除会话失败:', error);
      return false;
    }
  };

  // 加载会话列表（初始化时调用）
  const loadConversations = async () => {
    await queryConversationsByFunc();
  };

  // 清空所有会话
  const clearAllConversations = async () => {
    // 获取所有会话UUID
    const sessionUuids = Object.keys(chatSessions.value);

    for (const sessionUuid of sessionUuids) {
      await deleteConversationBySession(sessionUuid);
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
    loadFromLocalStorage,
    saveToLocalStorage,
    saveConversationToServer,
    saveBatchConversationToServer,
    queryConversationsByFunc,
    updateSessionTitle,
    syncCollectStatus,
    syncLikeStatus,
    updateMessageVote,
    deleteConversationBySession,
    loadConversations,
    clearAllConversations,
  };
});