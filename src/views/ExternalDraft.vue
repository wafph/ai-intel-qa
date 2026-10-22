<!--
  外部嵌套起草页（主系统 iframe 嵌入专用）。

  对话式布局：顶部标题栏，中间消息流（用户提问靠右、AI 回复靠左），底部常驻输入框可再次提出起草需求。
  首次进入为“一键开启智能起草”入口 + 居中表单（文件要求描述 + 禁用态展示的合同长度/强弱势），
  提交后切换为对话形态；不提供模板起草。
  起草链路：复用辅助起草 draft 流式任务，仅传描述文本；每轮流式结束各自自动生成 docx 附件并保留，
  每轮的附件都能单独下载、单独保存到主系统草稿箱（postMessage 携带正文与 docx）。
  鉴权沿用全局 agentAccess：main.ts 启动时已完成 token 初始化（外部页支持 ?token= 接入）。
-->
<template>
  <div class="external-draft">
    <header v-if="hasStarted" class="ed-title">文件起草</header>

    <!-- 首次进入：智能起草入口（居中标题 + AI起草按钮） -->
    <div v-if="!hasStarted" class="ed-hero">
      <h1 class="ed-hero-title">一键开启智能起草</h1>
      <button type="button" class="ed-hero-btn" @click="triggerDraft">AI起草</button>
    </div>

    <!-- 首次进入：居中表单卡片 -->
    <div v-show="!hasStarted" class="ed-form-scroll">
      <div class="ed-form-wrap">
        <ExternalDraftForm
          ref="formRef"
          :length="form.length"
          :strength="form.strength"
          :submitting="isDrafting"
          @start="handleSubmit"
        />
      </div>
    </div>

    <!-- 起草阶段：对话流 + 底部输入框 -->
    <div v-show="hasStarted" class="ed-chat">
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
        @submit="handleSubmit"
        @stop="handleStop"
      />
    </div>

    <!-- 授权兜底：未拿到有效会话时遮挡操作，并展示后端返回的真实原因 -->
    <!-- <div v-if="!authed" class="ed-auth-mask">
      <p class="ed-auth-title">未获取到访问授权</p>
      <p v-if="authError?.message" class="ed-auth-reason">{{ authError.message }}</p>
      <p class="ed-auth-tip">请确认主系统传入的 token 有效且具备本应用访问权限，或从主系统重新进入。</p>
    </div> -->
  </div>
</template>

<script setup lang="ts">
/**
 * 外部嵌套起草页脚本。
 *
 * 负责对话轮次的编排与能力接线：ExternalDraftForm（首次表单）、ExternalDraftChat（消息流）、
 * ExternalDraftComposer（底部输入）、ExternalDraftResult（各轮结果文件区），
 * 数据来自 useExternalDraftStream（任务 + SSE）与 useExternalDraftDocx（按轮次管理 docx 与草稿箱通知）。
 */
import { onUnmounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getBearerToken, consumeNotFoundError } from '@/services/authStorage';
import { useExternalDraftStream } from '@/composables/useExternalDraftStream';
import { useExternalDraftDocx } from '@/composables/useExternalDraftDocx';
import ExternalDraftForm from '@/components/ExternalDraftForm.vue';
import ExternalDraftChat from '@/components/ExternalDraftChat.vue';
import ExternalDraftComposer from '@/components/ExternalDraftComposer.vue';
import ExternalDraftResult from '@/components/ExternalDraftResult.vue';

/** 一轮完整的起草问答。 */
interface DraftTurn {
  /** 轮次标识：docx 状态按此索引，保证每轮附件独立。 */
  key: string;
  question: string;
  answer: string;
  /** 本轮的 qaId，docx 转换与失败重试复用。 */
  qaId: string;
}

// 授权判断：main.ts 的 bootstrap 阶段已统一初始化会话，这里仅同步读取结果
const authed = Boolean(getBearerToken());
/** token 校验失败原因（后端返回），仅未授权时读取用于遮罩提示。 */
const authError = authed ? null : consumeNotFoundError();

