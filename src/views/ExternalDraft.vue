<!--
  外部嵌套起草页（主系统 iframe 嵌入专用）。

  左右布局：左侧表单（ExternalDraftForm：文件要求描述 + 禁用态展示的合同长度/强弱势），
  右侧输出（流式渲染 + ExternalDraftResult 结果文件区）。
  起草链路：复用辅助起草 draft 流式任务，仅传描述文本，展示字段不参与起草参数；
  流式结束自动调 markdown-word convert 生成 docx 附件；"保存到草稿箱" postMessage 通知主系统。
  鉴权沿用全局 agentAccess：main.ts 启动时已完成 URL agentToken / postMessage SET_AGENTTOKEN 初始化。
-->
<template>
  <div class="external-draft">
    <header class="ed-title">文件起草 一键开启智能起草</header>

    <div class="ed-tabs">
      <button type="button" class="ed-tab" :class="{ active: draftMode === 'ai' }" @click="draftMode = 'ai'">
        AI起草
      </button>
      <button
        type="button"
        class="ed-tab"
        :class="{ active: draftMode === 'template' }"
        @click="draftMode = 'template'"
      >
        模板起草
      </button>
    </div>

    <template v-if="draftMode === 'ai'">
      <div class="ed-body">
        <!-- 左栏：起草表单 -->
        <div class="ed-left">
          <ExternalDraftForm
            :length="form.length"
            :strength="form.strength"
            :submitting="isDrafting"
            @start="handleStart"
          />
        </div>

        <!-- 右栏：流式输出与结果文件 -->
        <div class="ed-right">
          <div class="ed-output">
            <div v-if="draftError" class="ed-fail">
              <p class="ed-error-text">{{ draftError }}</p>
              <button type="button" class="ed-back-btn" @click="handleBack">返回修改</button>
            </div>
            <template v-else>
              <div v-if="!hasOutput && !isDrafting" class="ed-placeholder">
                填写左侧表单并点击“开始起草”，起草结果将在此展示
              </div>
              <template v-if="hasOutput || isDrafting">
                <div ref="streamRef" class="ed-stream" v-html="renderedContent"></div>
                <div v-if="isDrafting" class="ed-thinking">
                  <span class="ed-thinking-dot"></span>正在起草，请稍候…
                </div>
                <!-- 结果文件区：先自动保存 docx，再提供草稿箱入口 -->
                <ExternalDraftResult
                  v-if="isDone && !isDrafting"
                  :docx-status="docxStatus"
                  :error-text="docxError"
                  :attachment="attachment"
                  :has-sent-to-box="hasSentToBox"
                  @download-attachment="downloadAttachment"
                  @save-to-box="saveToDraftBox"
                  @retry="retrySaveDocx"
                  @back="handleBack"
                />
              </template>
            </template>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="ed-template-tip">模板起草暂未开放，敬请期待</div>

    <!-- 授权兜底：bootstrap 未完成授权时遮挡操作 -->
    <div v-if="!authed" class="ed-auth-mask">
      <p>未获取到访问授权，请从主系统进入</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 外部嵌套起草页脚本。
 *
 * 仅负责左右栏编排与能力接线：ExternalDraftForm（表单）、useExternalDraftStream（任务创建 + SSE 订阅）、
 * useExternalDraftDocx（docx 生成 + 草稿箱通知）、ExternalDraftResult（结果文件区）。
 */
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { renderMarkdown } from '@/utils/markdown';
import { getBearerToken } from '@/services/authStorage';
import { useExternalDraftStream } from '@/composables/useExternalDraftStream';
import { useExternalDraftDocx } from '@/composables/useExternalDraftDocx';
import ExternalDraftForm from '@/components/ExternalDraftForm.vue';
import ExternalDraftResult from '@/components/ExternalDraftResult.vue';

// 授权判断：main.ts 的 bootstrap 阶段已统一初始化会话，这里仅同步读取结果
const authed = Boolean(getBearerToken());

// 展示性字段：支持主系统经 URL 参数透传展示值（length/strength），不参与起草参数
const urlParams = new URLSearchParams(window.location.search);
const form = reactive({
  length: urlParams.get('length') === 'simple' ? 'simple' : 'detailed',
  strength: ['strong', 'neutral', 'weak'].includes(urlParams.get('strength') || '')
    ? (urlParams.get('strength') as string)
    : 'strong',
});

/** 起草方式 Tab：AI起草可用；模板起草仅占位。 */
const draftMode = ref<'ai' | 'template'>('ai');
/** 起草失败文案（空串表示未失败）。 */
const draftError = ref('');
/** 流式输出容器引用（用于自动滚动）。 */
const streamRef = ref<HTMLElement | null>(null);

const { isDrafting, isDone, draftContent, startDraft, detach, reset: resetStream } = useExternalDraftStream();
const {
  docxStatus,
  docxError,
  attachment,
  hasSentToBox,
  saveDraftDocx,
  downloadAttachment,
  saveToDraftBox,
  reset: resetDocx,
} = useExternalDraftDocx();

