<template>
  <div class="intelligent-qa">
    <!-- 头部区域 -->
    <div class="qa-header" v-if="!loading && chatData?.messages?.length === 0">
      <h1>我是问答助手，很高兴见到你</h1>
      <p>你可以使用自然语言提问，我来精准回答</p>
    </div>
    <!-- 历史对话列表 -->
    <div
      class="conversation-history"
      v-if="chatData?.messages && chatData?.messages?.length > 0"
    >
      <div
        v-for="(item, index) in chatData.messages || []"
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
              <div><img src="/images/user.svg" alt="" /></div>
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
              <!-- 【核心修改点】始终显示“思考过程”部分，只要消息中存在 reasoning 内容 -->
              <div
                v-if="item.reasoning && item.reasoning.trim() !== ''"
                class="thinking-process"
              >
                <div class="thinking-header">
                  <span>思考过程</span>
                </div>
                <div class="thinking-content">
                  <!-- 可以在显示前处理重复内容 -->
                  {{ removeDuplicateReasoning(item.reasoning) }}
                </div>
              </div>

              <!-- 当前流式消息 -->
              <div v-if="item.streaming && item.id === currentStreamingMessageId">
                <!-- 🚨 删除原“思考中...”的动态显示块，因为已由上方永久块显示 -->

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
              <div v-else>
                <!-- 显示最终回复内容 -->
                <div
                  class="message-content pad"
                  v-html="renderMarkdown(item.content)"
                ></div>

                <div
                  style="display: flex; align-items: center"
                  v-if="item.content && item.content !== '用户停止了生成'"
                >
                  <el-button link style="padding: 10px 20px" type="primary" plain
                    >来源<el-icon class="el-icon--right"><ArrowRight /></el-icon
                  ></el-button>
                  <!-- 复制按钮 -->
                  <div
                    class="copy-container"
                    :title="
                      item.streaming && item.id === currentStreamingMessageId
                        ? '正在生成内容，请稍后复制'
                        : '复制内容'
                    "
                    @click="handleCopy(item.content, item.id)"
                    :class="{
                      'copy-disabled':
                        item.streaming && item.id === currentStreamingMessageId,
                    }"
                  >
                    <img
                      src="/images/copy.svg"
                      style="width: 20px; height: 20px"
                      alt="复制"
                    />
                    <span
                      v-if="showCopied && copiedMessageId === item.id"
                      class="copied-text"
                      >已复制</span
                    >
                  </div>

                  <!-- 点赞按钮 -->
                  <div
                    class="vote-container"
                    style="display: inline-block; margin-left: 20px"
                  >
                    <img
                      :src="
                        item.vote === 'like'
                          ? '/images/zhan-active.svg'
                          : '/images/zhan.svg'
                      "
                      alt="点赞"
                      style="
                        width: 20px;
                        height: 20px;
                        cursor: pointer;
                        transition: opacity 0.3s ease;
                      "
                      @click="handleVote(item.id, 'like')"
                    />
                    <span
                      class="vote-count"
                      :style="{ color: item.vote === 'like' ? '#409eff' : '#999' }"
                    >
                      {{ item.likeCount || 0 }}
                    </span>
                  </div>

                  <div
                    class="vote-container"
                    style="display: inline-block; margin-left: 20px"
                  >
                    <img
                      src="/images/cai.svg"
                      alt="踩"
                      style="width: 20px; height: 20px; cursor: pointer"
                      @click="handleVote(item.id, 'dislike')"
                      :style="{
                        filter:
                          item.vote === 'dislike'
                            ? 'invert(29%) sepia(82%) saturate(748%) hue-rotate(327deg) brightness(97%) contrast(101%)'
                            : 'none',
                        transition: 'filter 0.3s ease',
                      }"
                    />
                    <span
                      class="vote-count"
                      :style="{ color: item.vote === 'dislike' ? '#f56c6c' : '#999' }"
                    >
                      {{ item.dislikeCount || 0 }}
                    </span>
                  </div>
                  <el-button
                    link
                    class="btnbottom"
                    type="success"
                    plain
                    @click="handleRestart(index)"
                  >
                    重新生成<el-icon class="el-icon--right"><ArrowRight /></el-icon>
                  </el-button>
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
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import MarkdownIt from 'markdown-it';

// 状态变量
const displayAnswer = ref<string>('');
const typingSpeed = 20; // 打字速度（毫秒）
let typingInterval: NodeJS.Timeout | null = null;
let currentTypingIndex = 0;
const loading = ref(false);
const isTyping = ref(false);
const emit = defineEmits(['regenerate']);
// Props
interface Props {
  chatData: ChatSession | null;
  streaming?: boolean;
  currentReasoning?: string; // 此prop可能不再需要，或仅用于流式时的临时UI反馈
  currentAnswer?: string;
  currentStreamingMessageId?: string | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  timestamp: Date;
  streaming?: boolean;
  vote?: 'like' | 'dislike' | null; // 用户投票状态
  likeCount?: number; // 点赞数量
  dislikeCount?: number; // 踩数量
}

