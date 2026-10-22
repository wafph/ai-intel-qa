<!--
  外部嵌套起草页的对话流区域。

  渲染已完成的多轮起草记录：用户提问靠右（灰色气泡 + 头像），AI 回复靠左（浅灰块 + 头像）；
  同时承载当前正在流式输出的最新一轮。结果文件区由父级经 #result 插槽注入到每条回复内部。

  滚动策略：用户停留在底部时流式输出自动跟随；向上滑动查看历史时暂停自动跟随，
  并显示"回到底部"悬浮按钮，点击平滑滚回最新内容。
-->
<template>
  <div class="edc-wrap">
    <div ref="listRef" class="edc-list" @scroll="updateAwayFromBottom">
      <!-- 已完成轮次 -->
      <template v-for="(turn, index) in turns" :key="turn.key">
        <div class="edc-row user">
          <div class="edc-bubble user">{{ turn.question }}</div>
          <div class="edc-avatar user">
            <el-icon><UserFilled /></el-icon>
          </div>
        </div>
        <div class="edc-row ai">
          <div class="edc-avatar ai">
            <el-icon><MagicStick /></el-icon>
          </div>
          <div class="edc-bubble ai">
            <div class="edc-markdown" v-html="renderMarkdown(turn.answer)"></div>
            <!-- 本轮结果文件区（附件 + 保存到草稿箱），由父级按 index 注入 -->
            <slot name="result" :index="index"></slot>
          </div>
        </div>
      </template>

      <!-- 当前正在起草的一轮：三点动效只在流式输出期间出现 -->
      <template v-if="streaming">
        <div class="edc-row user">
          <div class="edc-bubble user">{{ streamingQuestion }}</div>
          <div class="edc-avatar user">
            <el-icon><UserFilled /></el-icon>
          </div>
        </div>
        <div class="edc-row ai">
          <div class="edc-avatar ai">
            <el-icon><MagicStick /></el-icon>
          </div>
          <div class="edc-bubble ai">
            <div v-if="streamingContent" class="edc-markdown" v-html="renderMarkdown(streamingContent)"></div>
            <div class="edc-typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </template>

      <!-- 起草失败提示 -->
      <div v-if="error" class="edc-error">{{ error }}</div>
    </div>

    <!-- 回到底部：离开底部时出现，点击平滑滚到最新输出 -->
    <button
      v-if="awayFromBottom"
      type="button"
      class="edc-scroll-bottom"
      :class="{ 'is-streaming': streaming }"
      title="回到最新"
      @click="scrollToBottom(true)"
    >
      <el-icon><ArrowDownBold /></el-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * 对话流区域脚本：纯展示组件，接收消息与流式状态，内部负责 markdown 渲染、滚动跟随与回到底部。
 */
import { nextTick, ref, watch } from 'vue';
import { ArrowDownBold, MagicStick, UserFilled } from '@element-plus/icons-vue';
import { renderMarkdown } from '@/utils/markdown';

/** 一轮完整的起草问答。 */
interface DraftTurn {
  /** 轮次标识：docx 状态按此索引，保证每轮附件独立。 */
  key: string;
  question: string;
  answer: string;
}

interface Props {
  /** 已完成的轮次记录。 */
  turns?: DraftTurn[];
  /** 是否正在流式起草。 */
  streaming?: boolean;
  /** 当前轮次的用户提问。 */
  streamingQuestion?: string;
  /** 当前轮次已生成的正文。 */
  streamingContent?: string;
  /** 起草失败文案。 */
  error?: string;
}

const props = withDefaults(defineProps<Props>(), {
  turns: () => [],
  streaming: false,
  streamingQuestion: '',
  streamingContent: '',
  error: '',
});

/** 距底部多少像素内仍视为"停在底部"。 */
const NEAR_BOTTOM_THRESHOLD = 100;

/** 消息列表容器，用于滚动跟随与回到底部。 */
const listRef = ref<HTMLElement | null>(null);
/** 是否已离开底部：为 true 时暂停自动跟随，并显示回到底部按钮。 */
const awayFromBottom = ref(false);
/** 平滑滚动进行中的锁定标记，避免过渡动画误判为"用户上滑"。 */
let scrollLocked = false;

/** 刷新"是否离开底部"状态（用户滚动时调用）。 */
const updateAwayFromBottom = () => {
  if (scrollLocked) return;
  const el = listRef.value;
  if (!el) return;
  awayFromBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight > NEAR_BOTTOM_THRESHOLD;
};

/** 滚到底部：smooth 为 true 时使用平滑滚动（回到底部按钮）。 */
const scrollToBottom = (smooth = false) => {
  const el = listRef.value;
  if (!el) return;
  scrollLocked = true;
  awayFromBottom.value = false;
  if (smooth) {
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    window.setTimeout(() => {
      scrollLocked = false;
      updateAwayFromBottom();
    }, 420);
  } else {
    el.scrollTop = el.scrollHeight;
    scrollLocked = false;
    updateAwayFromBottom();
  }
};

