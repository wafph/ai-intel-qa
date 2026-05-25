<!--
  辅助起草页面，展示流式起草、推荐范文、预览和导出操作。
  本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
-->
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

    <!-- 主容器：左右分栏布局 -->
    <div class="qa-container">
      <!-- 左侧对话区域 -->
      <div class="qa-body">
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
            <!-- 用户消息（右对齐） -->
            <div v-if="item.role === 'user'" class="message-user">
              <div class="message-header">
                <div class="message-info">
                  <pre class="message-content user-message-content">{{
                    item.content
                  }}</pre>
                  <div class="message-time">{{ formatTime(item.timestamp) }}</div>
                </div>
              </div>
            </div>

            <!-- AI回复消息（左对齐） -->
            <div v-else class="message-assistant">
              <div class="message-header">
                <div class="message-info">
                  <!-- 原有的推理过程 -->
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

                    <!-- 加载指示器 -->
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
                    <div
                      class="message-content pad"
                      v-html="renderMarkdown(item.content)"
                    ></div>
                    <div
                      class="message-actions"
                      v-if="item.content && item.content !== '用户停止了生成'"
                    >
                      <!-- 查看推荐范文按钮 -->
                      <el-button
                        link
                        type="primary"
                        plain
                        @click="toggleSourcesPanel(item)"
                      >
                        {{
                          activeSourcesItem?.id === item.id && showSourcesPanel
                            ? '隐藏推荐范文'
                            : '显示推荐范文'
                        }}
                        <el-icon class="el-icon--right">
                          <component
                            :is="
                              activeSourcesItem?.id === item.id && showSourcesPanel
                                ? ArrowUp
                                : ArrowRight
                            "
                          />
                        </el-icon>
                      </el-button>

                      <!-- 导出按钮 -->
                      <el-button
                        link
                        class="export-btn"
                        type="primary"
                        plain
                        @click="handleExport"
                        :loading="loading"
                        :disabled="loading"
                      >
                        {{ loading ? '转换中...' : '导出' }}
                      </el-button>

                      <!-- 重新起草按钮 -->
                      <el-button
                        link
                        class="regenerate-btn"
                        type="success"
                        plain
                        @click="handleRestart(index)"
                      >
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
          </div>
        </div>
      </div>

      <!-- 右侧固定推荐范文面板（点击显示推荐范文时显示） -->
      <div
        v-if="showSourcesPanel"
        class="sources-sidebar"
        :class="{ 'sidebar-visible': showSourcesPanel }"
      >
        <div class="sources-header">
          <h3>📄 推荐范文</h3>
          <el-icon class="close-btn" @click="closeSourcesPanel"><Close /></el-icon>
        </div>
        <div
          class="sources-content"
          v-if="activeSourcesItem && activeSourcesItem.sources"
        >
          <div
            v-for="(source, sourceIndex) in activeSourcesItem.sources"
            :key="sourceIndex"
            class="source-item"
          >
            <div
              class="source-title"
              @click="toggleSourceItem(activeSourcesItem.id, sourceIndex)"
            >
              <div class="title-content">
                <!-- 可点击的标题链接 -->
                <strong
                  @click.stop="handleSourceTitleClick(source, $event)"
                  class="source-title-clickable"
                >
                  {{ source.title }}
                </strong>
                <span class="source-score">
                  匹配度: {{ formatScore(source.match_score || source.score) }}%
                </span>
              </div>
              <span class="collapse-icon">
                {{ isSourceCollapsed(sourceIndex) ? '▶' : '▼' }}
              </span>
            </div>
            <div v-show="!isSourceCollapsed(sourceIndex)" class="source-details">
              <div class="source-subtitle">{{ source.subtitle }}</div>
              <div class="source-content">{{ source.content }}</div>
              <div class="source-footer">
                <span class="source-date">
                  更新时间: {{ formatSourceDate(source.update_date_time) }}
                </span>
                <el-button link size="small" type="primary" @click="copySource(source)">
                  复制片段
                </el-button>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="no-sources">
          <p>暂无推荐范文</p>
        </div>
      </div>
    </div>

    <!-- PDF 预览弹框 -->
    <div v-if="showPdfViewer" class="pdf-viewer-modal" @click.self="closePdfViewer">
      <div class="pdf-viewer-container">
        <div class="pdf-viewer-header">
          <span>{{ currentPdfTitle }}</span>
          <button class="close-btn" @click="closePdfViewer">×</button>
        </div>
        <iframe
          v-if="pdfViewerUrl"
          :src="pdfViewerUrl"
          class="pdf-iframe"
          frameborder="0"
        ></iframe>
        <div v-else class="loading-pdf">
          <div class="loading-spinner"></div>
          <p>正在加载 PDF...</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import MarkdownIt from 'markdown-it';
