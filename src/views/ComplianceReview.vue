<!--
  合规审核页面，展示文件上传、审核结果、原文标记和报告导出。
  本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
-->
<template>
  <div class="intelligent-qa" :class="{ 'with-original-panel': activeOriginalMessage }">
    <div
      class="qa-header"
      v-if="!loading && (!chatData?.messages || chatData.messages.length === 0)"
    >
      <h1>智能合规审核，守护业务合规底线</h1>
      <p>以科技赋能合规管理，自动校验，高效守护业务规范</p>
    </div>

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

        <div v-else class="message-assistant">
          <div class="message-header">
            <div class="message-info">
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

              <div v-if="item.streaming && item.id === currentStreamingMessageId">
                <div
                  v-if="currentAnswer && currentAnswer.trim() !== ''"
                  class="answer-streaming"
                >
                  <div class="typing-container">
                    <div class="typing-text" v-html="renderMarkdown(currentAnswer)"></div>
                    <span v-if="isTyping" class="typing-cursor">|</span>
                  </div>
                </div>

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
                <div
                  class="message-content pad review-output"
                  v-html="renderReviewMarkdown(item.content)"
                  @mouseup="handleAnswerSelection(item)"
                  @click="handleAnswerClick($event, item)"
                ></div>
                <div
                  style="margin-left: 15px"
                  v-if="item.content && item.content !== '用户停止了生成'"
                >
                  <el-tooltip content="原文标记" placement="top">
                    <el-button
                      link
                      :class="['btnbottom', { 'original-mark-disabled': isOriginalMarkDisabled(item) }]"
                      type="warning"
                      plain
                      @click="handleOriginalMarkButtonClick(item)"
                    >
                      <el-icon><FolderChecked /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip content="导出报告" placement="top">
                    <el-button
                      link
                      class="btnbottom"
                      type="primary"
                      plain
                      @click="handleExport(item)"
                      :loading="loading"
                      :disabled="loading"
                    >
                      <el-icon v-if="!loading"><Download /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip content="重新审核" placement="top">
                    <el-button
                      link
                      class="btnbottom"
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

    <Transition name="original-panel-slide">
      <aside
        v-if="activeOriginalMessage"
        class="original-panel"
        :class="{ 'sidebar-visible': activeOriginalMessage }"
      >
      <div class="original-panel-header">
        <div class="original-title">
          <el-icon><FolderChecked /></el-icon>
          <h3>{{ activeOriginalFileName }}</h3>
        </div>
        <el-icon class="close-btn side-panel-close-btn" @click="closeOriginalPanel"><Close /></el-icon>
      </div>
      <div
        class="original-panel-tip"
        :class="{ warning: !originalMatchFound && originalSearchText }"
      >
        {{ originalPanelTip }}
      </div>
      <div
        v-if="isActivePdfOriginalViewer"
        ref="pdfViewerRef"
        class="original-content pdf-locator-content"
      >
        <div v-if="pdfLoading" class="original-empty">PDF 正在加载，请稍候...</div>
        <div v-else-if="pdfError" class="original-empty pdf-error">{{ pdfError }}</div>
        <template v-else>
          <div class="pdf-pagination-toolbar" v-if="pdfPageCount > 0">
            <el-button size="small" :disabled="currentPdfPageNo <= 1" @click="goPdfPage(currentPdfPageNo - 1)">上一页</el-button>
            <span>第 {{ currentPdfPageNo }} / {{ pdfPageCount }} 页</span>
            <el-button size="small" :disabled="currentPdfPageNo >= pdfPageCount" @click="goPdfPage(currentPdfPageNo + 1)">下一页</el-button>
          </div>
          <div v-if="currentPdfPage" class="pdf-page-list paged">
            <div
              class="pdf-page-shell"
              :data-pdf-page="currentPdfPage.pageNo"
              :style="{ width: `${currentPdfPage.width}px`, height: `${currentPdfPage.height}px` }"
            >
              <img class="pdf-page-image" :src="currentPdfPage.imageDataUrl" :alt="`第 ${currentPdfPage.pageNo} 页`" />
              <span
                v-for="span in currentPdfPage.items"
                :key="span.id"
                class="pdf-text-span"
                :class="{ active: isPdfSpanActive(currentPdfPage.pageNo, span.index) }"
                :style="{
                  left: `${span.left}px`,
                  top: `${span.top}px`,
                  width: `${span.width}px`,
                  height: `${span.height}px`,
                  fontSize: `${span.fontSize}px`,
                }"
                :title="span.text"
              >{{ span.text }}</span>
            </div>
          </div>
          <div v-else class="original-empty">暂无可渲染的 PDF 页面</div>
        </template>
      </div>
      <div
        v-else
        ref="originalContentRef"
        class="original-content"
        v-html="renderOriginalContent"
      ></div>
      </aside>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch, nextTick, onMounted, onUnmounted } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';
