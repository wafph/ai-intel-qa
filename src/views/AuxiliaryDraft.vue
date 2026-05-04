<template>
  <div class="auxiliary-draft intelligent-qa">
    <!-- 头部区域 -->
    <div
      class="qa-header"
      v-if="!loading && (!chatData?.messages || chatData.messages.length === 0)"
    >
      <h1>我是制度起草助手，很高兴见到你</h1>
      <p>帮助您快速生成合规、专业的制度文档，降低起草难度，节约时间成本</p>
    </div>

    <!-- 起草内容 -->
    <div
      class="conversation-history"
      v-if="chatData?.messages && chatData.messages.length > 0"
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
            <div class="message-info">
              <pre class="message-content user-message-content">{{ item.content }}</pre>
              <div class="message-time">{{ formatTime(item.timestamp) }}</div>
            </div>
          </div>
        </div>

        <!-- AI回复消息 -->
        <div v-else class="message-assistant">
          <!-- 双栏布局容器开始 -->
          <div
            class="dual-column-container"
            :class="{ 'show-sources': sourcesVisible[item.id] }"
          >
            <!-- 左侧消息内容区域 -->
            <div class="left-column" :ref="(el) => setLeftColumnRef(el, item.id)">
              <div class="message-header">
                <div class="message-info">
                  <!-- 原有的推理过程和消息内容保持不变 -->
                  <div
                    v-if="item.reasoning && item.reasoning.trim() !== ''"
                    class="thinking-process"
                  >
                    <div class="thinking-header">
                      <span>思考中...</span>
                    </div>
                    <div class="thinking-content">
                      {{ item.reasoning }}
                    </div>
                  </div>

                  <!-- 当前流式消息 -->
                  <div v-if="item.streaming && item.id === currentStreamingMessageId">
                    <!-- ... 流式内容显示 ... -->
                  </div>

                  <!-- 非流式消息 -->
                  <div v-else>
                    <div
                      class="message-content pad"
                      v-html="renderMarkdown(item.content)"
                    ></div>
                    <div
                      style="margin-left: 15px"
                      v-if="item.content && item.content !== '用户停止了生成'"
                    >
                      <el-button
                        link
                        type="primary"
                        plain
                        @click="toggleAndScrollToSources(item.id)"
                      >
                        {{ sourcesVisible[item.id] ? '隐藏推荐范文' : '显示推荐范文' }}
                        <el-icon class="el-icon--right">
                          <component
                            :is="sourcesVisible[item.id] ? ArrowUp : ArrowRight"
                          />
                        </el-icon>
                      </el-button>
                      <el-button
                        link
                        class="btn-bottom"
                        type="primary"
                        plain
                        @click="handleExport"
                        :loading="loading"
                        :disabled="loading"
                      >
                        {{ loading ? '转换中...' : '导出' }}
                      </el-button>
                      <el-button link type="success" plain @click="handleRestart(index)">
                        重新起草<el-icon class="el-icon--right"><ArrowRight /></el-icon>
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

            <!-- 右侧推荐范文区域 -->
            <div
              v-if="item.sources && item.sources.length > 0"
              class="right-column"
              :ref="(el) => setRightColumnRef(el, item.id)"
              :style="getRightColumnStyle(item.id)"
            >
              <div class="sources-container">
                <div class="sources-header">
                  <span>📄 推荐范文</span>
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
                        <strong class="source-title-clickable">
                          {{ source.title }}
                        </strong>
                        <span class="source-score">
                          匹配度: {{ formatScore(source.match_score || source.score) }}%
                        </span>
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
          <!-- 双栏布局容器结束 -->
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, reactive, onMounted, onUnmounted, onUpdated } from 'vue';
import MarkdownIt from 'markdown-it';
import { ArrowRight, ArrowUp } from '@element-plus/icons-vue'; // 新增图标导入
import { ElMessage } from 'element-plus';
const emit = defineEmits(['regenerate']);

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
  reasoning?: string;
  timestamp: Date;
  streaming?: boolean;
  sources?: any[];
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
const loading = ref(false);
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

