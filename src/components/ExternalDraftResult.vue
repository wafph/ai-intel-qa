<!--
  外部嵌套起草页的结果文件区。

  按 docx 生成状态机渲染三态：
  saving（正在保存起草文件）→ done（附件卡片 + 保存到草稿箱 + 重新起草）→ error（失败重试）。
  所有动作通过 emit 上抛给父页面执行，本组件不直接触碰接口。
-->
<template>
  <div class="edr-docx">
    <p v-if="docxStatus === 'saving'" class="edr-status">
      <span class="edr-spinner"></span>正在保存起草文件，请等待。
    </p>
    <template v-else-if="docxStatus === 'done' && attachment">
      <p class="edr-status ok">起草完成，已保存为docx格式文件，具体内容可查看附件。</p>
      <div class="edr-attachment" @click="emit('downloadAttachment')">
        <span class="edr-attachment-icon">W</span>
        <span class="edr-attachment-name">{{ attachment.fileName }}</span>
      </div>
      <button type="button" class="edr-save-box" :disabled="hasSentToBox" @click="emit('saveToBox')">
        {{ hasSentToBox ? '已保存到草稿箱' : '保存到草稿箱' }}
      </button>
      <button type="button" class="edr-back" @click="emit('back')">重新起草</button>
    </template>
    <p v-else-if="docxStatus === 'error'" class="edr-error">
      起草文件保存失败<span v-if="errorText">：{{ errorText }}</span>
      <button type="button" class="edr-retry" @click="emit('retry')">重试</button>
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * 外部起草结果区脚本：纯展示组件，状态与动作全部经 props/emits 与父页面交互。
 */
import type { DocxSaveStatus, DraftAttachment } from '@/composables/useExternalDraftDocx';

interface Props {
  /** docx 生成状态机。 */
  docxStatus?: DocxSaveStatus;
  /** 生成失败的具体原因（后端响应或异常文案）。 */
  errorText?: string;
  /** 生成成功后的附件信息。 */
  attachment?: DraftAttachment | null;
  /** 是否已发送过保存到草稿箱通知。 */
  hasSentToBox?: boolean;
}

withDefaults(defineProps<Props>(), {
  docxStatus: 'idle',
  errorText: '',
  attachment: null,
  hasSentToBox: false,
});

const emit = defineEmits<{
  /** 点击附件卡片下载。 */
  (e: 'downloadAttachment'): void;
  /** 点击保存到草稿箱。 */
  (e: 'saveToBox'): void;
  /** 保存失败重试。 */
  (e: 'retry'): void;
  /** 返回表单重新起草。 */
  (e: 'back'): void;
}>();
</script>

<style scoped>
/* 结果文件区：与流式正文之间以虚线分隔 */
.edr-docx {
  margin-top: 16px;
  border-top: 1px dashed #e4e7ed;
  padding-top: 14px;

  .edr-status {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    color: #606266;

    &.ok {
      color: #67c23a;
    }
  }

  .edr-attachment {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border: 1px solid #e4e7ed;
    border-radius: 6px;
    background: #fafafa;
    cursor: pointer;

    &:hover {
      border-color: #3b8cff;
    }

    .edr-attachment-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border-radius: 4px;
      background: #2b579a;
      color: #fff;
      font-weight: 700;
      font-size: 16px;
    }

    .edr-attachment-name {
      color: #303133;
    }
  }

  .edr-save-box {
    display: block;
    margin-top: 14px;
    padding: 10px 0;
    width: 220px;
    border: none;
    border-radius: 6px;
    background: #3b8cff;
    color: #fff;
    font-size: 14px;
    cursor: pointer;

    &:disabled {
      background: #a0cfff;
      cursor: not-allowed;
    }
  }

  .edr-back {
    margin-top: 12px;
    margin-left: 12px;
    padding: 8px 18px;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    background: #fff;
    color: #606266;
    cursor: pointer;

    &:hover {
      color: #3b8cff;
      border-color: #3b8cff;
    }
  }

  .edr-error {
    margin: 0;
    color: #f56c6c;

    .edr-retry {
      margin-left: 8px;
      border: none;
      background: none;
      color: #3b8cff;
      cursor: pointer;
      font-size: 12px;
    }
  }
}

/* 保存中的旋转指示（原生 CSS 嵌套要求 @keyframes 置于顶层） */
.edr-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #c8c9cc;
  border-top-color: #3b8cff;
  animation: edr-spin 0.8s linear infinite;
}

@keyframes edr-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