import MarkdownIt from 'markdown-it';
import {
  CaretBottom,
  CaretTop,
  Close,
  CopyDocument,
  Download,
  FolderChecked,
  Refresh,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { API } from '@/api/api';
import { isSuccessStatus, request } from '@/services/http';
import { fetchReviewPdfContext } from '@/services/reviewPdfPrepare';
import { copyTextToClipboard, shouldCollapseUserQuestion } from '@/utils/messageCollapse';

const displayAnswer = ref<string>('');
const typingSpeed = 20;
let typingInterval: NodeJS.Timeout | null = null;
let currentTypingIndex = 0;
const loading = ref(false);
const isTyping = ref(false);
const emit = defineEmits(['regenerate', 'sources-panel-toggle']);

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
  metadata?: {
    complianceOriginalText?: string;
    complianceFileName?: string;
    complianceParams?: ComplianceReviewParams;
    reviewContext?: Record<string, any>;
    pdfContextId?: string;
    pdfType?: string;
    sourceFileUrl?: string;
    locatorMode?: string;
    locatorAvailable?: boolean;
    locatorUnavailableReason?: string;
    parsedTxtUrl?: string;
    parsedMarkdownUrl?: string;
    reviewFileUrl?: string;
    textSource?: string;
  };
}

interface ComplianceReviewParams {
  file_url: string;
  query: string;
  dimensions: string[];
  fileName: string;
  originalText: string;
  fileType?: string;
  fileSize?: number;
  fileUrl?: string;
  uploadFileId?: string;
  originalHtml?: string;
  pdfContextId?: string;
  pdfType?: string;
  sourceFileUrl?: string;
  parsedTxtUrl?: string;
  parsedMarkdownUrl?: string;
  locatorMode?: string;
  locatorAvailable?: boolean;
  locatorUnavailableReason?: string;
  reviewFileUrl?: string;
  textSource?: string;
}

const props = withDefaults(defineProps<Props>(), {
  streaming: true,
  currentReasoning: '',
  currentAnswer: '',
  currentStreamingMessageId: null,
});

const activeOriginalMessageId = ref<string | null>(null);
const originalSearchText = ref('');
const originalMatchFound = ref(false);
const originalContentRef = ref<HTMLElement | null>(null);
const pdfViewerRef = ref<HTMLElement | null>(null);
type PdfTextItem = {
  id: string;
  index: number;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
};
type PdfPageView = {
  pageNo: number;
  width: number;
  height: number;
  imageDataUrl: string;
  text: string;
  items: PdfTextItem[];
};
const pdfPages = ref<PdfPageView[]>([]);
const currentPdfPageNo = ref(1);
const pdfLoading = ref(false);
const pdfError = ref('');
const pdfActiveMatch = ref<{ pageNo: number; itemIndexes: number[] } | null>(null);
const loadedPdfContext = ref<Record<string, any> | null>(null);
const loadedPdfContextId = ref('');
let pdfLoadToken = 0;
const pdfPageCount = computed(() => pdfPages.value.length);
const currentPdfPage = computed(() =>
  pdfPages.value.find((page) => page.pageNo === currentPdfPageNo.value) || pdfPages.value[0] || null,
);
const goPdfPage = (pageNo: number) => {
  const total = pdfPageCount.value || 1;
  currentPdfPageNo.value = Math.min(Math.max(1, pageNo), total);
};

/**
 * PDF.js 4.x 的 worker 是 ESM 模块，固定走 public 根路径并保留 .mjs 后缀。
 * 本地 Vite 能正确处理 ?url 的 hash worker；线上 Nginx / 缓存 / MIME 任一环节不一致，
 * 就可能导致 worker 初始化失败。固定为 /pdf.worker.min.mjs 可避免构建 hash 失效。
 */
const getPdfWorkerSrc = () => {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/');
  return `${base}pdf.worker.min.mjs`;
};
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = getPdfWorkerSrc();

const normalizePdfFileUrl = (url: string) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, window.location.origin);
    // 生产环境浏览器必须通过当前前端 Nginx 访问，避免直接打到 8000 或跨域。
    if (parsed.origin !== window.location.origin && parsed.pathname.startsWith('/review-pdf-api/')) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    if (parsed.origin !== window.location.origin && parsed.pathname.startsWith('/v1/review/pdf/files/')) {
      return `/review-pdf-api${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    if (parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return raw;
  } catch {
    return raw;
  }
};

const fetchPdfData = async (url: string) => {
  const normalizedUrl = normalizePdfFileUrl(url);
  if (!normalizedUrl) throw new Error('PDF 原文件地址为空，无法加载原文定位。');
  const response = await fetch(normalizedUrl, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/pdf,*/*' },
  });
  if (!response.ok) {
    throw new Error(`PDF 原文件加载失败: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) {
    throw new Error('PDF 原文件内容为空，无法加载原文定位。');
  }
  return new Uint8Array(buffer);
};

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

/** 封装当前模块内的业务逻辑：appendToTypingQueue。 */
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

/** 处理用户交互或组件事件：handleRestart。 */
const handleRestart = (index: number) => {
  if (!props.chatData || !props.chatData.messages) return;

  const assistantMessage = props.chatData.messages[index];
  let userMessage: ChatMessage | null = null;
  for (let i = index - 1; i >= 0; i--) {
    if (props.chatData.messages[i].role === 'user') {
      userMessage = props.chatData.messages[i];
      break;
    }
  }

  if (userMessage) {
    emit('regenerate', {
      content: userMessage.content,
      complianceParams:
        assistantMessage?.metadata?.complianceParams ||
        userMessage.metadata?.complianceParams ||
        null,
    });
  }
};

