<!--
  通用输入框组件，支持发送、停止、换行和自适应高度。
  - 合规审核模式：单文件上传，输入框只读。
  - 智能问答/智能检索/辅助起草模式：多文件上传，输入框可编辑，文件依次追加，支持单选删除。
  本文件属于规章制度智能体前端最新版交付代码。
-->
<template>
  <div
    class="chat-input-container"
    :class="{
      'has-content': hasInputContent,
      'is-disabled': disabled && !streaming,
      'is-streaming': streaming,
    }"
  >
    <div class="input-wrapper">
      <!-- 文本域 + 已上传文件卡片容器 -->
      <div
        class="textarea-container"
        :class="{
          'has-uploaded-file': (isComplianceMode && uploadedFileName) || (isQAMode && uploadedFileList.length > 0),
        }"
      >
        <!-- ========== 合规审核模式：单文件卡片 ========== -->
        <div
          v-if="isComplianceMode && uploadedFileName"
          class="uploaded-file-card"
          :class="{ processing: isComplianceFileProcessing }"
          :title="uploadedFileName"
        >
          <div class="file-icon">{{ fileIconText }}</div>
          <div class="file-info">
            <div class="file-name">{{ uploadedFileName }}</div>
            <div v-if="uploadedFileMeta" class="file-meta">{{ uploadedFileMeta }}</div>
          </div>
          <button
            v-if="!streaming && !isComplianceFileProcessing"
            class="remove-upload-btn"
            type="button"
            title="删除已上传文件"
            aria-label="删除已上传文件"
            @click.stop="handleRemoveUpload"
          >×</button>
        </div>

        <!-- ========== 智能问答模式：多文件卡片列表 ========== -->
        <div
          v-if="isQAMode && uploadedFileList.length > 0"
          class="qa-uploaded-file-list"
        >
          <div
            v-for="fileItem in uploadedFileList"
            :key="fileItem.uid"
            class="uploaded-file-card qa-file-card"
            :class="{
              'processing': fileItem.status === 'uploading',
              'is-uploading': fileItem.status === 'uploading',
            }"
            :title="fileItem.name"
          >
            <div class="file-icon">{{ getQAFileIconText(fileItem) }}</div>
            <div class="file-info">
              <div class="file-name">{{ fileItem.name }}</div>
              <div v-if="getQAFileMeta(fileItem)" class="file-meta">{{ getQAFileMeta(fileItem) }}</div>
            </div>
            <button
              v-if="!streaming && !isQAFileProcessing && fileItem.status !== 'uploading'"
              class="remove-upload-btn"
              type="button"
              :title="`删除文件：${fileItem.name}`"
              :aria-label="`删除文件：${fileItem.name}`"
              @click.stop="handleRemoveQAFile(fileItem.uid)"
            >×</button>
          </div>
        </div>

        <textarea
          ref="textareaRef"
          v-model="inputText"
          :placeholder="placeholder"
          :disabled="isComplianceMode ? false : disabled"
          :readonly="isComplianceMode"
          :maxlength="MAX_CHAT_INPUT_LENGTH"
          class="chat-textarea"
          rows="1"
          @keydown.enter.exact.prevent="handleSend"
          @keydown.enter.shift.exact.prevent="handleNewLine"
          @input="handleInput"
        />
      </div>

      <!-- ========== 底部工具栏：上传按钮 + 分隔符 + 合规审核额外插槽 + 发送/停止按钮 ========== -->
      <div class="input-footer">
        <div class="footer-tools">
          <!-- 合规审核：单文件上传入口 -->
          <el-upload
            v-if="isComplianceMode"
            class="upload-action"
            :http-request="customUpload"
            :show-file-list="false"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json"
            :disabled="streaming || isComplianceFileProcessing"
          >
            <button class="add-btn" type="button" aria-label="上传文件" title="上传文件">
              <svg class="add-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </el-upload>

          <!-- 智能问答 Tab：多文件上传入口（图标、格式、大小与合规审核保持一致） -->
          <el-upload
            v-else-if="isQAMode"
            class="upload-action"
            :http-request="customUploadQA"
            :show-file-list="false"
            :multiple="true"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.markdown,.csv,.json,.xml,.html,.htm,.log,.yml,.yaml,.png,.jpg,.jpeg,.gif,.bmp,.webp,.tif,.tiff"
            :disabled="streaming || isQAFileProcessing"
          >
            <button
              class="add-btn"
              type="button"
              aria-label="上传文件"
              title="上传文件（支持多文件依次追加）"
            >
              <svg class="add-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </el-upload>

          <span v-if="isComplianceMode" class="footer-divider"></span>
          <slot v-if="isComplianceMode"></slot>
        </div>

        <!-- 发送/停止按钮区 -->
        <div class="action-buttons">
          <button
            v-if="streaming"
            class="send-btn stop-btn is-active"
            type="button"
            aria-label="停止回答"
            @click="handleStop"
          >
            <span class="stop-tooltip">停止回答</span>
            <svg class="stop-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="8" y="8" width="8" height="8" rx="1.5" />
            </svg>
          </button>

          <button
            v-else
            class="send-btn"
            :class="{ 'is-active': !isSendButtonDisabled }"
            type="button"
            :disabled="isSendButtonDisabled"
            aria-label="发送"
            @click="handleSend"
          >
            <svg class="send-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 5.2 5.8 12.1h4.1v6.2h4.2v-6.2h4.1L12 5.2Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

