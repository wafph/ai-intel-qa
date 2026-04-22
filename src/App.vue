<template>
  <template v-if="showFullLayout">
    <div class="app-container">
      <!-- 顶部菜单 -->
      <HeaderMenu :active-tab="activeTab" @tab-change="handleTabChange" />

      <div class="main-layout">
        <!-- 左侧历史对话面板 -->
        <HistoryPanel
          :history-list="filteredHistory"
          :active-chat-id="activeChatId"
          :user="userStore.user"
          @select-chat="handleSelectChat"
          @new-chat="handleNewChat"
          @delete-chat="handleDeleteChat"
          @clear-history="handleClearHistory"
          @toggle-favorite="handleToggleFavorite"
        />

        <!-- 右侧主内容区域 -->
        <div class="content-area">
          <!-- 路由视图区域（替换原有的动态组件区域） -->
          <div class="dynamic-content">
            <router-view
              v-if="activeTab"
              :key="activeChatId"
              :chat-data="currentChatData"
              :streaming="isStreaming"
              :current-reasoning="currentReasoning"
              :current-answer="currentAnswer"
              :current-streaming-message-id="currentStreamingMessageId"
              @stop-stream="stopStream"
              @regenerate="handleRegenerate"
            />
          </div>

          <!-- 底部固定输入框 -->
          <div class="input-container">
            <ChatInput
              :placeholder="inputPlaceholder"
              :disabled="isStreaming"
              @send="handleSendMessage"
            />

            <!-- 流式传输控制 -->
            <div v-if="isStreaming" class="stream-controls">
              <el-button
                style="padding: 10px 20px"
                type="warning"
                plain
                @click="stopStream"
              >
                <span class="stop-icon">■</span>
                停止生成
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
  <template v-else>
    <!-- 独立页面布局 -->
    <router-view></router-view>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import HeaderMenu from './components/HeaderMenu.vue';
import HistoryPanel from './components/HistoryPanel.vue';
import ChatInput from './components/ChatInput.vue';
import { useAppStore } from './stores/app';
import { useChatStore } from './stores/chat';
import { useUserStore } from './stores/user';
import type { ChatMessage, ChatSession, HistoryItem } from './types/chat';

const appStore = useAppStore();
const chatStore = useChatStore();
const userStore = useUserStore();
const router = useRouter();
const route = useRoute();

// 定义类型接口
interface StreamChunk {
  event: string;
  reasoning_content?: string;
  content?: string;
  data?: {
    text?: string;
    reasoning_content?: string;
    content?: string;
    index?: number;
    outputs?: any;
    node_id?: string;
    node_type?: string;
    node_name?: string;
    workflow_id?: string;
    workflow_name?: string;
    createdTime?: number;
  };
  createdTime?: number;
}

// 状态管理
const activeTab = ref<string>('智能问答');
const activeChatId = ref<string>('');

// 流式相关状态
const isStreaming = ref<boolean>(false);
const currentReasoning = ref<string>('');
const currentAnswer = ref<string>('');
let abortController: AbortController | null = null;
let currentStreamingMessageId: string | null = null;

// 计算属性
const currentChatData = computed(() => {
  if (!activeChatId.value) return null;
  return chatStore.getChatSession(activeChatId.value) || null;
});
// 判断是否显示完整布局
const showFullLayout = computed(() => {
  // 这些页面不显示完整布局
  const excludeRoutes = ['/feedback', '/my-collections'];
  return !excludeRoutes.includes(route.path);
});
// 过滤后的历史记录（只显示当前菜单的历史记录）
const filteredHistory = computed(() => {
  return chatStore.historyList.filter((item: any) => item.menuType === activeTab.value);
});

// 根据当前路由设置活动标签
const updateActiveTabFromRoute = () => {
  const routeToTabMap: Record<string, string> = {
    '/intelligent-qa': '智能问答',
    '/intelligent-retrieval': '智能检索',
    '/auxiliary-draft': '辅助起草',
    '/compliance-review': '合规审核',
  };

  const matchedTab = routeToTabMap[route.path];
  if (matchedTab && activeTab.value !== matchedTab) {
    activeTab.value = matchedTab;
    chatStore.setCurrentActiveTab(matchedTab);
  }
};

