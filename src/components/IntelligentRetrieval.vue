<template>
  <div class="intelligent-retrieval">
    <!-- 初始状态：只有第一次进入时显示 -->
    <div
      v-if="!showRetrievalResult && conversationHistory.length === 0"
      class="initial-state"
    >
      <div class="retrieval-header">
        <h1>我是检索助手，很高兴见到你</h1>
        <p>你可以使用自然语言提问，我来帮你快速获取相关制度条款</p>
      </div>

      <div class="input-container initial-input">
        <el-input
          v-model="retrievalInput"
          type="textarea"
          placeholder="您好，请输入你的问题"
          :autosize="{ minRows: 4, maxRows: 6 }"
          @keydown.enter.exact.prevent="handleRetrieval"
        />
        <button
          class="send-btn"
          @click="handleRetrieval"
          :disabled="!retrievalInput.trim()"
        >
          <el-icon class="mr-8">
            <Search />
          </el-icon>
          发送
        </button>
      </div>

      <div class="retrieval-tags">
        <el-button
          v-for="(tag, index) in popularTags"
          :key="index"
          class="retrieval-tag"
          @click="setRetrieval(tag)"
        >
          {{ tag }}
        </el-button>
      </div>
    </div>

    <!-- 返回按钮（显示结果时显示） -->
    <div v-if="conversationHistory.length > 0" class="back-button-container">
      <el-button type="primary" link @click="handleBackToInitial" class="back-button">
        <el-icon><Back /></el-icon>
        返回
      </el-button>
    </div>

    <!-- 加载状态 - 显示在输入框下方、回复内容上方 -->
    <div
      v-if="loadingRetrieval && conversationHistory.length === 0"
      class="loading-container"
    >
      <div class="loading-content">
        <div class="loading-text">思考中...</div>
        <div class="loading-spinner"></div>
      </div>
    </div>

    <!-- 对话历史记录（显示结果时显示） -->
    <div v-if="conversationHistory.length > 0" class="conversation-container">
      <div
        v-for="(item, index) in conversationHistory"
        :key="index"
        class="conversation-item"
      >
        <!-- 用户提问 -->
        <el-card class="user-question-card">
          <div class="user-question">
            <div class="question-content">{{ item.question }}</div>
            <img src="../../public/user.svg" alt="用户" class="user-avatar" />
          </div>
        </el-card>

        <!-- 加载状态 - 在结果状态下显示在左上角 -->
        <div
          v-if="
            loadingRetrieval && index === conversationHistory.length - 1 && isStreaming
          "
          class="loading-container-in-conversation"
        >
          <div class="loading-content">
            <div class="loading-text">思考中...</div>
            <div class="loading-spinner"></div>
          </div>
        </div>

        <!-- AI回答 - 支持流式输出 -->
        <div
          v-if="
            item.answer && !(loadingRetrieval && index === conversationHistory.length - 1)
          "
          class="system-answer"
        >
          <div class="answer-content">
            <div class="result-header">
              <div class="result-title">回复</div>
            </div>

            <!-- 流式回答显示区域 -->
            <div
              class="ai-answer-content"
              v-if="
                index === conversationHistory.length - 1 && isStreaming && streamingAnswer
              "
            >
              <div class="result-item">
                <div class="result-item-header">
                  <div class="result-item-title">AI 回答</div>
                </div>
                <div class="result-content">{{ streamingAnswer }}</div>
                <div class="action-buttons">
                  <div class="result-item-source">来源：AI智能问答助手</div>
                </div>
              </div>
            </div>

            <!-- 历史回答显示区域 -->
            <div v-else-if="item.answer" class="history-answer-content">
              <div
                v-for="(result, resultIndex) in item.answer"
                :key="resultIndex"
                class="result-item"
              >
                <div class="result-item-header">
                  <div class="result-item-title">{{ result.title }}</div>
                </div>
                <div class="result-content">{{ result.content }}</div>
                <div class="action-buttons">
                  <div class="result-item-source">
                    {{ result.source }}
                    <span class="update-time"> 更新日期:{{ result.updateDate }}</span>
                  </div>
                  <div>
                    <el-button size="small" type="primary" link>
                      <el-icon>
                        <Download />
                      </el-icon>
                      导出
                    </el-button>
                    <el-button size="small" type="primary" link>
                      <el-icon>
                        <View />
                      </el-icon>
                      查看详情
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部输入框（只在有对话历史时显示） -->
    <div
      v-if="conversationHistory.length > 0 && !loadingRetrieval"
      class="input-container bottom-input"
    >
      <el-input
        v-model="retrievalInput"
        placeholder="您好，还有什么可以帮助您？"
        style="height: 60px; border-radius: 20px"
        @keydown.enter.exact.prevent="handleRetrieval"
      />
      <button class="send-btn" @click="handleRetrieval">
        <el-icon class="mr-8">
          <Promotion />
        </el-icon>
        发送
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useAppStore } from '../stores/app';
import { Search, Download, View, Promotion, Back } from '@element-plus/icons-vue';

