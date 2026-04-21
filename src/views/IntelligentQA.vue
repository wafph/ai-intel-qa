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
        :data-message-id="item.id"
      >
        <!-- 用户消息 -->
        <div v-if="item.role === 'user'" class="message-user">
          <div class="message-header">
            <div class="message-info">
              <pre class="message-content user-message-content">{{ item.content }}</pre>
              <div class="message-time">{{ formatTime(item.timestamp) }}</div>
            </div>
          </div>
        </div>

        <!-- AI回复消息 -->
        <div v-else class="message-assistant">
          <!-- 双栏布局容器 -->
          <div
            class="dual-column-container"
            :class="{ 'show-sources': sourcesVisible[item.id] }"
          >
            <!-- 左侧消息内容区域 -->
            <div class="left-column" :ref="(el) => setLeftColumnRef(el, item.id)">
              <div class="message-header">
                <div class="message-info">
                  <!-- 【核心修改点】始终显示"思考过程"部分，只要消息中存在 reasoning 内容 -->
                  <div
                    v-if="item.reasoning && item.reasoning.trim() !== ''"
                    class="thinking-process"
                    ref="thinkingProcessRef"
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
                    <!-- 回复内容（打字机效果） -->
                    <div
                      v-if="currentAnswer && currentAnswer.trim() !== ''"
                      class="answer-streaming"
                    >
                      <div class="typing-container">
                        <div
                          class="typing-text"
                          v-html="renderMarkdown(displayAnswer)"
                        ></div>
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
                      ref="finalContentRef"
                    ></div>

                    <div
                      style="display: flex; align-items: center"
                      v-if="item.content && item.content !== '用户停止了生成'"
                    >
                      <el-button
                        link
                        style="padding: 10px 20px"
                        type="primary"
                        plain
                        @click="toggleAndScrollToSources(item.id)"
                      >
                        来源<el-icon class="el-icon--right"><ArrowRight /></el-icon>
                      </el-button>
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

            <!-- 右侧参考来源区域 -->
            <div
              v-if="item.sources && item.sources.length > 0"
              class="right-column"
              :ref="(el) => setRightColumnRef(el, item.id)"
              :style="getRightColumnStyle(item.id)"
            >
              <div class="sources-container">
                <div class="sources-header">
                  <span>📄 参考来源</span>
                </div>
                <div class="sources-list">
                  <div
                    v-for="(source, sourceIndex) in item.sources"
                    :key="sourceIndex"
                    class="source-item"
                  >
                    <div
                      class="source-title"
                      @click="toggleSourceItem(item.id, sourceIndex)"
                    >
                      <div class="title-content">
                        <strong>{{ source.title }}</strong>
                        <span class="source-score"
                          >匹配度:
                          {{ (parseFloat(source.score) * 100).toFixed(1) }}%</span
                        >
                      </div>
                      <span class="collapse-icon">
                        {{ sourceCollapsed[`${item.id}-${sourceIndex}`] ? '▶' : '▼' }}
                      </span>
                    </div>
                    <div
                      v-show="!sourceCollapsed[`${item.id}-${sourceIndex}`]"
                      class="source-details"
                    >
                      <div class="source-subtitle">{{ source.subtitle }}</div>
                      <div class="source-content">{{ source.content }}</div>
                      <div class="source-footer">
                        <span class="source-date">
                          更新时间: {{ formatSourceDate(source.update_date_time) }}
                        </span>
                        <el-button
                          link
                          size="small"
                          type="primary"
                          @click="copySource(source)"
                        >
                          复制片段
                        </el-button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, onUpdated, reactive } from 'vue';
import MarkdownIt from 'markdown-it';
import { ElMessage } from 'element-plus';

// 状态变量
const displayAnswer = ref<string>('');
const typingSpeed = 20; // 打字速度（毫秒）
let typingInterval: NodeJS.Timeout | null = null;
let currentTypingIndex = 0;
const loading = ref(false);
const isTyping = ref(false);
const emit = defineEmits(['regenerate']);

// 新增：控制参考来源的显示状态和单个来源项的折叠状态
const sourcesVisible = ref<Record<string, boolean>>({});
const sourceCollapsed = ref<Record<string, boolean>>({});

