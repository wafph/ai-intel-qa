<!--
  智能问答页面，展示流式问答、引用来源和来源文档预览。
  本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
-->
<template>
  <div class="intelligent-qa">
    <!-- 头部区域 - 只在完全没有数据时显示 -->
    <div class="qa-header" v-if="!hasMessages && !loading">
      <h1>我是问答助手，很高兴见到你</h1>
      <p>你可以使用自然语言提问，我来精准回答</p>
    </div>

    <!-- 主容器：左右分栏布局 -->
    <div class="qa-container">
      <!-- 左侧对话区域 -->
      <div class="qa-body">
        <!-- 历史对话列表 -->
        <div class="conversation-history" v-if="hasMessages">
          <div
            v-for="(item, index) in chatData?.messages || []"
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
                    :class="{
                      'is-collapsed': isUserQuestionCollapsed(item),
                      'has-actions': shouldFoldUserQuestion(item.content),
                    }"
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
                          <component
                            :is="isUserQuestionCollapsed(item) ? CaretBottom : CaretTop"
                          />
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
                  <!-- 始终显示"思考过程"部分，只要消息中存在 reasoning 内容 -->
                  <div
                    v-if="item.reasoning && item.reasoning.trim() !== ''"
                    class="thinking-process"
                    ref="thinkingProcessRef"
                  >
                    <div class="thinking-header">
                      <span>思考过程</span>
                    </div>
                    <div class="thinking-content">
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
                    <div class="message-content pad" ref="finalContentRef">
                      <div v-html="renderMarkdown(item.content)"></div>
                      <div
                        v-if="getUniqueSources(item.sources).length > 0"
                        class="answer-sources"
                      >
                        <!-- <div class="answer-sources-title">引用来源</div> -->
                        <button
                          type="button"
                          class="answer-sources-toggle"
                          :aria-expanded="isAnswerSourcesExpanded(item.id)"
                          @click="toggleAnswerSources(item.id)"
                        >
                          <span
                            >共参考
                            {{ getUniqueSources(item.sources).length }} 篇文献</span
                          >
                          <span
                            class="answer-sources-arrow"
                            :class="{ 'is-expanded': isAnswerSourcesExpanded(item.id) }"
                          >
                            ▶
                          </span>
                        </button>
                        <div
                          v-show="isAnswerSourcesExpanded(item.id)"
                          class="answer-sources-list"
                        >
                          <button
                            v-for="(source, sourceIndex) in getUniqueSources(
                              item.sources,
                            )"
                            :key="`${source.title}-${sourceIndex}`"
                            type="button"
                            class="answer-source-title"
                            @click="handleAnswerSourceTitleClick(source, $event)"
                          >
                            {{ source.title }}
                          </button>
                        </div>
                      </div>
                    </div>

                    <!-- 操作按钮区域 -->
                    <div
                      class="message-actions"
                      v-if="item.content && item.content !== '用户停止了生成'"
                    >
                      <!-- 查看来源按钮 -->
                      <el-tooltip content="查看来源" placement="top">
                        <el-button
                          link
                          type="primary"
                          plain
                          @click="toggleSourcesPanel(item)"
                        >
                          <el-icon><View /></el-icon>
                        </el-button>
                      </el-tooltip>

                      <!-- 复制按钮 -->
                      <el-tooltip
                        :content="
                          item.streaming && item.id === currentStreamingMessageId
                            ? '正在生成内容，请稍后复制'
                            : '复制内容'
                        "
                        placement="top"
                      >
                        <div
                          class="copy-container"
                          @click="handleCopy(item.content)"
                          :class="{
                            'copy-disabled':
                              item.streaming && item.id === currentStreamingMessageId,
                          }"
                        >
                          <el-icon><CopyDocument /></el-icon>
                        </div>
                      </el-tooltip>

                      <!-- 点赞按钮 -->
                      <el-tooltip content="点赞" placement="top">
                        <div class="vote-container">
                          <img
                            :src="
                              item.vote === 'like'
                                ? '/images/zhan-active.svg'
                                : '/images/zhan.svg'
                            "
                            alt="点赞"
                            class="vote-icon"
                            @click="handleVote(item.id, 'like')"
                          />
                          <span
                            class="vote-count"
                            :style="{
                              color: item.vote === 'like' ? '#409eff' : '#999',
                            }"
                          >
                            {{ item.likeCount || 0 }}
                          </span>
                        </div>
                      </el-tooltip>

                      <!-- 点踩按钮 -->
                      <el-tooltip content="点踩" placement="top">
                        <div class="vote-container">
                          <img
                            src="/images/cai.svg"
                            alt="踩"
                            class="vote-icon"
                            @click="handleVote(item.id, 'dislike')"
                            :style="{
                              filter:
                                item.vote === 'dislike'
                                  ? 'invert(29%) sepia(82%) saturate(748%) hue-rotate(327deg) brightness(97%) contrast(101%)'
                                  : 'none',
                            }"
                          />
                          <span
                            class="vote-count"
                            :style="{
                              color: item.vote === 'dislike' ? '#f56c6c' : '#999',
                            }"
                          >
                            {{ item.dislikeCount || 0 }}
                          </span>
                        </div>
                      </el-tooltip>

                      <!-- 重新生成按钮 -->
                      <el-tooltip content="重新生成" placement="top">
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

        <!-- 加载状态 -->
        <div v-if="loading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>正在加载对话...</p>
        </div>
      </div>

      <!-- 右侧固定参考来源面板（点击查看来源时显示） -->
      <div
        v-if="showSourcesPanel"
        class="sources-sidebar"
        :class="{ 'sidebar-visible': showSourcesPanel }"
      >
        <div class="sources-header">
          <h3>参考来源</h3>
          <div class="sources-header-actions">
            <el-tooltip
              :content="areAllSourcesCollapsed ? '全部展开' : '全部收起'"
              placement="bottom"
            >
              <el-icon class="panel-action-btn" @click="toggleAllSources">
                <ArrowDown v-if="areAllSourcesCollapsed" />
                <ArrowUp v-else />
              </el-icon>
            </el-tooltip>
            <el-icon class="close-btn side-panel-close-btn" @click="closeSourcesPanel"
              ><Close
            /></el-icon>
          </div>
        </div>
        <div
          class="sources-content"
          v-if="activeSourcesItem && activeSourcesItem.sources"
        >
          <div
            v-for="(sourceGroup, sourceIndex) in activePanelSources"
            :key="`${sourceGroup.source.title}-${sourceIndex}`"
            class="source-item"
          >
            <div
              class="source-title"
              @click="toggleSourceItem(activeSourcesItem.id, sourceIndex)"
            >
              <div class="title-content">
                <strong
                  @click.stop="handleSourceTitleClick(sourceGroup.source, $event)"
                  class="source-title-clickable"
                >
                  {{ sourceGroup.source.title }}
                </strong>
              </div>
              <span class="collapse-icon">
                {{ isSourceCollapsed(sourceIndex) ? '▶' : '▼' }}
              </span>
            </div>
            <div v-show="!isSourceCollapsed(sourceIndex)" class="source-details">
              <div
                v-for="(source, chunkIndex) in sourceGroup.sources"
                :key="source.chunk_id || `${sourceGroup.source.title}-${chunkIndex}`"
                class="source-chunk"
              >
                <div class="source-subtitle">{{ source.subtitle }}</div>
                <div class="source-content">{{ source.content }}</div>
                <div class="source-footer">
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
        </div>
        <div v-else class="no-sources">
          <p>暂无参考来源</p>
        </div>
      </div>
    </div>

    <!-- 点踩反馈弹窗 -->
    <el-dialog
      v-model="feedbackDialogVisible"
      title="分享反馈"
      width="600px"
      :close-on-click-modal="false"
      class="dialogfoot"
      destroy-on-close
    >
      <el-radio-group v-model="feedbackReason" class="feedback-radio-group">
        <el-radio
          v-for="opt in feedbackOptions"
          :key="opt.value"
          :label="opt.value"
          class="feedback-radio"
        >
          <span class="radio-text">{{ opt.label }}</span>
        </el-radio>
      </el-radio-group>

      <el-input
        v-if="feedbackReason === 'other'"
        v-model="feedbackDetail"
        type="textarea"
        :rows="3"
        placeholder="请输入其他原因"
        maxlength="500"
        show-word-limit
        style="margin-top: 16px"
      />

      <template #footer>
        <el-button
          class="btn"
          style="padding: 16px 25px; border-radius: 20px"
          @click="feedbackDialogVisible = false"
          >取消</el-button
        >
        <el-button
          class="btn"
          type="primary"
          :loading="submitting"
          @click="submitDislikeFeedback"
          style="padding: 16px 25px; background: #191919; border-radius: 20px"
        >
          提交
        </el-button>
      </template>
    </el-dialog>

    <!-- 文档预览分栏 -->
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
import { ref, reactive, watch, computed, nextTick, onMounted, onUnmounted } from 'vue';
import MarkdownIt from 'markdown-it';
import { ElMessage } from 'element-plus';
import {
  CaretBottom,
  CaretTop,
  Close,
  CopyDocument,
  ArrowDown,
  ArrowUp,
  Refresh,
  View,
} from '@element-plus/icons-vue';
import { useChatStore } from '@/stores/chat';
import { API } from '@/api/api';
import { authRequest, isSuccessStatus } from '@/services/http';
import {
  fetchWatermarkDocument,
  isPdfDocument,
  downloadDocumentBlob,
  openDocumentUrl,
} from '@/services/documentDownload';
import {
  getSourceDirectUrl,
  getSourceFileId,
  getSourceTitle,
} from '@/services/sourceUtils';
import { copyTextToClipboard, shouldCollapseUserQuestion } from '@/utils/messageCollapse';
const chatStore = useChatStore();

