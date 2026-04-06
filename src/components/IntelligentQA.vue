<template>
  <div class="intelligent-qa">
    <!-- 模板部分保持不变 -->
    <div class="qa-header" v-if="!showAnswer && !loadingAnswer">
      <h1>我是问答助手，很高兴见到你</h1>
      <p>你可以使用自然语言提问，我来精准回答</p>
    </div>

    <div class="input-container" v-if="!showAnswer && !loadingAnswer">
      <el-input
        v-model="questionInput"
        :placeholder="questionPlaceholder"
        style="height: 60px; border-radius: 20px"
        @keydown.enter.exact.prevent="handleSendQuestion"
      />
      <button class="send-btn" @click="handleSendQuestion">
        <el-icon class="mr-8">
          <Promotion />
        </el-icon>
        发送
      </button>
    </div>

    <div v-if="!showAnswer && !loadingAnswer" class="suggestions">
      <el-button
        v-for="(suggestion, index) in suggestions"
        :key="index"
        type="primary"
        plain
        class="suggestion-btn"
        @click="setQuestion(suggestion)"
      >
        {{ suggestion }}
      </el-button>
    </div>

    <el-icon v-if="loadingAnswer" class="lefticon">
      <ArrowLeftBold @click="goback" />
    </el-icon>

    <el-card class="res-container" v-if="loadingAnswer || showAnswer">
      <div class="anser-input">
        <div class="right-input">{{ currentDisplayQuestion }}</div>
        <img src="../../public/user.svg" alt="" />
      </div>
    </el-card>

    <div v-if="!showAnswer && loadingAnswer" class="result-container">
      <div class="result-header">
        <div class="result-title">思考中...</div>
      </div>
      <div class="text-center">
        <div class="reasoning-content">{{ reasoningContent }}</div>
      </div>
    </div>

    <div v-if="showAnswer" class="result-container">
      <div class="result-header">
        <div class="result-title">回复</div>
      </div>
      <div class="result-content" id="pdfDom" v-html="renderedMarkdown"></div>
      <div style="display: flex; align-items: center; margin-top: 20px">
        <div class="source-tag">3个来源</div>
        <div class="action-buttons">
          <el-button
            size="small"
            type="success"
            plain
            :loading="loading"
            @click="pdfFunc"
          >
            <el-icon>
              <Download />
            </el-icon>
            导出
          </el-button>
          <el-button size="small" @click="resetAnswer">
            <el-icon>
              <Refresh />
            </el-icon>
            重新回答
          </el-button>
        </div>
      </div>
    </div>

    <div v-if="showAnswer" class="input-container">
      <el-input
        v-model="newQuestionInput"
        placeholder="您好，请输入你的问题"
        style="height: 60px; border-radius: 20px"
        @keydown.enter.exact.prevent="handleSendQuestion"
      />
      <button class="send-btn" @click="handleSendQuestion">
        <el-icon class="mr-8">
          <Promotion />
        </el-icon>
        发送
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import MarkdownIt from 'markdown-it';
import { useAppStore } from '../stores/app';
import { Promotion, Download, Refresh } from '@element-plus/icons-vue';
import htmlToPdf from '../utils/htmlToPdf';

// 状态变量
const loading = ref(false);
const isStreaming = ref(false);
const finalContent = ref('');
const reasoningContent = ref('');
const events = ref<Array<string>>([]);
const reader = ref<ReadableStreamDefaultReader<Uint8Array> | null>(null);
const abortController = ref<AbortController | null>(null);
let isCancelled = false;

// --- 输入框变量定义 ---
// 初始状态输入框绑定的变量
const questionInput = ref('');
// 新增：回答显示后，下方输入框绑定的独立变量
const newQuestionInput = ref('');
// 用于在回答区域显示的问题文本（即实际发送出去的问题）
const currentDisplayQuestion = ref('');
// 新增：保存上一次发送的问题，用于重新回答
const lastSentQuestion = ref('');
// --- 输入框变量定义结束 ---

const questionPlaceholder = '您好，请输入你的问题';
const suggestions = [
  '规章制度各层级审批主体是什么？',
  '规章制度起草程序及起草说明核心内容有哪些？',
  '规章制度需修订或废止的情形及程序区别是什么？',
];

// 回答状态
const loadingAnswer = ref(false);
const showAnswer = ref(false);

