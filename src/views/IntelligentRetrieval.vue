<template>
  <div class="intelligent-qa">
    <!-- 头部区域 -->
    <div class="qa-header" v-if="!loading && chatData?.messages?.length === 0">
      <h1>我是智能检索助手，很高兴见到你</h1>
      <p>你可以使用自然语言提问，我来精准回答</p>
    </div>

    <!-- 主体区域 -->
    <div class="conversation-history">
      <div
        v-for="(item, index) in chatData?.messages || []"
        :key="item.id"
        :class="[
          'history-item',
          item.role === 'user' ? 'user-message' : 'assistant-message',
        ]"
        :data-message-id="item.id"
      >
        <!-- 用户消息 -->
        <div v-if="item.role === 'user'" class="message-user">
          <div class="message-header">
            <div class="avatar user-avatar">
              <div><img src="/images/user.svg" alt="" /></div>
            </div>
            <div class="message-info">
              <pre class="message-content">{{ item.content }}</pre>
              <div class="message-time">{{ formatTime(item.timestamp) }}</div>
            </div>
          </div>
        </div>

        <!-- AI回复消息 -->
        <div v-else class="message-assistant">
          <div class="message-header">
            <div class="avatar ai-avatar">
              <div>AI</div>
            </div>
            <div class="message-info">
              <!-- 思考过程 -->
              <div
                v-if="item.reasoning && item.reasoning.trim() !== ''"
                class="thinking-process"
              >
                <div class="thinking-header">
                  <span>思考过程</span>
                </div>
                <div class="thinking-content">
                  {{ item.reasoning }}
                </div>
              </div>

              <!-- 当前流式消息 -->
              <div v-if="item.streaming && item.id === currentStreamingMessageId">
                <!-- 回复内容（打字机效果） -->
                <div
                  v-if="currentAnswer && currentAnswer.trim() !== ''"
                  class="answer-streaming"
                >
                  <div class="typing-container">
                    <div class="typing-text" v-html="renderMarkdown(displayAnswer)"></div>
                    <span v-if="isTyping" class="typing-cursor">|</span>
                  </div>
                </div>

                <!-- 加载指示器（当没有任何内容时） -->
                <div
                  v-if="streaming && (!currentAnswer || currentAnswer.trim() === '')"
                  class="thinking-indicator"
                >
                  <div class="thinking-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>

              <!-- 非流式消息 - 搜索结果展示 -->
              <div v-else>
                <!-- 当有来源信息时，显示搜索结果样式 -->
                <div
                  v-if="item.sources && item.sources.length > 0"
                  class="search-results-container"
                >
                  <div class="search-results-box">
                    <!-- 搜索结果列表 -->
                    <div
                      v-for="(source, idx) in paginatedSources(item)"
                      :key="source.chunk_id || idx"
                      class="search-result-item"
                    >
                     <h3 class="source-title">{{ source.subtitle }}</h3>
                      <div class="result-content-wrapper">
                        <div 
                          class="result-content"
                          :class="{ 'truncated': !expandedStates[source.chunk_id] }"
                        >
                          {{ getDisplayContent(source) }}
                        </div>
                        <span 
                          v-if="shouldShowExpand(source)"
                          class="expand-toggle"
                          @click="toggleExpand(source.chunk_id)"
                        >
                          {{ expandedStates[source.chunk_id] ? '收起 ↑' : '展开 ↓' }}
                        </span>
                      </div>
                      <div class="result-meta">
                        <span class="source-title">来源：{{ source.title }}</span>
                        <span class="update-date"
                          >更新日期：{{ formatUpdateDate(source.update_date_time) }}</span
                        >
                        <a class="view-detail" href="javascript:;">查看详情 →</a>
                      </div>
                    </div>
                  </div>

                  <!-- 使用 Element Plus 分页组件 -->
                  <div class="pagination-wrapper">
                    <el-pagination
                      :current-page="getCurrentPage(item.id)"
                      :page-size="getPageSize(item.id)"
                      :page-sizes="[5, 10, 20, 50]"
                      :total="item.sources.length"
                      layout="total, sizes, prev, pager, next, jumper"
                      @size-change="(size) => handleSizeChange(item.id, size)"
                      @current-change="(page) => handleCurrentChange(item.id, page)"
                    />
                  </div>
                </div>

                <!-- 当没有来源信息时，显示原有回复内容 -->
                <div v-else>
                  <div
                    class="message-content pad"
                    v-html="renderMarkdown(item.content)"
                  ></div>

                  <!-- 操作按钮 -->
                  <div
                    style="display: flex; align-items: center; margin-left: 15px"
                    v-if="item.content && item.content !== '用户停止了生成'"
                  >
                    <el-button link type="success" plain @click="handleRestart(index)">
                      重新检索<el-icon class="el-icon--right"><ArrowRight /></el-icon>
                    </el-button>
                    <el-button
                      link
                      class="btnbottom"
                      type="primary"
                      plain
                      @click="handleExport"
                    >
                      导出
                    </el-button>
                  </div>
                </div>
              </div>

              <div class="message-time">
                {{ formatTime(item.timestamp) }}
                <span
                  v-if="item.streaming && item.id === currentStreamingMessageId"
                  class="streaming-badge"
                >
                  <span class="streaming-dot"></span>
                  生成中...
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick, onMounted, onUnmounted } from 'vue';
import MarkdownIt from 'markdown-it';
import { ElIcon, ElPagination } from 'element-plus';
import { ArrowRight } from '@element-plus/icons-vue';

