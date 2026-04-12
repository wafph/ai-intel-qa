<template>
  <div class="chat-input-container" :class="{ 'has-content': inputText.trim(), 'is-disabled': disabled }">
    <div class="input-wrapper">
      <div class="textarea-container">
        <textarea
          ref="textareaRef"
          v-model="inputText"
          :placeholder="placeholder"
          :disabled="disabled"
          class="chat-textarea"
          @keydown.enter.exact.prevent="handleSend"
          @keydown.enter.shift.exact.prevent="handleNewLine"
          @input="handleInput"
          rows="1"
        />
        <div v-if="inputText.trim()" class="word-count">
          {{ inputText.length }}/2000
        </div>
      </div>
      
      <div class="action-buttons">
        <button
          v-if="!disabled"
          class="send-btn"
          :disabled="!inputText.trim()"
          @click="handleSend"
        >
          <svg
            class="send-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
        
        <div v-else class="loading-indicator">
          <div class="loading-spinner"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onUnmounted } from 'vue'

interface Props {
  placeholder?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请输入内容...',
  disabled: false
})

const emit = defineEmits<{
  send: [content: string]
}>()

// 响应式状态
const inputText = ref<string>('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const isComposing = ref<boolean>(false)

// 方法
const handleSend = () => {
  if (isComposing.value || !inputText.value.trim() || props.disabled) {
    return
  }
  
  const content = inputText.value.trim()
  emit('send', content)
  inputText.value = ''
  resetTextareaHeight()
}

const handleNewLine = () => {
  if (props.disabled) return
  inputText.value += '\n'
  nextTick(() => {
    autoResize()
  })
}

const handleInput = () => {
  autoResize()
  
  if (inputText.value.length > 2000) {
    inputText.value = inputText.value.substring(0, 2000)
  }
}

const autoResize = () => {
  nextTick(() => {
    if (!textareaRef.value) return
    
    textareaRef.value.style.height = 'auto'
    const newHeight = Math.min(textareaRef.value.scrollHeight, 150)
    textareaRef.value.style.height = newHeight + 'px'
  })
}

const resetTextareaHeight = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
  }
}

const focusInput = () => {
  if (textareaRef.value) {
    textareaRef.value.focus()
  }
}

// 处理组合输入
const handleCompositionStart = () => {
  isComposing.value = true
}

const handleCompositionEnd = () => {
  isComposing.value = false
}

// 生命周期
onMounted(() => {
  if (textareaRef.value) {
    textareaRef.value.addEventListener('compositionstart', handleCompositionStart)
    textareaRef.value.addEventListener('compositionend', handleCompositionEnd)
  }
  focusInput()
})

onUnmounted(() => {
  if (textareaRef.value) {
    textareaRef.value.removeEventListener('compositionstart', handleCompositionStart)
    textareaRef.value.removeEventListener('compositionend', handleCompositionEnd)
  }
})

// 监听disabled状态变化
watch(() => props.disabled, (newVal) => {
  if (!newVal) {
    nextTick(() => {
      focusInput()
    })
  }
})

// 暴露方法
defineExpose({
  focusInput
})
</script>

<style lang="less" scoped>
.chat-input-container {
  background: #ffffff;
  border-radius: 12px;
  border: 2px solid #e4e7ed;
  transition: all 0.3s;
  overflow: hidden;
  position: relative;
}

.chat-input-container.has-content {
  border-color: #1890ff;
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
}

.chat-input-container.is-disabled {
  background: #fafafa;
  border-color: #f0f0f0;
  opacity: 0.8;
  cursor: not-allowed;
}

.chat-input-container.is-disabled .chat-textarea {
  background: #fafafa;
  cursor: not-allowed;
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 12px;
  position: relative;
}

.textarea-container {
  flex: 1;
  position: relative;
}

.chat-textarea {
  width: 100%;
  min-height: 24px;
  max-height: 150px;
  border: none;
  outline: none;
  resize: none;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  background: transparent;
  font-family: inherit;
  padding: 0;
  overflow-y: auto;
}

.chat-textarea::placeholder {
  color: #bfbfbf;
}

.chat-textarea:disabled {
  color: #bfbfbf;
  cursor: not-allowed;
  background: #f5f5f5;
  border-radius: 6px;
  padding: 8px;
}

.word-count {
  position: absolute;
  bottom: -20px;
  right: 0;
  font-size: 12px;
  color: #bfbfbf;
  opacity: 0.7;
  transition: all 0.3s;
}

.chat-input-container.has-content .word-count {
  color: #1890ff;
  opacity: 1;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.send-btn {
  width: 40px;
  height: 40px;
  background: #1890ff;
  padding: 10px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
}

.send-btn:hover:not(:disabled) {
  background: #40a9ff;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.2);
}

.send-btn:active:not(:disabled) {
  transform: translateY(0);
}

.send-btn:disabled {
  background: #d9d9d9;
}
</style>