// 展示性字段：支持主系统经 URL 参数透传展示值（length/strength），不参与起草参数
const urlParams = new URLSearchParams(window.location.search);
const form = reactive({
  length: urlParams.get('length') === 'simple' ? 'simple' : 'detailed',
  strength: ['strong', 'neutral', 'weak'].includes(urlParams.get('strength') || '')
    ? (urlParams.get('strength') as string)
    : 'strong',
});

/** 起草方式已收敛为一键智能起草，不再提供模板起草入口。 */
/** 是否已进入对话阶段（true 时隐藏表单，显示消息流与底部输入）。 */
const hasStarted = ref(false);
/** 已完成的多轮起草记录。 */
const turns = ref<DraftTurn[]>([]);
/** 当前轮次正在起草的用户提问。 */
const streamingQuestion = ref('');
/** 起草失败文案（空串表示未失败）。 */
const draftError = ref('');

const { isDrafting, draftContent, startDraft, detach, reset: resetStream } = useExternalDraftStream();
const { getRecord, saveDraftDocx, downloadAttachment, saveToDraftBox } = useExternalDraftDocx();

/** 底部输入框实例：重新起草时通过它回填历史提问并自动发送。 */
const composerRef = ref<InstanceType<typeof ExternalDraftComposer> | null>(null);

/** 首次表单实例：顶部「AI起草」入口复用表单自身的必填校验与提交。 */
const formRef = ref<InstanceType<typeof ExternalDraftForm> | null>(null);

/** 顶部「AI起草」按钮：等同点击表单内的开始起草（描述为空时定位到输入框并提示）。 */
const triggerDraft = () => {
  formRef.value?.submit();
};

/** 轮次序号：用于生成稳定的轮次标识。 */
let turnSeq = 0;
/** 生成下一轮标识。 */
const nextTurnKey = () => `turn-${++turnSeq}`;

/** 取某轮对应的 docx 状态（轮次或状态不存在时返回 undefined）。 */
const recordOf = (index: number) => {
  const turn = turns.value[index];
  return turn ? getRecord(turn.key) : undefined;
};

/**
 * 提交一轮起草（首次按钮与底部输入框共用）。
 * 串行链路：流式起草 → 记录本轮问答 → 自动为该轮保存 docx。
 */
const handleSubmit = async (question: string) => {
  if (isDrafting.value) return;
  hasStarted.value = true;
  draftError.value = '';
  streamingQuestion.value = question;
  resetStream();
  const key = nextTurnKey();
  try {
    const { content, qaId } = await startDraft(question);
    if (!content.trim()) {
      draftError.value = '起草未生成内容，请调整描述后重试';
      return;
    }
    turns.value.push({ key, question, answer: content, qaId });
    // 自动保存本轮结果文件：流式结束后立即生成 docx 附件
    await saveDraftDocx(key, content, qaId);
  } catch (error) {
    draftError.value = error instanceof Error ? error.message : '起草失败，请稍后重试';
    ElMessage.error(draftError.value);
  } finally {
    streamingQuestion.value = '';
    // 清空流式缓冲：正文已进入 turns，避免与已完成消息重复渲染
    resetStream();
  }
};

/** 停止当前输出：中断订阅，已生成内容按正常收尾流程保留。 */
const handleStop = () => {
  detach();
};

/** 下载某轮的 docx 附件。 */
const downloadByIndex = (index: number) => {
  const turn = turns.value[index];
  if (turn) void downloadAttachment(turn.key);
};

/** 把某一轮的正文与 docx 附件保存到主系统草稿箱。 */
const saveToBoxByIndex = (index: number) => {
  const turn = turns.value[index];
  if (turn) void saveToDraftBox(turn.key, turn.answer);
};

/** 某轮 docx 保存失败后的重试。 */
const retrySaveDocx = (index: number) => {
  const turn = turns.value[index];
  if (turn) void saveDraftDocx(turn.key, turn.answer, turn.qaId);
};

/**
 * 重新起草：把该轮的历史提问回填到底部输入框并自动发送，重新输出一轮新答案。
 * 历史轮次保留在消息流中，不会被清空。
 */
const redraftTurn = (index: number) => {
  const turn = turns.value[index];
  if (!turn || isDrafting.value) return;
  composerRef.value?.fillAndSend(turn.question);
};

// 路由离开时中断未完成的流式订阅
onUnmounted(() => detach());
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
