<template>
  <div class="auxiliary-draft">
    <!-- 空状态 -->
    <div v-if="!chatData?.messages?.length" class="header-draft">
      <!-- <div class="empty-icon">✍️</div> -->
      <h1>我是制度起草助手，很高兴见到你</h1>
      <p>帮助您快速生成合规、专业的制度文档，降低起草难度，节约时间成本</p>
    </div>

    <!-- 起草内容 -->
    <div v-else class="draft-container">
      <div class="draft-header">
        <h3>{{ chatData.title }}</h3>
        <div class="draft-actions">
          <button class="action-btn" @click="handleExport">
            <span class="action-icon">📥</span>
            导出
          </button>
        </div>
      </div>

      <div class="messages-list">
        <div
          v-for="message in chatData.messages"
          :key="message.id"
          :class="['message-item', message.role]"
        >
          <!-- 用户消息 -->
          <div v-if="message.role === 'user'" class="message-user">
            <div class="message-content">
              <div class="message-text">{{ message.content }}</div>
              <div class="message-time">
                {{ formatTime(message.timestamp) }}
              </div>
            </div>
            <div class="message-avatar">
              <div class="avatar">我</div>
            </div>
          </div>

          <!-- AI消息 -->
          <div v-else class="message-assistant">
            <div class="message-avatar">
              <div class="avatar">AI</div>
            </div>
            <div class="message-content">
              <!-- 流式消息展示 -->
              <div v-if="message.streaming && message.id === currentStreamingMessageId">
                <!-- 推理过程显示 -->
                <div
                  v-if="currentReasoning !== undefined && currentReasoning.trim() !== ''"
                  class="thinking-process"
                >
                  <div class="thinking-header">
                    <span>思考中...</span>
                  </div>
                  <div class="thinking-content">
                    {{ currentReasoning }}
                  </div>
                </div>

                <!-- 流式回复内容 -->
                <div
                  v-if="currentAnswer && currentAnswer.trim() !== ''"
                  class="answer-streaming"
                >
                  <div class="typing-container">
                    <div class="typing-text" v-html="renderMarkdown(displayAnswer)"></div>
                    <span v-if="isTyping" class="typing-cursor">|</span>
                  </div>
                </div>

                <!-- 加载指示器 -->
                <div
                  v-if="
                    streaming &&
                    (!currentReasoning || currentReasoning.trim() === '') &&
                    (!currentAnswer || currentAnswer.trim() === '')
                  "
                  class="thinking-indicator"
                >
                  <div class="thinking-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>

              <!-- 在AuxiliaryDraft.vue的template中，找到AI消息的最终回复内容部分 -->
              <div v-else>
                <!-- 显示最终回复内容 -->
                <div class="message-text" v-html="renderMarkdown(message.content)"></div>

                <!-- 操作按钮区域 -->
                <div
                  class="action-buttons"
                  style="display: flex; align-items: center; margin-top: 12px"
                >
                  <!-- 复制按钮 -->
                  <div
                    class="copy-container"
                    style="display: inline-flex; align-items: center; margin-left: 0"
                    :title="'复制内容'"
                    @click="handleCopy(message.content, message.id)"
                  >
                    <img
                      src="/images/copy.svg"
                      style="width: 20px; height: 20px; margin-right: 4px"
                      alt="复制"
                    />
                    <span
                      v-if="showCopied && copiedMessageId === message.id"
                      class="copied-text"
                      >已复制</span
                    >
                  </div>

                  <!-- 点赞按钮 -->
                  <div
                    class="vote-container"
                    :class="{ 'like-active': message.vote === 'like' }"
                    @click="handleVote(message.id, 'like')"
                    style="margin-left: 20px"
                  >
                    <img
                      src="/images/zhan.svg"
                      alt="点赞"
                      style="width: 20px; height: 20px"
                      :class="{ 'like-active': message.vote === 'like' }"
                    />
                    <span
                      class="vote-count"
                      :class="{ 'like-active': message.vote === 'like' }"
                    >
                      {{ message.likeCount || 0 }}
                    </span>
                  </div>

                  <!-- 踩按钮 -->
                  <div
                    class="vote-container"
                    :class="{ 'dislike-active': message.vote === 'dislike' }"
                    @click="handleVote(message.id, 'dislike')"
                    style="margin-left: 20px"
                  >
                    <img
                      src="/images/cai.svg"
                      alt="踩"
                      style="width: 20px; height: 20px"
                      :class="{ 'dislike-active': message.vote === 'dislike' }"
                    />
                    <span
                      class="vote-count"
                      :class="{ 'dislike-active': message.vote === 'dislike' }"
                    >
                      {{ message.dislikeCount || 0 }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="message-time">
                {{ formatTime(message.timestamp) }}
                <span
                  v-if="message.streaming && message.id === currentStreamingMessageId"
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
const showCopied = ref(false);
const copiedMessageId = ref<string | null>(null);
let copyTimer: ReturnType<typeof setTimeout> | null = null;
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
  messages: DraftMessage[];
}

