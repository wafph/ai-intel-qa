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
      <div class="qa-body" ref="qaBodyRef">
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
            :data-message-id="item.id"
          >
            <!-- 用户消息（右对齐） -->
            <div v-if="item.role === 'user'" class="message-user">
              <div class="message-header">
                <div class="message-info">
                  <pre
                    class="message-content user-message-content"
                    :class="{ 'is-collapsed': isUserQuestionCollapsed(item) }"
                  ><span class="user-message-content-inner">{{
                    item.content
                  }}</span></pre>
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
                          v-html="renderMarkdown(currentAnswer)"
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
                      <el-tooltip content="推荐范文" placement="top">
                        <el-button link type="primary" plain @click="toggleSourcesPanel(item)">
                          <el-icon><Reading  /></el-icon>
                        </el-button>
                      </el-tooltip>

                      <!-- 导出按钮 -->
                      <el-tooltip content="导出" placement="top">
                        <el-button
                          link
                          class="export-btn"
                          type="primary"
                          plain
                          @click="handleExport(item)"
                          :loading="loading"
                          :disabled="loading"
                        >
                          <el-icon v-if="!loading"><Download /></el-icon>
                        </el-button>
                      </el-tooltip>

                      <!-- 重新起草按钮 -->
                      <el-tooltip content="重新起草" placement="top">
                        <el-button
                          link
                          class="regenerate-btn"
                          type="success"
                          plain
                          @click="handleRestart(index)"
                        >
                          <el-icon><Refresh /></el-icon>
                        </el-button>
                      </el-tooltip>
                      <span class="final-message-time">
                        {{ formatTime(item.timestamp) }}
                      </span>
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

      <!-- 回到底部浮动按钮 -->
      <transition name="scroll-bottom-fade">
        <!-- 流式输出中附加 is-streaming 类：按钮外圈显示旋转 loading 圆环；非流式时保持静态 -->
        <div v-if="showScrollButton" class="scroll-bottom-wrapper" :class="{ 'is-streaming': streaming }" @click="goToBottom">
          <div class="scroll-bottom-btn">
            <el-icon><ArrowDown /></el-icon>
          </div>
        </div>
      </transition>

      <!-- 右侧固定推荐范文面板（点击显示推荐范文时显示） -->
      <div
        v-if="showSourcesPanel"
        class="sources-sidebar"
        :class="{ 'sidebar-visible': showSourcesPanel }"
      >
        <div class="sources-header">
          <h3>
            <el-icon class="sources-title-icon"><Reading /></el-icon>
            <span>推荐范文</span>
          </h3>
          <div class="sources-header-actions">
            <el-tooltip :content="areAllSourcesCollapsed ? '全部展开' : '全部收起'" placement="bottom">
              <el-icon class="panel-action-btn" @click="toggleAllSources">
                <ArrowDown v-if="areAllSourcesCollapsed" />
                <ArrowUp v-else />
              </el-icon>
            </el-tooltip>
            <el-icon class="close-btn side-panel-close-btn" @click="closeSourcesPanel"><Close /></el-icon>
          </div>
        </div>
        <div
          class="sources-content"
          v-if="activeSourcesItem && activeSourcesItem.sources"
        >
          <div
            v-for="(source, sourceIndex) in activePanelSources"
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
              </div>
              <span class="collapse-icon">
                {{ isSourceCollapsed(sourceIndex) ? '▶' : '▼' }}
              </span>
            </div>
            <div v-show="!isSourceCollapsed(sourceIndex)" class="source-details">
              <div class="source-subtitle">{{ source.subtitle }}</div>
              <div class="source-content">{{ source.content }}</div>
              <div class="source-footer">
                <!-- 匹配度移到复制片段所在行，与智能问答参考来源面板一致：匹配度在前、复制片段在后。
                     footer 已是 flex + space-between 布局，纯位置调整，无逻辑改动 -->
                <span class="source-score">
                  匹配度: {{ formatScore(source.match_score || source.score) }}%
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

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { renderMarkdown } from '@/utils/markdown';
import {
  CaretBottom,
  CaretTop,
  Close,
  CopyDocument,
  Download,
  ArrowDown,
  ArrowUp,
  Reading,
  Refresh,
} from '@element-plus/icons-vue';
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
import { copyTextToClipboard, shouldCollapseUserQuestion } from '@/utils/messageCollapse';
import { copyPlainText } from '@/utils/clipboard';
import { useScrollToBottom } from '@/composables/useScrollToBottom';
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
const displayAnswer = ref<string>('');
const typingSpeed = 20;
let typingInterval: NodeJS.Timeout | null = null;
let currentTypingIndex = 0;
const loading = ref(false);
const isTyping = ref(false);
// 滚动容器引用
const qaBodyRef = ref<HTMLElement | null>(null);
// 回到底部按钮的状态和滚动控制
const { showScrollButton, scrollToBottom, goToBottom, resetAutoFollow } = useScrollToBottom({
  getContainer: () => qaBodyRef.value,
});