/** 处理用户交互或组件事件：handleExport。 */
const handleExport = async (item: any) => {
  const content = String(item?.content || '');

  if (!content.trim()) {
    ElMessage.warning('没有可导出的审核内容');
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
        markdown: content,
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

    await downloadConvertedFile(convertResult.download_url, convertResult.file_name);
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
  a.download = fileName || `${props.chatData?.title || '合规审核报告'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
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

/** 格式化展示内容：formatTime。 */
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

/** 封装当前模块内的业务逻辑：renderMarkdown。 */
const renderMarkdown = (content: string) => {
  if (!content) return '';
  return md.render(content);
};

/** 封装当前模块内的业务逻辑：escapeHtml。 */
const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/** 创建本地/远程业务对象：createOriginalLink。 */
const createOriginalLink = (text: string) => {
  return `<span class="original-reference-link" data-original-text="${escapeHtml(
    text,
  )}">${escapeHtml(text)}</span>`;
};

/** 封装当前模块内的业务逻辑：decorateOriginalReferences。 */
const decorateOriginalReferences = (html: string) => {
  if (typeof document === 'undefined') return html;

  const container = document.createElement('div');
  container.innerHTML = html;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();

  while (node) {
    textNodes.push(node as Text);
    node = walker.nextNode();
  }

  textNodes.forEach((textNode) => {
    const text = textNode.nodeValue || '';
    const referencePattern =
      /((?:原文|原句|引用原文)\s*[:：]\s*)([“"「『《]?[^。；;！!？?\n\r]{4,}[”"」』》]?)/g;

    if (!referencePattern.test(text)) return;

    referencePattern.lastIndex = 0;
    let cursor = 0;
    let match: RegExpExecArray | null = null;
    const fragment = document.createDocumentFragment();

    while ((match = referencePattern.exec(text))) {
      const [matchedText, label, originalText] = match;
      if (match.index > cursor) {
        fragment.append(document.createTextNode(text.slice(cursor, match.index)));
      }

      const wrapper = document.createElement('span');
      wrapper.innerHTML = `${escapeHtml(label)}${createOriginalLink(originalText.trim())}`;
      fragment.append(...Array.from(wrapper.childNodes));
      cursor = match.index + matchedText.length;
    }

    if (cursor < text.length) {
      fragment.append(document.createTextNode(text.slice(cursor)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  });

  return container.innerHTML;
};

/** 封装当前模块内的业务逻辑：renderReviewMarkdown。 */
const renderReviewMarkdown = (content: string) => {
  return decorateOriginalReferences(renderMarkdown(content));
};

/** 封装当前模块内的业务逻辑：activeOriginalMessage。 */
const activeOriginalMessage = computed(() => {
  if (!props.chatData || !activeOriginalMessageId.value) return null;
  return (
    props.chatData.messages.find(
      (message) =>
        message.id === activeOriginalMessageId.value && message.role === 'assistant',
    ) || null
  );
});

/** 封装当前模块内的业务逻辑：activeOriginalMetadata。 */
const activeOriginalMetadata = computed(() => {
  const assistant = activeOriginalMessage.value as any;
  if (!props.chatData || !activeOriginalMessageId.value) return assistant?.metadata || {};

  const messages = props.chatData.messages || [];
  /** 封装当前模块内的业务逻辑：assistantIndex。 */
  const assistantIndex = messages.findIndex((message: any) => message.id === activeOriginalMessageId.value);
  const pairedUser =
    messages.find((message: any) => message.id === `user_${activeOriginalMessageId.value}`) ||
    (assistantIndex > 0 ? messages.slice(0, assistantIndex).reverse().find((message: any) => message.role === 'user') : null);

  return {
    ...(pairedUser as any)?.metadata,
    ...assistant?.metadata,
  };
});

/** 从元数据、reviewContext 或已恢复的 PDF context 中读取字段。 */
const getOriginalMetaValue = (...keys: string[]) => {
  const metadata = activeOriginalMetadata.value || {};
  const reviewContext = metadata.reviewContext || metadata.review_context || {};
  const complianceParams = metadata.complianceParams || metadata.compliance_params || {};
  const reviewParams = reviewContext.reviewParams || reviewContext.review_params || {};
  const baseSources = [metadata, reviewContext, complianceParams, reviewParams];

  const getBaseContextId = () => {
    const contextKeys = ['pdfContextId', 'pdf_context_id', 'contextId', 'context_id'];
    for (const key of contextKeys) {
      for (const source of baseSources) {
        const value = source?.[key];
        if (value !== undefined && value !== null && value !== '') return String(value);
      }
    }
    return '';
  };

  const baseContextId = getBaseContextId();
  const useLoadedContext = Boolean(baseContextId && loadedPdfContextId.value === baseContextId && loadedPdfContext.value);
  const pdfContext = useLoadedContext ? loadedPdfContext.value || {} : {};
  const fileInfo = pdfContext.file_info || {};
  const reviewInput = pdfContext.review_input || {};
  const originalDispatch = pdfContext.original_dispatch || {};
  const pdfDetect = pdfContext.pdf_detect || {};
  const sources = useLoadedContext
    ? [metadata, reviewContext, complianceParams, reviewParams, fileInfo, reviewInput, originalDispatch, pdfDetect, pdfContext]
    : [metadata, reviewContext, complianceParams, reviewParams];

  for (const key of keys) {
    for (const source of sources) {
      if (source && Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined && source[key] !== null && source[key] !== '') {
        return source[key];
      }
    }
  }
  return '';
};

/** 封装当前模块内的业务逻辑：activeOriginalText。 */
const activeOriginalText = computed(() => {
  return (
    getOriginalMetaValue(
      'complianceOriginalText',
      'compliance_original_text',
      'originalText',
      'original_text',
      'parsedText',
      'parsed_text',
      'parsedMarkdown',
      'parsed_markdown',
    ) || ''
  ) as string;
});

/** 当前原文上下文 ID，用于刷新后恢复 PDF 原始文件和解析文本。 */
const activePdfContextId = computed(() =>
  String(getOriginalMetaValue('pdfContextId', 'pdf_context_id', 'context_id') || ''),
);

/** 标准 PDF 原始文件地址，供 PDF.js 文本层定位使用。 */
const activeSourceFileUrl = computed(() =>
  String(getOriginalMetaValue('sourceFileUrl', 'source_file_url', 'originalPdfUrl', 'original_pdf_url') || ''),
);

/** 当前原文定位模式。 */
const activeLocatorMode = computed(() =>
  String(getOriginalMetaValue('locatorMode', 'locator_mode') || ''),
);

/** 是否允许启用标准 PDF 高级定位。 */
const activeLocatorAvailable = computed(() => {
  const value = getOriginalMetaValue('locatorAvailable', 'locator_available');
  return value === true || value === 'true' || value === 1 || value === '1';
});

/** 不支持原 PDF 精准定位的原因。 */
const activeLocatorUnavailableReason = computed(() =>
  String(
    getOriginalMetaValue('locatorUnavailableReason', 'locator_unavailable_reason') ||
      '当前文件不支持原文精准定位，仅支持解析文本展示。',
  ),
);

const isActivePdfLocator = computed(() =>
  activeLocatorAvailable.value && activeLocatorMode.value === 'pdf_text_layer' && Boolean(activeSourceFileUrl.value),
);

const isActivePdfOriginalViewer = computed(() => Boolean(activeSourceFileUrl.value));

/** 封装当前模块内的业务逻辑：activeOriginalFileName。 */
const activeOriginalFileName = computed(() => {
  return String(
    getOriginalMetaValue('complianceFileName', 'compliance_file_name', 'fileName', 'file_name') || '上传原文',
  );
});

/** 封装当前模块内的业务逻辑：originalPanelTip。 */
const originalPanelTip = computed(() => {
  if (isActivePdfOriginalViewer.value) {
    if (pdfLoading.value) return '正在加载原始 PDF，加载完成后会自动定位原文片段。';
    if (pdfError.value) return pdfError.value;
    if (!isActivePdfLocator.value) return '该 PDF 为扫描件或非标准 PDF，当前仅支持查看原文页面，暂不支持精准文字高亮定位。';
    if (!originalSearchText.value) return '标准 PDF 已启用高级原文定位：点击左侧审核输出中的原文片段后，会自动跳转并高亮 PDF 文本层。';
    if (!originalMatchFound.value) return `未在 PDF 文本层中匹配到：${originalSearchText.value.slice(0, 40)}`;
    return `已在 PDF 中定位：${originalSearchText.value.slice(0, 40)}`;
  }

  if (!activeOriginalText.value) {
    if (activePdfContextId.value) return '正在尝试恢复审核原文上下文，请稍候；如果长时间无内容，请重新打开该历史会话。';
    return '当前记录没有可预览的原文缓存；请重新上传文本类文件后审核，或等待上传接口返回原文内容。';
  }
  if (activeLocatorMode.value === 'parsed_text_only' && activeLocatorUnavailableReason.value) {
    return `${activeLocatorUnavailableReason.value} 当前展示的是 PDF 解析文本。`;
  }
  if (!originalSearchText.value) {
    return '在左侧框选文字，或点击带有“原文：”标记的片段，右侧会自动定位并高亮。';
  }
  if (!originalMatchFound.value) {
    return `未在原文中匹配到：${originalSearchText.value.slice(0, 40)}`;
  }
  return `已定位：${originalSearchText.value.slice(0, 40)}`;
});

/** 按段落展示原文，优化 Word / 解析文本的段落级定位体验。 */
const renderOriginalContent = computed(() => {
  const originalText = activeOriginalText.value;
  if (!originalText) {
    return '<div class="original-empty">暂无可展示的原文内容</div>';
  }

  const query = originalSearchText.value;
  const matchedQuery = query && originalMatchFound.value ? query : '';
  const paragraphs = originalText.replace(/\r\n/g, '\n').split(/\n{1,}/);

  return paragraphs
    .map((paragraph, index) => {
      const text = paragraph || '';
      if (!text.trim()) return '<div class="original-paragraph blank">&nbsp;</div>';

      if (!matchedQuery) {
        return `<div class="original-paragraph" data-original-segment="${index}">${escapeHtml(text)}</div>`;
      }

      const pos = text.indexOf(matchedQuery);
      if (pos === -1) {
        return `<div class="original-paragraph" data-original-segment="${index}">${escapeHtml(text)}</div>`;
      }

      const before = text.slice(0, pos);
      const matched = text.slice(pos, pos + matchedQuery.length);
      const after = text.slice(pos + matchedQuery.length);
      return `<div class="original-paragraph" data-original-segment="${index}">${escapeHtml(before)}<mark data-original-mark="active">${escapeHtml(matched)}</mark>${escapeHtml(after)}</div>`;
    })
    .join('');
});

/** 构造请求载荷或业务上下文：buildSearchCandidates。 */
const buildSearchCandidates = (text: string) => {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const candidates = new Set<string>();
  const quotePatterns = [
    /“([^”]+)”/g,
    /"([^"]+)"/g,
    /‘([^’]+)’/g,
    /'([^']+)'/g,
    /「([^」]+)」/g,
    /『([^』]+)』/g,
    /《([^》]+)》/g,
  ];

  quotePatterns.forEach((pattern) => {
    const matches = cleaned.matchAll(pattern);
    for (const match of matches) {
      candidates.add(match[1].trim());
    }
  });

  const originalTextMatch = cleaned.match(/(?:原文|原句|内容)[:：]\s*(.+)$/);
  if (originalTextMatch?.[1]) {
    candidates.add(originalTextMatch[1].trim());
  }

  cleaned
    .split(/[。；;！!？?\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => candidates.add(item));

  candidates.add(cleaned);

  return [...candidates]
    .map((item) => item.replace(/^[-*序号\d.、\s]+/, '').trim())
    .filter((item) => normalizeLocatorText(item).length > 0)
    .sort((a, b) => b.length - a.length);
};