// 存储每个消息的左边栏和右边栏的DOM引用
const leftColumnRefs = reactive<Record<string, HTMLElement>>({});
const rightColumnRefs = reactive<Record<string, HTMLElement>>({});
// 设置左边栏引用
const setLeftColumnRef = (el: any, messageId: string) => {
  if (el && el instanceof HTMLElement) {
    leftColumnRefs[messageId] = el;
  }
};

const setRightColumnRef = (el: any, messageId: string) => {
  if (el && el instanceof HTMLElement) {
    rightColumnRefs[messageId] = el;
  }
};
// 获取右边栏样式
const getRightColumnStyle = (messageId: string) => {
  const leftColumn = leftColumnRefs[messageId];
  if (!leftColumn) return {};

  const leftHeight = leftColumn.offsetHeight;
  return {
    height: `${leftHeight}px`,
    maxHeight: 'none', // 移除最大高度限制
  };
};

// Props
interface Props {
  chatData: ChatSession | null;
  streaming?: boolean;
  currentReasoning?: string;
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
  vote?: 'like' | 'dislike' | null;
  likeCount?: number;
  dislikeCount?: number;
  sources?: any[];
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

// 格式化来源更新时间
const formatSourceDate = (timestamp: string) => {
  if (!timestamp) return '';
  const date = new Date(parseInt(timestamp));
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 复制来源片段
const copySource = async (source: any) => {
  const text = `标题：${source.title}\n子标题：${source.subtitle}\n内容：${source.content}`;
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制来源片段');
  } catch (err) {
    console.error('复制失败:', err);
  }
};

// 点击来源按钮时显示参考来源面板
const toggleAndScrollToSources = (messageId: string) => {
  // 切换显示状态
  sourcesVisible.value[messageId] = !sourcesVisible.value[messageId];

  // 如果显示，则调整右边栏高度
  if (sourcesVisible.value[messageId]) {
    nextTick(() => {
      adjustRightColumnHeight(messageId);

      const sourcesContainer = document.querySelector(
        `[data-message-id="${messageId}"] .sources-container`,
      );
      if (sourcesContainer) {
        sourcesContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }
};

// 新增：调整右边栏高度的函数 - 精确计算推理内容+最终回复内容高度
const adjustRightColumnHeight = (messageId: string) => {
  const leftColumn = leftColumnRefs[messageId];
  const rightColumn = rightColumnRefs[messageId];

  if (leftColumn && rightColumn) {
    // 获取左侧容器内所有需要计算高度的元素
    const thinkingProcess = leftColumn.querySelector('.thinking-process') as HTMLElement;
    const finalContent = leftColumn.querySelector('.message-content.pad') as HTMLElement;

    let totalHeight = 0;

    // 计算推理内容高度（如果存在）
    if (thinkingProcess) {
      totalHeight += thinkingProcess.offsetHeight;
    }

    // 计算最终回复内容高度（如果存在）
    if (finalContent) {
      totalHeight += finalContent.offsetHeight;
    }

    // 加上一些额外的间距（padding、margin等）
    const styles = window.getComputedStyle(leftColumn);
    const paddingTop = parseInt(styles.paddingTop) || 0;
    const paddingBottom = parseInt(styles.paddingBottom) || 0;
    const marginTop = parseInt(styles.marginTop) || 0;
    const marginBottom = parseInt(styles.marginBottom) || 0;

    totalHeight += paddingTop + paddingBottom + marginTop + marginBottom;

    // 设置右侧容器高度
    rightColumn.style.height = `${totalHeight}px`;

    // 同时设置sources-container的高度
    const sourcesContainer = rightColumn.querySelector(
      '.sources-container',
    ) as HTMLElement;
    if (sourcesContainer) {
      sourcesContainer.style.height = `${totalHeight}px`;
    }
  }
};

// 新增：切换单个来源项的折叠状态
const toggleSourceItem = (messageId: string, sourceIndex: number) => {
  const key = `${messageId}-${sourceIndex}`;
  sourceCollapsed.value[key] = !sourceCollapsed.value[key];

  // 延迟调整高度，等待DOM更新
  nextTick(() => {
    adjustRightColumnHeight(messageId);
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

      // 调整所有可见的右边栏高度
      Object.keys(sourcesVisible.value).forEach((messageId) => {
        if (sourcesVisible.value[messageId]) {
          adjustRightColumnHeight(messageId);
        }
      });
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

// 在每次更新后调整右边栏高度
onUpdated(() => {
  // 调整所有可见的右边栏高度
  Object.keys(sourcesVisible.value).forEach((messageId) => {
    if (sourcesVisible.value[messageId]) {
      adjustRightColumnHeight(messageId);
    }
  });
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

            .message-info {
              align-items: flex-end;
              margin-right: 30px;

              .message-content {
                background: #1c73eb;
                color: @white;
                border-radius: 22px;
                padding: 12px 36px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              }

              .user-message-content {
                white-space: pre-wrap;
                word-break: break-word;
                border-radius: 12px;
                padding: 12px 20px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                font-family: inherit; /* 继承父字体，避免等宽字体 */
                margin: 0; /* 移除 pre 标签默认的边距 */
                overflow-x: auto; /* 防止长行溢出 */
                max-width: 68%;
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
              padding: 35px;
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
              background: @white;
              border-radius: 22px;
              padding: 35px;
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
              background: #fff;
              border-radius: 22px;
              margin-bottom: 15px;
              font-size: 17px;
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

              & > :deep(p:nth-last-of-type(2)) {
                border-top: 1px solid lightgray;
              }

              & > :deep(p:last-child) {
                border-bottom: 1px solid lightgray;
                padding-bottom: 10px;
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

    .message-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  }

  // 双栏布局样式
  .dual-column-container {
    display: flex;
    width: 100%;
    gap: 2%;
    transition: all 0.3s ease;
    align-items: flex-start; // 防止等高拉伸

    // 默认单栏布局
    .left-column {
      width: 83%;
      transition: width 0.3s ease;
    }

    .right-column {
      width: 0;
      opacity: 0;
      overflow: hidden;
      transition: all 0.3s ease;
      border-left: 1px solid #e9ecef;
      padding-left: 0;
      margin-left: 0;
      display: flex;
      flex-direction: column;
      overflow-y: auto; // 允许滚动
      max-height: none; // 移除最大高度限制
    }

    // 显示参考来源时的双栏布局
    &.show-sources {
      .left-column {
        width: 63%;
      }

      .right-column {
        width: 35%;
        opacity: 1;
        padding-left: 20px;
        margin-left: 2%;
      }
    }
  }

  // 参考来源容器样式
  .sources-container {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    height: fit-content;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%; // 确保容器占满父元素高度

    .sources-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 16px;
      font-weight: 600;
      color: #303133;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e9ecef;
      flex-shrink: 0;
    }

    .sources-list {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
    }

    .source-item {
      background: white;
      border-radius: 6px;
      margin-bottom: 12px;
      border-left: 3px solid #409eff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      overflow: hidden;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .source-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      font-size: 14px;
      color: #303133;
      cursor: pointer;
      user-select: none;
      background: #f0f7ff;
      transition: background-color 0.3s ease;

      &:hover {
        background: #e6f7ff;
      }

      .title-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex: 1;
        margin-right: 10px;
      }

      .collapse-icon {
        font-size: 12px;
        color: #909399;
        transition: transform 0.3s ease;
        flex-shrink: 0;
      }
    }

    .source-details {
      transition: all 0.3s ease;
      overflow: hidden;
    }

    .source-subtitle {
      font-size: 12px;
      color: #909399;
      padding: 0 12px 8px 12px;
    }

    .source-content {
      font-size: 13px;
      color: #606266;
      line-height: 1.6;
      padding: 0 12px 8px 12px;
      max-height: 200px;
      overflow-y: auto;
      background: #f8f9fa;
      margin: 0 12px 8px 12px;
      border-radius: 4px;
    }

    .source-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #909399;
      padding: 0 12px 12px 12px;
    }

    .source-score {
      font-size: 12px;
      color: #67c23a;
      background: #f0f9eb;
      padding: 2px 6px;
      border-radius: 4px;
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
