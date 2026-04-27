import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ChatSession, HistoryItem, ChatMessage } from '../types/chat';

// API基础配置
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const useChatStore = defineStore('chat', () => {
  const chatSessions = ref<Record<string, ChatSession>>({});
  const historyList = ref<HistoryItem[]>([]);
  const currentActiveTab = ref<string>('智能问答');
  const currentConversationUuid = ref<string>(''); // 当前会话UUID

  // 获取功能ID映射
  const getFuncIdByTab = (tab: string): string => {
    const funcIdMap: Record<string, string> = {
      智能问答: 'FUNC001',
      智能检索: 'FUNC002',
      辅助起草: 'FUNC003',
      合规审核: 'FUNC004',
    };
    return funcIdMap[tab] || 'FUNC001';
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

      // 同步收藏状态到服务器（接口4）
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

  // 接口1：保存对话记录到服务器
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

      const payload = {
        func_id: funcId,
        session_uuid: sessionUuid,
        qa_id: qaId,
        input_content: userMessage.content,
        output_content: assistantMessage.content || '',
        reference_source: referenceSource,
        like_status: likeStatus,
        dislike_status: dislikeStatus,
        input_time: inputTime,
        output_time: outputTime,
        collect_status: collectStatus,
      };

      console.log('保存对话记录到服务器:', payload);
      const response = await fetch(`${API_BASE_URL}/v1/save_conversation`, {
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

  // 接口2：删除d单条会话全部记录
  const deleteConversationBySession = async (sessionUuid: string): Promise<boolean> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);

      const payload = {
        func_id: funcId,
        session_uuid: sessionUuid,
      };

      console.log('删除会话记录:', payload);
      const response = await fetch(`${API_BASE_URL}/v1/delete_conversation`, {
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
      console.log('会话记录删除成功:', result);

      // 从本地删除
      deleteHistoryItem(sessionUuid);
      delete chatSessions.value[sessionUuid];
      saveToLocalStorage();

      return true;
    } catch (error) {
      console.error('删除会话记录失败:', error);
      return false;
    }
  };

  // 接口3：查询会话列表
  const queryConversationsByFunc = async (): Promise<any> => {
    try {
      const funcId = getFuncIdByTab(currentActiveTab.value);

      const payload = {
        func_id: funcId,
      };

      console.log('查询会话列表:', payload);

      const response = await fetch(`${API_BASE_URL}/v1/query_conversation`, {
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
      console.log('会话列表查询成功:', result);

      // 转换后端数据格式为前端格式
      if (result.code === 200 && result.data) {
        const sessions = result.data;

        // 清空现有数据
        historyList.value = [];
        chatSessions.value = {};

        Object.keys(sessions).forEach((sessionUuid) => {
          const sessionData = sessions[sessionUuid];
          const conversationList = sessionData.conversation_list || [];

          if (conversationList.length > 0) {
            const firstQa = conversationList[0];

            // ✅ 修复：确保时间转换正确
            const createTime = new Date(firstQa.create_time).getTime();

            // 检查时间是否有效
            if (isNaN(createTime)) {
              console.error('无效的创建时间:', firstQa.create_time);
              return; // 跳过这个会话
            }

            const historyItem: HistoryItem = {
              id: sessionUuid,
              title:
                firstQa.input_content.substring(0, 50) +
                (firstQa.input_content.length > 50 ? '...' : ''),
              preview:
                firstQa.output_content.substring(0, 100) +
                (firstQa.output_content.length > 100 ? '...' : ''),
              time: new Date(firstQa.create_time).getTime(),
              type: currentActiveTab.value as any, // ✅ 添加 type 字段
              menuType: currentActiveTab.value,
              isCollected: sessionData.collect_status === 1,
            };

            // ✅ 创建会话消息
            const messages: ChatMessage[] = [];

            conversationList.forEach((qa: any) => {
              // 用户消息
              const inputTime = new Date(qa.input_time).getTime();
              const outputTime = new Date(qa.output_time).getTime();

              // 检查时间是否有效
              if (isNaN(inputTime) || isNaN(outputTime)) {
                console.error('无效的时间:', qa.input_time, qa.output_time);
                return;
              }

              messages.push({
                id: `user_${qa.qa_id}`,
                role: 'user',
                content: qa.input_content,
                timestamp: inputTime as any,
                vote: null,
              });

              // AI消息
              messages.push({
                id: qa.qa_id,
                role: 'assistant',
                content: qa.output_content,
                timestamp: outputTime as any,
                vote:
                  qa.like_status === 1
                    ? 'like'
                    : qa.dislike_status === 1
                      ? 'dislike'
                      : null,
                sources: qa.reference_source
                  ? [{ title: '参考来源', content: qa.reference_source }]
                  : [],
              });
            });

            // ✅ 创建会话
            chatSessions.value[sessionUuid] = {
              id: sessionUuid,
              title: historyItem.title,
              time: createTime, // ✅ 使用正确的时间戳
              type: currentActiveTab.value as any,
              messages: messages,
              menuType: currentActiveTab.value,
              conversationUuid: sessionUuid,
            };

            historyList.value.push(historyItem);
          }
        });

        // 按时间排序
        historyList.value.sort((a, b) => b.time - a.time);
        saveToLocalStorage();
      }

      return result;
    } catch (error) {
      console.error('查询会话列表失败:', error);
      return null;
    }
  };

  // 接口4：修改会话收藏状态
  const syncCollectStatus = async (
    sessionUuid: string,
    isCollected: boolean,
  ): Promise<boolean> => {
    try {
      const payload = {
        session_uuid: sessionUuid,
        collect_status: isCollected ? 1 : 0,
      };

      console.log('同步收藏状态:', payload);

      const response = await fetch(`${API_BASE_URL}/v1/update_collect_status`, {
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
      console.log('收藏状态同步成功:', result);
      return true;
    } catch (error) {
      console.error('同步收藏状态失败:', error);
      return false;
    }
  };

  // 接口5：修改单条问答点赞/点踩状态
  const syncLikeStatus = async (
    qaId: string,
    likeStatus: number,
    dislikeStatus: number,
  ): Promise<boolean> => {
    try {
      const payload = {
        qa_id: qaId,
        like_status: likeStatus,
        dislike_status: dislikeStatus,
      };

      console.log('同步点赞状态:', payload);

      const response = await fetch(`${API_BASE_URL}/v1/update_like_status`, {
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

      // 检查返回结果
      if (result.code !== 200) {
        throw new Error(result.msg || '更新失败');
      }

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

    // 同步到服务器（接口5）
    const likeStatus = vote === 'like' ? 1 : 0;
    const dislikeStatus = vote === 'dislike' ? 1 : 0;
    syncLikeStatus(messageId, likeStatus, dislikeStatus);
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
    deleteConversationBySession,
    queryConversationsByFunc,
    syncCollectStatus,
    syncLikeStatus,
    updateMessageVote,
    loadConversations,
    clearAllConversations,
  };
});
