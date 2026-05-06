<template>
  <template v-if="showFullLayout">
    <div class="app-container">
      <!-- 左侧侧边栏 -->
      <HistoryPanel
        :history-list="filteredHistory"
        :active-chat-id="activeChatId"
        :user="userStore.user"
        :collapsed="sidebarCollapsed"
        :active-tab="activeTab"
        @select-chat="handleSelectChat"
        @new-chat="handleNewChat"
        @delete-chat="handleDeleteChat"
        @clear-history="handleClearHistory"
        @update-title="handleUpdateTitle"
        @toggle-favorite="handleToggleFavorite"
        @toggle-pin="handleTogglePin"
      />

      <!-- 右侧主内容区 -->
      <div class="main-content">
        <!-- 顶部菜单 -->
        <HeaderMenu
          :active-tab="activeTab"
          :collapsed="sidebarCollapsed"
          @tab-change="handleTabChange"
          @toggle-sidebar="toggleSidebar"
        />

        <!-- 内容区域 -->
        <div class="content-area">
          <!-- 路由视图区域 -->
          <div class="dynamic-content">
            <router-view
              v-if="activeTab && currentChatData"
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
              :disabled="isSendDisabled"
              :is-compliance-mode="activeTab === '合规审核'"
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

            <!-- 仅「合规审核」页面显示 -->
            <div v-if="activeTab === '合规审核'" class="compliance-extras">
              <el-upload
                class="upload-demo"
                :http-request="customUpload"
                :show-file-list="false"
              >
                <el-tooltip
                  class="box-item"
                  effect="dark"
                  content="上传文件"
                  placement="top"
                >
                  <el-icon class="icon"><Plus /></el-icon>
                </el-tooltip>
              </el-upload>

              <!-- 上传后显示文件名 -->
              <div v-if="uploadedFileName" class="uploaded-file-name">
                {{ uploadedFileName }}
              </div>

              <!-- 审核维度选择（4个多选框） -->
              <div class="review-dimensions">
                <span>选择审核维度</span>
                <el-checkbox-group v-model="selectedDimensions">
                  <el-checkbox value="全选" @change="handleSelectAll">全选</el-checkbox>
                  <el-checkbox value="合规性">合规性</el-checkbox>
                  <el-checkbox value="冲突性">冲突性 </el-checkbox>
                  <el-checkbox value="文本规范性">文本规范性</el-checkbox>
                </el-checkbox-group>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
  <template v-else>
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
import { ElMessage } from 'element-plus';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const appStore = useAppStore();
const chatStore = useChatStore();
const userStore = useUserStore();
const router = useRouter();
const route = useRoute();
const inputText = ref('');
const lastComplianceParams = ref<{
  file_url: string;
  query: string;
  dimensions: string[];
} | null>(null);
const uploadedFileName = ref('');
const uploadedFileUrl = ref('');
const selectedDimensions = ref<string[]>([]);
const spliceSelectedDimensions = ref<string[]>([]);
const sidebarCollapsed = ref(false);

// 状态管理
const activeTab = ref<string>('智能问答');
const activeChatId = ref<string>('');
const currentConversationUuid = ref<string>('');

// 流式相关状态
const isStreaming = ref<boolean>(false);
const currentReasoning = ref<string>('');
const currentAnswer = ref<string>('');
let abortController: AbortController | null = null;
let currentStreamingMessageId: string | null = null;

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
  const excludeRoutes = ['/feedback', '/my-collections'];
  return !excludeRoutes.includes(route.path);
});

// 过滤后的历史记录
const filteredHistory = computed(() => {
  return chatStore.filteredHistory;
});

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
    const response = await fetch(
      'v1/1725c43e3fa54828a078fce60f5a3773/agent-runtime/upload-file?workspace_id=791044b6d56145abb6f66226b5c78784',
      {
        method: 'POST',
        headers: {
          'X-Auth-Token': token,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      throw new Error(`上传失败: ${response.status}`);
    }

    const result = await response.json();
    onSuccess(result, file);
    uploadedFileName.value = file.name;
    uploadedFileUrl.value = result?.url || file.name;
  } catch (error) {
    onError(error);
  }
};