/** 智能问答上传文件项类型：用于渲染多文件卡片列表。 */
export interface QAUploadedFile {
  /** 唯一标识，用于删除定位 */
  uid: string;
  /** 文件名（用户展示） */
  name: string;
  /** 文件大小（字节） */
  size: number;
  /** 上传完成后后端返回的文件 URL */
  fileUrl?: string;
  /** 上传完成后后端返回的文件 ID */
  uploadFileId?: string;
  /** 上传后提取的原文文本（可选，用于后端关联） */
  originalText?: string;
  /** 文件扩展名（小写） */
  fileType?: string;
  /** 上传状态：正在上传 / 成功 / 失败 */
  status?: 'uploading' | 'success' | 'error';
  /** 原始 File 对象引用（可选） */
  raw?: File;
}

/** 组件 Props 定义。 */
interface Props {
  /** 输入框占位符 */
  placeholder?: string;
  /** 当前激活的 Tab 名称：仅 '智能问答' 开启多文件上传入口 */
  activeTab?: string;
  /** 是否整体禁用（非合规模式下禁用 textarea） */
  disabled?: boolean;
  /** 是否为合规审核模式：true=单文件上传+textarea只读；false=多文件上传+textarea可写 */
  isComplianceMode?: boolean;
  /** 是否正在流式输出 */
  streaming?: boolean;
  /** 合规审核自定义上传回调（Element Plus http-request 参数） */
  customUpload?: (options: any) => Promise<void>;
  /** 合规审核已上传文件名（单文件） */
  uploadedFileName?: string;
  /** 合规审核已上传文件元信息文本：扩展名 | 大小 */
  uploadedFileMeta?: string;
  /** 合规审核文件解析中状态 */
  isComplianceFileProcessing?: boolean;
  /** 合规审核解析中文案 */
  complianceFileProcessingText?: string;

  /** ---- 智能问答多文件上传相关 Props（仅 '智能问答' Tab 生效） ---- */
  /** 多文件上传自定义回调（Element Plus http-request 参数），由父级完成上传并更新列表 */
  customUploadQA?: (options: any) => Promise<void>;
  /** 已上传文件列表，按选择顺序依次追加显示 */
  uploadedFileList?: QAUploadedFile[];
  /** 智能问答上传处理中状态（用于禁用按钮） */
  isQAFileProcessing?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请输入内容...',
  activeTab: '',
  disabled: false,
  isComplianceMode: false,
  streaming: false,
  customUpload: undefined,
  uploadedFileName: '',
  uploadedFileMeta: '',
  isComplianceFileProcessing: false,
  complianceFileProcessingText: '',
  customUploadQA: undefined,
  uploadedFileList: () => [],
  isQAFileProcessing: false,
});

/** 是否为智能问答 Tab：仅该 Tab 启用多文件上传入口与 file_url 参数。 */
const isQAMode = computed(() => !props.isComplianceMode && props.activeTab === '智能问答');