const inputPlaceholder = computed(() => {
  if (activeTab.value === '智能问答') {
    return '请输入你的问题';
  } else if (activeTab.value === '辅助起草') {
    return '您好，请描述你的制度要求，包括使用范围、核心条款、特殊要求等...';
  } else if (activeTab.value === '合规审核') {
    return '您好，请输入待审核的内容';
  } else {
    return '您好，请输出待检索内容';
  }
});

// 方法
const handleTabChange = (tabName: string) => {
  // 1. 中止当前正在进行的请求
  if (isStreaming.value) {
    stopStream();
  }

  // 2. 重置流式状态
  resetStreamState();
  activeTab.value = tabName;
  chatStore.setCurrentActiveTab(tabName);

  // 根据标签导航到对应的路由
  const tabToRouteMap: Record<string, string> = {
    智能问答: '/intelligent-qa',
    智能检索: '/intelligent-retrieval',
    辅助起草: '/auxiliary-draft',
    合规审核: '/compliance-review',
  };

  const targetRoute = tabToRouteMap[tabName] || '/intelligent-qa';
  if (route.path !== targetRoute) {
    router.push(targetRoute);
  }

  const historyForTab = chatStore.historyList.filter(
    (item: any) => item.menuType === tabName,
  );
  if (historyForTab.length > 0) {
    // 检查当前选中的对话是否属于当前菜单
    const currentChatBelongsToTab = historyForTab.some(
      (item: any) => item.id === activeChatId.value,
    );

    if (!currentChatBelongsToTab) {
      activeChatId.value = historyForTab[0].id;
    }
  } else {
    activeChatId.value = '';
  }
};
const handleNewChat = () => {
  const newChatId = Date.now().toString();
  activeChatId.value = newChatId;
  const chatTitle = activeTab.value;

  const newSession: ChatSession = {
    id: newChatId,
    title: chatTitle,
    time: Date.now(),
    type: activeTab.value as any,
    messages: [],
    menuType: activeTab.value,
  };

  const newHistory: HistoryItem = {
    id: newChatId,
    title: chatTitle,
    time: Date.now(),
    type: activeTab.value as any,
    preview: '新对话',
    menuType: activeTab.value,
  };

  chatStore.addChatSession(newSession);
  chatStore.addHistoryItem(newHistory);

  scrollToBottom();
};
const handleSelectChat = (chatId: string) => {
  if (isStreaming.value) {
    stopStream();
  }

  activeChatId.value = chatId;
  resetStreamState();
  scrollToBottom();
};

const handleDeleteChat = (chatId: string) => {
  chatStore.deleteHistoryItem(chatId);
  if (activeChatId.value === chatId) {
    if (chatStore.historyList.length > 0) {
      activeChatId.value = chatStore.historyList[0].id;
    } else {
      activeChatId.value = '';
    }
  }
};

const handleClearHistory = () => {
  // 清空所有历史记录，不区分菜单类型
  chatStore.historyList = [];
  chatStore.chatSessions = {};
  chatStore.saveToLocalStorage();
  activeChatId.value = '';
  resetStreamState();
};

const handleToggleFavorite = (chatId: string) => {
  chatStore.toggleCollect(chatId);
};

const handleSendMessage = async (content: string) => {
  if (!content.trim() || isStreaming.value) return;

  if (!activeChatId.value) {
    handleNewChat();
  }

  const chat = chatStore.getChatSession(activeChatId.value!);
  if (!chat) return;

  // 添加用户消息
  const userMessage: ChatMessage = {
    id: Date.now().toString(),
    role: 'user',
    content: content.trim(),
    timestamp: new Date(),
  };

  chat.messages.push(userMessage);

  // 如果是第一条消息，更新标题
  if (chat.messages.length === 1) {
    const newTitle = content.length > 20 ? content.substring(0, 20) + '...' : content;
    chat.title = newTitle;

    const historyItem = chatStore.historyList.find((h: any) => h.id === chat.id);
    if (historyItem) {
      historyItem.title = newTitle;
      historyItem.preview = content;
    }
  }

  // 添加AI消息占位符
  const aiMessageId = (Date.now() + 1).toString();
  const aiMessage: ChatMessage = {
    id: aiMessageId,
    role: 'assistant',
    content: '',
    reasoning: '', // 初始化 reasoning 字段为空字符串
    timestamp: new Date(),
    streaming: true,
  };
  chat.messages.push(aiMessage);
  currentStreamingMessageId = aiMessageId;

  // 重置流式状态
  resetStreamState();

  // 开始流式输出
  await startStream(content, aiMessageId);

  // 保存历史
  chatStore.saveToLocalStorage();
  scrollToBottom();
};

