<!--
  外部嵌套起草页的结果文件区（挂在每一轮 AI 回复下）。

  按该轮 docx 状态机渲染三态：
  saving（转换/获取真实文件）→ done（附件卡片 + 保存到草稿箱）→ error（失败重试，含具体原因）。
  "重新起草"只在最后一轮展示，由父级通过 showBack 控制。
  所有动作通过 emit 上抛给父页面执行，本组件不直接触碰接口。
-->
<template>
  <div v-if="record && record.status !== 'idle'" class="edr-docx">
    <p v-if="record.status === 'saving'" class="edr-status">
      <span class="edr-spinner"></span>{{ record.phase === 'downloading' ? '正在获取起草附件，请等待。' : '正在生成起草附件，请等待。' }}
    </p>
    <template v-else-if="record.status === 'done' && record.attachment">
      <p class="edr-status ok">起草完成，已保存为docx格式文件，具体内容可查看附件。</p>
      <button type="button" class="edr-attachment" @click="emit('downloadAttachment')">
        <span class="edr-attachment-icon">W</span>
        <span class="edr-attachment-name">{{ record.attachment.fileName }}</span>
      </button>
      <p v-if="record.boxError" class="edr-error">{{ record.boxError }}</p>
      <!-- 与确认的流程图一致：附件、保存按钮、重新起草依次纵向排列。 -->
      <div class="edr-actions">
        <button type="button" class="edr-save-box" :disabled="record.sentToBox || record.sending" @click="emit('saveToBox')">
          {{ record.sending ? '正在等待保存结果…' : record.sentToBox ? (record.simulated ? '已模拟保存到草稿箱' : '已保存到草稿箱') : '保存到草稿箱' }}
        </button>
        <button v-if="showBack" type="button" class="edr-back" @click="emit('back')">重新起草</button>
      </div>
    </template>
    <p v-else-if="record.status === 'error'" class="edr-error">
      起草附件准备失败<span v-if="record.error">：{{ record.error }}</span>
      <button type="button" class="edr-retry" @click="emit('retry')">重试</button>
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * 外部起草结果区脚本：纯展示组件，只接收本轮的 docx 状态对象，动作全部 emit 给父页面。
 */
import type { DraftDocxRecord } from '@/composables/useExternalDraftDocx';

interface Props {
  /** 本轮起草的 docx 状态（不存在时不渲染任何内容）。 */
  record?: DraftDocxRecord | null;
  /** 是否展示"重新起草"快捷按钮（仅最后一轮）。 */
  showBack?: boolean;
}

withDefaults(defineProps<Props>(), {
  record: null,
  showBack: false,
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
    max-width: 100%;
    box-sizing: border-box;
    font: inherit;
    text-align: left;
    padding: 10px 14px;
    border: 1px solid #e4e7ed;
    border-radius: 6px;
    background: #fafafa;
    cursor: pointer;

    &:hover {
      border-color: #3b8cff;
    }

    .edr-attachment-icon {
      flex-shrink: 0;
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
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }

  /* 保存为主要操作，重新起草在下方展示；窄 iframe 内按钮不溢出。 */
  .edr-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    margin-top: 14px;
  }

  .edr-save-box {
    padding: 10px 0;
    width: 220px;
    max-width: 100%;
    border: 1px solid transparent;
    border-radius: 6px;
    background: #3b8cff;
    color: #fff;
    font-size: 15px;
    cursor: pointer;

    &:disabled {
      background: #a0cfff;
      cursor: not-allowed;
    }
  }

  .edr-back {
    padding: 10px 22px;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    background: #fff;
    color: #606266;
    font-size: 15px;
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