// 修改：导出功能
const handleExport = async () => {
  if (!props.chatData) {
    ElMessage.error('没有可导出的内容');
    return;
  }

  // 获取 AI 生成的草稿内容
  const draftContent = props.chatData.messages
    .filter((msg: any) => msg.role === 'assistant')
    .map((msg: any) => msg.content)
    .join('\n\n');

  if (!draftContent.trim()) {
    ElMessage.warning('没有可导出的草稿内容');
    return;
  }

  // 获取 qa_id（使用最后一个 AI 消息的 id）
  const lastAssistantMessage = props.chatData.messages
    .filter((msg: any) => msg.role === 'assistant')
    .pop();

  const qaId = lastAssistantMessage?.id || 'unknown';

  try {
    loading.value = true;
    // 调用转换接口
    const convertResponse = await fetch('http://1.94.244.72:11327/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        markdown: draftContent,
        qa_id: qaId,
      }),
    });

    if (!convertResponse.ok) {
      throw new Error(`转换失败: ${convertResponse.status}`);
    }
    const convertResult = await convertResponse.json();
    console.log('转换结果:', convertResult);
    // 检查转换结果
    if (!convertResult.download_url) {
      throw new Error('转换结果中没有下载链接');
    }
    // 下载文件
    await downloadConvertedFile(convertResult.download_url, convertResult.file_name);

    ElMessage.success('导出成功！');
  } catch (error) {
    console.error('导出失败:', error);
    ElMessage.error(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
  } finally {
    loading.value = false;
  }
};

// 新增：下载转换后的文件
const downloadConvertedFile = async (downloadUrl: string, fileName: string) => {
  try {
    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        Accept: '*/*',
      },
    });

    if (!response.ok) {
      throw new Error(`下载失败: ${response.status}`);
    }
    const fileBlob = await response.blob();
    // 创建下载链接
    const url = window.URL.createObjectURL(fileBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'draft.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('下载文件失败:', error);
    throw error;
  }
};

// ✅ 新增：控制推荐范文的显示状态和单个条目的折叠状态
const sourcesVisible = ref<Record<string, boolean>>({});
const sourceCollapsed = ref<Record<string, boolean>>({});

// ✅ 新增：存储左右栏的DOM引用，用于高度同步
const leftColumnRefs = reactive<Record<string, HTMLElement>>({});
const rightColumnRefs = reactive<Record<string, HTMLElement>>({});

// ✅ 新增：设置引用
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

// ✅ 新增：获取右侧栏样式（动态高度）
const getRightColumnStyle = (messageId: string) => {
  const leftColumn = leftColumnRefs[messageId];
  if (!leftColumn) return {};
  const leftHeight = leftColumn.offsetHeight;
  return {
    height: `${leftHeight}px`,
    maxHeight: 'none',
  };
};

// ✅ 新增：切换推荐范文侧边栏的显示/隐藏
const toggleAndScrollToSources = (messageId: string) => {
  sourcesVisible.value[messageId] = !sourcesVisible.value[messageId];
  if (sourcesVisible.value[messageId]) {
    nextTick(() => {
      adjustRightColumnHeight(messageId);
    });
  }
};

// ✅ 新增：调整右侧栏高度以匹配左侧内容
const adjustRightColumnHeight = (messageId: string) => {
  const leftColumn = leftColumnRefs[messageId];
  const rightColumn = rightColumnRefs[messageId];
  if (leftColumn && rightColumn) {
    const thinkingProcess = leftColumn.querySelector('.thinking-process') as HTMLElement;
    const finalContent = leftColumn.querySelector('.message-content.pad') as HTMLElement;
    let totalHeight = 0;
    if (thinkingProcess) totalHeight += thinkingProcess.offsetHeight;
    if (finalContent) totalHeight += finalContent.offsetHeight;
    const styles = window.getComputedStyle(leftColumn);
    totalHeight +=
      (parseInt(styles.paddingTop) || 0) + (parseInt(styles.paddingBottom) || 0);
    rightColumn.style.height = `${totalHeight}px`;
    const sourcesContainer = rightColumn.querySelector(
      '.sources-container',
    ) as HTMLElement;
    if (sourcesContainer) sourcesContainer.style.height = `${totalHeight}px`;
  }
};