const displayAnswer = ref<string>('');
const typingSpeed = 20; // 打字速度（毫秒）
let typingInterval: NodeJS.Timeout | null = null;
let currentTypingIndex = 0;
const loading = ref(false);
const isTyping = ref(false);
const emit = defineEmits(['regenerate', 'sources-panel-toggle']);

// 参考来源面板状态
const showSourcesPanel = ref(false);
const activeSourcesItem = ref<any>(null);
const sourceCollapsed = ref<Record<string, boolean>>({});

const expandedUserQuestionMap = reactive<Record<string, boolean>>({});
const expandedAnswerSourcesMap = reactive<Record<string, boolean>>({});
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
const isAnswerSourcesExpanded = (id?: string) => {
  const key = String(id || '');
  return Boolean(key && expandedAnswerSourcesMap[key]);
};
const toggleAnswerSources = (id?: string) => {
  const key = String(id || '');
  if (!key) return;
  expandedAnswerSourcesMap[key] = !expandedAnswerSourcesMap[key];
};
// PDF 预览相关状态
const showPdfViewer = ref(false);
const pdfViewerUrl = ref('');
const currentPdfTitle = ref('');

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

// 反馈对话框相关
const feedbackDialogVisible = ref(false);
const currentDislikeMessage = ref<ChatMessage | null>(null);
const submitting = ref(false);
const feedbackReason = ref('');
const feedbackDetail = ref('');

