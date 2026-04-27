<template>
  <template v-if="showFullLayout">
    <div class="app-container">
      <!-- 左侧侧边栏 -->
      <HistoryPanel
        :history-list="filteredHistory"
        :active-chat-id="activeChatId"
        :user="userStore.user"
        :collapsed="sidebarCollapsed"
        @select-chat="handleSelectChat"
        @new-chat="handleNewChat"
        @delete-chat="handleDeleteChat"
        @clear-history="handleClearHistory"
        @toggle-favorite="handleToggleFavorite"
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

            <!-- ✅ 新增：仅「合规审核」页面显示 -->
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
                <!-- <el-button type="primary">选择文件上传</el-button> -->
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

const appStore = useAppStore();
const chatStore = useChatStore();
const userStore = useUserStore();
const router = useRouter();
const route = useRoute();
const inputText = ref('');

const uploadedFileName = ref('');
const uploadedFileUrl = ref(''); //  新增：存储上传后的文件URL
const selectedDimensions = ref<string[]>([]);
const spliceSelectedDimensions = ref<string[]>([]);
// 侧边栏折叠状态
const sidebarCollapsed = ref(false);

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
const currentConversationUuid = ref<string>('');

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
  const excludeRoutes = ['/feedback', '/my-collections'];
  return !excludeRoutes.includes(route.path);
});

// 过滤后的历史记录
const filteredHistory = computed(() => {
  return chatStore.historyList.filter((item: any) => item.menuType === activeTab.value);
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
// ✅ 新增：全选/取消全选逻辑
const handleSelectAll = (val: boolean) => {
  if (val) {
    selectedDimensions.value = ['全选', '合规性', '冲突性', '文本规范性'];
  } else {
    selectedDimensions.value = [];
  }
};

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
    resetCurrentChat();
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
    return '请上传文件并选择审核维度'; // ✅ 提示用户不需要输入
  } else {
    return '请输入你的内容';
  }
});

// ✅ 生成UUID的函数
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// 重置当前对话（核心方法）
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

const handleTabChange = async (tabName: string) => {
  if (isStreaming.value) {
    stopStream();
  }

  resetStreamState();
  resetCurrentChat();

  activeTab.value = tabName;
  chatStore.setCurrentActiveTab(tabName);

  // ✅ 切换标签时重新从服务器加载会话
  await chatStore.queryConversationsByFunc();

  const historyForTab = chatStore.historyList.filter(
    (item: any) => item.menuType === tabName,
  );

  if (historyForTab.length > 0) {
    activeChatId.value = historyForTab[0].id;

    // ✅ 获取选中对话的UUID
    const chat = chatStore.getChatSession(historyForTab[0].id);
    if (chat && (chat as any).conversationUuid) {
      currentConversationUuid.value = (chat as any).conversationUuid;
    }
  } else {
    activeChatId.value = '';
    currentConversationUuid.value = '';
  }

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
};