interface RetrievalResult {
  title: string;
  source: string;
  updateDate: string;
  content: string;
}

interface ConversationItem {
  question: string;
  answer: RetrievalResult[];
  timestamp: number;
}

const appStore = useAppStore();

// 检索输入
const retrievalInput = ref('');
const popularTags = ['报销审批流程', '员工晋升条件', '信息安全政策', '绩效等级制度'];

// 检索状态
const loadingRetrieval = ref(false);
const isStreaming = ref(false);
const showRetrievalResult = ref(false);
const streamingAnswer = ref('');

// 流式请求相关
const reader = ref<ReadableStreamDefaultReader<Uint8Array> | null>(null);
const abortController = ref<AbortController | null>(null);
let isCancelled = false;

// 历史对话记录
const conversationHistory = ref<ConversationItem[]>([]);

// 加载历史对话记录
const loadConversationHistory = () => {
  const saved = localStorage.getItem('intelligentRetrievalHistory');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      conversationHistory.value = parsed;
      showRetrievalResult.value = parsed.length > 0;
    } catch (e) {
      console.error('加载智能检索历史对话失败:', e);
    }
  }
};

// 保存历史对话记录
const saveConversationHistory = () => {
  try {
    localStorage.setItem(
      'intelligentRetrievalHistory',
      JSON.stringify(conversationHistory.value),
    );
  } catch (e) {
    console.error('保存智能检索历史对话失败:', e);
  }
};

// 设置检索
const setRetrieval = (query: string) => {
  retrievalInput.value = query;
  handleRetrieval();
};

// 返回初始状态
const handleBackToInitial = () => {
  // 清空对话历史
  conversationHistory.value = [];
  saveConversationHistory();
  // 重置输入框
  retrievalInput.value = '';
  // 隐藏结果
  showRetrievalResult.value = false;
  // 停止加载
  loadingRetrieval.value = false;
  isStreaming.value = false;
  streamingAnswer.value = '';
};

// 处理检索
const handleRetrieval = async () => {
  if (!retrievalInput.value.trim()) return;

  const currentQuestion = retrievalInput.value;

  // 清空输入框
  retrievalInput.value = '';

  loadingRetrieval.value = true;
  isStreaming.value = true;
  showRetrievalResult.value = true;
  streamingAnswer.value = '';

  // 添加到全局历史记录
  appStore.addHistory(currentQuestion);

  // 将当前问题添加到历史记录中，但暂时不添加答案
  conversationHistory.value.push({
    question: currentQuestion,
    answer: [],
    timestamp: Date.now(),
  });

  saveConversationHistory();

  // 调用AI大模型智能问答接口
  await startAIStreaming(currentQuestion);
};

