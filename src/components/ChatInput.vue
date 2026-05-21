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
      <div class="textarea-container">
        <textarea
          ref="textareaRef"
          v-model="inputText"
          :placeholder="placeholder"
          :disabled="isComplianceMode ? false : disabled"
          class="chat-textarea"
          rows="1"
          @keydown.enter.exact.prevent="handleSend"
          @keydown.enter.shift.exact.prevent="handleNewLine"
          @input="handleInput"
        />
      </div>

      <div class="action-buttons">
        <button class="add-btn" type="button" aria-label="添加" title="添加">
          <svg class="add-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <button
          v-if="streaming"
          class="send-btn stop-btn"
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
          type="button"
          :disabled="isSendButtonDisabled"
          aria-label="发送"
          @click="handleSend"
        >
          <svg class="send-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 5.5 5.75 12H10v6h4v-6h4.25L12 5.5Z" />
          </svg>
        </button>
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
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请输入内容...',
  disabled: false,
  isComplianceMode: false,
  streaming: false,
});

const emit = defineEmits<{
  send: [content: string];
  stop: [];
}>();

const inputText = ref<string>('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const isComposing = ref<boolean>(false);
const hasInputContent = computed(() => Boolean(inputText.value.trim()));

const isSendButtonDisabled = computed(() => {
  if (props.streaming) return false;
  if (props.disabled) return true;
  if (props.isComplianceMode) return false;
  return !hasInputContent.value;
});

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

const handleStop = () => {
  emit('stop');
};

const handleNewLine = () => {
  if (props.disabled || props.streaming) return;
  inputText.value += '\n';
  nextTick(() => {
    autoResize();
  });
};

const handleInput = () => {
  autoResize();

  if (inputText.value.length > 2000) {
    inputText.value = inputText.value.substring(0, 2000);
  }
};

const autoResize = () => {
  nextTick(() => {
    if (!textareaRef.value) return;

    textareaRef.value.style.height = 'auto';
    const newHeight = Math.min(textareaRef.value.scrollHeight, 150);
    textareaRef.value.style.height = `${newHeight}px`;
  });
};

const resetTextareaHeight = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto';
  }
};

const focusInput = () => {
  textareaRef.value?.focus();
};

const clearInput = () => {
  inputText.value = '';
  resetTextareaHeight();
};

const handleCompositionStart = () => {
  isComposing.value = true;
};

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
  min-height: 100px;
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
  min-height: 105px;
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 16px 20px 18px;
  position: relative;
}

.textarea-container {
  flex: 1;
  align-self: stretch;
  display: flex;
  align-items: flex-start;
}

.chat-textarea {
  width: 100%;
  min-height: 24px;
  max-height: 150px;
  border: none;
  outline: none;
  resize: none;
  font-size: 14px;
  line-height: 22px;
  color: #333;
  // background: transparent;
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

.action-buttons {
  display: flex;
  align-items: center;
  gap: 14px;
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
  color: #6b5f54;
  cursor: default;
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
  background: #1f7af0;
  color: #fff;
  cursor: pointer;
  position: relative;
}

.send-icon {
  width: 17px;
  height: 17px;
}

.send-btn:hover:not(:disabled) {
  background: #126fe8;
  transform: translateY(-1px);
}

.send-btn:active:not(:disabled) {
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
  width: 18px;
  height: 18px;
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