// 流式请求
const startStream = async (queryText: string, messageId: string) => {
  isStreaming.value = true;
  currentReasoning.value = '';
  currentAnswer.value = '';

  try {
    abortController = new AbortController();

    const params = {
      inputs: {
        query: queryText,
      },
    };

    const token = appStore.sharedDataToken;
    if (!token) {
      throw new Error('未找到认证token，请先登录');
    }

    // 根据当前选项卡选择不同的API接口
    const urlqa =
      '/api1/v1/1725c43e3fa54828a078fce60f5a3773/workflows/60a15b33-e781-4d5d-88d3-5ed90054d9b0/conversations/cccbd7f6-cdbd-44a8-9458-8d8767683249?version=1776836351895';
    const urlDraf =
      '/api1/v1/1725c43e3fa54828a078fce60f5a3773/agents/fe7b5350-c3ee-41d4-b5d5-ecc6c26d33b3/conversations/48c6d6f4-1c9b-4d5a-9620-9891f25f9afb?version=1776825707705';
    const urlreview =
      '/api1/v1/1725c43e3fa54828a078fce60f5a3773/workflows/32dd3ef3-2bfb-4ad7-a448-811ddd37924a/conversations/57859d42-70e7-4998-9998-184832f8d6fb?version=1776051927454';
    const urlSearch =
      '/api1/v1/1725c43e3fa54828a078fce60f5a3773/workflows/c206107e-ec31-47d8-9aaf-5c1262931168/conversations/9f57de87-98d4-432c-9e14-5e338fbc830b?version=1776669038280';
    var apiUrl =
      activeTab.value === '智能问答'
        ? urlqa
        : activeTab.value === '辅助起草'
          ? urlDraf
          : activeTab.value === '合规审核'
            ? urlreview
            : urlSearch;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'X-Auth-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
      signal: abortController.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`网络响应异常: ${response.status}`);
    }

    const reader = response.body.getReader();
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
            const parsed: StreamChunk = JSON.parse(data);
            await processStreamChunk(parsed, messageId);
          } catch (error) {
            console.error('解析流数据失败:', error, '原始数据:', data);
          }
        }
      }
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('流式请求被取消');
    } else {
      console.error('流式请求失败:', error);
      handleStreamError(messageId, error.message);
    }
  } finally {
    finishStream(messageId);
  }
};

const handleRegenerate = (content: string) => {
  if (isStreaming.value) {
    stopStream(); // 停止当前生成
  }
  handleSendMessage(content); // 重新发送原问题
};