const feedbackOptions = ref([
  { label: '不正确或不完整', value: 'incorrect_or_incomplete' },
  { label: '与期望不符', value: 'not_as_expected' },
  { label: '速度慢或存在问题', value: 'slow_or_problematic' },
  { label: '风格或语气', value: 'style_or_tone' },
  { label: '安全或法律疑虑', value: 'security_or_legal' },
  { label: '其他', value: 'other' },
]);

/** 封装当前模块内的业务逻辑：hasMessages。 */
const hasMessages = computed(() => {
  return props.chatData?.messages && props.chatData.messages.length > 0;
});

watch(
  () => props.chatData,
  (newChatData) => {
    if (newChatData) {
      if (newChatData.messages && newChatData.messages.length > 0) {
        // 数据加载完成后的处理
      }
    }
  },
  { immediate: true, deep: true },
);

// Markdown渲染器
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

// 格式化匹配度分数
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

// 左侧回复中的引用来源按标题保留第一条。
const getUniqueSources = (sources?: any[]): any[] => {
  const seenTitles = new Set<string>();

  return (sources || []).filter((source) => {
    const title = String(source?.title || '').trim();
    if (!title) return true;
    if (seenTitles.has(title)) return false;

    seenTitles.add(title);
    return true;
  });
};

interface SourceGroup {
  source: any;
  sources: any[];
}