// ✅ 新增：切换单个范文条目的折叠状态
const toggleSourceItem = (messageId: string, sourceIndex: number) => {
  const key = `${messageId}-${sourceIndex}`;
  sourceCollapsed.value[key] = !sourceCollapsed.value[key];
  nextTick(() => adjustRightColumnHeight(messageId));
};

// ✅ 新增：格式化匹配度分数
const formatScore = (score: number | string | undefined): string => {
  if (score === undefined || score === null) return '0.0';
  let numScore: number = typeof score === 'number' ? score : parseFloat(score);
  if (isNaN(numScore)) return '0.0';
  return (numScore > 1 ? numScore : numScore * 100).toFixed(1);
};

// ✅ 新增：格式化来源更新时间
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

// ✅ 新增：复制范文片段
const copySource = async (source: any) => {
  const text = `标题：${source.title}\n子标题：${source.subtitle}\n内容：${source.content}`;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      ElMessage.success('已复制范文片段');
    } catch (err) {
      ElMessage.error('复制失败');
    }
  } else {
    // 降级方案
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    success
      ? ElMessage.success('已复制范文片段')
      : ElMessage.error('复制失败（降级方案）');
  }
};
const scrollToBottom = () => {
  nextTick(() => {
    const container = document.querySelector('.conversation-history');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
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

// 监听当前流式消息ID变化
watch(
  () => props.currentStreamingMessageId,
  (newId) => {
    if (!newId) {
      stopTypingEffect();
    }
  },
);

watch(
  () => props.chatData,
  () => {
    nextTick(() => {
      Object.keys(sourcesVisible.value).forEach((messageId) => {
        if (sourcesVisible.value[messageId]) {
          adjustRightColumnHeight(messageId);
        }
      });
    });
  },
  { deep: true },
);

// ✅ 新增：在组件更新后也调整高度
onUpdated(() => {
  Object.keys(sourcesVisible.value).forEach((messageId) => {
    if (sourcesVisible.value[messageId]) {
      adjustRightColumnHeight(messageId);
    }
  });
});

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
    padding-top: 20px;
    overflow-y: auto;
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

            .message-info {
              align-items: flex-end;
              margin-right: 30px;

              .message-content {
                background: #1c73eb;
                color: @white;
                border-radius: 22px;
                padding: 12px 20px;
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

      .message-assistant {
        width: 100%;
      }

      &.assistant-message {
        align-self: flex-start;
        width: 100%;

        .message-header {
          .message-info {
            width: 100%;

            .pad {
              padding: 20px 30px;
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

            .answer-streaming {
              background: @white;
              border-radius: 22px;
              line-height: 1.6;
              padding: 20px 30px;
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
              background: #fff;
              margin-bottom: 15px;
              border-radius: 22px;
              font-size: 17px;
              line-height: 1.6;
              word-break: break-word;

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
}

.dual-column-container {
  display: flex;
  width: 100%;
  gap: 2%;
  transition: all 0.3s ease;
  align-items: flex-start;

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
    overflow-y: auto;
    max-height: none;
  }

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

/* 推荐范文容器样式 */
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
  height: 100%;

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
    padding: 8px 12px;
    border-top: 1px solid #f0f0f0;
  }
  .source-score {
    font-size: 12px;
    color: #52c41a;
    font-weight: 500;
    background: #f6ffed;
    padding: 2px 6px;
    border-radius: 10px;
    border: 1px solid #b7eb8f;
  }
  .source-title-clickable {
    cursor: pointer;
    color: #1890ff;
    &:hover {
      text-decoration: underline;
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
