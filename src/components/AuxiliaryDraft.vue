<template>
  <div class="auxiliary-draft">
    <!-- 头部区域（仅在无历史对话时显示） -->
    <div class="draft-header" v-if="!loadingAnswer && conversationHistory.length === 0">
      <h1>我是制度起草助手，很高兴见到你</h1>
      <p>帮助您快速生成合规、专业的制度文档，降低起草难度，节约时间成本</p>
    </div>

    <!-- 历史对话列表 -->
    <div class="conversation-history" v-if="conversationHistory.length > 0">
      <div
        v-for="(item, index) in conversationHistory"
        :key="item.id"
        :class="[
          'history-item',
          item.role === 'user' ? 'user-message' : 'assistant-message',
        ]"
      >
        <!-- 用户消息 -->
        <div v-if="item.role === 'user'" class="message-user">
          <div class="message-header">
            <div class="avatar user-avatar">
              <img src="../../public/user.svg" alt="用户" />
            </div>
            <div class="message-info">
              <div class="message-content">{{ item.content }}</div>
              <div class="message-time">{{ formatTime(item.timestamp) }}</div>
            </div>
          </div>
        </div>

        <!-- AI回复消息 -->
        <div v-else class="message-assistant">
          <div class="message-header">
            <div class="avatar ai-avatar">
              <span>🤖</span>
            </div>
            <div class="message-info">
                回复
              <div
                class="message-content pad"
                id="pdfDom"
                v-html="renderedMarkdown(item.content)"
              ></div>
              <div class="message-time">{{ formatTime(item.timestamp) }}</div>
            </div>
          </div>

          <!-- 操作按钮（仅在助手消息显示） -->
          <div
            class="action-buttons"
            v-if="!isCurrentThinking && conversationHistory.length - 1 === index"
          >
            <el-button
              size="small"
              @click="regenerateAnswer(item.id)"
              :loading="regeneratingId === item.id"
              plain
            >
              <el-icon>
                <Refresh />
              </el-icon>
              重新生成
            </el-button>
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
          </div>
        </div>
      </div>

      <!-- 当前回答加载中 -->
      <div
        v-if="loadingAnswer && currentDisplayQuestion"
        class="history-item assistant-message"
      >
        <div class="message-header">
          <div class="avatar ai-avatar">
            <span>🤖</span>
          </div>
          <div class="message-info">
            <div v-if="!showAnswer" class="thinking-indicator">
              <div class="thinking-dots">
                <p class="think">思考中</p>
                <span></span>
                <span></span>
                <span></span>
              </div>
              <div class="reasoning-content" v-if="reasoningContent">
                {{ reasoningContent }}
              </div>
            </div>
            <div
              v-else
              class="message-content"
              v-html="renderedMarkdown(finalContent)"
            ></div>
            <div class="message-time">{{ formatTime(new Date()) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 返回按钮（在对话历史存在时显示） -->
    <el-icon
      v-if="conversationHistory.length > 0 && !loadingAnswer"
      class="back-icon"
      @click="goback"
    >
      <ArrowLeftBold />
    </el-icon>

    <!-- 输入区域（始终显示在底部） -->
    <div
      class="input-container"
      :class="{ 'with-history': conversationHistory.length > 0 }"
    >
      <!-- 输入框区域 -->
      <div class="input-area">
        <el-input
          v-model="draftInput"
          type="textarea"
          placeholder="您好，请描述你的制度要求，包括使用范围、核心条款、特殊要求等..."
          :autosize="{ minRows: 3, maxRows: 6 }"
          :disabled="loadingAnswer"
          @keydown.enter.exact.prevent="handleDraft"
        />
        <button
          class="send-btn"
          @click="handleDraft"
          :disabled="!draftInput.trim() || loadingAnswer"
        >
          <el-icon class="mr-8">
            <Promotion />
          </el-icon>
          {{ loadingAnswer ? '发送中...' : '发送' }}
        </button>
      </div>
      <!-- 推荐问题（仅在无历史对话时显示） -->
      <div
        v-if="!loadingAnswer && conversationHistory.length === 0"
        class="recommend-questions"
      >
        <div class="recommend-title">推荐问题</div>
        <div
          v-for="(question, index) in recommendQuestions"
          :key="index"
          class="recommend-item"
          @click="setDraft(question)"
        >
          <span>{{ question }}</span>
          <el-icon>
            <ArrowRight />
          </el-icon>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import MarkdownIt from 'markdown-it';
import { useAppStore } from '../stores/app';
import {
  Promotion,
  Download,
  Refresh,
  ArrowRight,
  ArrowLeftBold,
} from '@element-plus/icons-vue';
import htmlToPdf from '../utils/htmlToPdf';
import { ElMessage } from 'element-plus';

// 状态变量
const loading = ref(false);
const isStreaming = ref(false);
const finalContent = ref('');
const reasoningContent = ref('');
const events = ref<Array<string>>([]);
const reader = ref<ReadableStreamDefaultReader<Uint8Array> | null>(null);
const abortController = ref<AbortController | null>(null);
let isCancelled = false;
const appStore = useAppStore();
// 对话历史相关
interface ConversationItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const conversationHistory = ref<ConversationItem[]>([]);
const draftInput = ref('');
const currentDisplayQuestion = ref('');
const loadingAnswer = ref(false);
const showAnswer = ref(false);
const regeneratingId = ref<string | null>(null);
const recommendQuestions = [
  '编写党委会议事规则',
  '编写适用于全集团的IT安全管理制度',
  '编写工程建设项目管理制度',
];

// 计算当前是否正在思考
const isCurrentThinking = computed(() => {
  return loadingAnswer.value && !showAnswer.value;
});

// Markdown渲染
const md = new MarkdownIt();
const renderedMarkdown = computed(() => (content: string) => md.render(content));

// 加载历史对话
const loadConversationHistory = () => {
  const saved = localStorage.getItem('draftConversationHistory');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      conversationHistory.value = parsed.map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp),
      }));
    } catch (e) {
      console.error('加载历史对话失败:', e);
    }
  }
};

