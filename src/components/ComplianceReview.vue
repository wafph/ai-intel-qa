<template>
  <!-- 模板部分保持不变 -->
  <div class="audit-container">
    <div class="review-header" v-show="!showAnswer && !loadingAnswer">
      <h1>智能合规审核，守护业务合规底线</h1>
      <p>以科技赋能合规管理，自动校验，高效守护业务规范</p>
    </div>
    <div class="input-container" v-if="!showAnswer && !loadingAnswer">
      <el-input
        v-model="questionInput"
        type="textarea"
        :placeholder="questionPlaceholder"
        :rows="8"
        @keydown.enter.exact.prevent="handleSendQuestion"
      />
      <button class="send-btn" @click="handleSendQuestion">
        <el-icon class="mr-8">
          <Promotion />
        </el-icon>
        发送
      </button>
    </div>
    <el-icon v-if="loadingAnswer" class="lefticon">
      <ArrowLeftBold @click="goback" />
    </el-icon>
    <el-card class="res-container" v-if="loadingAnswer || showAnswer">
      <el-collapse v-model="activeNames">
        <el-collapse-item name="1">
          <div class="anser-input">
            <div class="right-input">{{ currentDisplayQuestion }}</div>
            <img src="../../public/user.svg" alt="" />
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-card>
    <!-- 回答加载中 -->
    <div v-if="!showAnswer && loadingAnswer" class="result-container">
      <div class="result-header">
        <div class="result-title">思考中...</div>
      </div>
      <div class="text-center">
        <div class="reasoning-content">{{ reasoningContent }}</div>
      </div>
    </div>

    <!-- 回答结果 -->
    <div v-if="showAnswer" class="result-container">
      <div class="result-header">
        <div class="result-title">回复</div>
      </div>
      <div class="result-content" id="pdfDom" v-html="renderedMarkdown"></div>
      <div style="display: flex; align-items: center; margin-top: 20px">
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
            重新审核
          </el-button>
        </div>
      </div>
    </div>

    <!-- 修改：回答显示后的独立输入框 -->
    <div v-if="showAnswer" class="input-container as">
      <el-input
        v-model="otherInput"
        placeholder="您好，请输入待审核内容"
        style="height: 60px; border-radius: 20px"
        @keydown.enter.exact.prevent="handleSendOtherQuestion"
      />
      <button class="send-btn bottom" @click="handleSendOtherQuestion">
        <el-icon class="mr-8">
          <Promotion />
        </el-icon>
        发送
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue';
import MarkdownIt from 'markdown-it';
import { useAppStore } from '../stores/app';
import { ElMessage } from 'element-plus';
import { Promotion, Download, Refresh } from '@element-plus/icons-vue';
import htmlToPdf from '../utils/htmlToPdf.js';

const loading = ref(false);
const activeNames = ref(['1']);

const pdfFunc = () => {
  loading.value = true;
  // 调用htmlToPdf工具函数
  htmlToPdf.getPdf('myPdf');
  // 定时器模拟按钮loading动画的时间
  setTimeout(() => {
    loading.value = false;
    ElMessage.success('打印成功!');
  }, 1000);
};

const appStore = useAppStore();
const isStreaming = ref(false);
const finalContent = ref('');
const reasoningContent = ref('');
const events = ref<Array<string>>([]);
const reader = ref<ReadableStreamDefaultReader<Uint8Array> | null>(null);
const abortController = ref<AbortController | null>(null);
let isCancelled = false;

// --- 输入框变量定义 ---
// 主输入框绑定
const questionInput = ref('');
// 回答后输入框绑定
const otherInput = ref('');
// 用于显示在回答区域的用户问题
const currentDisplayQuestion = ref('');
// 新增：保存上一次发送的问题，用于重新回答
const lastSentQuestion = ref('');
// --- 输入框变量定义结束 ---

const questionPlaceholder = '您好，请输入待审核内容。';

// 回答状态
const loadingAnswer = ref(false);
const showAnswer = ref(false);

// 优化后的发送问题函数
const handleSendQuestion = () => {
  if (!questionInput.value.trim()) return;

  // 保存当前显示的问题
  currentDisplayQuestion.value = questionInput.value;
  // 保存上一次发送的问题
  lastSentQuestion.value = questionInput.value;
  // 清空主输入框
  questionInput.value = '';

  loadingAnswer.value = true;
  showAnswer.value = false;
  appStore.addHistory(currentDisplayQuestion.value);
  startStream(currentDisplayQuestion.value);
};

// 新增：处理回答后输入框的问题发送
const handleSendOtherQuestion = () => {
  if (!otherInput.value.trim()) return;

  // 保存当前显示的问题
  currentDisplayQuestion.value = otherInput.value;
  // 保存上一次发送的问题
  lastSentQuestion.value = otherInput.value;
  // 清空回答后输入框
  otherInput.value = '';

  loadingAnswer.value = true;
  showAnswer.value = false;
  appStore.addHistory(currentDisplayQuestion.value);
  startStream(currentDisplayQuestion.value);
};

