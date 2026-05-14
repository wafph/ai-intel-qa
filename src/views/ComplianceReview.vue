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
      >
        <div v-if="item.role === 'user'" class="message-user">
          <div class="message-header">
            <div class="message-info">
              <pre class="message-content user-message-content">{{ item.content }}</pre>
              <div class="message-time">{{ formatTime(item.timestamp) }}</div>
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
                    <div class="typing-text" v-html="renderMarkdown(displayAnswer)"></div>
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
                  <el-button
                    link
                    class="btnbottom"
                    type="warning"
                    plain
                    @click="toggleOriginalPanel(item)"
                  >
                    原文标记<el-icon class="el-icon--right"><ArrowRight /></el-icon>
                  </el-button>
                  <el-button
                    link
                    class="btnbottom"
                    type="primary"
                    plain
                    @click="handleExport"
                    :loading="loading"
                    :disabled="loading"
                  >
                    {{ loading ? '转换中...' : '导出报告' }}
                  </el-button>
                  <el-button
                    link
                    class="btnbottom"
                    type="success"
                    plain
                    @click="handleRestart(index)"
                  >
                    重新审核
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

    <aside
      v-if="activeOriginalMessage"
      class="original-panel"
      :class="{ 'sidebar-visible': activeOriginalMessage }"
    >
      <div class="original-panel-header">
        <div class="original-title">
          <el-icon><Document /></el-icon>
          <h3>{{ activeOriginalFileName }}</h3>
        </div>
        <el-icon class="close-btn" @click="closeOriginalPanel"><Close /></el-icon>
      </div>
      <div
        class="original-panel-tip"
        :class="{ warning: !originalMatchFound && originalSearchText }"
      >
        {{ originalPanelTip }}
      </div>
      <div
        ref="originalContentRef"
        class="original-content"
        v-html="renderOriginalContent"
      ></div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import MarkdownIt from 'markdown-it';
import { ArrowRight, Close, Document } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { API } from '@/api/api';
import { isSuccessStatus, request } from '@/services/http';

const displayAnswer = ref<string>('');
const typingSpeed = 20;
let typingInterval: NodeJS.Timeout | null = null;
let currentTypingIndex = 0;
const loading = ref(false);
const isTyping = ref(false);
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
  };
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

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

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

const handleRestart = (index: number) => {
  if (!props.chatData || !props.chatData.messages) return;

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

const handleExport = async () => {
  if (!props.chatData) {
    ElMessage.error('没有可导出的内容');
    return;
  }

  const content = props.chatData.messages
    .filter((msg) => msg.role === 'assistant')
    .map((msg) => msg.content)
    .join('\n\n');

  if (!content.trim()) {
    ElMessage.warning('没有可导出的审核内容');
    return;
  }

  const lastAssistantMessage = props.chatData.messages
    .filter((msg) => msg.role === 'assistant')
    .pop();
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
        markdown: content,
        qa_id: qaId,
      },
    });

    if (!isSuccessStatus(convertResponse.status)) {
      throw new Error(`转换失败: ${convertResponse.status}`);
    }

    const convertResult = convertResponse.data;
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

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const createOriginalLink = (text: string) => {
  return `<span class="original-reference-link" data-original-text="${escapeHtml(
    text,
  )}">${escapeHtml(text)}</span>`;
};

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

const renderReviewMarkdown = (content: string) => {
  return decorateOriginalReferences(renderMarkdown(content));
};

const activeOriginalMessage = computed(() => {
  if (!props.chatData || !activeOriginalMessageId.value) return null;
  return (
    props.chatData.messages.find(
      (message) =>
        message.id === activeOriginalMessageId.value && message.role === 'assistant',
    ) || null
  );
});

const activeOriginalText = computed(() => {
  return activeOriginalMessage.value?.metadata?.complianceOriginalText || '';
});

const activeOriginalFileName = computed(() => {
  return activeOriginalMessage.value?.metadata?.complianceFileName || '上传原文';
});

const originalPanelTip = computed(() => {
  if (!activeOriginalText.value) {
    return '当前记录没有可预览的原文缓存；请重新上传文本类文件后审核，或等待上传接口返回原文内容。';
  }
  if (!originalSearchText.value) {
    return '在左侧框选或点击审核输出中的原文片段，右侧会自动定位并高亮。';
  }
  if (!originalMatchFound.value) {
    return `未在原文中匹配到：${originalSearchText.value.slice(0, 40)}`;
  }
  return `已定位：${originalSearchText.value.slice(0, 40)}`;
});

const renderOriginalContent = computed(() => {
  const originalText = activeOriginalText.value;
  if (!originalText) {
    return '<div class="original-empty">暂无可展示的原文内容</div>';
  }

  const query = originalSearchText.value;
  const index = query ? originalText.indexOf(query) : -1;
  if (!query || index === -1 || !originalMatchFound.value) {
    return escapeHtml(originalText);
  }

  const before = originalText.slice(0, index);
  const matched = originalText.slice(index, index + query.length);
  const after = originalText.slice(index + query.length);

  return `${escapeHtml(before)}<mark data-original-mark="active">${escapeHtml(
    matched,
  )}</mark>${escapeHtml(after)}`;
});