const handleNewChat = async () => {
  const newChatId = Date.now().toString();
  activeChatId.value = newChatId;
  currentConversationUuid.value = generateUUID();

  const chatTitle = activeTab.value;

  const newSession: ChatSession = {
    id: newChatId,
    title: chatTitle,
    time: Date.now(),
    type: activeTab.value as any,
    messages: [],
    menuType: activeTab.value,
    conversationUuid: currentConversationUuid.value,
  };

  const newHistory: HistoryItem = {
    id: newChatId,
    title: chatTitle,
    time: Date.now(),
    type: activeTab.value as any,
    preview: '新对话',
    menuType: activeTab.value,
    isCollected: false,
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
  const chat = chatStore.getChatSession(chatId);

  if (chat && (chat as any).conversationUuid) {
    currentConversationUuid.value = (chat as any).conversationUuid;
  } else {
    currentConversationUuid.value = generateUUID();
    if (chat) {
      (chat as any).conversationUuid = currentConversationUuid.value;
      chatStore.saveToLocalStorage();
    }
  }

  resetStreamState();
  scrollToBottom();
};

const handleDeleteChat = async (chatId: string) => {
  // ✅ 先调用后端接口删除
  await chatStore.deleteConversationBySession(chatId);

  // 从本地删除
  chatStore.deleteHistoryItem(chatId);
  delete chatStore.chatSessions[chatId];
  chatStore.saveToLocalStorage();

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
  // ✅ 先调用后端接口清空所有会话
  await chatStore.clearAllConversations();
  chatStore.historyList = [];
  chatStore.chatSessions = {};
  chatStore.saveToLocalStorage();
  activeChatId.value = '';
  currentConversationUuid.value = '';
  resetStreamState();
};
const handleToggleFavorite = (chatId: string) => {
  chatStore.toggleCollect(chatId);
};

const isSendDisabled = computed(() => {
  if (activeTab.value === '合规审核') {
    // ✅ 合规审核模式：只检查文件上传和多选框选择，不检查输入框内容
    return !uploadedFileUrl.value || selectedDimensions.value.length === 0;
  }
  // 其他模式：检查输入框内容和流式状态
  return isStreaming.value;
});

const handleSendMessage = async (content: string) => {
  inputText.value = content;
  // ✅ 合规审核模式特殊处理：不检查输入框内容
  if (activeTab.value === '合规审核') {
    if (!uploadedFileUrl.value || selectedDimensions.value.length === 0) {
      return;
    }
  } else {
    // 其他模式需要输入框内容
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
    timestamp: new Date(),
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
      historyItem.preview = activeTab.value === '合规审核' ? '开始合规审核' : content;
    }
  }

  // 添加AI消息占位符
  const aiMessageId = (Date.now() + 1).toString();
  const aiMessage: ChatMessage = {
    id: aiMessageId,
    role: 'assistant',
    content: '',
    reasoning: '',
    timestamp: new Date(),
    streaming: true,
  };
  chat.messages.push(aiMessage);
  currentStreamingMessageId = aiMessageId;

  resetStreamState();

  // 开始流式输出
  await startStream(content, aiMessageId);

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
    if (selectedDimensions.value.includes('全选')) {
      spliceSelectedDimensions.value = ['合规性', '冲突性', '文本规范性'];
    }
    let params: any = {};

    // ✅ 合规审核特殊处理
    if (activeTab.value === '合规审核') {
      params = {
        inputs: {
          file_url: uploadedFileUrl.value,
          query: !selectedDimensions.value.includes('全选')
            ? selectedDimensions.value.join(',')
            : spliceSelectedDimensions.value.join(','), // 用逗号连接多选值
        },
      };
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

    // 使用动态UUID替换所有API URL中的UUID
    const baseUrls = {
      qa: '/v1/1725c43e3fa54828a078fce60f5a3773/workflows/60a15b33-e781-4d5d-88d3-5ed90054d9b0/conversations/',
      draf: '/v1/1725c43e3fa54828a078fce60f5a3773/workflows/1808592a-3c09-41a1-b1b6-225c9985ee00/conversations/',
      review:
        '/v1/1725c43e3fa54828a078fce60f5a3773/workflows/32dd3ef3-2bfb-4ad7-a448-811ddd37924a/conversations/',
      search:
        '/v1/1725c43e3fa54828a078fce60f5a3773/workflows/c206107e-ec31-47d8-9aaf-5c1262931168/conversations/',
    };

    const version1 = '?version=1776836351895';
    const version2 = '?version=1777019540183';
    const version3 = '?version=1777258599011';
    const version4 = '?version=1777097823097';

    // 根据当前选项卡选择不同的API接口，并注入动态UUID
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
          }
        }
      }
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
    } else {
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

  dataReasion = chunk.data?.reasoning_content;
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
          }
        }
      }
    } catch (error) {
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
    replyContent = chunk.data?.text;
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

// 新增计算属性

// 在 App.vue 的 finishStream 函数中添加
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

      // ✅ 新增：保存对话记录到服务器
      if (chat.messages.length >= 2) {
        const userMessage = chat.messages[chat.messages.length - 2];
        const assistantMessage = chat.messages[chat.messages.length - 1];
        // 获取参考来源
        let referenceSource = '';
        if (assistantMessage.sources && assistantMessage.sources.length > 0) {
          referenceSource = assistantMessage.sources
            .map((source: any) => `${source.title}: ${source.content}`)
            .join('\n');
        }

        chatStore.saveConversationToServer(
          currentConversationUuid.value,
          messageId,
          userMessage,
          assistantMessage,
          referenceSource,
          assistantMessage.vote === 'like' ? 1 : 0,
          assistantMessage.vote === 'dislike' ? 1 : 0,
        );
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
onMounted(async () => {
  // ✅ 先从服务器加载会话记录
  await chatStore.queryConversationsByFunc();
  // 再根据路由设置活动标签
  updateActiveTabFromRoute();
  // 如果没有任何会话，创建新对话
  if (chatStore.historyList.length === 0) {
    handleNewChat();
  }
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