import { ArrowRight, ArrowUp, Close } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { API } from '@/api/api';
import { isSuccessStatus, request } from '@/services/http';
import {
  fetchWatermarkDocument,
  isPdfDocument,
  downloadDocumentBlob,
  openDocumentUrl,
} from '@/services/documentDownload';
import { getSourceDirectUrl, getSourceFileId, getSourceTitle } from '@/services/sourceUtils';
const emit = defineEmits(['regenerate', 'sources-panel-toggle']);

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

// 推荐范文面板状态
const showSourcesPanel = ref(false);
const activeSourcesItem = ref<any>(null);
const sourceCollapsed = ref<Record<string, boolean>>({});
// PDF 预览相关状态
const showPdfViewer = ref(false);
const pdfViewerUrl = ref('');
const currentPdfTitle = ref('');

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

/** 开始编辑、订阅或交互：startTypingEffect。 */
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

/** 停止当前输出或任务：stopTypingEffect。 */
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

// 格式化时间
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

// 渲染 Markdown
const renderMarkdown = (content: string) => {
  if (!content) return '';
  return md.render(content);
};

// 导出功能：恢复早期可用逻辑。
// 先调用独立转换服务 /convert 获取 download_url，再按 download_url 执行 GET 下载文件流。
// /convert 和后续下载地址建议由 11316 Nginx 直转到 11327，不经过 8000 后端。
const handleExport = async () => {
  if (!props.chatData) {
    ElMessage.error('没有可导出的内容');
    return;
  }

  /** 封装当前模块内的业务逻辑：assistantMessages。 */
  const assistantMessages = props.chatData.messages.filter((msg: any) => msg.role === 'assistant');
  const draftContent = assistantMessages
    .map((msg: any) => msg.content)
    .filter((content: string) => content && content.trim())
    .join('\n\n');

  if (!draftContent.trim()) {
    ElMessage.warning('没有可导出的草稿内容');
    return;
  }

  const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
  const qaId = lastAssistantMessage?.id || 'unknown';

  try {
    loading.value = true;
    const convertResponse = await request({
      url: API.document.convert,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        markdown: draftContent,
        qa_id: qaId,
      },
    });

    if (!isSuccessStatus(convertResponse.status)) {
      throw new Error(`转换失败: ${convertResponse.status}`);
    }

    const convertResult: any = convertResponse.data;
    if (!convertResult.download_url) {
      throw new Error('转换结果中没有下载链接');
    }

    await downloadConvertedFile(convertResult.download_url, convertResult.file_name || 'draft.docx');
    ElMessage.success('导出成功！');
  } catch (error) {
    ElMessage.error(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
  } finally {
    loading.value = false;
  }
};