const processStreamChunk = async (chunk: StreamChunk, messageId: string) => {
  var dataReasion;
  if (
    activeTab.value === '智能问答' ||
    activeTab.value === '合规审核' ||
    activeTab.value === '智能检索'
  ) {
    dataReasion = chunk.data?.reasoning_content;
  } else {
    dataReasion = chunk.reasoning_content;
  }
  // ✅ 新增：处理 workflow_finished 事件
  if (chunk.event === 'workflow_finished') {
    try {
      const outputs = chunk.data?.outputs;
      if (outputs && outputs.user_fields && outputs.user_fields.data_json) {
        const sources = outputs.user_fields.data_json.map((item: any) => ({
          file_id: item.file_id,
          chunk_id: item.chunk_id,
          title: item.title, // 文件标题
          content: item.content, // 切片内容
          subtitle: item.subtitle, // 子标题
          update_date_time: item.update_date_time, // 更新时间
          tags: item.tags,
          repo_id: item.repo_id,
          score: item.score,
        }));

        // 将来源信息保存到当前消息
        const chat = chatStore.getChatSession(activeChatId.value!);
        if (chat) {
          const message = chat.messages.find((m: any) => m.id === messageId);
          if (message) {
            message.sources = sources;
            console.log('已保存来源信息:', sources);
          }
        }
      }
    } catch (error) {
      console.error('解析 workflow_finished 失败:', error);
    }
    return; // 处理完后返回，不再走下面的逻辑
  }
  if (chunk.event === 'message') {
    // 处理推理过程
    if (dataReasion !== undefined) {
      const reasoning = dataReasion;
      // 3.1 更新临时状态（用于UI即时响应）
      currentReasoning.value += reasoning;

      // 3.2 【关键修改】将推理内容持久化到当前消息对象
      const chat = chatStore.getChatSession(activeChatId.value!);
      if (chat) {
        const message = chat.messages.find((m: any) => m.id === messageId);
        if (message) {
          // 累加 reasoning 内容到消息对象本身
          message.reasoning = (message.reasoning || '') + reasoning;
        }
      }
    }

    // 处理回复内容 - 根据接口类型选择字段
    let replyContent: string | undefined;
    if (
      activeTab.value === '智能问答' ||
      activeTab.value === '合规审核' ||
      activeTab.value === '智能检索'
    ) {
      replyContent = chunk.data?.text;
    } else {
      replyContent = chunk?.content;
    }
    if (replyContent !== undefined) {
      currentAnswer.value += replyContent;
      // 更新对应的AI消息内容
      const chat = chatStore.getChatSession(activeChatId.value!);
      if (chat) {
        const message = chat.messages.find((m: any) => m.id === messageId);
        if (message) {
          message.content = currentAnswer.value;
        }
      }
    }
    // 触发视图更新
    await nextTick();
    scrollToBottom();
  }
};

// 完成流式输出
const finishStream = (messageId: string) => {
  isStreaming.value = false;
  currentStreamingMessageId = null;
  currentReasoning.value = '';
  currentAnswer.value = '';

  const chat = chatStore.getChatSession(activeChatId.value!);
  if (chat) {
    const message = chat.messages.find((m: any) => m.id === messageId);
    if (message) {
      message.streaming = false;

      // 更新历史记录预览
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

  // 重置流式状态
  resetStreamState();
  chatStore.saveToLocalStorage();
  scrollToBottom();
};

// 处理流式错误
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
  currentStreamingMessageId = null;
  resetStreamState();
};

// 停止流式输出
const stopStream = () => {
  if (abortController) {
    abortController.abort();
  }

  if (currentStreamingMessageId) {
    const chat = chatStore.getChatSession(activeChatId.value!);
    if (chat) {
      const message = chat.messages.find((m: any) => m.id === currentStreamingMessageId);
      if (message) {
        message.streaming = false;
        if (message.content === '') {
          message.content = '用户停止了生成';
        }
      }
    }
  }

  isStreaming.value = false;
  currentStreamingMessageId = null;
  resetStreamState();
  chatStore.saveToLocalStorage();
};
// 重置流式状态
const resetStreamState = () => {
  currentReasoning.value = '';
  currentAnswer.value = '';
  abortController = null;
};

// 工具函数
const scrollToBottom = () => {
  nextTick(() => {
    const container = document.querySelector('.dynamic-content');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });
};

// 监听路由变化
watch(
  () => route.path,
  () => {
    updateActiveTabFromRoute();
  },
  { immediate: true },
);

// 生命周期
onMounted(() => {
  chatStore.loadFromLocalStorage();
  if (chatStore.historyList.length > 0) {
    activeChatId.value = chatStore.historyList[0].id;
  }
  updateActiveTabFromRoute();
});

onUnmounted(() => {
  if (isStreaming.value) {
    stopStream();
  }
});
</script>

<style lang="less" scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
    sans-serif;
  overflow: hidden;
}

.main-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  position: relative;
}

.dynamic-content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  position: relative;
  scroll-behavior: smooth;
}

.input-container {
  width: 80%;
  margin: auto;
  margin-bottom: 30px;
  padding: 20px;
  border-top: 1px solid #e9ecef;
  background: #ffffff;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
  z-index: 10;
  border-radius: 20px;
  position: relative;
}

.stream-controls {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
  animation: slideInUp 0.3s ease;
}

.stop-icon {
  font-size: 12px;
  font-weight: bold;
}

.stream-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #666;
  animation: pulse 1.5s ease-in-out infinite;
}

.streaming-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #52c41a;
  animation: blink 1.5s infinite;
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
</style>
