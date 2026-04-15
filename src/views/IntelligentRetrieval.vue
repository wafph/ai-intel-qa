<template>
  <div class="intelligent-qa">
    <!-- 头部区域 -->
    <div class="qa-header" v-if="!loading && chatData?.messages?.length === 0">
      <h1>我是智能检索助手，很高兴见到你</h1>
      <p>你可以使用自然语言提问，我来精准回答</p>
    </div>
    <!-- 历史对话列表 -->
    <div
      class="conversation-history"
      v-if="chatData?.messages && chatData?.messages?.length > 0"
    >
      <div
        v-for="item in chatData.messages || []"
        :key="item.id"
        :class="[
          'history-item',
          item.role === 'user' ? 'user-message' : 'assistant-message',
        ]"
      >
        <!-- 用户消息 -->
        <div v-if="item.role === 'user'" class="message-user">
          <div class="message-header">
            <div class="avatar user-avatar">
              <div><img src="/images/user.svg" alt=""></div>
            </div>
            <div class="message-info">
              <div class="message-content">{{ item.content }}</div>
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
              <!-- 【核心修改】始终显示消息的思考过程 -->
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
                <!-- 删除原"思考中..."的动态显示块，已由上方永久块显示 -->

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

              <!-- 非流式消息 -->
              <div v-else>
                <!-- 显示最终回复内容 -->
                <div
                  class="message-content pad"
                  v-html="renderMarkdown(item.content)"
                ></div>
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
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import MarkdownIt from 'markdown-it';

// 状态变量
const displayAnswer = ref<string>('');
const typingSpeed = 20; // 打字速度（毫秒）
let typingInterval: NodeJS.Timeout | null = null;
let currentTypingIndex = 0;
const loading = ref(false);
const isTyping = ref(false);

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

// 【核心修改】在ChatMessage接口中添加reasoning字段
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string; // 新增：持久化存储思考过程
  timestamp: Date;
  streaming?: boolean;
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

      // 【核心修改】打字过程中触发滚动
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

// 🚨 关键修改：优化回复内容监听逻辑
// 监听回复内容变化
watch(
  () => props.currentAnswer,
  (newAnswer, oldAnswer = '') => {
    if (newAnswer && newAnswer !== oldAnswer) {
      // 计算新增的文本部分
      const newText = newAnswer.substring(oldAnswer.length);
      if (newText) {
        // 将新增文本加入打字队列
        appendToTypingQueue(newText);
      } else if (newAnswer === '') {
        // 如果内容被清空（如新对话），则重置显示
        displayAnswer.value = '';
        stopTypingEffect();
      }
    }
    // 【核心修改】回复内容变化时，无论是否新增，都触发滚动
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
    // 【核心修改】推理过程（思考中）内容更新时，触发滚动到底部
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

  .conversation-history {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    margin-bottom: 20px;
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
              };
            }

            .message-info {
              align-items: flex-end;

              .message-content {
                background: #d7e6fe;
                color: black;
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
              // background: #fff7e6;
              // border: 1px solid #ffd591;
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

            .thinking-icon {
              font-size: 16px;
            }

            .thinking-content {
              font-size: 13px;
              color: #333;
              line-height: 1.6;
              white-space: pre-wrap;
              word-break: break-word;
              font-style: italic;
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
              background: #f6ffed;
              border: 1px solid #b7eb8f;
              border-radius: 8px;
               padding: 16px 35px;
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
              font-size: 14px;
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
              padding: 12px 36px;
              line-height: 1.6;
              word-break: break-word;
              background: white;
              border: 1px solid #e8e8e8;
              border-radius: 12px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              border-left: 4px solid #4facfe;

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
              font-size: 12px;
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
