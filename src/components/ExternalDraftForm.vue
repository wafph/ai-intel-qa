<!--
  外部嵌套起草页的表单区。

  文件要求描述为唯一必填业务字段；合同长度/强弱势按产品约定为禁用态纯展示，
  不参与起草参数。提交时仅透传描述文本给父页面。
-->
<template>
  <div class="edf-form">
    <div class="edf-field">
      <label class="edf-label required">文件要求描述</label>
      <textarea
        ref="textareaRef"
        v-model="description"
        class="edf-textarea"
        rows="5"
        placeholder="请尽量详细地描述您的文件生成需求，包括文件名称、业务背景和核心诉求等，信息越详细，生成效果越好哦！"
      ></textarea>
      <p v-if="descriptionError" class="edf-error-text">请填写文件描述</p>
    </div>
    <div class="edf-field">
      <label class="edf-label">合同长度</label>
      <div class="edf-radios">
        <span class="edf-radio" :class="{ checked: length === 'detailed' }">
          <span class="edf-radio-dot"></span>详细版
        </span>
        <span class="edf-radio" :class="{ checked: length === 'simple' }">
          <span class="edf-radio-dot"></span>简洁版
        </span>
      </div>
    </div>
    <div class="edf-field">
      <label class="edf-label">强弱势</label>
      <div class="edf-radios">
        <span class="edf-radio" :class="{ checked: strength === 'strong' }">
          <span class="edf-radio-dot"></span>强势
        </span>
        <span class="edf-radio" :class="{ checked: strength === 'neutral' }">
          <span class="edf-radio-dot"></span>中立
        </span>
        <span class="edf-radio" :class="{ checked: strength === 'weak' }">
          <span class="edf-radio-dot"></span>弱势
        </span>
      </div>
    </div>
    <button type="button" class="edf-submit" :disabled="submitting" @click="handleSubmit">开始起草</button>
  </div>
</template>

<script setup lang="ts">
/**
 * 外部起草表单脚本：仅做描述必填校验与提交透传。
 */
import { ref } from 'vue';

interface Props {
  /** 合同长度展示值（禁用态）。 */
  length?: string;
  /** 强弱势展示值（禁用态）。 */
  strength?: string;
  /** 父级起草进行中，禁用提交按钮。 */
  submitting?: boolean;
}

withDefaults(defineProps<Props>(), {
  length: 'detailed',
  strength: 'strong',
  submitting: false,
});

const emit = defineEmits<{
  /** 提交起草：仅携带描述文本。 */
  (e: 'start', description: string): void;
}>();

/** 文件要求描述输入。 */
const description = ref('');
/** 描述输入框，校验失败时定位过去。 */
const textareaRef = ref<HTMLTextAreaElement | null>(null);
/** 描述必填校验提示。 */
const descriptionError = ref(false);

/** 提交起草：空描述拦截并定位输入框，合法则透传给父页面。 */
const handleSubmit = () => {
  if (!description.value.trim()) {
    descriptionError.value = true;
    textareaRef.value?.focus();
    return;
  }
  descriptionError.value = false;
  emit('start', description.value.trim());
};

/** 供页面顶部「AI起草」入口调用：与点击开始起草完全一致。 */
defineExpose({ submit: handleSubmit });
</script>

<style scoped>
/* 外部起草表单：位于页面左栏，宽度由父级栏宽决定 */
.edf-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;

  .edf-label {
    display: block;
    margin-bottom: 6px;
    font-weight: 600;
    color: #303133;

    &.required::before {
      content: '*';
      color: #f56c6c;
      margin-right: 4px;
    }
  }

  .edf-textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 12px 14px;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    font-size: 16px;
    line-height: 1.6;
    color: #303133;
    background: #fff;
    resize: vertical;
    outline: none;

    &:focus {
      border-color: #3b8cff;
    }
  }

  .edf-radios {
    display: flex;
    gap: 24px;

    .edf-radio {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #909399;

      .edf-radio-dot {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 1px solid #dcdfe6;
        background: #fff;
        box-sizing: border-box;
      }

      &.checked {
        color: #3b8cff;

        .edf-radio-dot {
          border: 4px solid #3b8cff;
        }
      }
    }
  }

  .edf-submit {
    margin-top: 8px;
    padding: 13px 0;
    border: none;
    border-radius: 6px;
    background: #3b8cff;
    color: #fff;
    font-size: 16px;
    cursor: pointer;

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .edf-error-text {
    margin: 4px 0 0;
    font-size: 13px;
    color: #f56c6c;
  }
}
</style>