/** 组件事件定义。 */
const emit = defineEmits<{
  /** 用户点击发送按钮或回车：content 为输入框文本内容 */
  send: [content: string];
  /** 用户点击停止按钮 */
  stop: [];
  /** 合规审核模式：删除已上传的单个文件 */
  'remove-upload': [];
  /** 智能问答模式：删除指定 uid 对应的已上传文件 */
  'remove-qa-file': [uid: string];
}>();

// ---- 基础响应式状态 ----
/** 当前输入框文本值 */
const inputText = ref<string>('');
/** textarea 元素引用 */
const textareaRef = ref<HTMLTextAreaElement | null>(null);
/** 输入法（中文/日文等）组合输入中状态 */
const isComposing = ref<boolean>(false);
/** 输入框最大字符数，防止超大内容提交 */
const MAX_CHAT_INPUT_LENGTH = 50000;

// ---- 合规审核单文件显示辅助 ----
/** 合规审核文件图标文字：取扩展名前 3 个大写字母。 */
const fileIconText = computed(() => {
  const ext = (props.uploadedFileName || '').split('.').pop()?.toUpperCase();
  return ext ? ext.slice(0, 3) : 'W';
});

// ---- 智能问答多文件显示辅助 ----

/**
 * 根据 QA 上传文件项生成图标文字。
 * 与合规审核保持一致：取文件扩展名前 3 个大写字母；无法识别时显示通用 "FILE"。
 * @param fileItem - QA 上传文件项
 * @returns 图标文字（如 PDF、DOCX、TXT）
 */
const getQAFileIconText = (fileItem: QAUploadedFile): string => {
  const ext = (fileItem.fileType || fileItem.name.split('.').pop() || '').toUpperCase();
  return ext ? ext.slice(0, 4) : 'FILE';
};

/**
 * 格式化 QA 文件元信息（扩展名 | 大小），与合规审核 uploadedFileMeta 格式保持一致。
 * @param fileItem - QA 上传文件项
 * @returns 如 "PDF | 1.23MB" 的格式化文本，大小未知时仅返回扩展名
 */
const getQAFileMeta = (fileItem: QAUploadedFile): string => {
  const ext = (fileItem.fileType || fileItem.name.split('.').pop() || '').toUpperCase();
  const size = fileItem.size;
  let sizeText = '';
  if (Number.isFinite(size) && size > 0) {
    if (size < 1024) sizeText = `${size}B`;
    else if (size < 1024 * 1024) sizeText = `${(size / 1024).toFixed(2)}KB`;
    else sizeText = `${(size / 1024 / 1024).toFixed(2)}MB`;
  }
  return sizeText ? `${ext} | ${sizeText}` : ext;
};

// ---- 计算属性 ----

/** 输入框是否有非空内容：用于发送按钮高亮与容器 class。 */
const hasInputContent = computed(() => Boolean(inputText.value.trim()));

/** 发送按钮是否禁用。
 *  - 流式中：始终可点（切换为停止按钮）。
 *  - 合规审核：只要文件解析中则禁用。
 *  - 智能问答 / 智能检索 / 辅助起草：必须文本框有内容才高亮，仅上传文件时按钮置灰。
 */
const isSendButtonDisabled = computed(() => {
  if (props.streaming) return false;
  if (props.disabled) return true;
  if (props.isComplianceMode) return Boolean(props.isComplianceFileProcessing);
  return !hasInputContent.value;
});

// ---- 事件处理 ----

/** 处理用户点击发送 / 回车键。
 *  - 输入法组合中、整体禁用、流式中：直接忽略。
 *  - 合规审核模式不需要内容校验（父级负责）。
 *  - 智能问答 / 智能检索 / 辅助起草：必须文本框有内容才能发送，仅上传文件时不触发发送。
 */
const handleSend = () => {
  if (isComposing.value || props.disabled || props.streaming) {
    return;
  }

  const content = inputText.value.trim();
  if (props.isComplianceMode) {
    emit('send', content);
    inputText.value = '';
    autoResize();
    return;
  }

  // 智能问答 / 智能检索 / 辅助起草：必须有文字
  if (!content) return;

  emit('send', content);
  inputText.value = '';
  resetTextareaHeight();
};