const normalizeLocatorText = (text: string) =>
  String(text || '')
    .normalize('NFKC')
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .toLowerCase();

/** 忽略空格、符号和单双引号差异，同时保留原文位置用于高亮。 */
const findNormalizedMatch = (source: string, candidate: string) => {
  const sourcePositions: number[] = [];
  let normalizedSource = '';
  for (let i = 0; i < source.length; i++) {
    const normalizedChar = normalizeLocatorText(source[i]);
    for (const char of normalizedChar) {
      sourcePositions.push(i);
      normalizedSource += char;
    }
  }

  const normalizedCandidate = normalizeLocatorText(candidate);
  if (!normalizedCandidate) return null;

  const normalizedIndex = normalizedSource.indexOf(normalizedCandidate);
  if (normalizedIndex === -1) return null;

  const start = sourcePositions[normalizedIndex];
  const end = sourcePositions[normalizedIndex + normalizedCandidate.length - 1] + 1 || start;
  return source.slice(start, end);
};

/** 封装当前模块内的业务逻辑：findOriginalMatch。 */
const findOriginalMatch = (source: string, text: string) => {
  const candidates = buildSearchCandidates(text);
  for (const candidate of candidates) {
    if (source.includes(candidate)) {
      return candidate;
    }

    const normalizedMatch = findNormalizedMatch(source, candidate);
    if (normalizedMatch) {
      return normalizedMatch;
    }
  }
  return '';
};