const buildSearchCandidates = (text: string) => {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const candidates = new Set<string>();
  const quotePatterns = [
    /“([^”]{4,})”/g,
    /"([^"]{4,})"/g,
    /「([^」]{4,})」/g,
    /『([^』]{4,})』/g,
    /《([^》]{4,})》/g,
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
    .filter((item) => item.length >= 4)
    .forEach((item) => candidates.add(item));

  candidates.add(cleaned);

  return [...candidates]
    .map((item) => item.replace(/^[-*序号\d.、\s]+/, '').trim())
    .filter((item) => item.length >= 4)
    .sort((a, b) => b.length - a.length);
};

const findCompactMatch = (source: string, candidate: string) => {
  const sourcePositions: number[] = [];
  let compactSource = '';
  for (let i = 0; i < source.length; i++) {
    if (!/\s/.test(source[i])) {
      sourcePositions.push(i);
      compactSource += source[i];
    }
  }

  const compactCandidate = candidate.replace(/\s+/g, '');
  if (compactCandidate.length < 4) return null;

  const compactIndex = compactSource.indexOf(compactCandidate);
  if (compactIndex === -1) return null;

  const start = sourcePositions[compactIndex];
  const end = sourcePositions[compactIndex + compactCandidate.length - 1] + 1 || start;
  return source.slice(start, end);
};

const findOriginalMatch = (source: string, text: string) => {
  const candidates = buildSearchCandidates(text);
  for (const candidate of candidates) {
    if (source.includes(candidate)) {
      return candidate;
    }

    const compactMatch = findCompactMatch(source, candidate);
    if (compactMatch) {
      return compactMatch;
    }
  }
  return '';
};

const scrollToOriginalMatch = () => {
  nextTick(() => {
    const mark = originalContentRef.value?.querySelector('[data-original-mark="active"]');
    mark?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
};

const locateOriginalText = (rawText: string, item: ChatMessage) => {
  const text = rawText.replace(/\s+/g, ' ').trim();
  if (!text || item.role !== 'assistant') return;

  if (activeOriginalMessageId.value !== item.id) {
    activeOriginalMessageId.value = item.id;
    emit('sources-panel-toggle', true);
  }

  const source = item.metadata?.complianceOriginalText || '';
  const matchedText = source ? findOriginalMatch(source, text) : '';
  originalSearchText.value = matchedText || text;
  originalMatchFound.value = Boolean(matchedText);

  if (matchedText) {
    scrollToOriginalMatch();
  }
};

const handleAnswerSelection = (item: ChatMessage) => {
  const selection = window.getSelection()?.toString() || '';
  if (selection.trim().length >= 4) {
    locateOriginalText(selection, item);
  }
};

const handleAnswerClick = (event: MouseEvent, item: ChatMessage) => {
  const originalLink = (event.target as HTMLElement | null)?.closest(
    '.original-reference-link',
  ) as HTMLElement | null;
  if (originalLink?.dataset.originalText) {
    event.preventDefault();
    event.stopPropagation();
    locateOriginalText(originalLink.dataset.originalText, item);
    return;
  }

  const selection = window.getSelection()?.toString() || '';
  if (selection.trim().length >= 4) return;

  const target = event.target as HTMLElement | null;
  const textNode = target?.closest(
    'p, li, td, th, blockquote, h1, h2, h3, h4, h5, h6',
  ) as HTMLElement | null;
  const text = textNode?.innerText || target?.textContent || '';
  if (text.trim().length >= 4) {
    locateOriginalText(text, item);
  }
};

const toggleOriginalPanel = (item: ChatMessage) => {
  if (activeOriginalMessageId.value === item.id) {
    closeOriginalPanel();
    return;
  }

  activeOriginalMessageId.value = item.id;
  originalSearchText.value = '';
  originalMatchFound.value = false;
  emit('sources-panel-toggle', true);
};

const closeOriginalPanel = () => {
  activeOriginalMessageId.value = null;
  originalSearchText.value = '';
  originalMatchFound.value = false;
  emit('sources-panel-toggle', false);
};

const scrollToBottom = () => {
  nextTick(() => {
    const container =
      document.querySelector('.dynamic-content') ||
      document.querySelector('.conversation-history');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });
};

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
    }
  },
);

watch(
  () => props.chatData,
  () => {
    if (
      activeOriginalMessageId.value &&
      !props.chatData?.messages.some(
        (message) => message.id === activeOriginalMessageId.value,
      )
    ) {
      closeOriginalPanel();
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
  height: 98%;
  padding: 0;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  position: relative;
  overflow-x: hidden;
  align-items: center;

  &.with-original-panel {
    align-items: stretch;

    .conversation-history {
      width: 62%;
      margin: 0 30% 20px auto;
      padding-right: 0;
    }

    .history-item {
      width: 100%;
    }

    .message-assistant {
      width: 100%;
    }
  }

  .original-panel {
    position: fixed;
    right: -350px;
    top: 70px;
    bottom: 0;
    width: 350px;
    background: #fff;
    border-left: 1px solid #e9ecef;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
    transition: right 0.3s ease;
    display: flex;
    flex-direction: column;
    z-index: 100;

    &.sidebar-visible {
      right: 0;
    }
  }

  .original-panel-header {
    padding: 20px;
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
      font-size: 18px;
      font-weight: 600;
      color: #303133;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .close-btn {
    cursor: pointer;
    color: #909399;
    font-size: 20px;

    &:hover {
      color: #409eff;
    }
  }

  .original-panel-tip {
    padding: 10px 16px;
    background: #f5f8ff;
    border-bottom: 1px solid #edf0f5;
    color: #4d668c;
    font-size: 13px;
    line-height: 1.5;

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
        width: 85%;
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