const handleSelectAll = (val: boolean) => {
  if (val) {
    selectedDimensions.value = ['全选', '合规性', '冲突性', '文本规范性'];
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
  currentStreamingMessageId = null;
};

// 切换侧边栏折叠状态
const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
};

let isCreatingChat = false;
let creationPromise: Promise<void> | null = null;

const handleNewChat = async () => {
  // 如果当前已经是空白新会话，则不再重复创建
  if (activeChatId.value) {
    const currentChat = chatStore.getChatSession(activeChatId.value);

    const isEmptyNewChat =
      currentChat &&
      currentChat.messages.length === 0 &&
      currentChat.preview !== '已有内容';

    if (isEmptyNewChat) {
      return;
    }
  }

  if (isCreatingChat) {
    return;
  }

  if (creationPromise) {
    await creationPromise;
    return;
  }

  isCreatingChat = true;

  creationPromise = (async () => {
    try {
      const newChatId = generateUUID();

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

// 修改 handleSelectChat 函数，确保能正确加载会话
const handleSelectChat = async (chatId: string) => {
  if (isStreaming.value) {
    stopStream();
  }
  hasAutoCreated = false;
  // 先清空，再设置，确保触发响应式更新
  activeChatId.value = '';
  await nextTick();

  const session = chatStore.getChatSession(chatId);

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

  // ✅ 切换到新会话时，清空保存的合规审核参数
  lastComplianceParams.value = null;
};

const handleDeleteChat = async (chatId: string) => {
  await chatStore.deleteConversationBySession(chatId);

  if (activeChatId.value === chatId) {
    if (chatStore.historyList.length > 0) {
      activeChatId.value = chatStore.historyList[0].id;
      const chat = chatStore.getChatSession(chatStore.historyList[0].id);
      if (chat && (chat as any).conversationUuid) {
        currentConversationUuid.value = (chat as any).conversationUuid;
      }
    } else {
      activeChatId.value = '';
      currentConversationUuid.value = '';
    }
  }
};

const handleClearHistory = async () => {
  await chatStore.clearAllConversations();
  chatStore.historyList = [];
  chatStore.chatSessions = {};

  activeChatId.value = '';
  currentConversationUuid.value = '';
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

  if (!activeChatId.value) {
    handleNewChat();
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
    content: activeTab.value === '合规审核' ? '开始合规审核' : content.trim(),
    timestamp: new Date() as any,
  };

  chat.messages.push(userMessage);

  // ✅ 保存合规审核的参数，用于重新审核
  if (activeTab.value === '合规审核') {
    lastComplianceParams.value = {
      file_url: uploadedFileUrl.value,
      query: !selectedDimensions.value.includes('全选')
        ? selectedDimensions.value.join(',')
        : spliceSelectedDimensions.value.join(','),
      dimensions: [...selectedDimensions.value],
    };
  }

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
      historyItem.preview = activeTab.value === '合规审核' ? '开始合规审核' : content;
    }
  }

  // ✅ 清空输入框（针对合规审核，清空上传状态和选择状态）
  if (activeTab.value === '合规审核') {
    // 清空上传文件状态
    uploadedFileName.value = '';
    uploadedFileUrl.value = '';

    // 清空多选框状态
    selectedDimensions.value = [];
    spliceSelectedDimensions.value = [];

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
  };
  chat.messages.push(aiMessage);
  currentStreamingMessageId = aiMessageId;

  chatStore.updateHistoryItem(activeChatId.value!, {
    preview: content.trim() || '已有内容',
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
      // ✅ 使用保存的参数（如果有），否则使用当前值
      if (lastComplianceParams.value) {
        params = {
          inputs: {
            file_url: lastComplianceParams.value.file_url,
            query: lastComplianceParams.value.query,
          },
        };
      } else {
        if (selectedDimensions.value.includes('全选')) {
          spliceSelectedDimensions.value = ['合规性', '冲突性', '文本规范性'];
        }

        params = {
          inputs: {
            file_url: uploadedFileUrl.value,
            query: !selectedDimensions.value.includes('全选')
              ? selectedDimensions.value.join(',')
              : spliceSelectedDimensions.value.join(','),
          },
        };
      }
    } else {
      params = {
        inputs: {
          query: queryText,
        },
      };
    }

    const token = appStore.sharedDataToken;
    if (!token) {
      throw new Error('未找到认证token，请先登录');
    }

    const baseUrls = {
      qa: '/v1/1725c43e3fa54828a078fce60f5a3773/workflows/60a15b33-e781-4d5d-88d3-5ed90054d9b0/conversations/',
      draf: '/v1/1725c43e3fa54828a078fce60f5a3773/workflows/1808592a-3c09-41a1-b1b6-225c9985ee00/conversations/',
      review:
        '/v1/1725c43e3fa54828a078fce60f5a3773/workflows/32dd3ef3-2bfb-4ad7-a448-811ddd37924a/conversations/',
      search:
        '/v1/1725c43e3fa54828a078fce60f5a3773/workflows/c206107e-ec31-47d8-9aaf-5c1262931168/conversations/',
    };

    const version1 = '?version=1777453764415';
    const version2 = '?version=1777869733574';
    const version3 = '?version=1777960203166';
    const version4 = '?version=1777432604064';

    let apiUrl = '';
    if (activeTab.value === '智能问答') {
      apiUrl = baseUrls.qa + currentConversationUuid.value + version1;
    } else if (activeTab.value === '辅助起草') {
      apiUrl = baseUrls.draf + currentConversationUuid.value + version2;
    } else if (activeTab.value === '合规审核') {
      apiUrl = baseUrls.review + currentConversationUuid.value + version3;
    } else {
      apiUrl = baseUrls.search + currentConversationUuid.value + version4;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'X-Auth-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
      signal: abortController.signal,
    });
    clearTimeout(id); // 清除定时器
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
            const parsed: any = JSON.parse(data);
            await processStreamChunk(parsed, messageId);
          } catch (error) {}
        }
      }
    }
  } catch (error: any) {
    clearTimeout(id); // 清除定时器
    if (error.name === 'AbortError') {
      handleStreamError(
        messageId,
        `请求超时，当前功能超时时间为 ${Math.floor(requestTimeout / 60000)} 分钟`,
      );
    } else {
      handleStreamError(messageId, error.message);
    }
  } finally {
    finishStream(messageId);
  }
};