// PDF导出功能
const pdfFunc = () => {
  loading.value = true;
  htmlToPdf.getPdf('myPdf');
  setTimeout(() => {
    loading.value = false;
  }, 1000);
};

const appStore = useAppStore();
const md = new MarkdownIt();
const renderedMarkdown = computed(() => md.render(finalContent.value));

// 设置问题（点击推荐问题）
const setQuestion = (question: string) => {
  // 根据当前所在区域，设置到对应的输入框变量
  if (showAnswer.value) {
    // 如果在回答页面，就设置到下方独立的输入框
    newQuestionInput.value = question;
  } else {
    // 如果在初始页面，就设置到主输入框
    questionInput.value = question;
  }
  // 自动发送
  handleSendQuestion();
};

// 优化后的发送问题函数
const handleSendQuestion = () => {
  let questionToSend = '';
  let inputFieldToClear = null;

  // 决策逻辑：根据当前界面状态，决定使用哪个输入框的内容
  if (showAnswer.value) {
    // 场景：在查看回答时，发送下方新输入框的内容
    questionToSend = newQuestionInput.value.trim();
    inputFieldToClear = newQuestionInput; // 发送后需要清空这个变量
  } else {
    // 场景：在初始页面，发送主输入框的内容
    questionToSend = questionInput.value.trim();
    inputFieldToClear = questionInput; // 发送后需要清空这个变量
  }

  // 输入验证
  if (!questionToSend) {
    return; // 如果内容为空，则不执行任何操作
  }

  // 更新当前显示的问题（用于在回答区域顶部展示）
  currentDisplayQuestion.value = questionToSend;
  // 保存上一次发送的问题
  lastSentQuestion.value = questionToSend;
  // 清空对应的输入框变量，实现"发送后输入框为空"
  inputFieldToClear.value = '';

  // 设置状态并开始流式请求
  loadingAnswer.value = true;
  showAnswer.value = false;
  appStore.addHistory(questionToSend);
  startStream(questionToSend); // 将问题文本传递给请求函数
};

