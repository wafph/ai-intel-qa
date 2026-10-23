<!--
  外部嵌套起草页（主系统 iframe 嵌入专用）。

  对话式布局：顶部标题栏，中间消息流（用户提问靠右、AI 回复靠左），底部常驻输入框可再次提出起草需求。
  首次进入为“一键开启智能起草”入口 + 仅含文件要求描述的居中表单，
  提交后切换为对话形态；不提供模板起草。
  起草链路：复用辅助起草 draft 流式任务，仅传描述文本；每轮流式结束自动转换并获取真实 docx 附件，
  每轮的附件都能单独下载、单独保存到主系统草稿箱（postMessage 携带正文与 docx）。
  鉴权使用 externalDraftAccess 独立凭证；会话初始化仍保留，页面不展示新建会话按钮。
-->
<template>
  <div class="external-draft">
    <header v-if="hasStarted" class="ed-title">
      <span>文件起草</span>
    </header>

    <!-- 首次进入：智能起草入口（居中标题 + AI起草按钮） -->
    <div v-if="authed && !hasStarted" class="ed-hero">
      <h1 class="ed-hero-title">一键开启智能起草</h1>
      <button type="button" class="ed-hero-btn" @click="triggerDraft">AI起草</button>
    </div>

    <!-- 首次进入：居中表单卡片 -->
    <div v-if="authed" v-show="!hasStarted" class="ed-form-scroll">
      <div class="ed-form-wrap">
        <ExternalDraftForm
          :key="sessionId"
          ref="formRef"
          :length="form.length"
          :strength="form.strength"
          :submitting="busy"
          @start="handleSubmit"
        />
      </div>
    </div>

    <!-- 起草阶段：对话流 + 底部输入框 -->
    <div v-if="authed" v-show="hasStarted" class="ed-chat">
      <ExternalDraftChat
        :turns="turns"
        :streaming="isDrafting"
        :streaming-question="streamingQuestion"
        :streaming-content="draftContent"
        :error="draftError"
      >
        <!-- 每一轮 AI 回复下方各自渲染本轮的附件与草稿箱入口 -->
        <template #result="{ index }">
          <ExternalDraftResult
            :record="recordOf(index)"
            :show-back="index === turns.length - 1"
            @download-attachment="downloadByIndex(index)"
            @save-to-box="saveToBoxByIndex(index)"
            @retry="retrySaveDocx(index)"
            @back="redraftTurn(index)"
          />
        </template>
      </ExternalDraftChat>
      <ExternalDraftComposer
        ref="composerRef"
        :streaming="isDrafting"
        :disabled="busy && !isDrafting"
        @submit="handleSubmit"
        @stop="handleStop"
      />
    </div>

    <div v-if="!authed" class="ed-auth-mask" role="status" aria-live="polite">
      <p class="ed-auth-title">{{ access.status === 'validating' ? '正在校验访问授权' : '等待主系统授权' }}</p>
      <p class="ed-auth-reason">{{ access.message }}</p>
      <p class="ed-auth-tip">请从主系统进入本页面。主系统授权到达后会自动继续。</p>
      <button v-if="access.status === 'error'" type="button" class="ed-auth-retry" @click="initializeExternalDraftAccess">重新校验</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 外部起草独立入口：授权、会话/轮次、终稿文件和第三方保存回执分开管理。 */
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { externalDraftAccess as access, initializeExternalDraftAccess, disposeExternalDraftAccess } from '@/services/externalDraftAccess';
import { useExternalDraftStream } from '@/composables/useExternalDraftStream';
import { useExternalDraftDocx } from '@/composables/useExternalDraftDocx';
import ExternalDraftForm from '@/components/ExternalDraftForm.vue';
import ExternalDraftChat from '@/components/ExternalDraftChat.vue';
import ExternalDraftComposer from '@/components/ExternalDraftComposer.vue';
import ExternalDraftResult from '@/components/ExternalDraftResult.vue';