/** 处理用户点击停止按钮，中断流式输出。 */
const handleStop = () => {
  emit('stop');
};

/** 删除合规审核模式下已上传的单文件。 */
const handleRemoveUpload = () => {
  emit('remove-upload');
};

/**
 * 删除智能问答模式下指定 uid 的已上传文件。
 * @param uid - 文件唯一标识
 */
const handleRemoveQAFile = (uid: string) => {
  emit('remove-qa-file', uid);
};

/** Shift+Enter 在可编辑模式下插入换行。 */
const handleNewLine = () => {
  if (props.disabled || props.streaming || props.isComplianceMode) return;
  inputText.value += '\n';
  nextTick(() => {
    autoResize();
  });
};

/** 输入框内容变化：自适应高度 + 超长截断。 */
const handleInput = () => {
  autoResize();

  if (inputText.value.length > MAX_CHAT_INPUT_LENGTH) {
    inputText.value = inputText.value.substring(0, MAX_CHAT_INPUT_LENGTH);
  }
};

/** textarea 高度自适应，上限 150px。 */
const autoResize = () => {
  nextTick(() => {
    if (!textareaRef.value) return;

    textareaRef.value.style.height = 'auto';
    const newHeight = Math.min(textareaRef.value.scrollHeight, 150);
    textareaRef.value.style.height = `${newHeight}px`;
  });
};

/** 重置 textarea 高度为 auto（发送/清空后调用）。 */
const resetTextareaHeight = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto';
  }
};

/** 让输入框获得焦点。 */
const focusInput = () => {
  textareaRef.value?.focus();
};

/** 清空输入框文本内容（保留上传文件列表，父级单独管理）。 */
const clearInput = () => {
  inputText.value = '';
  resetTextareaHeight();
};

/** 输入法组合开始（例如中文拼音输入过程中）：暂停 enter 发送。 */
const handleCompositionStart = () => {
  isComposing.value = true;
};

/** 输入法组合结束：恢复 enter 发送。 */
const handleCompositionEnd = () => {
  isComposing.value = false;
};

// ---- 生命周期 ----

onMounted(() => {
  if (textareaRef.value) {
    textareaRef.value.addEventListener('compositionstart', handleCompositionStart);
    textareaRef.value.addEventListener('compositionend', handleCompositionEnd);
  }
  focusInput();
});

onUnmounted(() => {
  if (textareaRef.value) {
    textareaRef.value.removeEventListener('compositionstart', handleCompositionStart);
    textareaRef.value.removeEventListener('compositionend', handleCompositionEnd);
  }
});

// 解除禁用后自动重新聚焦，方便连续输入。
watch(
  () => props.disabled,
  (newVal) => {
    if (!newVal) {
      nextTick(() => {
        focusInput();
      });
    }
  },
);

/** 对外暴露方法：供父级（AppLayout）直接调用。 */
defineExpose({
  focusInput,
  clearInput,
});
</script>

<style lang="less" scoped>
.chat-input-container {
  width: 100%;
  min-height: 88px;
  border: 1px solid #e6e6e6;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(20, 24, 31, 0.08);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
  overflow: visible;
  position: relative;
}

.chat-input-container.has-content,
.chat-input-container.is-streaming {
  border-color: #d9d9d9;
}

.chat-input-container.is-disabled {
  cursor: default;
}

.input-wrapper {
  min-height: 92px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 18px 14px;
  position: relative;
}

.textarea-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.textarea-container.has-uploaded-file {
  min-height: 72px;
}

.uploaded-file-card {
  max-width: 190px;
  height: 50px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 30px 8px 12px;
  border-radius: 7px;
  background: #f4f2f2;
  position: relative;
}

.remove-upload-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: #f56c6c;
  color: #fff;
  font-size: 14px;
  line-height: 18px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(245, 108, 108, 0.28);
  /* 默认隐藏，hover 时显示；通过父卡片 :hover 控制 */
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