interface DraftMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  streaming?: boolean;
  vote?: 'like' | 'dislike' | null; // 新增：投票状态
  likeCount?: number;    // 新增：点赞数
  dislikeCount?: number; // 新增：踩数
}

const props = withDefaults(defineProps<Props>(), {
  streaming: false,
  currentReasoning: '',
  currentAnswer: '',
  currentStreamingMessageId: null,
});

// 响应式状态
const md = new MarkdownIt();
const displayAnswer = ref<string>('');
const typingSpeed = 20;
let typingInterval: NodeJS.Timeout | null = null;
let currentTypingIndex = 0;
const isTyping = ref(false);
// 打字机效果
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

const copyToClipboard = async (text: string) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
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

// 处理复制点击事件
const handleCopy = async (content: string, messageId: string) => {
  if (!content || content.trim() === '') {
    return;
  }
  
  const isCopied = await copyToClipboard(content);
  
  if (isCopied) {
    showCopied.value = true;
    copiedMessageId.value = messageId;
    
    if (copyTimer) {
      clearTimeout(copyTimer);
    }
    
    copyTimer = setTimeout(() => {
      showCopied.value = false;
      copiedMessageId.value = null;
    }, 2000);
  }
};

// 投票处理函数
const handleVote = (messageId: string, voteType: 'like' | 'dislike') => {
  if (!props.chatData) return;
  
  const message = props.chatData.messages.find(msg => msg.id === messageId);
  if (!message) return;
  
  if (message.vote === voteType) {
    message.vote = null;
    if (voteType === 'like') {
      message.likeCount = Math.max((message.likeCount || 1) - 1, 0);
    } else {
      message.dislikeCount = Math.max((message.dislikeCount || 1) - 1, 0);
    }
  } else if (message.vote === 'like' && voteType === 'dislike') {
    message.vote = 'dislike';
    message.likeCount = Math.max((message.likeCount || 1) - 1, 0);
    message.dislikeCount = (message.dislikeCount || 0) + 1;
  } else if (message.vote === 'dislike' && voteType === 'like') {
    message.vote = 'like';
    message.dislikeCount = Math.max((message.dislikeCount || 1) - 1, 0);
    message.likeCount = (message.likeCount || 0) + 1;
  } else {
    message.vote = voteType;
    if (voteType === 'like') {
      message.likeCount = (message.likeCount || 0) + 1;
    } else {
      message.dislikeCount = (message.dislikeCount || 0) + 1;
    }
  }
};
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
const scrollToBottom = () => {
  nextTick(() => {
    const container = document.querySelector('.messages-list');
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
  // 监听模板点击事件
  window.addEventListener('send-template', () => {});
});

onUnmounted(() => {
  stopTypingEffect();
  window.removeEventListener('send-template', () => {});
});
</script>

<style lang="less" scoped>
.auxiliary-draft {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  position: relative;
  overflow-y: auto;
  align-items: center;

  .header-draft {
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
}

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  max-width: 800px;
  margin: 0 auto;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 24px;
  opacity: 0.8;
  animation: bounce 2s ease-in-out infinite;
}

.empty-state h2 {
  margin: 0 0 12px 0;
  font-size: 28px;
  color: #2c3e50;
  font-weight: 600;
  background: linear-gradient(135deg, #1890ff, #096dd9);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.empty-state p {
  margin: 0 0 40px 0;
  font-size: 16px;
  color: #666;
  line-height: 1.6;
  max-width: 600px;
}

.draft-container {
  height: 100%;
  width: 80%;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  margin: 20px;
  position: relative;
}

.draft-header {
  padding: 10px 15px;
  background: #dae6fd;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 10;
}

.draft-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  font-size: 13px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  backdrop-filter: blur(10px);
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateY(-1px);
}

.action-icon {
  font-size: 14px;
}

.messages-list {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  background: #fafafa;
  width: 100%;
}

.message-item {
  display: flex;
  animation: slideIn 0.3s ease;

  &.user {
    justify-content: flex-end;
  }
}

.message-user {
  display: flex;
  max-width: 960px;
  gap: 16px;
  margin-bottom: 16px;
}

.message-assistant {
  display: flex;
  gap: 16px;
  width: 100%;
}

.message-avatar {
  flex-shrink: 0;
}

.message-avatar .avatar {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  color: white;
}

.message-user .avatar {
  background: #d7e6fe;
}

.message-assistant .avatar {
  background: linear-gradient(135deg, #4facfe, #00f2fe);
}

.message-content {
  flex: 1;
  max-width: calc(100% - 60px);
}

.message-user .message-text {
  background: #dae5fc;
  border: 1px solid #e8e8e8;
  border-radius: 12px;
  padding: 16px 20px;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  white-space: pre-wrap;
  word-break: break-word;
}

.message-assistant .message-text {
  // background: white;
  // border: 1px solid #e8e8e8;
  // border-radius: 12px;
  padding: 20px 24px;
  font-size: 14px;
  line-height: 1.8;
  color: #333;
  // box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  // border-left: 4px solid #4facfe;
  position: relative;
  overflow: hidden;
}

.message-assistant .message-text :deep(h1),
.message-assistant .message-text :deep(h2),
.message-assistant .message-text :deep(h3) {
  color: #2c3e50;
  margin: 20px 0 12px 0;
  font-weight: 600;
  padding-bottom: 8px;
  border-bottom: 2px solid #f0f0f0;
}

// .message-assistant .message-text :deep(h1) {
//   font-size: 20px;
// }

// .message-assistant .message-text :deep(h2) {
//   font-size: 18px;
// }

// .message-assistant .message-text :deep(h3) {
//   font-size: 16px;
// }

.message-assistant .message-text :deep(p) {
  margin: 12px 0;
  text-indent: 2em;
}

.message-assistant .message-text :deep(ul),
.message-assistant .message-text :deep(ol) {
  margin: 12px 0;
  padding-left: 2em;
}

.message-assistant .message-text :deep(li) {
  margin: 6px 0;
  line-height: 1.6;
}

.message-assistant .message-text :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  border: 1px solid #e8e8e8;
}

.message-assistant .message-text :deep(th) {
  background: #fafafa;
  padding: 12px;
  text-align: left;
  font-weight: 600;
  border: 1px solid #e8e8e8;
  color: #2c3e50;
}

.message-assistant .message-text :deep(td) {
  padding: 12px;
  border: 1px solid #e8e8e8;
  vertical-align: top;
}

.message-assistant .message-text :deep(pre) {
  background: #f6f8fa;
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
  margin: 12px 0;
  border: 1px solid #e1e4e8;
  border-left: 4px solid #4facfe;
}

.message-assistant .message-text :deep(code) {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.9em;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f6f8fa;
  color: #e74c3c;
}

.message-assistant .message-text :deep(blockquote) {
  border-left: 4px solid #4facfe;
  margin: 16px 0;
  padding: 0 0 0 20px;
  color: #666;
  font-style: italic;
  background: #f0f7ff;
  border-radius: 0 8px 8px 0;
  padding: 12px 20px;
}

/* 流式消息相关样式 */
.thinking-process {
  // background: #fff7e6;
  // border: 1px solid #ffd591;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  animation: fadeIn 0.5s ease;
  width: 100%;
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
  // overflow-y: auto;
}

.answer-streaming {
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

.thinking-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}

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

.document-meta {
  margin-top: 16px;
  padding: 16px;
  background: #f9f9f9;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-label {
  font-size: 12px;
  color: #8c8c8c;
  font-weight: 500;
}

.meta-value {
  font-size: 13px;
  color: #333;
  font-weight: 600;
}

.message-time {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
  padding: 0 4px;
}

.action-buttons {
  display: flex;
  align-items: center;
  margin-top: 12px;
  gap: 20px;
}

.copy-container {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s ease;
  padding: 4px 8px;
  border-radius: 6px;
  
  &:hover {
    background-color: rgba(0, 0, 0, 0.05);
    
    img {
      opacity: 0.8;
    }
  }
  
  img {
    transition: opacity 0.3s ease;
  }
  
  .copied-text {
    position: absolute;
    top: -30px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #67c23a;
    color: white;
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

.vote-container {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.3s ease;
  padding: 4px 8px;
  border-radius: 6px;
  
  &:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }
  
  &.like-active {
    background-color: rgba(64, 158, 255, 0.1);
  }
  
  &.dislike-active {
    background-color: rgba(245, 108, 108, 0.1);
  }
  
  img {
    transition: all 0.3s ease;
    
    &.like-active {
      filter: invert(39%) sepia(93%) saturate(748%) hue-rotate(183deg) brightness(97%) contrast(101%);
    }
    
    &.dislike-active {
      filter: invert(29%) sepia(82%) saturate(748%) hue-rotate(327deg) brightness(97%) contrast(101%);
    }
  }
}

.vote-count {
  font-size: 12px;
  font-weight: 600;
  min-width: 16px;
  text-align: center;
  transition: all 0.3s ease;
  
  &.like-active {
    color: #409eff;
    font-weight: 700;
  }
  
  &.dislike-active {
    color: #f56c6c;
    font-weight: 700;
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

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
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

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
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