// 优化后的开始流式请求函数
const startStream = async (queryText: string) => {
  try {
    // 重置状态
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

    // 创建AbortController用于取消请求
    abortController.value = new AbortController();

    // 使用Fetch API发起请求
    const response = await fetch(
      '/api1/v1/1725c43e3fa54828a078fce60f5a3773/agents/820722c8-4ef6-4de9-8596-e1ab56b4946c/conversations/b764ace3-33fb-4422-92d0-4f0f8931b6e7?version=1775051779794',
      {
        method: 'post',
        headers: {
          'X-Auth-Token': appStore.sharedDataToken!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      },
    );

    if (!response.ok || !response.body) {
      throw new Error(`网络响应异常: ${response.status}`);
    }
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('响应体不可用');
    }

    // 获取可读流
    reader.value = response.body.getReader();
    const decoder = new TextDecoder();

    // 处理流数据
    while (true) {
      if (isCancelled) {
        break;
      }

      const { done, value } =
        (await reader.value.read()) as ReadableStreamReadResult<Uint8Array>;

      if (done) {
        loadingAnswer.value = false;
        showAnswer.value = true;
        break;
      }
      // 解码数据块
      const chunk = decoder.decode(value, { stream: true });
      processChunk(chunk);
    }
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error('获取流数据时出错:', error);
    }
  } finally {
    isStreaming.value = false;
    reader.value = null;
  }
};

// 处理数据块
const processChunk = (chunk: any) => {
  // 按行分割
  const lines = chunk.split('\n');

  lines.forEach((line: any) => {
    if (line.startsWith('data:')) {
      const dataLine = line.substring(5).trim(); // 移除"data:"前缀

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

// 处理事件
const handleEvent = (data: any) => {
  // 记录事件
  events.value.push(`${data.event} - ${new Date(data.createdTime).toLocaleTimeString()}`);

  switch (data.event) {
    case 'start':
      break;

    case 'message':
      if (data.reasoning_content) {
        reasoningContent.value += data.reasoning_content;
      }
      if (data.content) {
        finalContent.value += data.content;
      }
      break;

    case 'done':
      isStreaming.value = false;
      break;

    default:
      console.log('未知事件:', data.event);
  }
};

const md = new MarkdownIt();
const renderedMarkdown = computed(() => md.render(finalContent.value));

// 优化后的重置答案函数
const resetAnswer = () => {
  // 检查是否有上一次发送的问题
  if (!lastSentQuestion.value.trim()) {
    // 如果没有上一次的问题，尝试使用当前显示的问题
    if (!currentDisplayQuestion.value.trim()) {
      ElMessage.warning('没有找到可以重新回答的问题');
      return;
    }
    lastSentQuestion.value = currentDisplayQuestion.value;
  }

  // 重新回答上一次发送的问题
  loadingAnswer.value = true;
  showAnswer.value = false;
  // 这里不需要添加到历史记录，因为是重新回答同一个问题
  startStream(lastSentQuestion.value);
};

// 停止流
const stopStream = () => {
  if (abortController.value) {
    abortController.value?.abort();
  }
  if (reader.value) {
    reader.value?.cancel();
  }
  isCancelled = true;
  isStreaming.value = false;
};

const goback = () => {
  loadingAnswer.value = false;
};

onMounted(() => {
  // 初始化
});

// 组件卸载时清理
onUnmounted(() => {
  stopStream();
});
</script>

<style lang="less" scoped>
.audit-container {
  .review-header {
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
    margin: 20px auto;
    position: relative;

    .el-textarea__inner {
      padding: 16px;
      font-size: 16px;
      border-radius: 8px;
      border: 1px solid @border-color;
      resize: none;

      &:focus {
        border-color: @primary-color;
      }
    }

    :deep(.el-textarea__inner) {
      border-radius: 10px;
    }
  }

  .as {
    padding: 24px;
    filter: drop-shadow(0px 5px 5px rgba(0, 0, 0, 0.19215686274509805));
    background-color: @white;
    border-radius: 8px;
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
  .btnp {
    padding: 5px 10px;
    margin-top: 10px;
  }

  .send-btn {
    position: absolute;
    right: 15px;
    bottom: 13px;
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

  .bottom{
     bottom: 33px;
     right: 33px
  }

  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    max-width: 850px;
    margin: 20px auto;

    .suggestion-btn {
      padding: 10px 20px;
      background-color: @white;
      border: 1px solid @border-color-light;
      border-radius: 20px;
      color: @text-color-secondary;
      font-size: 14px;
      cursor: pointer;
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