// 推荐范文面板状态
const showSourcesPanel = ref(false);
const activeSourcesItem = ref<any>(null);
const sourceCollapsed = ref<Record<string, boolean>>({});

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

// 导出功能：恢复早期可用逻辑。
// 先调用 Markdown 转 Word 服务 /v1/markdown-word/convert 获取 download_url，再按 download_url 执行 GET 下载文件流。
// 转换接口由 8005 统一文件服务提供，不经过 8000 后端业务接口。
const handleExport = async (item: any) => {
  const draftContent = String(item?.content || '');

  if (!draftContent.trim()) {
    ElMessage.warning('没有可导出的草稿内容');
    return;
  }

  const qaId = item?.id || item?.qaId || 'unknown';

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


const keepActionAreaVisible = (messageId: string) => {
  nextTick(() => {
    const node = document.querySelector(`[data-message-id="${messageId}"] .message-actions`) ||
      document.querySelector(`[data-message-id="${messageId}"]`);
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
};

const restoreMessageAnchor = (messageId?: string) => {
  if (!messageId) return;
  nextTick(() => {
    requestAnimationFrame(() => {
      const node = document.querySelector(`[data-message-id="${messageId}"] .message-actions`) ||
        document.querySelector(`[data-message-id="${messageId}"]`);
      node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  });
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
    keepActionAreaVisible(item.id);
  }
  emit('sources-panel-toggle', showSourcesPanel.value);
};

/** 关闭面板、菜单或弹窗：closeSourcesPanel。 */
const closeSourcesPanel = () => {
  const messageId = activeSourcesItem.value?.id;
  showSourcesPanel.value = false;
  activeSourcesItem.value = null;
  sourceCollapsed.value = {};
  emit('sources-panel-toggle', false);
  restoreMessageAnchor(messageId);
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

const getNormalizedSourceScore = (source: any): number => {
  const rawScore = source?.match_score ?? source?.score;
  const score = typeof rawScore === 'number' ? rawScore : parseFloat(rawScore);
  if (!Number.isFinite(score)) return 0;
  return score > 1 ? score : score * 100;
};

const activePanelSources = computed(() => {
  const sources = activeSourcesItem.value?.sources;
  if (!Array.isArray(sources)) return [];

  return sources
    .map((source: any, originalIndex: number) => ({ source, originalIndex }))
    .sort(
      (a: any, b: any) =>
        getNormalizedSourceScore(b.source) - getNormalizedSourceScore(a.source) ||
        a.originalIndex - b.originalIndex,
    )
    .map(({ source }: any) => source);
});
const areAllSourcesCollapsed = computed(() =>
  activePanelSources.value.length > 0 &&
  activePanelSources.value.every((_: any, sourceIndex: number) => isSourceCollapsed(sourceIndex)),
);
const toggleAllSources = () => {
  const messageId = activeSourcesItem.value?.id;
  if (!messageId) return;
  const shouldCollapse = !areAllSourcesCollapsed.value;
  activePanelSources.value.forEach((_: any, sourceIndex: number) => {
    sourceCollapsed.value[`${messageId}-${sourceIndex}`] = shouldCollapse;
  });
};

// 格式化匹配度分数
const formatScore = (score: number | string | undefined): string => {
  if (score === undefined || score === null) return '0.0';
  let numScore: number = typeof score === 'number' ? score : parseFloat(score);
  if (isNaN(numScore)) return '0.0';
  return (numScore > 1 ? numScore : numScore * 100).toFixed(1);
};

// 复制范文片段
const copySource = async (source: any) => {
  const text = `标题：${source.title || ''}
子标题：${source.subtitle || ''}
内容：${source.content || ''}`;
  const success = await copyPlainText(text);
  success
    ? ElMessage.success('已复制范文片段')
    : ElMessage.error('复制失败，请手动选择文本复制');
};

// 处理来源标题点击
const openDraftPdf = (previewWindow: Window | null, url: string) => {
  if (!previewWindow) {
    throw new Error('新页面被浏览器拦截，请允许本站打开新页面');
  }
  previewWindow.location.href = url;
};

const handleSourceTitleClick = async (source: any, event: Event) => {
  event.stopPropagation();

  const previewWindow = window.open('', '_blank');
  if (previewWindow) previewWindow.opener = null;

  try {
    const fileId = getSourceFileId(source);
    const title = getSourceTitle(source, 'document');
    const directUrl = getSourceDirectUrl(source);

    // 按早期可用版本逻辑：推荐范文预览优先使用 file_id 调用独立水印下载服务。
    // 只有缺少 file_id 时，才兜底打开来源自带直链。
    if (!fileId) {
      if (directUrl) {
        if (isPdfDocument(directUrl, 'application/pdf', title, directUrl)) {
          openDraftPdf(previewWindow, directUrl);
        } else {
          previewWindow?.close();
          openDocumentUrl(directUrl);
        }
        return;
      }
      throw new Error('来源缺少文件ID或预览地址，无法预览文档');
    }

    const result = await fetchWatermarkDocument(fileId, title);

    if (isPdfDocument(fileId, result.contentType, title, result.downloadUrl)) {
      if (result.downloadUrl) {
        openDraftPdf(previewWindow, result.downloadUrl);
      } else if (result.blob) {
        const blobUrl = window.URL.createObjectURL(result.blob);
        openDraftPdf(previewWindow, blobUrl);
        window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
      } else {
        throw new Error('水印接口未返回可预览的文档地址');
      }
    } else if (result.downloadUrl) {
      previewWindow?.close();
      openDocumentUrl(result.downloadUrl);
    } else if (result.blob) {
      previewWindow?.close();
      downloadDocumentBlob(result.blob, title || 'document', fileId);
    } else {
      throw new Error('水印接口未返回可下载的文档内容');
    }
  } catch (error: any) {
    previewWindow?.close();
    ElMessage.error(error?.message || '获取文档失败，请稍后重试');
  }
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

// 监听聊天数据变化：新消息添加时重置自动跟随并滚到底部
watch(
  () => props.chatData?.messages?.length,
  () => {
    resetAutoFollow();
    nextTick(() => scrollToBottom());
  },
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

  // 回到底部按钮样式
  .scroll-bottom-wrapper {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    cursor: pointer;
  }

  // 回到底部按钮：圆形阴影按钮（32px 略小巧，与外圈 loading 环比例协调）
  .scroll-bottom-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    // 统一按钮底色为米白 #fbf9f5
    background: #fbf9f5;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    }

    .el-icon {
      font-size: 16px;
      color: #606266;
    }
  }

  // 流式输出中：按钮外圈显示旋转圆弧（loading 动态效果，颜色与"生成中"指示点一致）；
  // 非流式输出时不渲染该环，按钮保持静态圆形样式
  .scroll-bottom-wrapper.is-streaming .scroll-bottom-btn {
    position: relative;

    &::before {
      content: '';
      position: absolute;
      // 仅外扩 2px（恰等于环边框宽度），使 loading 圆环贴近按钮圆形边缘
      inset: -2px;
      border-radius: 50%;
      border: 2px solid rgba(64, 158, 255, 0.25);
      border-top-color: #409eff;
      animation: scroll-bottom-spin 0.8s linear infinite;
      // 圆环仅作视觉提示，不拦截按钮点击
      pointer-events: none;
    }
  }

  @keyframes scroll-bottom-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .scroll-bottom-fade-enter-active,
  .scroll-bottom-fade-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .scroll-bottom-fade-enter-from,
  .scroll-bottom-fade-leave-to {
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
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
      padding-right: var(--sources-panel-width, 450px);
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
              padding: 20px 40px 68px;
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
              gap: 8px;
              width: calc(100% - 80px);
              margin: -64px 0 26px 40px;
              padding-top: 10px;
              border-top: none;
              flex-wrap: wrap;
              justify-content: flex-start; /* 操作按钮左对齐 */
              position: relative;
              z-index: 2;

              .final-message-time {
                color: #999;
                font-size: 15px;
                line-height: 28px;
              }

              > :deep(.el-button) {
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
              width: 100%;
              box-sizing: border-box;
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

              // 内联代码样式（不在 pre 内部的 code）
              :deep(:not(pre) > code) {
                background: #f5f5f5;
                padding: 2px 4px;
                border-radius: 4px;
                font-family: 'Courier New', monospace;
              }

              // 代码块样式
              :deep(pre) {
                background: #2d2d2d;
                color: #f8f8f2;
                padding: 12px;
                border-radius: 8px;
                overflow-x: auto;
                margin: 12px 0;
              }

              // pre 内部的 code 继承 pre 样式
              :deep(pre code) {
                background: transparent;
                color: inherit;
                padding: 0;
                border-radius: 0;
                font-family: 'Courier New', monospace;
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
              width: 100%;
              box-sizing: border-box;

              // 内联代码样式（不在 pre 内部的 code）
              :deep(:not(pre) > code) {
                background: #f5f5f5;
                padding: 2px 4px;
                border-radius: 4px;
                font-family: 'Courier New', monospace;
              }

              // 代码块样式
              :deep(pre) {
                background: #2d2d2d;
                color: #f8f8f2;
                padding: 12px;
                border-radius: 8px;
                overflow-x: auto;
                margin: 12px 0;
              }

              // pre 内部的 code 继承 pre 样式
              :deep(pre code) {
                background: transparent;
                color: inherit;
                padding: 0;
                border-radius: 0;
                font-family: 'Courier New', monospace;
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
    right: calc(-1 * var(--sources-panel-width, 450px));
    top: 57px;
    bottom: 0;
    width: var(--sources-panel-width, 450px);
    height: 94vh;
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
      min-height: 68px;
      padding: 0 20px;
      border-bottom: 1px solid #edf1f7;
      background: #ffffff;

      h3 {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0;
        font-size: 17px;
        font-weight: 600;
        color: #1f2937;

        .sources-title-icon {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          color: #ffffff;
          font-size: 16px;
          background: linear-gradient(135deg, #409eff, #7c8cff);
          box-shadow: 0 5px 12px rgba(64, 158, 255, 0.24);
        }
      }

      .sources-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .panel-action-btn,
      .side-panel-close-btn {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #909399;
        font-size: 20px;
        background: transparent;
        border: none;
        transition: color 0.18s ease, background 0.18s ease;

        &:hover {
          color: #409eff;
          background: rgba(64, 158, 255, 0.08);
        }
      }
    }

    .sources-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      background: #f6f8fb;

      &::-webkit-scrollbar {
        width: 6px;
      }

      &::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: #cbd5e1;
      }
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
      background: #ffffff;
      border-radius: 12px;
      margin-bottom: 14px;
      border: 1px solid #e5ebf3;
      box-shadow: 0 5px 18px rgba(31, 45, 61, 0.06);
      overflow: hidden;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;

      &:hover {
        border-color: #c9dcf7;
        box-shadow: 0 8px 24px rgba(31, 122, 240, 0.1);
        transform: translateY(-1px);
      }

      &:last-child {
        margin-bottom: 0;
      }
    }

    .source-title {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      padding: 14px;
      font-size: 14px;
      color: #303133;
      cursor: pointer;
      user-select: none;
      background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
      transition: background-color 0.2s ease;

      &:hover {
        background: #f3f8ff;
      }

      .title-content {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        flex: 1;
        min-width: 0;
      }

      .collapse-icon {
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        font-size: 10px;
        color: #7b8ba5;
        background: #edf3fb;
        transition: color 0.2s ease, background 0.2s ease;
        flex-shrink: 0;
      }
    }

    .source-details {
      padding: 0 14px 12px;
      transition: all 0.25s ease;
      overflow: hidden;
    }

    .source-subtitle {
      font-size: 12px;
      line-height: 1.55;
      color: #8a96a8;
      padding: 0 0 10px;
    }

    .source-content {
      font-size: 13px;
      color: #4b5563;
      line-height: 1.75;
      padding: 12px;
      max-height: 240px;
      overflow-y: auto;
      white-space: pre-wrap;
      background: #f8fafc;
      border: 1px solid #edf1f6;
      border-radius: 8px;

      &::-webkit-scrollbar {
        width: 5px;
      }

      &::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: #cbd5e1;
      }
    }

    .source-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #909399;
      padding: 10px 0 0;

      :deep(.el-button) {
        height: 26px;
        padding: 0 10px;
        border-radius: 999px;
        background: #eef6ff;
        font-weight: 500;
      }
    }

    .source-score {
      flex-shrink: 0;
      font-size: 12px;
      line-height: 20px;
      color: #389e0d;
      font-weight: 600;
      background: #f1faeb;
      padding: 1px 8px;
      border-radius: 999px;
      border: 1px solid #b7e397;
      white-space: nowrap;
    }

    .source-title-clickable {
      flex: 1;
      min-width: 0;
      line-height: 1.55;
      cursor: pointer;
      color: #1677d2;
      font-weight: 600;

      &:hover {
        color: #0958b5;
      }
    }
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