interface DraftTurn { key: string; sessionId: string; qaId: string; taskId: string; question: string; answer: string }
const route = useRoute();
const authed = computed(() => access.status === 'ready');
const params = new URLSearchParams(window.location.search);
const form = reactive({ length: params.get('length') === 'simple' ? 'simple' : 'detailed', strength: ['strong', 'neutral', 'weak'].includes(params.get('strength') || '') ? params.get('strength')! : 'strong' });
const hasStarted = ref(false), turns = ref<DraftTurn[]>([]), streamingQuestion = ref(''), draftError = ref(''), savingFile = ref(false);
const { sessionId, isDrafting, draftContent, startDraft, stop, detach, reset: resetStream, newSession } = useExternalDraftStream();
const { getRecord, saveDraftDocx, downloadAttachment, saveToDraftBox, reset: resetFiles } = useExternalDraftDocx();
const busy = computed(() => isDrafting.value || savingFile.value);
const composerRef = ref<InstanceType<typeof ExternalDraftComposer> | null>(null);
const formRef = ref<InstanceType<typeof ExternalDraftForm> | null>(null);
let pageVersion = 0;
const recordOf = (index: number) => { const turn = turns.value[index]; return turn ? getRecord(turn.qaId) : undefined; };
const triggerDraft = () => { if (authed.value && !busy.value) formRef.value?.submit(); };
const handleNewSession = () => { pageVersion++; newSession(); resetFiles(); turns.value = []; hasStarted.value = false; streamingQuestion.value = ''; draftError.value = ''; savingFile.value = false; };
const handleSubmit = async (question: string) => {
  if (!authed.value || busy.value) return;
  const version = ++pageVersion;
  hasStarted.value = true; draftError.value = ''; streamingQuestion.value = question;
  try {
    const result = await startDraft(question);
    if (version !== pageVersion) return;
    if (result.status === 'stopped') {
      turns.value.push({ key: result.qaId, ...result, question, answer: (result.content || '本次起草已停止') + '\n\n（已停止，本轮未生成结果文件）' });
      return;
    }
    if (!result.content.trim()) { draftError.value = '起草未生成内容，请调整描述后重试'; return; }
    turns.value.push({ key: result.qaId, ...result, question, answer: result.content });
    streamingQuestion.value = ''; resetStream();
    // 一个会话可有多轮；文件使用这一轮 qaId，不以 sessionId 代替文件缓存键。
    savingFile.value = true;
    await saveDraftDocx(result.qaId, result.content, result);
  } catch (error: any) {
    if (version !== pageVersion || error?.name === 'AbortError') return;
    draftError.value = error?.message || '起草失败，请稍后重试'; ElMessage.error(draftError.value);
  } finally {
    if (version === pageVersion) { streamingQuestion.value = ''; savingFile.value = false; resetStream(); }
  }
};
const handleStop = () => { void stop(); };
const downloadByIndex = (index: number) => { const turn = turns.value[index]; if (turn) void downloadAttachment(turn.qaId); };
const saveToBoxByIndex = (index: number) => { const turn = turns.value[index]; if (turn) void saveToDraftBox(turn.qaId, turn.answer); };
const retrySaveDocx = (index: number) => { const turn = turns.value[index]; if (turn) void saveDraftDocx(turn.qaId, turn.answer, turn); };
const redraftTurn = (index: number) => { const turn = turns.value[index]; if (turn && !busy.value) composerRef.value?.fillAndSend(turn.question); };
watch(() => access.revision, handleNewSession, { flush: 'sync' });
watch(() => route.fullPath, () => { void initializeExternalDraftAccess(); }, { immediate: true });
onUnmounted(() => { pageVersion++; detach(); resetFiles(); disposeExternalDraftAccess(); });
</script>

<style scoped>
/* 外部起草页整体：独立路由、无 AppLayout 壳，纵向撑满 iframe 视口 */
.external-draft {
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
  background: #f5f7fa;
  font-size: 16px;
  color: #303133;

  .ed-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    padding: 16px 28px;
    background: #fff;
    border-bottom: 1px solid #ebeef5;
    font-size: 16px;
    font-weight: 600;
  }

  /* 智能起草入口：居中标题 + AI起草按钮（仅首次表单阶段展示） */
  .ed-hero {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    padding: 44px 24px 20px;

    .ed-hero-title {
      margin: 0;
      font-size: 26px;
      font-weight: 700;
      color: #1f2329;
      letter-spacing: 1px;
    }

    .ed-hero-btn {
      padding: 9px 28px;
      border: none;
      border-radius: 4px;
      background: #4a90ff;
      color: #fff;
      font-size: 15px;
      cursor: pointer;
      transition: background 0.2s;

      &:hover {
        background: #3b8cff;
      }
    }
  }

  /* 首次表单外层：占满剩余高度并可滚动，卡片自身保持内容高度 */
  .ed-form-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 0 24px;
  }

  /* 首次表单卡片：居中、宽度随内容区 */
  .ed-form-wrap {
    width: 100%;
    max-width: 880px;
    margin: 0 auto 24px;
    padding: 24px;
    background: #fff;
    border-radius: 8px;
    box-sizing: border-box;
  }

  /* 对话阶段：消息流占满剩余高度，输入框常驻底部 */
  .ed-chat {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #fff;
    padding: 16px 28px 0;
  }

  /* 授权兜底遮罩 */
  .ed-auth-mask {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px;
    text-align: center;
    background: rgba(255, 255, 255, 0.97);
    color: #606266;
    z-index: 10;

    .ed-auth-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #303133;
    }

    .ed-auth-reason {
      margin: 0;
      font-size: 15px;
      color: #f56c6c;
    }

    .ed-auth-tip {
      margin: 0;
      max-width: 520px;
      font-size: 14px;
      color: #909399;
      line-height: 1.7;
    }
  }
}
</style>

<style scoped>
.ed-auth-retry { border: 1px solid #dcdfe6; border-radius: 6px; background: #fff; color: #303133; padding: 8px 16px; cursor: pointer; }
</style>