const renderedContent = computed(() => renderMarkdown(draftContent.value));

/** 右栏是否已有可展示的输出内容。 */
const hasOutput = computed(() => Boolean(draftContent.value.trim()));

// 流式输出过程中自动滚到底部
watch(draftContent, async () => {
  await nextTick();
  const el = streamRef.value;
  if (el) el.scrollTop = el.scrollHeight;
});

/** 最近一次起草的 qaId（docx 转换与失败重试复用）。 */
let lastQaId = '';

/** 表单提交"开始起草"：串联 起草 → 自动保存 docx。 */
const handleStart = async (description: string) => {
  draftError.value = '';
  try {
    const { content, qaId } = await startDraft(description);
    lastQaId = qaId;
    if (!content.trim()) {
      draftError.value = '起草未生成内容，请调整描述后重试';
      return;
    }
    // 自动保存起草结果文件：流式结束后立即生成 docx 附件
    await saveDraftDocx(content, qaId);
  } catch (error) {
    draftError.value = error instanceof Error ? error.message : '起草失败，请稍后重试';
    ElMessage.error(draftError.value);
  }
};

/** docx 保存失败后的重试。 */
const retrySaveDocx = () => {
  if (lastQaId) void saveDraftDocx(draftContent.value, lastQaId);
};

/** 重新起草/返回修改：清空右栏输出与结果文件状态，左栏表单保留描述。 */
const handleBack = () => {
  draftError.value = '';
  resetDocx();
  resetStream();
};

// 路由离开时中断未完成的流式订阅
onUnmounted(() => detach());
</script>

<style scoped>
/* 外部起草页整体：独立路由、无 AppLayout 壳，背景与主系统嵌套环境保持一致 */
.external-draft {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 24px 32px 48px;
  background: #f5f7fa;
  font-size: 14px;
  color: #303133;

  .ed-title {
    margin: 16px 0 24px;
    text-align: center;
    font-size: 26px;
    font-weight: 700;
    color: #1f2329;
  }

  /* AI起草 / 模板起草 切换 Tab */
  .ed-tabs {
    display: flex;
    justify-content: center;
    margin-bottom: 24px;

    .ed-tab {
      padding: 8px 20px;
      border: 1px solid #dcdfe6;
      background: #fff;
      color: #606266;
      cursor: pointer;
      font-size: 14px;

      &:first-child {
        border-radius: 6px 0 0 6px;
      }
      &:last-child {
        border-radius: 0 6px 6px 0;
      }
      &.active {
        background: #3b8cff;
        border-color: #3b8cff;
        color: #fff;
      }
    }
  }

  /* 左右分栏：左表单 右输出 */
  .ed-body {
    max-width: 1180px;
    margin: 0 auto;
    display: flex;
    gap: 20px;
    align-items: flex-start;

    .ed-left {
      width: 400px;
      flex-shrink: 0;
      box-sizing: border-box;
      background: #fff;
      border-radius: 8px;
      padding: 20px;
    }

    .ed-right {
      flex: 1;
      min-width: 0;

      .ed-output {
        box-sizing: border-box;
        min-height: 420px;
        background: #fff;
        border-radius: 8px;
        padding: 20px 24px;

        /* 起草前空态占位 */
        .ed-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 360px;
          color: #a8abb2;
          font-size: 14px;
        }

        .ed-stream {
          max-height: 52vh;
          overflow-y: auto;
          line-height: 1.7;
          word-break: break-word;

          /* markdown 排版基础样式（v-html 内容需 :deep 穿透） */
          :deep(h1, h2, h3) {
            margin: 12px 0 8px;
            line-height: 1.4;
          }
          :deep(p) {
            margin: 6px 0;
          }
          :deep(ul, ol) {
            margin: 6px 0;
            padding-left: 22px;
          }
          :deep(table) {
            border-collapse: collapse;
            margin: 8px 0;
          }
          :deep(td, th) {
            border: 1px solid #dcdfe6;
            padding: 4px 8px;
          }
        }

        /* 流式进行中的提示 */
        .ed-thinking {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          color: #606266;

          .ed-thinking-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #3b8cff;
            animation: ed-pulse 1s ease-in-out infinite;
          }
        }

        /* 起草失败态 */
        .ed-fail {
          text-align: center;
          padding: 24px 0;

          .ed-error-text {
            margin: 0 0 16px;
            color: #f56c6c;
          }
        }

        .ed-back-btn {
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
      }
    }
  }

  /* 模板起草占位 */
  .ed-template-tip {
    max-width: 720px;
    margin: 40px auto;
    padding: 40px 0;
    text-align: center;
    color: #909399;
    background: #fff;
    border-radius: 8px;
  }

  /* 授权兜底遮罩 */
  .ed-auth-mask {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.96);
    color: #909399;
    z-index: 10;
  }
}

@keyframes ed-pulse {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
