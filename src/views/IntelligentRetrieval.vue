<!--
  智能检索页面，展示检索答案、来源详情和文档预览。
  本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
-->
<template>
  <div class="intelligent-qa">
    <!-- 头部区域 -->
    <div
      class="qa-header"
      v-if="!loading && (!chatData?.messages || chatData.messages.length === 0)"
    >
      <h1>我是智能检索助手，很高兴见到你</h1>
      <p>你可以使用自然语言提问，我来精准回答</p>
    </div>

    <!-- 主体区域 -->
    <div class="qa-container">
      <div class="qa-body">
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
            <div class="message-info">
              <pre
                class="message-content user-message-content"
                :class="{ 'is-collapsed': isUserQuestionCollapsed(item) }"
              ><span class="user-message-content-inner">{{ item.content }}</span></pre>
              <div class="user-message-meta">
                <div class="user-message-actions">
                  <el-tooltip content="复制内容" placement="top">
                    <button
                      class="user-message-action-btn user-message-copy-btn"
                      type="button"
                      aria-label="复制内容"
                      @click.stop="copyUserQuestion(item.content)"
                    >
                      <el-icon><CopyDocument /></el-icon>
                    </button>
                  </el-tooltip>
                <el-tooltip
                  v-if="shouldFoldUserQuestion(item.content)"
                  :content="isUserQuestionCollapsed(item) ? '展开' : '折叠'"
                  placement="top"
                >
                  <button
                    class="user-message-action-btn"
                    type="button"
                    :aria-label="isUserQuestionCollapsed(item) ? '展开' : '折叠'"
                    @click.stop="toggleUserQuestionFold(item.id)"
                  >
                    <el-icon>
                      <component :is="isUserQuestionCollapsed(item) ? CaretBottom : CaretTop" />
                    </el-icon>
                  </button>
                </el-tooltip>
                </div>
                <div class="message-time">{{ formatTime(item.timestamp) }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- AI回复消息 -->
        <div v-else class="message-assistant">
          <div class="message-header">
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
                      <h3 class="source-title">
                        {{ source.subtitle
                        }}<el-button type="primary" plain round class="source-score">
                          匹配度:
                          {{ formatScore(source.score) }}%</el-button
                        >
                      </h3>
                      <div class="result-content-wrapper">
                        <div
                          class="result-content"
                          :class="{ truncated: !expandedStates[source.chunk_id] }"
                        >
                          {{ getDisplayContent(source) }}
                        </div>

                        <div class="result-meta">
                          <span
                            v-if="shouldShowExpand(source)"
                            class="expand-toggle"
                            @click="toggleExpand(source.chunk_id)"
                          >
                            {{ expandedStates[source.chunk_id] ? '收起 ↑' : '展开 ↓' }}
                          </span>
                          <span class="source-origin">
                            制度来源：
                            <a
                              class="source-document-link"
                              href="javascript:;"
                              @click.prevent="
                                handleViewDocument(source)
                              "
                              :class="{ disabled: isDownloading[getSourceFileId(source) || getSourceDirectUrl(source) || source.title] }"
                            >
                              {{ source.title }}
                            </a>
                          </span>
                        </div>
                      </div>
                      <div
                        v-if="
                          idx === paginatedSources(item).length - 1 &&
                          item.content !== '用户停止了生成'
                        "
                        class="retrieval-actions retrieval-actions-in-card"
                      >
                        <el-tooltip content="重新检索" placement="top">
                          <el-button link type="success" plain @click="handleRestart(index)">
                            <el-icon><Refresh /></el-icon>
                          </el-button>
                        </el-tooltip>
                        <span class="final-message-time">
                          {{ formatTime(item.timestamp) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 当没有来源信息时，显示原有回复内容 -->
                <div v-else class="plain-response-container">
                  <div
                    class="message-content pad"
                    v-html="renderMarkdown(item.content)"
                  ></div>
                  <div
                    v-if="item.content && item.content !== '用户停止了生成'"
                    class="retrieval-actions"
                  >
                    <el-tooltip content="重新检索" placement="top">
                      <el-button link type="success" plain @click="handleRestart(index)">
                        <el-icon><Refresh /></el-icon>
                      </el-button>
                    </el-tooltip>
                    <span class="final-message-time">
                      {{ formatTime(item.timestamp) }}
                    </span>
                  </div>
                </div>
              </div>

              <div
                v-if="item.streaming && item.id === currentStreamingMessageId"
                class="message-time"
              >
                {{ formatTime(item.timestamp) }}
                <span class="streaming-badge">
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
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick, onMounted, onUnmounted } from 'vue';
import MarkdownIt from 'markdown-it';
import { ElIcon, ElMessage } from 'element-plus';
import { CaretBottom, CaretTop, CopyDocument, Refresh } from '@element-plus/icons-vue';
import { fetchWatermarkDocument, isPdfDocument, downloadDocumentBlob, openDocumentUrl } from '@/services/documentDownload';
import { getSourceDirectUrl, getSourceFileId, getSourceTitle } from '@/services/sourceUtils';
import { copyTextToClipboard, shouldCollapseUserQuestion } from '@/utils/messageCollapse';

// 状态变量
const displayAnswer = ref<string>('');
const typingSpeed = 20; // 打字速度（毫秒）
let typingInterval: NodeJS.Timeout | null = null;
let currentTypingIndex = 0;
const loading = ref(false);
const isTyping = ref(false);
const emit = defineEmits(['regenerate']);
// 分页状态管理
const paginationStates = reactive<
  Record<string, { currentPage: number; pageSize: number }>
>({});
const isDownloading = reactive<Record<string, boolean>>({});
const expandedStates = reactive<Record<string, boolean>>({});

const expandedUserQuestionMap = reactive<Record<string, boolean>>({});
const shouldFoldUserQuestion = (content?: string) => shouldCollapseUserQuestion(content);
const isUserQuestionCollapsed = (item: { id?: string; content?: string }) => {
  const id = String(item?.id || '');
  return shouldFoldUserQuestion(item?.content) && !expandedUserQuestionMap[id];
};
const toggleUserQuestionFold = (id?: string) => {
  const key = String(id || '');
  if (!key) return;
  expandedUserQuestionMap[key] = !expandedUserQuestionMap[key];
};

const copyUserQuestion = async (content?: string) => {
  const copied = await copyTextToClipboard(content);
  if (copied) {
    ElMessage.success({ message: '已复制', offset: 72 });
  } else {
    ElMessage.error({ message: '复制失败', offset: 72 });
  }
};


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

// 获取显示内容（截断或完整）
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

// 判断是否应该显示展开/收起按钮
const shouldShowExpand = (source: SourceInfo) => {
  const content = source.content || '';
  return content.length > 150;
};

const openRetrievalPdf = (previewWindow: Window | null, url: string) => {
  if (!previewWindow) {
    throw new Error('新页面被浏览器拦截，请允许本站打开新页面');
  }
  previewWindow.location.href = url;
};

/** 处理用户交互或组件事件：handleViewDocument。 */
const handleViewDocument = async (source: SourceInfo | any) => {
  const fileId = getSourceFileId(source);
  const title = getSourceTitle(source, 'document');
  const directUrl = getSourceDirectUrl(source);
  const loadingKey = fileId || directUrl || title;

  if (isDownloading[loadingKey]) return;
  isDownloading[loadingKey] = true;

  const previewWindow = window.open('', '_blank');
  if (previewWindow) previewWindow.opener = null;

  try {
    // 按早期可用版本逻辑：检索详情优先使用 source.file_id 调用独立水印下载服务。
    // 只有缺少 file_id 时，才兜底打开来源自带直链。
    if (!fileId) {
      if (directUrl) {
        if (isPdfDocument(directUrl, 'application/pdf', title, directUrl)) {
          openRetrievalPdf(previewWindow, directUrl);
        } else {
          previewWindow?.close();
          openDocumentUrl(directUrl);
        }
        return;
      }
      throw new Error('检索结果缺少文件ID或预览地址，无法查看详情');
    }

    const result = await fetchWatermarkDocument(fileId, title);

    if (isPdfDocument(fileId, result.contentType, title, result.downloadUrl)) {
      if (result.downloadUrl) {
        openRetrievalPdf(previewWindow, result.downloadUrl);
      } else if (result.blob) {
        const blobUrl = window.URL.createObjectURL(result.blob);
        openRetrievalPdf(previewWindow, blobUrl);
        window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
      } else {
        throw new Error('水印接口未返回可预览的文档地址');
      }
    } else if (result.downloadUrl) {
      previewWindow?.close();
      openDocumentUrl(result.downloadUrl);
    } else if (result.blob) {
      previewWindow?.close();
      downloadDocumentBlob(result.blob, title, fileId);
    } else {
      throw new Error('水印接口未返回可下载的文档内容');
    }
  } catch (error: any) {
    previewWindow?.close();
    ElMessage.error(error?.message || '获取文档失败，请稍后重试');
  } finally {
    isDownloading[loadingKey] = false;
  }
};

// 切换展开状态
const toggleExpand = (chunkId: string) => {
  expandedStates[chunkId] = !expandedStates[chunkId];
};

// 获取当前页码（带默认值）
// const getCurrentPage = (messageId: string): number => {
//   if (!paginationStates[messageId]) {
//     paginationStates[messageId] = { currentPage: 1, pageSize: 10 };
//   }
//   return paginationStates[messageId].currentPage;
// };

// 计算分页后的数据
const paginatedSources = (item: ChatMessage) => {
  if (!item.sources || item.sources.length === 0) return [];

  const state = paginationStates[item.id] || { currentPage: 1, pageSize: 10 };
  const startIndex = (state.currentPage - 1) * state.pageSize;
  const endIndex = startIndex + state.pageSize;

  return item.sources.slice(startIndex, endIndex);
};

// IntelligentQA.vue 和 IntelligentRetrieval.vue 中的 formatScore 函数
const formatScore = (score: number | string | undefined): string => {
  if (score === undefined || score === null) return '0.0';

  let numScore: number;
  if (typeof score === 'number') {
    numScore = score;
  } else {
    numScore = parseFloat(score);
  }

  if (isNaN(numScore)) return '0.0';

  // 如果 score 已经是百分比（大于1），直接显示
  if (numScore > 1) {
    return numScore.toFixed(1);
  }

  // 否则乘以100
  return (numScore * 100).toFixed(1);
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

/** 处理用户交互或组件事件：handleRestart。 */
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

/** 封装当前模块内的业务逻辑：renderMarkdown。 */
const renderMarkdown = (content: string) => {
  if (!content) return '';
  return md.render(content);
};

/** 封装当前模块内的业务逻辑：scrollToBottom。 */
const scrollToBottom = () => {
  nextTick(() => {
    const container =
      document.querySelector('.qa-body') ||
      document.querySelector('.dynamic-content') ||
      document.querySelector('.conversation-history');
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
  height: 98%;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  position: relative;
  overflow: hidden;
}

.qa-container {
  display: flex;
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.qa-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  margin: 0 auto;
}

.conversation-history {
  flex: 1;
  padding-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 80%;
  margin: 0 auto;
  box-sizing: border-box;

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
            font-size: 17px;
            padding: 20px 40px 68px;
            line-height: 1.6;
            word-break: break-word;
            width: 100%;
            box-sizing: border-box;
            margin-bottom: 20px;

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

          .retrieval-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            padding-top: 14px;
            background: #fff;
            border-radius: 16px;
            position: relative;
            z-index: 2;

            .final-message-time {
              color: #999;
              font-size: 15px;
              line-height: 28px;
            }

            :deep(.el-button) {
              width: 28px;
              height: 28px;
              margin: 0;
              padding: 0;
              border-radius: 6px;
              color: #606266;
              font-size: 18px;

              .el-icon {
                font-size: 18px;
              }

              &:hover {
                background: #f2f3f5;
              }
            }
          }

          .message-time {
            font-size: 15px;
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

.search-results-container {
  width: 100%;
  box-sizing: border-box;
  background: transparent;
  margin-bottom: 20px;
}

.plain-response-container {
  overflow: hidden;
  border-radius: 22px;
  background: @white;
  margin-bottom: 20px;

  .message-content {
    margin-bottom: 0 !important;
    padding-bottom: 20px !important;
    border-radius: 0 !important;
    background: transparent !important;
  }
}

.search-results-box {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.search-result-item {
  padding: 22px 24px;
  border: 1px solid #edf0f5;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 5px 16px rgba(31, 45, 61, 0.08);

  .source-title {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    margin: 0 0 14px;
    font-size: 18px;
    line-height: 1.5;
    color: #20242a;
  }

  &:last-child {
    margin-bottom: 0;
  }

  .retrieval-actions-in-card {
    margin: 16px -24px -22px;
    padding: 14px 24px 18px;
    border-radius: 0 0 16px 16px;
    box-shadow: none;
  }
}

.result-content-wrapper {
  position: relative;
  margin-bottom: 0;

  .result-meta {
    display: flex;
    align-items: center;
    gap: 18px;
    font-size: 14px;
    color: #666;
    padding-top: 14px;
    border-top: none;

    .source-origin {
      display: inline-flex;
      align-items: center;
      min-width: 0;
    }

    .source-document-link {
      color: #1890ff;
      text-decoration: none;
      cursor: pointer;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      &:hover {
        text-decoration: underline;
      }
    }
  }
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

.source-document-link {
  &.disabled {
    color: #999;
    cursor: not-allowed;
    pointer-events: none;
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
