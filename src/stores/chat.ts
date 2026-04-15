import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ChatSession, HistoryItem } from '../types/chat';

export const useChatStore = defineStore('chat', () => {
  const chatSessions = ref<Record<string, ChatSession>>({});
  const historyList = ref<HistoryItem[]>([]);
  const currentActiveTab = ref<string>('智能问答');

  // 过滤后的历史记录（基于当前菜单）
  const filteredHistory = computed(() => {
    return historyList.value.filter((item:any) => item.menuType === currentActiveTab.value);
  });

  // 收藏的历史记录
  const collectedHistory = computed(() => {
    return historyList.value.filter((item:any) => item.isCollected);
  });

  // 切换当前菜单
  const setCurrentActiveTab = (tab: string) => {
    currentActiveTab.value = tab;
  };

  // 添加历史记录
  const addHistoryItem = (item: HistoryItem) => {
    historyList.value.unshift(item);
    saveToLocalStorage();
  };

  // 更新历史记录
  const updateHistoryItem = (id: string, updates: Partial<HistoryItem>) => {
    const index = historyList.value.findIndex(item => item.id === id);
    if (index !== -1) {
      historyList.value[index] = { ...historyList.value[index], ...updates };
      saveToLocalStorage();
    }
  };

  // 删除历史记录
  const deleteHistoryItem = (id: string) => {
    const index = historyList.value.findIndex(item => item.id === id);
    if (index !== -1) {
      historyList.value.splice(index, 1);
      saveToLocalStorage();
    }
  };

  // 切换收藏状态
  const toggleCollect = (id: string) => {
    const index = historyList.value.findIndex((item:any) => item.id === id);
    if (index !== -1) {
      historyList.value[index].isCollected = !historyList.value[index].isCollected;
      saveToLocalStorage();
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

  return {
    chatSessions,
    historyList,
    filteredHistory,
    collectedHistory,
    currentActiveTab,
    setCurrentActiveTab,
    addHistoryItem,
    updateHistoryItem,
    deleteHistoryItem,
    toggleCollect,
    getChatSession,
    addChatSession,
    loadFromLocalStorage,
    saveToLocalStorage
  };
});