const findPdfMatch = (query: string) => {
  if (!query || pdfPages.value.length === 0) return null;
  const candidates = buildSearchCandidates(query)
    .map((item) => normalizeLocatorText(item))
    .filter(Boolean);

  for (const page of pdfPages.value) {
    const compactParts: string[] = [];
    const positions: number[] = [];

    page.items.forEach((item) => {
      const normalized = normalizeLocatorText(item.text);
      for (const ch of normalized) {
        compactParts.push(ch);
        positions.push(item.index);
      }
    });

    const compactPage = compactParts.join('');
    for (const candidate of candidates) {
      const start = compactPage.indexOf(candidate);
      if (start === -1) continue;
      const end = start + candidate.length;
      const itemIndexes = Array.from(new Set(positions.slice(start, end)));
      if (itemIndexes.length > 0) {
        return { pageNo: page.pageNo, itemIndexes };
      }
    }
  }

  return null;
};

const updatePdfMatch = () => {
  if (!isActivePdfLocator.value || !originalSearchText.value) {
    pdfActiveMatch.value = null;
    return;
  }

  const match = findPdfMatch(originalSearchText.value);
  pdfActiveMatch.value = match;
  originalMatchFound.value = Boolean(match);

  if (match) {
    currentPdfPageNo.value = match.pageNo;
    nextTick(() => {
      const activeSpan = pdfViewerRef.value?.querySelector('.pdf-text-span.active') as HTMLElement | null;
      if (activeSpan) {
        activeSpan.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        return;
      }
      const pageNode = pdfViewerRef.value?.querySelector(`[data-pdf-page="${match.pageNo}"]`);
      pageNode?.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' });
    });
  }
};

const isPdfSpanActive = (pageNo: number, spanIndex: number) => {
  return Boolean(
    pdfActiveMatch.value &&
      pdfActiveMatch.value.pageNo === pageNo &&
      pdfActiveMatch.value.itemIndexes.includes(spanIndex),
  );
};