// 状态变量
const displayAnswer = ref<string>('');
const typingSpeed = 20; // 打字速度（毫秒）
let typingInterval: NodeJS.Timeout | null = null;
let currentTypingIndex = 0;
const loading = ref(false);
const isTyping = ref(false);
const emit = defineEmits(['regenerate']);

// 分页状态管理
const paginationStates = reactive<Record<string, { currentPage: number; pageSize: number }>>({});

// ✅ 新增：展开状态管理
const expandedStates = reactive<Record<string, boolean>>({});

// Props
interface Props {
  chatData: ChatSession | null;
  streaming?: boolean;
  currentReasoning?: string;
  currentAnswer?: string;
  currentStreamingMessageId?: string | null;
}

interface ChatSession {
  id: string;
  title: string;
  time: string;
  type: string;
  messages: ChatMessage[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  timestamp: Date;
  streaming?: boolean;
  sources?: SourceInfo[];
}

interface SourceInfo {
  file_id: string;
  chunk_id: string;
  title: string;
  content: string;
  subtitle: string;
  update_date_time: string;
  tags: string;
  repo_id: string;
  score: string;
}

const props = withDefaults(defineProps<Props>(), {
  streaming: true,
  currentReasoning: '',
  currentAnswer: '',
  currentStreamingMessageId: null,
});

// Markdown渲染器
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

// 格式化更新日期
const formatUpdateDate = (timeStr: string) => {
  if (!timeStr) return '';
  // 如果是时间戳格式
  if (!isNaN(Number(timeStr))) {
    const timestamp = Number(timeStr);
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }
  // 如果是字符串格式，直接返回
  return timeStr;
};

// ✅ 新增：获取显示内容（截断或完整）
const getDisplayContent = (source: SourceInfo) => {
  const content = source.content || '';
  const chunkId = source.chunk_id;
  
  // 如果已展开或内容长度不超过150，显示完整内容
  if (expandedStates[chunkId] || content.length <= 150) {
    return content;
  }
  
  // 否则截断前150个字符
  return content.substring(0, 150) + '...';
};

// ✅ 新增：判断是否应该显示展开/收起按钮
const shouldShowExpand = (source: SourceInfo) => {
  const content = source.content || '';
  return content.length > 150;
};

// ✅ 新增：切换展开状态
const toggleExpand = (chunkId: string) => {
  expandedStates[chunkId] = !expandedStates[chunkId];
};

// 获取当前页码（带默认值）
const getCurrentPage = (messageId: string): number => {
  if (!paginationStates[messageId]) {
    paginationStates[messageId] = { currentPage: 1, pageSize: 10 };
  }
  return paginationStates[messageId].currentPage;
};

// 获取每页条数（带默认值）
const getPageSize = (messageId: string): number => {
  if (!paginationStates[messageId]) {
    paginationStates[messageId] = { currentPage: 1, pageSize: 10 };
  }
  return paginationStates[messageId].pageSize;
};

// 分页处理函数
const handleSizeChange = (messageId: string, size: number) => {
  if (!paginationStates[messageId]) {
    paginationStates[messageId] = { currentPage: 1, pageSize: 10 };
  }
  paginationStates[messageId].pageSize = size;
  paginationStates[messageId].currentPage = 1; // 重置到第一页
};

const handleCurrentChange = (messageId: string, page: number) => {
  if (!paginationStates[messageId]) {
    paginationStates[messageId] = { currentPage: 1, pageSize: 10 };
  }
  paginationStates[messageId].currentPage = page;
};

// 计算分页后的数据
const paginatedSources = (item: ChatMessage) => {
  if (!item.sources || item.sources.length === 0) return [];
  
  const state = paginationStates[item.id] || { currentPage: 1, pageSize: 10 };
  const startIndex = (state.currentPage - 1) * state.pageSize;
  const endIndex = startIndex + state.pageSize;
  
  return item.sources.slice(startIndex, endIndex);
};

// 将文本追加到打字机队列
const appendToTypingQueue = (text: string) => {
  if (!text) return;

  if (!typingInterval) {
    startTypingEffect(displayAnswer.value + text);
  } else {
    stopTypingEffect();
    const targetText = displayAnswer.value + text;
    startTypingEffect(targetText);
  }
};

// 打字机效果
const startTypingEffect = (targetText: string) => {
  stopTypingEffect();

  if (!targetText || targetText.trim() === '') {
    displayAnswer.value = '';
    isTyping.value = false;
    return;
  }

  if (displayAnswer.value === targetText) {
    isTyping.value = false;
    return;
  }

  currentTypingIndex = displayAnswer.value.length;
  isTyping.value = true;

  typingInterval = setInterval(() => {
    if (currentTypingIndex < targetText.length) {
      displayAnswer.value += targetText.charAt(currentTypingIndex);
      currentTypingIndex++;

      nextTick(() => {
        scrollToBottom();
      });
    } else {
      stopTypingEffect();
    }
  }, typingSpeed);
};

// 停止打字效果
const stopTypingEffect = () => {
  if (typingInterval) {
    clearInterval(typingInterval);
    typingInterval = null;
  }
  isTyping.value = false;
  if (props.currentAnswer && displayAnswer.value !== props.currentAnswer) {
    displayAnswer.value = props.currentAnswer;
  }
};

// 方法
const formatTime = (date: Date) => {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const handleRestart = (index: number) => {
  if (!props.chatData || !props.chatData.messages) return;

  // 向前查找最近的 user 消息
  let userMessage = null;
  for (let i = index - 1; i >= 0; i--) {
    if (props.chatData.messages[i].role === 'user') {
      userMessage = props.chatData.messages[i];
      break;
    }
  }

  if (userMessage) {
    emit('regenerate', userMessage.content);
  }
};

const handleExport = () => {
  if (!props.chatData) return;

  const content = props.chatData.messages
    .filter((msg) => msg.role === 'assistant')
    .map((msg) => msg.content)
    .join('\n\n');

  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.chatData.title}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const renderMarkdown = (content: string) => {
  if (!content) return '';
  return md.render(content);
};

const scrollToBottom = () => {
  nextTick(() => {
    const container = document.querySelector('.conversation-history');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });
};

// 监听回复内容变化
watch(
  () => props.currentAnswer,
  (newAnswer, oldAnswer = '') => {
    if (newAnswer && newAnswer !== oldAnswer) {
      const newText = newAnswer.substring(oldAnswer.length);
      if (newText) {
        appendToTypingQueue(newText);
      } else if (newAnswer === '') {
        displayAnswer.value = '';
        stopTypingEffect();
      }
    }
    scrollToBottom();
  },
  { immediate: true },
);

// 监听流式状态变化
watch(
  () => props.streaming,
  (newStreaming) => {
    if (!newStreaming) {
      stopTypingEffect();
    }
  },
  { immediate: true },
);

// 监听推理过程变化
watch(
  () => props.currentReasoning,
  (newReasoning) => {
    if (newReasoning && newReasoning.trim() !== '') {
      scrollToBottom();
    }
  },
);

// 监听当前流式消息ID变化
watch(
  () => props.currentStreamingMessageId,
  (newId) => {
    if (!newId) {
      stopTypingEffect();
    }
  },
);

// 监听聊天数据变化
watch(
  () => props.chatData,
  () => {
    nextTick(() => {
      scrollToBottom();
    });
  },
  { deep: true },
);

// 生命周期
onMounted(() => {
  scrollToBottom();
});

onUnmounted(() => {
  stopTypingEffect();
});
</script>

<style lang="less" scoped>
.intelligent-qa {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  padding: 0;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  position: relative;
  overflow-y: auto;
}

.conversation-history {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 20px;
  padding-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 80%;

  .history-item {
    margin: 0 auto;
    animation: slideIn 0.3s ease-out;

    &.user-message {
      align-self: flex-end;
      width: 100%;

      .message-user {
        .message-header {
          flex-direction: row-reverse;

          .avatar {
            margin-left: 12px;
            margin-right: 0;

            img {
              width: 80%;
              height: 80%;
            }
          }

          .message-info {
            align-items: flex-end;

            .message-content {
              background: #d7e6fe;
              border-radius: 12px;
              padding: 12px 20px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }

            .message-time {
              text-align: right;
            }
          }
        }
      }
    }

    &.assistant-message {
      align-self: flex-start;
      width: 100%;

      .message-header {
        .message-info {
          width: 100%;

          .pad {
            padding: 20px 40px;
          }

          .thinking-process {
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            animation: fadeIn 0.5s ease;
          }

          .thinking-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            font-size: 13px;
            font-weight: 600;
            color: #fa8c16;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .thinking-content {
            font-size: 15px;
            color: #333;
            white-space: pre-wrap;
            word-break: break-word;
            background: rgba(255, 255, 255, 0.7);
            padding: 12px;
            border-radius: 6px;
            border-left: 3px solid #fa8c16;
          }

          .thinking-placeholder {
            font-size: 12px;
            color: #999;
            font-style: italic;
            text-align: center;
            padding: 8px;
          }

          .answer-streaming {
            padding: 20px;
            border-radius: 8px;
            animation: fadeIn 0.5s ease;
            margin-top: 8px;
          }

          .typing-container {
            position: relative;
            min-height: 20px;
          }

          .typing-text {
            display: inline;
            line-height: 1.6;
            font-size: 17px;
            color: #333;

            :deep(p) {
              margin: 8px 0;
            }

            :deep(code) {
              background: #f5f5f5;
              padding: 2px 4px;
              border-radius: 4px;
              font-family: 'Courier New', monospace;
            }

            :deep(pre) {
              background: #2d2d2d;
              color: #f8f8f2;
              padding: 12px;
              border-radius: 8px;
              overflow-x: auto;
              margin: 12px 0;
            }

            :deep(blockquote) {
              border-left: 4px solid #ddd;
              margin: 12px 0;
              padding-left: 12px;
              color: #666;
              font-style: italic;
            }
          }

          .typing-cursor {
            display: inline-block;
            font-weight: bold;
            color: #409eff;
            animation: blink 0.7s infinite;
            margin-left: 2px;
            position: relative;
            top: 1px;
          }

          @keyframes blink {
            0%,
            100% {
              opacity: 1;
            }
            50% {
              opacity: 0;
            }
          }

          .thinking-indicator {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 8px;

            .thinking-dots {
              display: flex;
              gap: 8px;
            }

            .thinking-dots span {
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: #409eff;
              animation: bounce 1.4s ease-in-out infinite;
            }

            .thinking-dots span:nth-child(1) {
              animation-delay: -0.32s;
            }
            .thinking-dots span:nth-child(2) {
              animation-delay: -0.16s;
            }
          }

          .message-content {
            font-size: 17px;
            padding: 12px 17px;
            line-height: 1.6;
            word-break: break-word;

            :deep(p) {
              margin: 8px 0;
            }

            :deep(code) {
              background: #f5f5f5;
              padding: 2px 4px;
              border-radius: 4px;
              font-family: 'Courier New', monospace;
            }

            :deep(pre) {
              background: #2d2d2d;
              color: #f8f8f2;
              padding: 12px;
              border-radius: 8px;
              overflow-x: auto;
              margin: 12px 0;
            }

            :deep(blockquote) {
              border-left: 4px solid #ddd;
              margin: 12px 0;
              padding-left: 12px;
              color: #666;
              font-style: italic;
            }
          }

          .message-time {
            font-size: 16px;
            color: #999;
            margin-top: 8px;
            padding: 0 4px;
          }

          .streaming-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            background: #f0f7ff;
            border-radius: 12px;
            font-size: 11px;
            color: #409eff;
            border: 1px solid #91d5ff;
            animation: pulse 1.5s ease-in-out infinite;
          }

          .streaming-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #409eff;
            animation: blink 1s infinite;
          }
        }
      }
    }
  }
}

