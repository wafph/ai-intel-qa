<!--
  通用输入框组件，支持发送、停止、换行和自适应高度。
  本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
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
      <div
        class="textarea-container"
        :class="{ 'has-uploaded-file': isComplianceMode && uploadedFileName }"
      >
        <div
          v-if="isComplianceMode && uploadedFileName"
          class="uploaded-file-card"
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

      <div class="input-footer">
        <div class="footer-tools">
          <el-upload
            v-if="isComplianceMode"
            class="upload-action"
            :http-request="customUpload"
            :show-file-list="false"
            :disabled="streaming || isComplianceFileProcessing"
          >
            <button class="add-btn" type="button" aria-label="上传文件" title="上传文件">
              <svg class="add-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </el-upload>

          <span v-if="isComplianceMode" class="footer-divider"></span>
          <slot v-if="isComplianceMode"></slot>
        </div>

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

interface Props {
  placeholder?: string;
  disabled?: boolean;
  isComplianceMode?: boolean;
  streaming?: boolean;
  customUpload?: (options: any) => Promise<void>;
  uploadedFileName?: string;
  uploadedFileMeta?: string;
  isComplianceFileProcessing?: boolean;
  complianceFileProcessingText?: string;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请输入内容...',
  disabled: false,
  isComplianceMode: false,
  streaming: false,
  customUpload: undefined,
  uploadedFileName: '',
  uploadedFileMeta: '',
  isComplianceFileProcessing: false,
  complianceFileProcessingText: '',
});

const emit = defineEmits<{
  send: [content: string];
  stop: [];
  'remove-upload': [];
}>();

const inputText = ref<string>('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const isComposing = ref<boolean>(false);
const MAX_CHAT_INPUT_LENGTH = 50000;
const fileIconText = computed(() => {
  const ext = (props.uploadedFileName || '').split('.').pop()?.toUpperCase();
  return ext ? ext.slice(0, 3) : 'W';
});
/** 封装当前模块内的业务逻辑：hasInputContent。 */
const hasInputContent = computed(() => Boolean(inputText.value.trim()));

/** 判断条件是否成立：isSendButtonDisabled。 */
const isSendButtonDisabled = computed(() => {
  if (props.streaming) return false;
  if (props.disabled) return true;
  if (props.isComplianceMode) return Boolean(props.isComplianceFileProcessing);
  return !hasInputContent.value;
});

/** 处理用户交互或组件事件：handleSend。 */
const handleSend = () => {
  if (isComposing.value || props.disabled || props.streaming) {
    return;
  }

  const content = inputText.value.trim();
  if (!content && !props.isComplianceMode) {
    return;
  }

  emit('send', content);
  inputText.value = '';
  resetTextareaHeight();
};

/** 处理用户交互或组件事件：handleStop。 */
const handleStop = () => {
  emit('stop');
};

/** 删除合规审核已上传文件。 */
const handleRemoveUpload = () => {
  emit('remove-upload');
};

/** 处理用户交互或组件事件：handleNewLine。 */
const handleNewLine = () => {
  if (props.disabled || props.streaming || props.isComplianceMode) return;
  inputText.value += '\n';
  nextTick(() => {
    autoResize();
  });
};

/** 处理用户交互或组件事件：handleInput。 */
const handleInput = () => {
  autoResize();

  if (inputText.value.length > MAX_CHAT_INPUT_LENGTH) {
    inputText.value = inputText.value.substring(0, MAX_CHAT_INPUT_LENGTH);
  }
};

/** 自动调整输入框等 UI 状态：autoResize。 */
const autoResize = () => {
  nextTick(() => {
    if (!textareaRef.value) return;

    textareaRef.value.style.height = 'auto';
    const newHeight = Math.min(textareaRef.value.scrollHeight, 150);
    textareaRef.value.style.height = `${newHeight}px`;
  });
};

/** 重置组件状态：resetTextareaHeight。 */
const resetTextareaHeight = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto';
  }
};

/** 封装当前模块内的业务逻辑：focusInput。 */
const focusInput = () => {
  textareaRef.value?.focus();
};

/** 清理输入、搜索或缓存状态：clearInput。 */
const clearInput = () => {
  inputText.value = '';
  resetTextareaHeight();
};

/** 处理用户交互或组件事件：handleCompositionStart。 */
const handleCompositionStart = () => {
  isComposing.value = true;
};

/** 处理用户交互或组件事件：handleCompositionEnd。 */
const handleCompositionEnd = () => {
  isComposing.value = false;
};

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
</style>


<style scoped>
.uploaded-file-card.processing .file-icon {
  animation: fileProcessingPulse 1.2s ease-in-out infinite;
}

@keyframes fileProcessingPulse {
  0%, 100% { opacity: 0.45; transform: scale(0.96); }
  50% { opacity: 1; transform: scale(1.04); }
}
</style>