const loadPdfTextLayer = async (url: string) => {
  if (!url) return;
  const token = ++pdfLoadToken;
  pdfLoading.value = true;
  pdfError.value = '';
  pdfPages.value = [];
  currentPdfPageNo.value = 1;
  pdfActiveMatch.value = null;

  try {
    const pdfData = await fetchPdfData(url);
    if (token !== pdfLoadToken) return;
    const loadingTask = (pdfjsLib as any).getDocument({
      data: pdfData,
      cMapUrl: undefined,
      standardFontDataUrl: undefined,
    });
    const pdf = await loadingTask.promise;
    const pages: PdfPageView[] = [];

    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      if (token !== pdfLoadToken) return;
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 1.12 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: context, viewport }).promise;
      const textContent = await page.getTextContent();
      const items: PdfTextItem[] = (textContent.items || [])
        .map((item: any, index: number) => {
          const text = String(item.str || '').trim();
          if (!text) return null;
          const tx = (pdfjsLib as any).Util.transform(viewport.transform, item.transform);
          const fontSize = Math.max(8, Math.hypot(tx[2], tx[3]) || Math.abs(item.height || 10));
          const width = Math.max(2, (item.width || text.length * fontSize * 0.55) * (viewport.scale || 1));
          const height = Math.max(8, fontSize * 1.15);
          return {
            id: `p${pageNo}_t${index}`,
            index,
            text,
            left: tx[4],
            top: tx[5] - height,
            width,
            height,
            fontSize,
          } as PdfTextItem;
        })
        .filter(Boolean) as PdfTextItem[];

      pages.push({
        pageNo,
        width: canvas.width,
        height: canvas.height,
        imageDataUrl: canvas.toDataURL('image/png'),
        text: items.map((item) => item.text).join(''),
        items,
      });
    }

    if (token !== pdfLoadToken) return;
    pdfPages.value = pages;
    currentPdfPageNo.value = pages[0]?.pageNo || 1;
    updatePdfMatch();
  } catch (error: any) {
    console.warn('PDF 原文定位加载失败:', {
      sourceFileUrl: url,
      normalizedUrl: normalizePdfFileUrl(url),
      workerSrc: getPdfWorkerSrc(),
      error,
    });
    pdfError.value = error?.message || 'PDF 加载失败，无法进行高级原文定位';
  } finally {
    if (token === pdfLoadToken) {
      pdfLoading.value = false;
    }
  }
};

const loadActivePdfContext = async () => {
  const contextId = activePdfContextId.value;
  if (!contextId) {
    loadedPdfContext.value = null;
    loadedPdfContextId.value = '';
    return;
  }
  if (loadedPdfContextId.value === contextId) return;

  loadedPdfContext.value = null;
  loadedPdfContextId.value = '';
  try {
    const context = await fetchReviewPdfContext(contextId, true);
    loadedPdfContext.value = context as any;
    loadedPdfContextId.value = contextId;
  } catch (error) {
    console.warn('恢复 PDF 审核上下文失败:', error);
  }
};

/** 封装当前模块内的业务逻辑：scrollToOriginalMatch。 */
const scrollToOriginalMatch = () => {
  nextTick(() => {
    const mark = originalContentRef.value?.querySelector('[data-original-mark="active"]');
    mark?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
};


const getMessageMetaValue = (item: ChatMessage, ...keys: string[]) => {
  const metadata = (item.metadata || {}) as Record<string, any>;
  const reviewContext = metadata.reviewContext || {};
  const complianceParams = metadata.complianceParams || {};
  const sources = [metadata, reviewContext, complianceParams];

  for (const key of keys) {
    for (const source of sources) {
      const value = source?.[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }
  return '';
};

const isOriginalMarkDisabled = (item: ChatMessage) => {
  const hasOriginalText = Boolean(getMessageMetaValue(item, 'complianceOriginalText', 'originalText', 'original_text'));
  const hasPdfFile = Boolean(getMessageMetaValue(item, 'sourceFileUrl', 'source_file_url', 'originalPdfUrl', 'original_pdf_url'));
  const hasPdfContext = Boolean(getMessageMetaValue(item, 'pdfContextId', 'pdf_context_id', 'contextId', 'context_id'));
  // 非标准 PDF 不再禁用，支持弱原文查看；只有既无文本缓存也无 PDF 上下文时才禁用。
  return !hasOriginalText && !hasPdfFile && !hasPdfContext;
};

const showNonStandardPdfOriginalDisabledTip = () => {
  ElMessageBox.alert('当前记录没有可预览的原文缓存，请重新上传文件后审核。', '原文标记不可用', {
    type: 'warning',
    confirmButtonText: '我知道了',
  });
};

const handleOriginalMarkButtonClick = (item: ChatMessage) => {
  if (isOriginalMarkDisabled(item)) {
    showNonStandardPdfOriginalDisabledTip();
    return;
  }
  toggleOriginalPanel(item);
};

/** 封装当前模块内的业务逻辑：locateOriginalText。 */
const locateOriginalText = (rawText: string, item: ChatMessage) => {
  const text = rawText.replace(/\s+/g, ' ').trim();
  if (!text || item.role !== 'assistant') return;

  if (isOriginalMarkDisabled(item)) {
    showNonStandardPdfOriginalDisabledTip();
    return;
  }

  if (activeOriginalMessageId.value !== item.id) {
    activeOriginalMessageId.value = item.id;
    emit('sources-panel-toggle', true);
  }

  const source = (item.metadata?.complianceOriginalText || activeOriginalMetadata.value?.complianceOriginalText || activeOriginalText.value || '') as string;
  const matchedText = source ? findOriginalMatch(source, text) : '';
  originalSearchText.value = matchedText || text;

  if (isActivePdfOriginalViewer.value) {
    updatePdfMatch();
    return;
  }

  originalMatchFound.value = Boolean(matchedText);

  if (matchedText) {
    scrollToOriginalMatch();
  }
};

/** 处理用户交互或组件事件：handleAnswerSelection。 */
const handleAnswerSelection = (item: ChatMessage) => {
  const selection = window.getSelection()?.toString() || '';
  if (normalizeLocatorText(selection).length > 0) {
    locateOriginalText(selection, item);
  }
};

/** 处理用户交互或组件事件：handleAnswerClick。 */
const handleAnswerClick = (event: MouseEvent, item: ChatMessage) => {
  const originalLink = (event.target as HTMLElement | null)?.closest(
    '.original-reference-link',
  ) as HTMLElement | null;
  if (originalLink?.dataset.originalText) {
    event.preventDefault();
    event.stopPropagation();
    locateOriginalText(originalLink.dataset.originalText, item);
  }
};

/** 切换面板、菜单或状态：toggleOriginalPanel。 */
const toggleOriginalPanel = (item: ChatMessage) => {
  if (activeOriginalMessageId.value === item.id) {
    closeOriginalPanel();
    return;
  }

  activeOriginalMessageId.value = item.id;
  nextTick(() => {
    const node = document.querySelector(`[data-message-id="${item.id}"] .btnbottom`) ||
      document.querySelector(`[data-message-id="${item.id}"]`);
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  originalSearchText.value = '';
  originalMatchFound.value = false;
  loadedPdfContext.value = null;
  loadedPdfContextId.value = '';
  pdfActiveMatch.value = null;
  emit('sources-panel-toggle', true);
};

const restoreOriginalMessageAnchor = (messageId?: string) => {
  if (!messageId) return;
  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const node = document.querySelector(`[data-message-id="${messageId}"] .btnbottom`) ||
          document.querySelector(`[data-message-id="${messageId}"]`);
        node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });
  });
};

/** 关闭面板、菜单或弹窗：closeOriginalPanel。 */
const closeOriginalPanel = () => {
  const messageId = activeOriginalMessageId.value;
  activeOriginalMessageId.value = null;
  originalSearchText.value = '';
  originalMatchFound.value = false;
  pdfActiveMatch.value = null;
  loadedPdfContext.value = null;
  loadedPdfContextId.value = '';
  emit('sources-panel-toggle', false);
  restoreOriginalMessageAnchor(messageId || undefined);
};

/** 封装当前模块内的业务逻辑：scrollToBottom。 */
const scrollToBottom = () => {
  nextTick(() => {
    /** 封装当前模块内的业务逻辑：scrollContainers。 */
    const scrollContainers = () => {
      const containers = [
        document.querySelector('.dynamic-content'),
        document.querySelector('.conversation-history'),
        document.querySelector('.intelligent-qa'),
      ];

      for (const container of containers) {
        if (!container) continue;
        try {
          container.scrollTop = container.scrollHeight;
        } catch {}
      }

      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'auto',
      });
    };

    requestAnimationFrame(() => {
      scrollContainers();
      requestAnimationFrame(scrollContainers);
    });
  });
};