/* 搜索结果容器样式 */
.search-results-container {
  width: 100%;
  margin-bottom: 20px;
}

.search-results-box {
  // border: 2px solid #ff4d4f;
  border-radius: 8px;
  overflow: hidden;
  // background-color: white;
}

.search-result-item {
  padding: 20px;
  border-bottom: 1px solid #f0f0f0;

  &:last-child {
    border-bottom: none;
  }
}

.result-content-wrapper {
  position: relative;
  margin-bottom: 15px;
}

.result-content {
  font-size: 16px;
  line-height: 1.6;
  color: #333;
  word-break: break-word;
  white-space: pre-wrap;
  transition: all 0.3s ease;

  &.truncated {
    max-height: 4.8em; /* 大约3行文字的高度 */
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }
}

.expand-toggle {
  display: inline-block;
  margin-top: 8px;
  color: #1890ff;
  cursor: pointer;
  font-size: 14px;
  user-select: none;
  transition: color 0.3s;

  &:hover {
    color: #40a9ff;
    text-decoration: underline;
  }
}

.result-meta {
  display: flex;
  align-items: center;
  font-size: 14px;
  color: #666;
  padding-top: 10px;
  border-top: 2px solid #e8e8e8;

  .source-title {
    font-weight: bold;
    margin-right: 20px;
  }

  .update-date {
    margin-right: auto;
  }

  .view-detail {
    color: #1890ff;
    text-decoration: none;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }
}