/* 合规审核卡片 hover 时显示删除按钮 */
.uploaded-file-card:hover .remove-upload-btn,
/* QA 多文件卡片 hover 时显示删除按钮 */
.qa-file-card:hover .remove-upload-btn,
/* 拖拽中或处理中仍显示，便于用户发现 */
.remove-upload-btn:focus-visible {
  opacity: 1;
  pointer-events: auto;
}

.remove-upload-btn:hover {
  background: #d9363e;
}

.file-icon {
  width: 22px;
  height: 28px;
  border-radius: 4px;
  background: #d9ecff;
  color: #1f7af0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.file-info {
  min-width: 0;
}

.file-name {
  max-width: 132px;
  color: #222;
  font-size: 13px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  margin-top: 1px;
  color: #8c8c8c;
  font-size: 11px;
  line-height: 16px;
}

.chat-textarea {
  width: 100%;
  min-height: 24px;
  max-height: 120px;
  border: none;
  outline: none;
  resize: none;
  font-size: 14px;
  line-height: 22px;
  color: #333;
  background: transparent;
  font-family: inherit;
  padding: 0;
  margin-top: 3px;
  overflow-y: auto;
}

.chat-textarea::placeholder {
  color: #8c8c8c;
}

.chat-textarea:disabled {
  cursor: default;
  color: #333;
  background: transparent;
  -webkit-text-fill-color: #333;
}

.chat-textarea:read-only {
  cursor: default;
}

.input-footer {
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.footer-tools {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
}

.footer-divider {
  width: 1px;
  height: 18px;
  background: #ececec;
  flex-shrink: 0;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

.upload-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.add-btn,
.send-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.add-btn {
  background: transparent;
  color: #111;
  cursor: pointer;
}

.add-btn:hover {
  color: #1f7af0;
}

.add-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.send-btn {
  background: #e6e6e8;
  color: #fff;
  cursor: default;
  position: relative;
}

.send-btn.is-active {
  background: #1f7af0;
  cursor: pointer;
}

.send-icon {
  width: 22px;
  height: 26px;
}

.send-btn.is-active:hover {
  background: #126fe8;
  transform: translateY(-1px);
}

.send-btn.is-active:active {
  transform: translateY(0);
}

.send-btn:disabled {
  background: #e6e6e8;
  color: #fff;
  cursor: default;
}

.stop-btn {
  overflow: visible;
}

.stop-icon {
  width: 26px;
  height: 26px;
}

.stop-tooltip {
  position: absolute;
  right: -8px;
  bottom: calc(100% + 10px);
  padding: 7px 9px;
  border-radius: 5px;
  background: #2f2f2f;
  color: #fff;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.stop-tooltip::after {
  content: '';
  position: absolute;
  right: 13px;
  top: 100%;
  border: 5px solid transparent;
  border-top-color: #2f2f2f;
}

.stop-btn:hover .stop-tooltip {
  opacity: 1;
  transform: translateY(0);
}

/* ========== 智能问答多文件卡片列表样式 ========== */

/** 多文件容器：横向排列 + 自动换行，支持任意数量文件依次展示。 */
.qa-uploaded-file-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  width: 100%;
  align-items: flex-start;
}

/** QA 单文件卡片样式：整体与合规审核保持一致，仅宽度限制更宽松。 */
.qa-file-card {
  max-width: 220px;
  height: 50px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 30px 8px 12px;
  border-radius: 7px;
  background: #f4f2f2;
  position: relative;
  flex-shrink: 0;
  transition: box-shadow 0.2s ease, background 0.2s ease;
}

/** QA 上传中状态：图标呼吸动画 + 背景变淡。 */
.qa-file-card.is-uploading {
  background: #eef3fb;

  .file-icon {
    animation: fileProcessingPulse 1.2s ease-in-out infinite;
  }
}

</style>


<style scoped>
/** 合规审核处理中 + QA 上传中共用的图标呼吸动画。 */
.uploaded-file-card.processing .file-icon {
  animation: fileProcessingPulse 1.2s ease-in-out infinite;
}

@keyframes fileProcessingPulse {
  0%, 100% { opacity: 0.45; transform: scale(0.96); }
  50% { opacity: 1; transform: scale(1.04); }
}
</style>