interface ChatSession {
  id: string;
  title: string;
  time: string;
  type: string;
  messages: ChatMessage[];
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

// 在script部分添加响应式数据
const showCopied = ref(false);
const copiedMessageId = ref<string | null>(null);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

// 复制文本到剪贴板的函数
const copyToClipboard = async (text: string) => {
  try {
    // 现代浏览器API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // 回退方案
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'absolute';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    return true;
  } catch (error) {
    console.error('复制失败:', error);
    return false;
  }
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

// 处理复制点击事件
const handleCopy = async (content: string, messageId: string) => {
  if (!content || content.trim() === '') {
    return;
  }

  const isCopied = await copyToClipboard(content);

  if (isCopied) {
    // 显示"已复制"提示
    showCopied.value = true;
    copiedMessageId.value = messageId;

    // 清除之前的计时器
    if (copyTimer) {
      clearTimeout(copyTimer);
    }

    // 设置2秒后自动隐藏
    copyTimer = setTimeout(() => {
      showCopied.value = false;
      copiedMessageId.value = null;
    }, 2000);
  }
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

// 添加投票处理函数
const handleVote = (messageId: string, voteType: 'like' | 'dislike') => {
  if (!props.chatData) return;

  const message = props.chatData.messages.find((msg) => msg.id === messageId);
  if (!message) return;

  // 如果已经投过票，点击相同按钮则取消
  if (message.vote === voteType) {
    message.vote = null;
    if (voteType === 'like') {
      message.likeCount = Math.max((message.likeCount || 1) - 1, 0);
    } else {
      message.dislikeCount = Math.max((message.dislikeCount || 1) - 1, 0);
    }
  }
  // 如果从点赞切换到踩
  else if (message.vote === 'like' && voteType === 'dislike') {
    message.vote = 'dislike';
    message.likeCount = Math.max((message.likeCount || 1) - 1, 0);
    message.dislikeCount = (message.dislikeCount || 0) + 1;
  }
  // 如果从踩切换到点赞
  else if (message.vote === 'dislike' && voteType === 'like') {
    message.vote = 'like';
    message.dislikeCount = Math.max((message.dislikeCount || 1) - 1, 0);
    message.likeCount = (message.likeCount || 0) + 1;
  }
  // 首次投票
  else {
    message.vote = voteType;
    if (voteType === 'like') {
      message.likeCount = (message.likeCount || 0) + 1;
    } else {
      message.dislikeCount = (message.dislikeCount || 0) + 1;
    }
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

const removeDuplicateReasoning = (reasoningText: string) => {
  if (!reasoningText) return '';

  // 简单去重逻辑：如果内容完全重复，只取一半
  const midIndex = Math.floor(reasoningText.length / 2);
  const firstHalf = reasoningText.substring(0, midIndex);
  const secondHalf = reasoningText.substring(midIndex);

  if (firstHalf === secondHalf) {
    return firstHalf;
  }
  return reasoningText;
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
    // 回复内容变化时，确保滚动
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

// 【可选】可以保留对 currentReasoning 的监听，用于调试，但不再用于触发滚动（因为内容已从 item.reasoning 读取）
watch(
  () => props.currentReasoning,
  () => {},
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
  height: 100%;
  padding: 0;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  position: relative;
  overflow-y: auto;
  align-items: center;

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
                color: black;
                border-radius: 12px;
                padding: 12px 36px;
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
              padding: 20px;
            }

            .thinking-process {
              border-radius: 8px;
              font-size: 16px;
              padding: 16px;
              margin-bottom: 12px;
              animation: fadeIn 0.5s ease;
            }

            .btnbottom {
              margin-left: 20px;
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
              font-size: 15px;
              color: #333;
              line-height: 1.6;
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
              font-size: 16px;
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
.vote-container {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }

  img.active {
    filter: brightness(0.9);
  }
}

.vote-count {
  font-size: 12px;
  font-weight: 600;
  min-width: 16px;
  text-align: center;
  transition: color 0.3s ease;
}

.copy-container {
  position: relative;
  display: inline-flex;
  align-items: center;
  transition: all 0.3s ease;
  padding: 4px 8px;
  border-radius: 6px;

  &:hover {
    background-color: rgba(0, 0, 0, 0.05);

    &:not(.copy-disabled) img {
      opacity: 0.8;
    }
  }

  &.copy-disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  img {
    transition: opacity 0.3s ease;
  }

  .copied-text {
    position: absolute;
    top: -30px;
    left: 50%;
    transform: translateX(-50%);
    background-color: white;
    color: blacck;
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    white-space: nowrap;
    animation: fadeInOut 2s ease;
    z-index: 10;

    &::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border-width: 4px;
      border-style: solid;
      border-color: #67c23a transparent transparent transparent;
    }
  }
}

@keyframes fadeInOut {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(5px);
  }
  20% {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  80% {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateX(-50%) translateY(-5px);
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