// 下载转换后的文件：恢复早期逻辑，按转换服务返回的 download_url 再 GET 文件流。
const downloadConvertedFile = async (downloadUrl: string, fileName: string) => {
  const response = await request<Blob>({
    url: downloadUrl,
    method: 'GET',
    headers: {
      Accept: '*/*',
    },
    responseType: 'blob',
  });

  if (!isSuccessStatus(response.status)) {
    throw new Error(`下载失败: ${response.status}`);
  }

  const fileBlob = response.data;
  const url = window.URL.createObjectURL(fileBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'draft.docx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

// 切换参考来源面板
const toggleSourcesPanel = (item: DraftMessage) => {
  if (activeSourcesItem.value?.id === item.id && showSourcesPanel.value) {
    // 如果点击的是当前已显示的面板，则关闭
    closeSourcesPanel();
  } else {
    // 否则打开新面板
    activeSourcesItem.value = item;
    showSourcesPanel.value = true;
  }
  emit('sources-panel-toggle', showSourcesPanel.value);
};

/** 关闭面板、菜单或弹窗：closeSourcesPanel。 */
const closeSourcesPanel = () => {
  showSourcesPanel.value = false;
  activeSourcesItem.value = null;
  sourceCollapsed.value = {};
  emit('sources-panel-toggle', false);
};

// 检查源是否折叠
const isSourceCollapsed = (sourceIndex: string | number): boolean => {
  if (!activeSourcesItem.value) return false;
  const key = `${activeSourcesItem.value.id}-${sourceIndex}`;
  return sourceCollapsed.value[key] || false;
};

// 切换单个源折叠状态
const toggleSourceItem = (messageId: string, sourceIndex: string | number) => {
  const key = `${messageId}-${sourceIndex}`;
  sourceCollapsed.value[key] = !sourceCollapsed.value[key];
};

// 格式化匹配度分数
const formatScore = (score: number | string | undefined): string => {
  if (score === undefined || score === null) return '0.0';
  let numScore: number = typeof score === 'number' ? score : parseFloat(score);
  if (isNaN(numScore)) return '0.0';
  return (numScore > 1 ? numScore : numScore * 100).toFixed(1);
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

// 复制范文片段
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

// 处理来源标题点击
const handleSourceTitleClick = async (source: any, event: Event) => {
  event.stopPropagation();

  try {
    const fileId = getSourceFileId(source);
    const title = getSourceTitle(source, 'document');
    const directUrl = getSourceDirectUrl(source);

    // 按早期可用版本逻辑：推荐范文预览优先使用 file_id 调用独立水印下载服务。
    // 只有缺少 file_id 时，才兜底打开来源自带直链。
    if (!fileId) {
      if (directUrl) {
        if (isPdfDocument(directUrl, 'application/pdf', title, directUrl)) {
          pdfViewerUrl.value = directUrl;
          currentPdfTitle.value = title || 'PDF 预览';
          showPdfViewer.value = true;
        } else {
          openDocumentUrl(directUrl);
        }
        return;
      }
      throw new Error('来源缺少文件ID或预览地址，无法预览文档');
    }

    const result = await fetchWatermarkDocument(fileId, title);

    if (isPdfDocument(fileId, result.contentType, title, result.downloadUrl)) {
      if (result.downloadUrl) {
        pdfViewerUrl.value = result.downloadUrl;
      } else if (result.blob) {
        pdfViewerUrl.value = window.URL.createObjectURL(result.blob);
      } else {
        throw new Error('水印接口未返回可预览的文档地址');
      }
      currentPdfTitle.value = title || 'PDF 预览';
      showPdfViewer.value = true;
    } else if (result.downloadUrl) {
      openDocumentUrl(result.downloadUrl);
    } else if (result.blob) {
      downloadDocumentBlob(result.blob, title || 'document', fileId);
    } else {
      throw new Error('水印接口未返回可下载的文档内容');
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '获取文档失败，请稍后重试');
  }
};

// 关闭 PDF 查看器
const closePdfViewer = () => {
  if (pdfViewerUrl.value && pdfViewerUrl.value.startsWith('blob:')) {
    window.URL.revokeObjectURL(pdfViewerUrl.value);
  }
  pdfViewerUrl.value = '';
  showPdfViewer.value = false;
  currentPdfTitle.value = '';
};

// 滚动到底部函数
const scrollToBottom = () => {
  nextTick(() => {
    // 方法1：尝试查找正确的滚动容器
    const containers = [
      document.querySelector('.qa-body'),
      document.querySelector('.conversation-history'),
      document.querySelector('.dynamic-content'),
      document.querySelector('.auxiliary-draft'),
    ];

    for (const container of containers) {
      if (container) {
        try {
          const isScrollable = container.scrollHeight > container.clientHeight;
          if (isScrollable || container === containers[0]) {
            container.scrollTop = container.scrollHeight;
            return;
          }
        } catch (error) {
          console.error('滚动失败:', error);
        }
      }
    }

    // 方法2：如果上述方法都失败，使用全局滚动
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'smooth',
    });
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

// 在 onMounted 中添加延迟
onMounted(() => {
  scrollToBottom();
});

onUnmounted(() => {
  stopTypingEffect();
});
</script>

<style lang="less" scoped>
.auxiliary-draft.intelligent-qa {
  display: flex;
  flex-direction: column;
  height: 98%;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  position: relative;
  overflow: hidden;

  .qa-header {
    text-align: center;
    margin: 60px auto 20px;
    padding: 0 20px;

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

  .qa-container {
    display: flex;
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .qa-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    box-sizing: border-box;
    margin: 0 auto;
    width: 100%;

    // 当右侧面板显示时，留出空间
    &:has(~ .sources-sidebar.sidebar-visible) {
      padding-right: 250px;
    }
  }

  .conversation-history {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 80%;
    padding-top: 20px;
    margin: 0 auto;

    .history-item {
      animation: slideIn 0.3s ease-out;

      &.user-message {
        align-self: flex-end; /* 用户消息右对齐 */
        width: 100%;
        display: flex;
        justify-content: flex-end; /* 内容右对齐 */

        .message-user {
          width: 68%;
          // max-width: 800px;
          display: flex;
          justify-content: flex-end; /* 容器右对齐 */

          .message-header {
            display: flex;
            justify-content: flex-end; /* 头部右对齐 */

            .message-info {
              display: flex;
              flex-direction: column;
              align-items: flex-end; /* 内容右对齐 */

              .message-content {
                background: #1c73eb; /* 用户消息背景色 */
                color: white; /* 用户消息文字颜色 */
                border-radius: 22px;
                padding: 12px 20px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                border: 1px solid #1a6bc7;
                margin-left: 0;
                text-align: right; /* 文本右对齐 */
              }

              .user-message-content {
                white-space: pre-wrap;
                word-break: break-word;
                font-family: inherit;
                margin: 0;
                font-size: 15px;
                line-height: 1.6;
                color: white;
                overflow-x: auto; /* 防止长行溢出 */
              }

              .message-time {
                text-align: right;
                margin-top: 8px;
                color: #999;
                font-size: 15px;
                padding-right: 0;
              }
            }
          }
        }
      }

      &.assistant-message {
        align-self: flex-start; /* AI消息左对齐 */
        width: 100%;
        // max-width: 800px;

        .message-header {
          .message-info {
            width: 100%;

            .pad {
              padding: 20px 40px;
              background: #ffffff;
              border-radius: 22px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              border: 1px solid #e9ecef;
              text-align: left; /* AI消息文本左对齐 */
            }

            .thinking-process {
              border-radius: 8px;
              font-size: 16px;
              padding: 16px;
              margin-bottom: 12px;
              animation: fadeIn 0.5s ease;
              background: #fff9e6;
              border-left: 3px solid #faad14;
              text-align: left; /* 思考过程左对齐 */
            }

            .message-actions {
              display: flex;
              align-items: center;
              gap: 15px;
              margin-top: 12px;
              padding-top: 12px;
              border-top: 1px solid #f0f0f0;
              flex-wrap: wrap;
              justify-content: flex-start; /* 操作按钮左对齐 */
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
              line-height: 1.6;
              white-space: pre-wrap;
              word-break: break-word;
              background: rgba(255, 255, 255, 0.7);
              padding: 12px;
              border-radius: 6px;
              border-left: 3px solid #fa8c16;
              text-align: left;
            }

            .answer-streaming {
              background: #ffffff;
              border-radius: 22px;
              padding: 20px 40px;
              animation: fadeIn 0.5s ease;
              margin-bottom: 15px;
              line-height: 1.6;
              border: 1px solid #e9ecef;
              text-align: left;
              width: 83%;
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
              text-align: left;

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
              font-size: 16px;
              line-height: 1.6;
              text-align: left;
              width: 83%;

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

              :deep(hr) {
                margin: 10px 0;
              }
            }

            .message-time {
              color: #999;
              margin-top: 8px;
              padding: 0 4px;
              font-size: 15px;
              text-align: left; /* AI消息时间左对齐 */
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

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;

    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #f3f3f3;
      border-top: 3px solid #409eff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 16px;
    }

    p {
      color: #666;
      font-size: 14px;
    }
  }

  /* 右侧固定推荐范文面板 */
  .sources-sidebar {
    position: fixed;
    right: -350px;
    top: 70px;
    width: 350px;
    height: 93vh;
    background: #ffffff;
    border-left: 1px solid #e9ecef;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
    transition: right 0.3s ease;
    z-index: 100;
    display: flex;
    flex-direction: column;

    &.sidebar-visible {
      right: 0;
    }

    .sources-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      border-bottom: 1px solid #e9ecef;
      background: #f8f9fa;

      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #303133;
      }

      .close-btn {
        cursor: pointer;
        color: #909399;
        font-size: 20px;

        &:hover {
          color: #409eff;
        }
      }
    }

    .sources-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .no-sources {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #909399;
      font-size: 14px;
    }

    .source-item {
      background: #f8f9fa;
      border-radius: 8px;
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
      background: #ffffff;
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

  /* PDF 预览弹框 */
  .pdf-viewer-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .pdf-viewer-container {
    width: 90%;
    height: 90%;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  }

  .pdf-viewer-header {
    padding: 16px 20px;
    background: #f5f5f5;
    border-bottom: 1px solid #e8e8e8;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    color: #333;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
    padding: 0 8px;
    transition: color 0.2s;

    &:hover {
      color: #333;
    }
  }

  .pdf-iframe {
    flex: 1;
    width: 100%;
    border: none;
  }

  .loading-pdf {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #666;

    .loading-spinner {
      width: 50px;
      height: 50px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 20px;
    }

    @keyframes spin {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
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