// 右侧来源面板按文档标题分组，同一文档下保留并展示所有切片。
const groupSourcesByTitle = (sources?: any[]): SourceGroup[] => {
  const groups = new Map<string, SourceGroup>();

  (sources || []).forEach((source, sourceIndex) => {
    const title = String(source?.title || '').trim();
    const key = title || `__untitled-${sourceIndex}`;
    const existingGroup = groups.get(key);

    if (!existingGroup) {
      groups.set(key, {
        source,
        sources: [source],
      });
      return;
    }

    existingGroup.sources.push(source);
  });

  return Array.from(groups.values());
};

// 复制文本到剪贴板
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
    return false;
  }
};

// 复制来源片段
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

const openAnswerPdf = (previewWindow: Window | null, url: string) => {
  if (!previewWindow) {
    throw new Error('新页面被浏览器拦截，请允许本站打开新页面');
  }
  previewWindow.location.href = url;
};

// 左侧回答中的 PDF 在新页面打开，非 PDF 保持原有打开或下载逻辑。
const handleAnswerSourceTitleClick = async (source: any, event: Event) => {
  event.stopPropagation();

  const previewWindow = window.open('', '_blank');
  if (previewWindow) previewWindow.opener = null;

  try {
    const fileId = getSourceFileId(source);
    const title = getSourceTitle(source, 'document');
    const directUrl = getSourceDirectUrl(source);

    if (!fileId) {
      if (!directUrl) {
        throw new Error('来源缺少文件ID或预览地址，无法预览文档');
      }
      if (isPdfDocument(directUrl, 'application/pdf', title, directUrl)) {
        openAnswerPdf(previewWindow, directUrl);
      } else {
        previewWindow?.close();
        openDocumentUrl(directUrl);
      }
      return;
    }

    const result = await fetchWatermarkDocument(fileId, title);
    const isPdf = isPdfDocument(fileId, result.contentType, title, result.downloadUrl);

    if (isPdf && result.downloadUrl) {
      openAnswerPdf(previewWindow, result.downloadUrl);
    } else if (isPdf && result.blob) {
      const blobUrl = window.URL.createObjectURL(result.blob);
      openAnswerPdf(previewWindow, blobUrl);
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
    } else if (result.downloadUrl) {
      previewWindow?.close();
      openDocumentUrl(result.downloadUrl);
    } else if (result.blob) {
      previewWindow?.close();
      downloadDocumentBlob(result.blob, title, fileId);
    } else {
      throw new Error('水印接口未返回可预览或下载的文档内容');
    }
  } catch (error: any) {
    previewWindow?.close();
    ElMessage.error(error?.message || '获取文档失败，请稍后重试');
  }
};