// 开始AI流式请求
const startAIStreaming = async (queryText: string) => {
  try {
    isStreaming.value = true;
    streamingAnswer.value = '';
    isCancelled = false;

    const params = {
      inputs: {
        query: queryText,
      },
    };

    abortController.value = new AbortController();

    // 这里替换为实际的AI大模型智能问答接口
    const response = await fetch(
      '/api1/v1/1725c43e3fa54828a078fce60f5a3773/agents/52512531-0a97-480f-bd5c-5f4fd0df61c4/conversations/76e28615-8d2c-4913-8295-8a74e523334e?version=1775138805524', // 请替换为实际的AI接口
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
    let aiAnswerContent = '';

    while (true) {
      if (isCancelled) break;
      const { done, value } =
        (await reader.value!.read()) as ReadableStreamReadResult<Uint8Array>;
      if (done) {
        // 流式接收完成，将最终答案保存到历史记录
        if (aiAnswerContent.trim()) {
          const aiAnswerResult: RetrievalResult = {
            title: 'AI 回答',
            source: 'AI智能问答助手',
            updateDate: new Date().toLocaleDateString('zh-CN'),
            content: aiAnswerContent,
          };

          // 更新最后一个对话记录的答案
          if (conversationHistory.value.length > 0) {
            const lastIndex = conversationHistory.value.length - 1;
            conversationHistory.value[lastIndex].answer = [aiAnswerResult];
            saveConversationHistory();
          }
        }

        loadingRetrieval.value = false;
        isStreaming.value = false;
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const processedContent = processAIResponseChunk(chunk);

      if (processedContent) {
        aiAnswerContent += processedContent;
        streamingAnswer.value = aiAnswerContent;
      }
    }
  } catch (error: any) {
    if (error?.name !== 'AbortError') {
      console.error('获取AI回答时出错:', error);

      // 添加错误消息到历史记录
      const errorResult: RetrievalResult = {
        title: 'AI 回答',
        source: 'AI智能问答助手',
        updateDate: new Date().toLocaleDateString('zh-CN'),
        content: '抱歉，获取AI回答时出现错误，请稍后重试。',
      };

      if (conversationHistory.value.length > 0) {
        const lastIndex = conversationHistory.value.length - 1;
        conversationHistory.value[lastIndex].answer = [errorResult];
        saveConversationHistory();
      }
    }
  } finally {
    loadingRetrieval.value = false;
    isStreaming.value = false;
    reader.value = null;

    // 滚动到底部
    setTimeout(() => {
      const container = document.querySelector('.conversation-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 100);
  }
};

// 处理AI响应数据块
const processAIResponseChunk = (chunk: string) => {
  const lines = chunk.split('\n');
  let content = '';

  lines.forEach((line: string) => {
    if (line.startsWith('data:')) {
      const dataLine = line.substring(5).trim();
      if (dataLine) {
        try {
          const parsedData = JSON.parse(dataLine);
          if (parsedData.event === 'message' && parsedData.content) {
            content += parsedData.content;
          }
        } catch (error) {
          console.error('解析AI响应JSON失败:', error, '原始数据:', dataLine);
        }
      }
    }
  });
  return content;
};

// 停止流
const stopStream = () => {
  abortController.value?.abort();
  reader.value?.cancel();
  isCancelled = true;
  isStreaming.value = false;
  loadingRetrieval.value = false;
};

// 组件挂载时加载历史记录
onMounted(() => {
  loadConversationHistory();

  // 组件卸载时停止流
  onUnmounted(() => {
    stopStream();
  });
});
</script>

<style lang="less" scoped>
.intelligent-retrieval {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  width: 100%;
  position: relative;
  padding: 0 20px;
  box-sizing: border-box;

  .initial-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 850px;
    // margin-top: 78px;
  }

  .retrieval-header {
    text-align: center;
    margin-bottom: 20px;
    width: 100%;

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
    width: 100%;
    max-width: 850px;
    margin: 20px auto 40px;
    padding: 15px 20px;
    background: @white;
    position: relative;
    box-sizing: border-box;

    &.bottom-input {
      position: fixed;
      bottom: 20px;
      z-index: 10;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
      border-radius: 20px;
      margin: 0;
      width: calc(100% - 40px);
      max-width: 850px;
    }

    :deep(.el-textarea__inner) {
      border-radius: 10px;
      width: 100%;
    }

    .el-textarea__inner {
      padding: 16px;
      font-size: 16px;
      border-radius: 8px;
      border: 1px solid @border-color;
      resize: none;
      min-height: 120px;
      width: 100%;

      &:focus {
        border-color: @primary-color;
      }
    }
  }

  .send-btn {
    position: absolute;
    right: 32px;
    bottom: 25px;
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

    &:disabled {
      background: #c0c4cc;
      cursor: not-allowed;
    }
  }

  .retrieval-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: space-between;
    max-width: 850px;
    margin: 0 auto 30px;
    width: 100%;

    .retrieval-tag {
      padding: 18px 45px;
      background-color: #f0f7ff;
      border-radius: 20px;
      color: @primary-color;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background-color: #e6f7ff;
      }
    }
  }

  .back-button-container {
    width: 100%;
    max-width: 850px;
    margin: 20px auto;

    .back-button {
      display: flex;
      align-items: center;
      gap: 8px;
      color: @primary-color;
      font-size: 14px;

      &:hover {
        color: #40a9ff;
      }
    }
  }

  // 初始状态下的加载提示
  .loading-container {
    width: 100%;
    max-width: 850px;
    margin: 0 auto 20px;
    text-align: left;
    padding: 15px 20px;

    .loading-content {
      display: flex;
      align-items: center;
      gap: 10px;

      .loading-text {
        font-size: 16px;
        font-weight: 500;
        color: @primary-color;
      }

      .loading-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid #f3f3f3;
        border-top: 2px solid @primary-color;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
    }
  }

  // 对话中的加载提示
  .loading-container-in-conversation {
    text-align: left;
    margin: 10px 0 20px 0;
    width: 100%;

    .loading-content {
      display: flex;
      align-items: center;
      gap: 10px;

      .loading-text {
        font-size: 16px;
        font-weight: 500;
        color: @primary-color;
      }

      .loading-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid #f3f3f3;
        border-top: 2px solid @primary-color;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
    }
  }

  .conversation-container {
    width: 100%;
    max-width: 850px;
    margin: 0 auto 100px;
    padding: 10px 0;
    min-height: 60vh;
    display: flex;
    flex-direction: column;
    align-items: center;

    .conversation-item {
      width: 100%;
      margin-bottom: 30px;

      .user-question-card {
        margin-bottom: 20px;
        text-align: right;
        width: 100%;

        :deep(.el-card__body) {
          padding: 12px 16px;
        }

        .user-question {
          display: flex;
          align-items: center;
          justify-content: flex-end;

          .question-content {
            background: #f2f2f2;
            padding: 12px 16px;
            border-radius: 12px;
            margin-right: 12px;
            max-width: 80%;
            word-wrap: break-word;
          }

          .user-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
          }
        }
      }

      .system-answer {
        width: 100%;

        .answer-content {
          width: 100%;

          .result-header {
            display: flex;
            margin-bottom: 16px;

            .result-title {
              font-size: 18px;
              font-weight: 600;
              color: @text-color;
              border-left: 4px solid @primary-color;
              padding-left: 15px;
            }
          }
        }
      }
    }
  }

  .ai-answer-content,
  .history-answer-content {
    width: 100%;
  }

  .result-item {
    padding: 20px;
    border: 1px solid @border-color-light;
    border-radius: 8px;
    margin-bottom: 16px;
    background-color: @white;
    width: 100%;

    &-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    &-title {
      font-weight: 600;
      color: @text-color;
    }

    &-source {
      font-size: 12px;
      color: @info-color;
    }

    .result-content {
      line-height: 1.6;
      color: @text-color-secondary;
      margin-bottom: 16px;
      white-space: pre-wrap;
    }

    .action-buttons {
      display: flex;
      gap: 12px;
      justify-content: space-between;

      .result-item-source {
        .update-time {
          margin-left: 50px;
        }
      }
    }
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