// 新一轮开始：无论用户在哪，都滚到最新提问处
watch(
  () => props.turns.length,
  async () => {
    await nextTick();
    scrollToBottom();
  },
);

// 进入流式状态：滚到当前输出位置
watch(
  () => props.streaming,
  async (streaming) => {
    if (!streaming) return;
    await nextTick();
    scrollToBottom();
  },
);

// 流式内容增长：仅在用户仍停在底部时自动跟随，上滑查看历史时不打断
watch(
  () => props.streamingContent,
  async () => {
    if (awayFromBottom.value) return;
    await nextTick();
    scrollToBottom();
  },
);
</script>

<style scoped>
/* 消息流外层：相对定位以承载回到底部按钮，宽度随页面内容区 */
.edc-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;

  .edc-list {
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    padding: 8px 4px 20px;
    font-size: 16px;

    .edc-row {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 18px;

      /* 用户提问：靠右 */
      &.user {
        justify-content: flex-end;

        .edc-bubble.user {
          max-width: 64%;
          background: #f2f3f5;
          color: #303133;
          border-radius: 8px;
          padding: 12px 16px;
          line-height: 1.7;
          white-space: pre-wrap;
          word-break: break-word;
        }
      }

      /* AI 回复：靠左，浅灰整块 */
      &.ai {
        .edc-bubble.ai {
          flex: 1;
          min-width: 0;
          background: #f5f6f8;
          border-radius: 8px;
          padding: 18px 24px;
          line-height: 1.8;
          color: #303133;
          word-break: break-word;

          .edc-markdown {
            :deep(h1) {
              margin: 0 0 14px;
              font-size: 26px;
              font-weight: 700;
            }
            :deep(h2) {
              margin: 20px 0 10px;
              font-size: 21px;
              font-weight: 700;
            }
            :deep(h3) {
              margin: 16px 0 8px;
              font-size: 18px;
              font-weight: 600;
            }
            :deep(p) {
              margin: 10px 0;
            }
            :deep(ul, ol) {
              margin: 10px 0;
              padding-left: 26px;
            }
            :deep(li) {
              margin: 6px 0;
            }
            :deep(blockquote) {
              margin: 12px 0;
              padding: 10px 14px;
              border-left: 3px solid #dcdfe6;
              color: #606266;
              background: #fff;
            }
            :deep(table) {
              border-collapse: collapse;
              margin: 10px 0;
              width: 100%;
              font-size: 15px;
            }
            :deep(td, th) {
              border: 1px solid #dcdfe6;
              padding: 8px 12px;
              text-align: left;
            }
            :deep(pre) {
              margin: 10px 0;
              padding: 14px;
              background: #fff;
              border-radius: 6px;
              overflow-x: auto;
            }
            :deep(img) {
              max-width: 100%;
            }
          }
        }
      }
    }

    /* 头像 */
    .edc-avatar {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      color: #fff;
      font-size: 20px;
      background: #3b8cff;

      &.ai {
        background: linear-gradient(135deg, #5b9dff, #3b7cff);
      }
    }

    /* 流式输出中的三点动效（不输出时整块不存在） */
    .edc-typing {
      display: flex;
      align-items: center;
      gap: 5px;
      height: 20px;
      margin-top: 8px;

      span {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #a8abb2;
        animation: edc-bounce 1.2s infinite ease-in-out;

        &:nth-child(2) {
          animation-delay: 0.15s;
        }
        &:nth-child(3) {
          animation-delay: 0.3s;
        }
      }
    }

    /* 起草失败提示 */
    .edc-error {
      margin: 4px 0 12px 54px;
      color: #f56c6c;
      font-size: 14px;
    }

    /* 结果区上方与正文的间距（结果区组件自带虚线分隔） */
    :deep(.edr-docx) {
      font-size: 15px;
    }
  }

  /* 回到底部：白底圆形按钮 + 蓝色下箭头，浮在消息区底部中间 */
  .edc-scroll-bottom {
    position: absolute;
    left: 50%;
    bottom: 14px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    padding: 0;
    border: 1px solid #e4e7ed;
    border-radius: 50%;
    background: #fff;
    color: #3b8cff;
    font-size: 20px;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
    z-index: 2;
    transition: color 0.2s, box-shadow 0.2s;

    &:hover {
      color: #2f7ef0;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);
    }

    /* 流式输出时按钮外圈加旋转环，提示仍在生成 */
    &.is-streaming::before {
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: 50%;
      border: 2px solid rgba(59, 140, 255, 0.2);
      border-top-color: #3b8cff;
      animation: edc-spin 0.9s linear infinite;
    }
  }
}

@keyframes edc-bounce {
  0%,
  80%,
  100% {
    opacity: 0.4;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-4px);
  }
}

@keyframes edc-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