// 处理来源标题点击
const handleSourceTitleClick = async (source: any, event: Event) => {
  event.stopPropagation();

  try {
    const fileId = getSourceFileId(source);
    const title = getSourceTitle(source, 'document');
    const directUrl = getSourceDirectUrl(source);

    // 按早期可用版本逻辑：优先使用来源 file_id 调用独立水印下载服务。
    // /v1/files/watermark/download 由统一文件服务负责生成水印并返回 download_url；
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

const keepActionAreaVisible = (messageId: string) => {
  nextTick(() => {
    const node =
      document.querySelector(`[data-message-id="${messageId}"] .message-actions`) ||
      document.querySelector(`[data-message-id="${messageId}"]`);
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
};

const restoreMessageAnchor = (messageId?: string) => {
  if (!messageId) return;
  nextTick(() => {
    requestAnimationFrame(() => {
      const node =
        document.querySelector(`[data-message-id="${messageId}"] .message-actions`) ||
        document.querySelector(`[data-message-id="${messageId}"]`);
      node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  });
};

// 切换参考来源面板
const toggleSourcesPanel = (item: ChatMessage) => {
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

const activePanelSources = computed<SourceGroup[]>(
  () => groupSourcesByTitle(activeSourcesItem.value?.sources),
);
const areAllSourcesCollapsed = computed(
  () =>
    activePanelSources.value.length > 0 &&
    activePanelSources.value.every((_, sourceIndex) => isSourceCollapsed(sourceIndex)),
);
const toggleAllSources = () => {
  const messageId = activeSourcesItem.value?.id;
  if (!messageId) return;
  const shouldCollapse = !areAllSourcesCollapsed.value;
  activePanelSources.value.forEach((_, sourceIndex) => {
    sourceCollapsed.value[`${messageId}-${sourceIndex}`] = shouldCollapse;
  });
};

// 重新生成
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

const copyUserQuestion = async (content?: string) => {
  const copied = await copyTextToClipboard(content);
  if (copied) {
    ElMessage.success({ message: '已复制', offset: 72 });
  } else {
    ElMessage.error({ message: '复制失败', offset: 72 });
  }
};

// 处理复制点击事件
const handleCopy = async (content: string) => {
  if (!content || content.trim() === '') {
    return;
  }

  const isCopied = await copyToClipboard(content);

  if (isCopied) {
    ElMessage.success({ message: '已复制', offset: 72 });
  } else {
    ElMessage.error({ message: '复制失败', offset: 72 });
  }
};

// 处理点赞/点踩
const handleVote = async (messageId: string, voteType: 'like' | 'dislike') => {
  if (!props.chatData) {
    return;
  }

  /** 封装当前模块内的业务逻辑：message。 */
  const message = props.chatData.messages.find((msg) => msg.id === messageId);
  if (!message) {
    return;
  }

  const sessionUuid =
    (props.chatData as any).conversationUuid || (props.chatData as any).id;

  if (!sessionUuid) {
    ElMessage.error('无法获取会话ID，请刷新页面重试');
    return;
  }

  const originalVote = message.vote;
  let originalLikeCount = message.likeCount || 0;
  let originalDislikeCount = message.dislikeCount || 0;

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

  // 调用后端接口同步点赞状态
  const likeStatus = message.vote === 'like' ? 1 : 0;
  const dislikeStatus = message.vote === 'dislike' ? 1 : 0;
  if (dislikeStatus) {
    currentDislikeMessage.value = message;
    feedbackDialogVisible.value = true;
    feedbackReason.value = '';
    feedbackDetail.value = '';
  }

  try {
    const success = await chatStore.syncLikeStatus(
      messageId,
      likeStatus,
      dislikeStatus,
      sessionUuid,
      dislikeStatus === 0 ? '' : undefined,
    );

    if (!success) {
      message.vote = originalVote;
      message.likeCount = originalLikeCount;
      message.dislikeCount = originalDislikeCount;
      ElMessage.error('点赞状态更新失败，请重试');
    }
  } catch (error) {
    message.vote = originalVote;
    message.likeCount = originalLikeCount;
    message.dislikeCount = originalDislikeCount;
    ElMessage.error('网络错误，请稍后重试');
  }
};

// 提交点踩反馈
const submitDislikeFeedback = async () => {
  if (!feedbackReason.value) {
    ElMessage.warning('请选择反馈原因');
    return;
  }

  if (feedbackReason.value === 'other' && !feedbackDetail.value.trim()) {
    ElMessage.warning('请输入其他原因');
    return;
  }

  if (!currentDislikeMessage.value || !props.chatData) {
    ElMessage.error('无法获取消息信息');
    return;
  }

  submitting.value = true;
  try {
    const finalReason = feedbackDetail.value.trim() || feedbackReason.value;
    const sessionUuid =
      (props.chatData as any).conversationUuid || (props.chatData as any).id;
    const funcId = chatStore.getFuncIdByTab('智能问答');

    const payload = {
      sessionId: sessionUuid,
      functionId: funcId,
      qaId: currentDislikeMessage.value.id,
      dislikeStatus: 1,
      dislikeReason: finalReason,
    };
    const response = await authRequest({
      url: API.chat.status,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      data: payload,
    });

    if (!isSuccessStatus(response.status)) {
      throw new Error(`HTTP错误! 状态: ${response.status}`);
    }
    ElMessage.success('感谢您的反馈！');
    feedbackDialogVisible.value = false;
  } catch (error) {
    ElMessage.error('提交失败，请稍后重试');
  } finally {
    submitting.value = false;
  }
};

// 打字机效果相关函数
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
  const processedContent = content.replace(/\$\$\$/g, '\n\n---\n\n');
  return md.render(processedContent);
};

// 滚动到底部
// 修改后的 scrollToBottom 函数
const scrollToBottom = () => {
  nextTick(() => {
    // 方法1：尝试查找正确的滚动容器
    const containers = [
      document.querySelector('.qa-body'),
      document.querySelector('.conversation-history'),
      document.querySelector('.dynamic-content'),
      document.querySelector('.intelligent-qa'),
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

// 移除重复的推理过程
const removeDuplicateReasoning = (reasoningText: string) => {
  if (!reasoningText) return '';

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

              .user-message-meta {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 8px;
                width: 100%;
                margin-top: 8px;
              }

              .user-message-meta .message-time {
                text-align: right;
                margin-top: 0;
                color: #999;
                font-size: 15px;
                line-height: 24px;
                padding: 0;
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
                margin-left: auto;
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
              width: 100%;
              box-sizing: border-box;

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

            .answer-sources {
              margin-top: 14px;
              padding-top: 14px;
              border-top: 1px solid #e4e7ed;
            }

            .answer-sources-title {
              margin-bottom: 8px;
              color: #303133;
              font-size: 19px;
              font-weight: 600;
            }

            .answer-sources-toggle {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              padding: 0;
              border: none;
              background: transparent;
              color: #909399;
              font-size: 13px;
              line-height: 1.5;
              cursor: pointer;
            }

            .answer-sources-arrow {
              display: inline-block;
              font-size: 10px;
              transition: transform 0.2s ease;

              &.is-expanded {
                transform: rotate(90deg);
              }
            }

            .answer-sources-list {
              display: flex;
              flex-direction: column;
              align-items: flex-start;
              gap: 6px;
              margin-top: 10px;
            }

            .answer-source-title {
              padding: 0;
              border: none;
              background: transparent;
              color: #1890ff;
              font-size: 14px;
              line-height: 1.5;
              text-align: left;
              cursor: pointer;

              &:hover {
                text-decoration: underline;
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

            .copy-container {
              cursor: pointer;
              position: relative;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 28px;
              height: 28px;
              border-radius: 6px;

              .el-icon {
                color: #606266;
                font-size: 20px;
              }

              &:hover {
                background: #f2f3f5;
              }

              &.copy-disabled {
                cursor: not-allowed;
                opacity: 0.5;
              }

            }

            .vote-container {
              position: relative;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 28px;
              height: 28px;
              border-radius: 6px;

              &:hover {
                background: #f2f3f5;
              }

              .vote-icon {
                width: 20px;
                height: 20px;
                cursor: pointer;
                transition: opacity 0.3s ease;

                &:hover {
                  opacity: 0.8;
                }
              }

              .vote-count {
                display: none;
              }
            }

            .regenerate-btn {
              margin-left: 0;
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

  /* 右侧固定参考来源面板 */
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

        &::before {
          content: '文';
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
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
        transition:
          color 0.18s ease,
          background 0.18s ease;

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
      transition:
        border-color 0.2s ease,
        box-shadow 0.2s ease,
        transform 0.2s ease;

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
        transition:
          color 0.2s ease,
          background 0.2s ease;
        flex-shrink: 0;
      }
    }

    .source-details {
      padding: 0 14px 12px;
      transition: all 0.25s ease;
      overflow: hidden;
    }

    .source-chunk {
      padding-top: 12px;

      & + .source-chunk {
        margin-top: 12px;
        border-top: 1px dashed #dfe6ef;
      }
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

  /* 点踩反馈对话框 */
  .dialogfoot {
    :deep(.el-dialog__body) {
      padding: 20px;
    }

    .feedback-radio-group {
      display: flex;
      gap: 12px;
    }

    .feedback-radio {
      margin-right: 0;

      .radio-text {
        font-size: 14px;
        color: #303133;
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