watch(
  () => [activeOriginalMessageId.value, activePdfContextId.value],
  async () => {
    await loadActivePdfContext();
    if (isActivePdfOriginalViewer.value) {
      await loadPdfTextLayer(activeSourceFileUrl.value);
    } else {
      pdfLoadToken += 1;
      pdfPages.value = [];
      pdfActiveMatch.value = null;
      pdfError.value = '';
      pdfLoading.value = false;
    }
  },
);

watch(
  () => [originalSearchText.value, pdfPages.value.length, isActivePdfLocator.value],
  () => {
    if (isActivePdfLocator.value) updatePdfMatch();
  },
);

watch(
  () => props.currentAnswer,
  (newAnswer, oldAnswer = '') => {
    if (!newAnswer) {
      displayAnswer.value = '';
      stopTypingEffect();
      scrollToBottom();
      return;
    }

    if (newAnswer && newAnswer !== oldAnswer) {
      const newText = newAnswer.substring(oldAnswer.length);
      if (newText) {
        appendToTypingQueue(newText);
      }
    }
    scrollToBottom();
  },
  { immediate: true },
);

watch(
  () => props.streaming,
  (newStreaming) => {
    if (!newStreaming) {
      stopTypingEffect();
    }
  },
  { immediate: true },
);

watch(
  () => props.currentReasoning,
  (newReasoning) => {
    if (newReasoning && newReasoning.trim() !== '') {
      scrollToBottom();
    }
  },
);

watch(
  () => props.currentStreamingMessageId,
  (newId) => {
    if (!newId) {
      stopTypingEffect();
      return;
    }
    displayAnswer.value = '';
    stopTypingEffect();
  },
);

watch(
  () => props.chatData,
  () => {
    if (activeOriginalMessageId.value) {
      const messages = props.chatData?.messages || [];
      const activeIndex = messages.findIndex((message) => message.id === activeOriginalMessageId.value);
      if (activeIndex === -1 || activeIndex < messages.length - 1) {
        closeOriginalPanel();
      }
    }
    nextTick(() => {
      scrollToBottom();
    });
  },
  { deep: true },
);

onMounted(() => {
  scrollToBottom();
});

onUnmounted(() => {
  stopTypingEffect();
  emit('sources-panel-toggle', false);
});
</script>