// 修改后的流式请求函数，接收问题参数
const startStream = async (queryText: string) => {
  try {
    isStreaming.value = true;
    finalContent.value = '';
    reasoningContent.value = '';
    events.value = [];
    isCancelled = false;

    const params = {
      inputs: {
        query: queryText, // 使用传入的问题文本
      },
    };

    abortController.value = new AbortController();

    const response = await fetch(
      '/api1/v1/1725c43e3fa54828a078fce60f5a3773/agents/52512531-0a97-480f-bd5c-5f4fd0df61c4/conversations/8c5ea263-0bc2-4caa-921a-ace8de0aeb38?version=1775138708331',
      {
        method: 'post',
        headers: {
          'X-Auth-Token': appStore.sharedDataToken!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
        signal: abortController.value.signal,
      },
    );

    if (!response.ok || !response.body) {
      throw new Error(`网络响应异常: ${response.status}`);
    }

    reader.value = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      if (isCancelled) break;
      const { done, value } =
        (await reader.value!.read()) as ReadableStreamReadResult<Uint8Array>;
      if (done) {
        loadingAnswer.value = false;
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      processChunk(chunk);
    }
  } catch (error: any) {
    if (error?.name !== 'AbortError') {
      console.error('获取流数据时出错:', error);
    }
  } finally {
    isStreaming.value = false;
    reader.value = null;
  }
};

// 处理数据块
const processChunk = (chunk: any) => {
  const lines = chunk.split('\n');
  lines.forEach((line: any) => {
    if (line.startsWith('data:')) {
      const dataLine = line.substring(5).trim();
      if (dataLine) {
        try {
          const parsedData = JSON.parse(dataLine);
          if (parsedData.content) {
            showAnswer.value = true;
          }
          handleEvent(parsedData);
        } catch (error) {
          console.error('解析JSON失败:', error, '原始数据:', dataLine);
        }
      }
    }
  });
};

const handleEvent = (data: any) => {
  switch (data.event) {
    case 'message':
      if (data.reasoning_content) {
        reasoningContent.value += data.reasoning_content;
      } else if (data.content) {
        finalContent.value += data.content;
      }
      break;
    case 'done':
      isStreaming.value = false;
      break;
    default:
      break;
  }
};

const stopStream = () => {
  abortController.value?.abort();
  reader.value?.cancel();
  isCancelled = true;
  isStreaming.value = false;
};

const goback = () => {
  loadingAnswer.value = false;
};

// 优化后的重置答案函数
const resetAnswer = () => {
  // 检查是否有上一次发送的问题
  if (!lastSentQuestion.value.trim()) {
    // 如果没有上一次的问题，尝试使用当前显示的问题
    if (!currentDisplayQuestion.value.trim()) {
      console.warn('没有找到可以重新回答的问题');
      return;
    }
    lastSentQuestion.value = currentDisplayQuestion.value;
  }

  // 重新回答上一次发送的问题
  // 清除当前答案
  finalContent.value = '';
  // 进入加载状态
  loadingAnswer.value = true;
  showAnswer.value = false;
  // 重新发送相同的问题
  startStream(lastSentQuestion.value);
};

onUnmounted(() => {
  stopStream();
});
</script>

<style lang="less" scoped>
/* 样式部分保持不变 */
.intelligent-qa {
  .qa-header {
    text-align: center;
    margin-bottom: 20px;
    h1 {
      font-size: 28px;
      color: @text-color;
      margin-bottom: 12px;
    }
    p {
      font-size: 16px;
      color: @text-color-secondary;
    }
  }
  .input-container {
    max-width: 850px;
    height: 105px;
    margin: 15px auto;
    padding: 24px;
    filter: drop-shadow(0px 5px 5px rgba(0, 0, 0, 0.19215686274509805));
    background-color: @white;
    border-radius: 8px;
    position: relative;
    .el-textarea__inner {
      padding: 16px;
      font-size: 16px;
      border-radius: 8px;
      border: 1px solid @border-color;
      resize: none;
      min-height: 120px;
      &:focus {
        border-color: @primary-color;
      }
    }
    :deep(.el-input__wrapper) {
      border-radius: 10px;
    }
  }
  .lefticon {
    position: absolute;
    left: 300px;
    top: 110px;
    font-size: 23px;
    color: #4285f4;
  }
  .res-container {
    max-width: 850px;
    margin: auto;
    text-align: right;
    :deep(.el-card__body) {
      padding: 8px;
    }
    .anser-input {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      .right-input {
        background: #f2f2f2;
        padding: 10px;
        border-radius: 12px;
        margin-right: 20px;
      }
    }
  }
  .send-btn {
    position: absolute;
    right: 35px;
    bottom: 30px;
    background-color: @primary-color;
    color: @white;
    border: none;
    border-radius: 6px;
    padding: 10px 20px;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    &:hover {
      background-color: #40a9ff;
    }
  }
  .suggestions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex-wrap: wrap;
    max-width: 850px;
    gap: 20px;
    margin: 20px auto;
    .suggestion-btn {
      padding: 16px 20px;
      background-color: #f0f7ff;
      border: 1px solid @border-color-light;
      border-radius: 20px;
      margin-left: 0;
      transition: all 0.2s;
      &:hover {
        background-color: #eef5ff;
        border-color: @primary-color;
        color: @primary-color;
      }
    }
  }
  .result-container {
    max-width: 850px;
    min-height: 400px;
    margin: 40px auto 0;
    padding: 24px;
    filter: drop-shadow(0px 5px 5px rgba(0, 0, 0, 0.19215686274509805));
    background-color: @white;
    border-radius: 8px;
    .reasoning-content {
      min-height: 50px;
      padding: 0 10px 10px 10px;
      margin: 10px 0;
      text-align: left;
      color: gray;
      background-color: white;
      border-left: 1px solid #eee;
      border-radius: 4px;
      white-space: pre-wrap;
    }
    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      .result-title {
        font-size: 18px;
        font-weight: 600;
        color: @text-color;
        border-left: 4px solid @primary-color;
        padding-left: 15px;
      }
    }
    .result-content {
      line-height: 1.6;
      color: @text-color-secondary;
      padding: 15px 10px 10px 35px;
      border: 1px solid lightgray;
      border-radius: 7px;
      ol {
        padding-left: 20px;
        margin: 12px 0;
        li {
          margin-bottom: 8px;
        }
      }
    }
    .source-tag {
      display: flex;
      padding: 4px 12px;
      background-color: #e6f7ff;
      color: @primary-color;
      border-radius: 4px;
      font-size: 12px;
    }
    .action-buttons {
      display: flex;
      gap: 12px;
      margin-left: 30px;

      :deep(.el-button--small) {
        padding: 5px 10px;
      }
    }
  }
}
</style>