const handleRegenerate = (content: string) => {
  if (isStreaming.value) {
    stopStream();
  }

  // ✅ 如果是合规审核，重新审核时使用保存的参数
  if (activeTab.value === '合规审核') {
    if (lastComplianceParams.value) {
      // 重新审核时不重新上传文件，使用保存的参数
      handleSendMessage('开始合规审核');
    } else {
      // 如果没有保存的参数，则使用当前状态
      handleSendMessage(content);
    }
  } else {
    // 非合规审核，正常重新生成
    handleSendMessage(content);
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

const handleTabChange = (tab: string) => {
  stopStream();
  activeTab.value = tab;
  chatStore.setCurrentActiveTab(tab);
  resetCurrentChat();

  // ✅ 切换标签时清空保存的合规审核参数
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
  isStreaming.value = false;
  currentStreamingMessageId = null;
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
  currentStreamingMessageId = null;
  resetStreamState();
};

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

// 新增：处理置顶/取消置顶
const handleTogglePin = async (chatId: string, topStatus: number) => {
  try {
    const funcId = chatStore.getFuncIdByTab(activeTab.value);

    const payload = {
      sessionId: chatId,
      functionId: funcId,
      topStatus: topStatus,
    };
    const response = await fetch(`${API_BASE_URL}/v1/chat/pin`, {
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
    hasAutoCreated = true; // ✅ 设置标志位
    handleNewChat();
  }
});

watch(
  () => route.fullPath,
  async () => {
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
</script>

<style lang="less" scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  overflow: hidden;
  background: #ffffff;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

.compliance-extras {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.upload-demo {
  width: 100%;

  .icon {
    position: absolute;
    top: 60px;
    left: 30px;
    font-size: 25px;
    font-weight: 1000;
  }

  .icon:hover {
    background: #c9c7c4;
    border-radius: 50%;
    width: 28px;
    height: 28px;
    font-size: 22px;
  }
}

.uploaded-file-name {
  font-size: 14px;
  color: #666;
  position: absolute;
  top: 30px;
  left: 30px;
}

.review-dimensions {
  font-size: 14px;
  color: #333;

  .el-checkbox-group {
    margin-top: 8px;
  }

  .el-checkbox {
    margin-right: 12px;
  }
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
