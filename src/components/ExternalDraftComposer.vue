<!--
  外部嵌套起草页的底部输入区。

  始终吸附在对话区底部，支持再次输入起草问题（Enter 发送、Shift+Enter 换行）。
  右侧圆形按钮双态：空闲显示向上箭头（发送），起草中显示蓝色停止方块（中断当前输出）。
-->
<template>
  <div class="edc-composer">
    <div class="edc-box">
      <textarea
        v-model="text"
        class="edc-input"
        rows="1"
        :placeholder="placeholder"
        @keydown.enter.exact.prevent="handleSend"
      ></textarea>
      <button
        type="button"
        class="edc-action"
        :class="{ 'is-streaming': streaming }"
        :title="streaming ? '停止输出' : '发送'"
        @click="handleAction"
      >
        <!-- 起草中：白色停止方块；空闲：向上箭头 -->
        <span v-if="streaming" class="edc-stop"></span>
        <svg v-else class="edc-arrow" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 19V6M12 6l-6 6M12 6l6 6" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 底部输入区脚本：内部维护输入文本，发送与停止均通过事件上抛给父页面。
 */
import { nextTick, ref } from 'vue';

interface Props {
  /** 是否正在起草（按钮切换为停止态，输入不拦截以免影响阅读时继续输入）。 */
  streaming?: boolean;
  /** 输入框占位文案。 */
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  streaming: false,
  placeholder: '请输入您的起草需求，AI 将为您生成文件内容…',
});

const emit = defineEmits<{
  /** 发送提问。 */
  (e: 'submit', question: string): void;
  /** 停止当前输出。 */
  (e: 'stop'): void;
}>();

/** 输入文本。 */
const text = ref('');

/** 发送：空内容拦截，合法则清空并上抛。 */
const handleSend = () => {
  const question = text.value.trim();
  if (!question) return;
  text.value = '';
  emit('submit', question);
};

/** 按钮点击：起草中为停止，否则为发送。 */
const handleAction = () => {
  if (props.streaming) {
    emit('stop');
    return;
  }
  handleSend();
};

/**
 * 回填问题并自动发送（重新起草时复用历史提问）：
 * 先写入输入框让用户看到问题内容，下一帧再提交，避免直提跳过输入框展示。
 */
const fillAndSend = (question: string) => {
  if (props.streaming) return;
  text.value = question;
  void nextTick(() => handleSend());
};

defineExpose({ fillAndSend });
</script>

<style scoped>
/* 底部输入区：白底、上边框与消息流分隔 */
.edc-composer {
  flex-shrink: 0;
  padding: 12px 0 16px;
  background: #fff;

  .edc-box {
    position: relative;
    max-width: 1120px;
    margin: 0 auto;

    .edc-input {
      width: 100%;
      box-sizing: border-box;
      min-height: 58px;
      max-height: 160px;
      padding: 17px 68px 17px 18px;
      border: 1px solid #e4e7ed;
      border-radius: 8px;
      font-size: 16px;
      line-height: 1.6;
      color: #303133;
      background: #fff;
      resize: none;
      outline: none;
      overflow-y: auto;

      &:focus {
        border-color: #3b8cff;
      }

      &::placeholder {
        color: #a8abb2;
      }
    }

    /* 右侧圆形动作按钮 */
    .edc-action {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 1px solid #dcdfe6;
      border-radius: 50%;
      background: #fff;
      color: #909399;
      cursor: pointer;

      .edc-arrow {
        width: 18px;
        height: 18px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      &:hover {
        color: #3b8cff;
        border-color: #3b8cff;
      }

      /* 起草中：蓝色实心圆 + 白色停止方块 */
      &.is-streaming {
        border-color: #3b8cff;
        background: #3b8cff;

        .edc-stop {
          width: 12px;
          height: 12px;
          border-radius: 2px;
          background: #fff;
        }

        &:hover {
          background: #2f7ef0;
        }
      }
    }
  }
}
</style>