// 保存历史对话
const saveConversationHistory = () => {
  try {
    localStorage.setItem(
      'draftConversationHistory',
      JSON.stringify(conversationHistory.value),
    );
  } catch (e) {
    console.error('保存历史对话失败:', e);
  }
};

// 组件挂载
onMounted(() => {
  loadConversationHistory();
  setTimeout(() => {
    scrollToBottom();
  }, 100);
});

// 监听对话历史变化
watch(
  conversationHistory,
  () => {
    saveConversationHistory();
    nextTick(() => {
      scrollToBottom();
    });
  },
  { deep: true },
);

// 滚动到底部
const scrollToBottom = () => {
  const container = document.querySelector('.conversation-history');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
};

// 格式化时间
const formatTime = (date: Date) => {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

// 设置起草内容
const setDraft = (question: string) => {
  draftInput.value = question;
  handleDraft();
};

// 处理起草请求
const handleDraft = () => {
  const question = draftInput.value.trim();
  if (!question || loadingAnswer.value) return;

  // 保存用户消息
  const userMessage: ConversationItem = {
    id: Date.now().toString(),
    role: 'user',
    content: question,
    timestamp: new Date(),
  };

  conversationHistory.value.push(userMessage);
  currentDisplayQuestion.value = question;
  draftInput.value = '';

  // 开始加载
  loadingAnswer.value = true;
  showAnswer.value = false;
  finalContent.value = '';
  reasoningContent.value = '';
  // appStore.addHistory(question);
  // 调用API
  startStream(question);
};

// 重新生成回答
const regenerateAnswer = (messageId: string) => {
  // 找到对应的助手消息
  const messageIndex = conversationHistory.value.findIndex((msg) => msg.id === messageId);
  if (messageIndex === -1) return;

  const message = conversationHistory.value[messageIndex];
  if (message.role !== 'assistant') return;

  // 找到对应的用户问题
  const userMessageIndex = messageIndex - 1;
  if (userMessageIndex < 0 || conversationHistory.value[userMessageIndex].role !== 'user')
    return;

  const userQuestion = conversationHistory.value[userMessageIndex].content;

  // 移除原来的助手回复
  conversationHistory.value.splice(messageIndex, 1);

  // 重新生成
  regeneratingId.value = messageId;
  loadingAnswer.value = true;
  showAnswer.value = false;
  finalContent.value = '';
  reasoningContent.value = '';

  startStream(userQuestion);
};

// 流式请求
const startStream = async (queryText: string) => {
  try {
    isStreaming.value = true;
    finalContent.value = '';
    reasoningContent.value = '';
    events.value = [];
    isCancelled = false;

    const params = {
      inputs: {
        query: queryText,
      },
    };

    abortController.value = new AbortController();

    const response = await fetch(
      '/api1/v1/1725c43e3fa54828a078fce60f5a3773/agents/fe7b5350-c3ee-41d4-b5d5-ecc6c26d33b3/conversations/84a263c0-2795-4d91-b1c1-c5e72fb5bf15?version=1775207010237',
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
    let assistantMessageContent = '';

    while (true) {
      if (isCancelled) break;
      const { done, value } =
        (await reader.value!.read()) as ReadableStreamReadResult<Uint8Array>;
      if (done) {
        // 流式接收完成，保存AI回复到历史
        if (assistantMessageContent.trim()) {
          const assistantMessage: ConversationItem = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: assistantMessageContent,
            timestamp: new Date(),
          };
          conversationHistory.value.push(assistantMessage);
        }

        loadingAnswer.value = false;
        showAnswer.value = true;
        regeneratingId.value = null;
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const processedContent = processChunk(chunk);

      if (processedContent) {
        assistantMessageContent += processedContent;
        finalContent.value = assistantMessageContent;
        showAnswer.value = true;
      }
    }
  } catch (error: any) {
    if (error?.name !== 'AbortError') {
      console.error('获取流数据时出错:', error);
      // 添加错误消息
      const errorMessage: ConversationItem = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，回答过程中出现错误，请稍后重试。',
        timestamp: new Date(),
      };
      conversationHistory.value.push(errorMessage);
    }
  } finally {
    isStreaming.value = false;
    loadingAnswer.value = false;
    regeneratingId.value = null;
    reader.value = null;
  }
};

// 处理数据块
const processChunk = (chunk: string) => {
  const lines = chunk.split('\n');
  let content = '';

  lines.forEach((line: string) => {
    if (line.startsWith('data:')) {
      const dataLine = line.substring(5).trim();
      if (dataLine) {
        try {
          const parsedData = JSON.parse(dataLine);
          if (parsedData.event === 'message') {
            if (parsedData.reasoning_content) {
              reasoningContent.value += parsedData.reasoning_content;
            } else if (parsedData.content) {
              content += parsedData.content;
            }
          }
        } catch (error) {
          console.error('解析JSON失败:', error, '原始数据:', dataLine);
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
  loadingAnswer.value = false;
  regeneratingId.value = null;
};

const goback = () => {
  conversationHistory.value.length = 0;
  showAnswer.value = false;
};

// PDF导出
const pdfFunc = () => {
  loading.value = true;
  htmlToPdf.getPdf('myPdf');
  setTimeout(() => {
    loading.value = false;
    ElMessage.success('导出成功!');
  }, 1000);
};

// 组件卸载时停止流
onUnmounted(() => {
  stopStream();
});
</script>

<style lang="less" scoped>
.auxiliary-draft {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 20px;
  background-color: #f5f7fa;
  position: relative;

  .draft-header {
    text-align: center;
    margin-bottom: 40px;
    margin-top: 60px;

    h1 {
      font-size: 28px;
      color: #303133;
      margin-bottom: 12px;
      font-weight: 600;
    }

    p {
      font-size: 16px;
      color: #606266;
    }
  }

  .conversation-history {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;

    .history-item {
      max-width: 850px;
      margin: 0 auto;
      animation: slideIn 0.3s ease-out;

      &.user-message {
        align-self: flex-end;
        width: 100%;

        .message-user {
          .message-header {
            flex-direction: row-reverse;

            .avatar {
              margin-left: 12px;
              margin-right: 0;
            }

            .message-info {
              max-width: 850px;
              align-items: flex-end;

              .message-content {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 12px;
                padding: 10px 20px;
                line-height: 1.6;
                word-break: break-word;
              }

              .message-time {
                text-align: right;
              }
            }
          }
        }
      }

      &.assistant-message {
        align-self: flex-start;
        width: 100%;

        .message-header {
          .message-info {
            max-width: 850px;
            width: 100%;

            .message-content {
              width: 100%;
              max-width: 100%;
              box-sizing: border-box;
              background: white;
              color: #303133;
              border-radius: 12px;
              box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
              padding: 20px 40px;
              line-height: 1.6;
              word-break: break-word;

              :deep(pre) {
                background-color: #f6f8fa;
                border-radius: 6px;
                padding: 12px;
                overflow-x: auto;
                margin: 8px 0;

                code {
                  font-family: 'Consolas', 'Monaco', monospace;
                }
              }

              :deep(code) {
                background-color: #f6f8fa;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 0.9em;
              }
            }

            .pad {
              padding: 20px 40px;
            }

            .thinking-indicator {
              width: 100%;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              gap: 8px;
              padding: 12px 16px;
              background: white;
              border-radius: 12px;
              box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);

              .thinking-dots {
                display: flex;
                align-items: center;
                gap: 4px;

                .think {
                  color: #303133;
                  font-size: 18px;
                  font-weight: 600;
                }

                span {
                  width: 5px;
                  height: 5px;
                  border-radius: 50%;
                  background-color: #409eff;
                  animation: blink 1.4s infinite;

                  &:nth-child(2) {
                    animation-delay: 0.2s;
                  }

                  &:nth-child(3) {
                    animation-delay: 0.4s;
                  }
                }
              }

              .reasoning-content {
                font-size: 15px;
                color: #909399;
                width: 100%;
                word-break: break-word;
              }
            }
          }
        }
      }
    }
  }

  .message-header {
    display: flex;
    align-items: flex-start;
    max-width: 100%;

    .avatar {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      margin-right: 12px;

      &.user-avatar {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

        img {
          width: 24px;
          height: 24px;
          filter: brightness(0) invert(1);
        }
      }

      &.ai-avatar {
        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        font-size: 20px;
        color: white;
      }
    }

    .message-info {
      margin-top: 7px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;

      .message-content {
        padding: 10px 20px;
        line-height: 1.6;
        word-break: break-word;
      }

      .message-time {
        font-size: 15px;
        color: #909399;
        padding: 0 4px;
      }
    }
  }

  .action-buttons {
    display: flex;
    gap: 12px;
    margin-top: 12px;
    margin-left: 52px;

    :deep(.el-button) {
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 500;

      &.el-button--success {
        background: linear-gradient(135deg, #67c23a 0%, #85ce61 100%);
        border: none;
        color: white;

        &:hover {
          opacity: 0.9;
        }
      }
    }
  }

  .back-icon {
    position: fixed;
    font-size: 23px;
    color: #4285f4;
    cursor: pointer;
  }

  .input-container {
    max-width: 850px;
    width: 100%;
    margin: 0 auto 70px;
    padding: 20px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);

    &.with-history {
      margin-top: 0;
    }

    .recommend-questions {
      margin-bottom: 20px;
      margin-top: 15px;

      .recommend-title {
        font-size: 16px;
        font-weight: 500;
        color: #606266;
        margin-bottom: 12px;
      }

      .recommend-item {
        padding: 12px 16px;
        border: 1px solid #dcdfe6;
        border-radius: 8px;
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        transition: all 0.3s ease;
        background: white;

        &:hover {
          border-color: #409eff;
          background-color: #f5f7fa;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(64, 158, 255, 0.1);
        }

        span {
          font-size: 14px;
          color: #303133;
        }

        .el-icon {
          color: #409eff;
        }
      }
    }

    .input-area {
      position: relative;

      :deep(.el-textarea__inner) {
        padding: 16px;
        font-size: 15px;
        border-radius: 12px;
        border: 1px solid #e4e7ed;
        transition: all 0.3s ease;
        resize: none;

        &:hover,
        &:focus,
        &.is-focus {
          border-color: #409eff;
          box-shadow: none;
        }

        &:disabled {
          background-color: #f5f7fa;
          cursor: not-allowed;
        }
      }

      .send-btn {
        position: absolute;
        right: 12px;
        bottom: 12px;
        background: #1890ff;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 8px 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 80px;

        &:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(64, 158, 255, 0.4);
        }

        &:disabled {
          background: #c0c4cc;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .mr-8 {
          margin-right: 8px;
        }
      }
    }
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes blink {
  0%,
  100% {
    opacity: 0.2;
  }
  50% {
    opacity: 1;
  }
}
</style>