/* 分页组件样式 */
.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 15px 0;
  font-size: 14px;
  color: #666;
  // border-top: 1px solid #e8e8e8;
  margin-top: 20px;

  :deep(.el-pagination) {
    --el-pagination-font-size: 14px;
    --el-pagination-bg-color: #fff;
    --el-pagination-text-color: #606266;
    --el-pagination-border-radius: 4px;
    --el-pagination-button-color: #606266;
    --el-pagination-button-bg-color: #f4f4f5;
    --el-pagination-button-disabled-color: #c0c4cc;
    --el-pagination-button-disabled-bg-color: #fff;
    --el-pagination-hover-color: #409eff;

    .el-pagination__total {
      margin-right: 16px;
      font-weight: normal;
    }

    .el-pagination__sizes {
      margin-right: 16px;
    }

    .el-pagination__jump {
      margin-left: 16px;
    }

    .btn-prev,
    .btn-next {
      background-color: transparent;
      border: 1px solid #dcdfe6;
      border-radius: 4px;
      margin: 0 4px;

      &:hover {
        color: #409eff;
        border-color: #409eff;
      }
    }

    .el-pager li {
      background-color: transparent;
      border: 1px solid #dcdfe6;
      border-radius: 4px;
      margin: 0 4px;
      min-width: 32px;
      height: 32px;
      line-height: 30px;

      &.is-active {
        background-color: #409eff;
        color: #fff;
        border-color: #409eff;
      }

      &:hover {
        color: #409eff;
        border-color: #409eff;
      }
    }
  }
}

.message-header {
  display: flex;
  align-items: flex-start;
  max-width: 100%;

  .avatar {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 600;
    color: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    margin-right: 12px;

    &.user-avatar {
      background: #d7e6fe;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    &.ai-avatar {
      background: linear-gradient(135deg, #4facfe, #00f2fe);
    }
  }

  .message-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
}

.qa-header {
  text-align: center;
  margin-bottom: 40px;
  margin-top: 60px;

  h1 {
    font-size: 28px;
    color: #303133;
    margin-bottom: 12px;
    font-weight: 600;
  }

  p {
    font-size: 16px;
    color: #606266;
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes bounce {
  0%,
  80%,
  100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
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

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>