<style lang="less" scoped>
.intelligent-qa {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 0;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  position: relative;
  overflow-x: hidden;
  align-items: center;

  &.with-original-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(420px, 1fr);
    gap: 16px;
    align-items: stretch;
    padding: 12px 18px 10px;
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    transition:
      padding 0.3s ease,
      gap 0.3s ease;

    .conversation-history {
      width: 100%;
      max-width: none;
      margin: 0;
      padding: 0 0 20px;
      overflow-y: auto;
      min-height: 0;
      transition:
        width 0.3s ease,
        padding 0.3s ease,
        margin 0.3s ease;
    }

    .history-item,
    .message-assistant {
      width: 100%;
    }
  }

  .original-panel {
    position: fixed;
    top: 50px;
    right: 0;
    bottom: 0;
    width: calc((100vw - var(--sidebar-width, 280px)) / 2 );
    height: auto;
    max-height: none;
    min-width: 0;
    background: #fff;
    border: 1px solid #e9ecef;
    box-shadow: 0 12px 30px rgba(31, 45, 61, 0.12);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 10;
    transition:
      width 0.3s ease,
      right 0.3s ease;
  }

  .original-panel-slide-enter-active,
  .original-panel-slide-leave-active {
    transition:
      opacity 0.3s ease,
      transform 0.3s ease,
      width 0.3s ease;
  }

  .original-panel-slide-enter-from,
  .original-panel-slide-leave-to {
    opacity: 0;
    transform: translateX(28px);
  }

  .original-panel-header {
    padding: 14px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #e9ecef;
    background: #f8f9fa;
  }

  .original-title {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #303133;
    flex: 1;

    h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #303133;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

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

  .original-panel-tip {
    padding: 8px 14px;
    background: #f5f8ff;
    border-bottom: 1px solid #edf0f5;
    color: #4d668c;
    font-size: 13px;
    line-height: 1.45;

    &.warning {
      background: #fff7e6;
      color: #ad6800;
    }
  }

  .original-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    color: #303133;
    font-size: 14px;
    line-height: 1.8;
    white-space: pre-wrap;
    word-break: break-word;

    :deep(mark) {
      padding: 2px 4px;
      border-radius: 4px;
      background: #ffe58f;
      color: #1f1f1f;
      box-shadow: 0 0 0 2px rgba(250, 173, 20, 0.18);
    }

    :deep(.original-empty) {
      color: #909399;
      text-align: center;
      padding-top: 120px;
    }
  }


  .pdf-locator-content {
    padding: 0 10px 10px;
    background: #f3f5f8;
    white-space: normal;
    overflow: auto;
    scrollbar-gutter: stable;
  }

  .pdf-pagination-toolbar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px 8px 10px;
    background: #f3f5f8;
    border-bottom: 1px solid #e6eaf0;
    color: #4d668c;
    font-size: 13px;
  }

  .pdf-page-list {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 12px 8px 18px;

    &.paged {
      width: 100%;
      min-width: 0;
      overflow-x: auto;
    }
  }

  .pdf-page-shell {
    position: relative;
    margin: 0 auto;
    background: #fff;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
    overflow: hidden;
    flex: 0 0 auto;
  }

  .pdf-page-image {
    display: block;
    width: 100%;
    height: 100%;
    user-select: none;
  }

  .pdf-text-span {
    position: absolute;
    display: inline-block;
    color: transparent;
    line-height: 1;
    border-radius: 2px;
    pointer-events: none;
  }

  .pdf-text-span.active {
    background: rgba(255, 214, 102, 0.55);
    box-shadow: 0 0 0 1px rgba(250, 140, 22, 0.75);
  }

  .pdf-error {
    color: #cf1322;
  }

  :deep(.original-mark-disabled) {
    color: #c0c4cc !important;
    cursor: not-allowed;
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

  .conversation-history {
    flex: 1;
    padding-top: 20px;
    overflow: visible;
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 80%;
    transition:
      width 0.3s ease,
      padding 0.3s ease,
      margin 0.3s ease;

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
                font-family: inherit;
                margin: 0;
                overflow-x: hidden;
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
              padding: 20px 40px 68px;
            }

            > div > div[style*='margin-left: 15px'] {
              display: flex;
              align-items: center;
              gap: 8px;
              margin: -64px 0 26px 40px !important;
              width: calc(100% - 80px);
              padding-top: 10px;
              position: relative;
              z-index: 2;

              .final-message-time {
                color: #999;
                font-size: 15px;
                line-height: 28px;
              }

              > :deep(.btnbottom) {
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

            .thinking-icon {
              font-size: 16px;
            }

            .thinking-content {
              font-size: 13px;
              color: #333;
              white-space: pre-wrap;
              word-break: break-word;
              background: rgba(255, 255, 255, 0.7);
              padding: 12px;
              border-radius: 6px;
              border-left: 3px solid #fa8c16;
              overflow-y: auto;
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
              border-radius: 8px;
              padding: 20px 40px;
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
                overflow-x: hidden;
                white-space: pre-wrap;
                word-break: break-word;
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
              line-height: 1.6;
              word-break: break-word;
              overflow-wrap: anywhere;
              max-width: 100%;
              width: 100%;
              box-sizing: border-box;
              margin-bottom: 15px;

              &.review-output {
                cursor: text;
              }

              :deep(.original-reference-link) {
                color: #1890ff;
                cursor: pointer;
                text-decoration: underline;
                text-underline-offset: 3px;

                &:hover {
                  color: #40a9ff;
                }
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
                overflow-x: hidden;
                white-space: pre-wrap;
                word-break: break-word;
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

  .message-header {
    display: flex;
    align-items: flex-start;
    max-width: 100%;

    .message-info {
      flex: 1;
      min-width: 0;
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
