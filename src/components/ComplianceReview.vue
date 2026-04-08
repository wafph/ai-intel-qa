<template>
  <div class="audit-container">
    <!-- 头部区域 (仅在无历史对话时显示) -->
    <div class="review-header" v-if="!loadingAnswer && conversationHistory.length === 0">
      <h1>智能合规审核，守护业务合规底线</h1>
      <p>以科技赋能合规管理，自动校验，高效守护业务规范</p>
    </div>

    <!-- 历史对话列表 (类似IntelligentQA) -->
    <div class="conversation-history" v-if="conversationHistory.length > 0">
      <div
        v-for="(item, index) in conversationHistory"
        :key="index"
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
                class="message-content"
                id="pdfDom"
                v-html="renderedMarkdown(item.content)"
              ></div>
              <div class="message-time">{{ formatTime(item.timestamp) }}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; justify-content: flex-end">
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
            </div>
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
      class="lefticon"
      @click="goback"
    >
      <ArrowLeftBold />
    </el-icon>

    <!-- 修改点：两种输入框格式 -->
    <!-- 1. 无历史对话时显示textarea格式 -->
    <div v-if="conversationHistory.length === 0" class="input-container textarea-container">
      <el-input
        v-model="questionInput"
        type="textarea"
        :placeholder="questionPlaceholder"
        :rows="8"
        @keydown.enter.exact.prevent="handleSendQuestion"
        clearable
        :disabled="loadingAnswer"
        class="textarea-input"
      />
      <button
        class="send-btn"
        @click="handleSendQuestion"
        :disabled="!questionInput.trim() || loadingAnswer"
      >
        <el-icon class="mr-8">
          <Promotion />
        </el-icon>
        {{ loadingAnswer ? '发送中...' : '发送' }}
      </button>
    </div>

    <!-- 2. 有历史对话时显示单行输入框 -->
    <div v-else :class="['input-container', 'single-line-container']">
      <el-input
        v-model="questionInput"
        :placeholder="questionPlaceholder"
        style="height: 60px; border-radius: 20px"
        @keydown.enter.exact.prevent="handleSendQuestion"
        clearable
        :disabled="loadingAnswer"
        class="single-line-input"
      />
      <button
        class="send-btn bottom"
        @click="handleSendQuestion"
        :disabled="!questionInput.trim() || loadingAnswer"
      >
        <el-icon class="mr-8">
          <Promotion />
        </el-icon>
        {{ loadingAnswer ? '发送中...' : '发送' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import MarkdownIt from 'markdown-it';
import { useAppStore } from '../stores/app';
import { Promotion, Download, ArrowLeftBold } from '@element-plus/icons-vue';
import htmlToPdf from '../utils/htmlToPdf.js';
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

// 对话历史数据结构
interface ConversationItem {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  id: string;
}
const conversationHistory = ref<ConversationItem[]>([]);

// 输入框变量定义
const questionInput = ref('');
const currentDisplayQuestion = ref('');
const questionPlaceholder = '您好，请输入待审核内容';

// 回答状态
const loadingAnswer = ref(false);
const showAnswer = ref(false);

// 加载与保存历史对话
const loadConversationHistory = () => {
  const saved = localStorage.getItem('complianceConversationHistory');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      conversationHistory.value = parsed.map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp),
      }));
    } catch (e) {
      console.error('加载合规审核历史对话失败:', e);
    }
  }
};
const saveConversationHistory = () => {
  try {
    localStorage.setItem(
      'complianceConversationHistory',
      JSON.stringify(conversationHistory.value),
    );
  } catch (e) {
    console.error('保存合规审核历史对话失败:', e);
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

// 组件挂载时加载历史记录
onMounted(() => {
  loadConversationHistory();
  setTimeout(() => {
    scrollToBottom();
  }, 100);
});

// 监听对话历史变化，自动保存并滚动
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

// 滚动到底部函数
const scrollToBottom = () => {
  const container = document.querySelector('.conversation-history');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
};

// PDF导出功能
const pdfFunc = () => {
  loading.value = true;
  htmlToPdf.getPdf('myPdf');
  setTimeout(() => {
    loading.value = false;
    ElMessage.success('打印成功!');
  }, 1000);
};

const appStore = useAppStore();
const md = new MarkdownIt();
const renderedMarkdown = computed(() => (content: string) => md.render(content));

// 发送问题函数
const handleSendQuestion = async () => {
  const question = questionInput.value.trim();
  if (!question || loadingAnswer.value) return;

  // 保存用户问题到历史记录
  const userMessage: ConversationItem = {
    id: Date.now().toString(),
    role: 'user',
    content: question,
    timestamp: new Date(),
  };
  conversationHistory.value.push(userMessage);
  currentDisplayQuestion.value = question;
  questionInput.value = '';

  // 开始加载状态
  loadingAnswer.value = true;
  showAnswer.value = false;
  finalContent.value = '';
  reasoningContent.value = '';
  appStore.addHistory(question);

  // 调用流式API
  await startStream(question);
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
      '/api1/v1/1725c43e3fa54828a078fce60f5a3773/agents/820722c8-4ef6-4de9-8596-e1ab56b4946c/conversations/689f2795-366f-43bb-a19a-d5aa87bee7b7?version=1775051779794',
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
      const errorMessage: ConversationItem = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，审核过程中出现错误，请稍后重试。',
        timestamp: new Date(),
      };
      conversationHistory.value.push(errorMessage);
    }
  } finally {
    isStreaming.value = false;
    loadingAnswer.value = false;
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
};

// 返回/清空对话历史
const goback = () => {
  conversationHistory.value.length = 0;
  loadingAnswer.value = false;
  showAnswer.value = false;
  finalContent.value = '';
  reasoningContent.value = '';
};

// 组件卸载时停止流
onUnmounted(() => {
  stopStream();
});
</script>

<style lang="less" scoped>
.audit-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 20px;
  background-color: #f5f7fa;
  position: relative;

  .review-header {
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

  /* 对话历史区域样式 */
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
                font-size: 15px;
                color: #909399;
                padding: 0 4px;
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

            .message-time {
              font-size: 15px;
              color: #909399;
              padding: 0 4px;
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
    }
  }

  .lefticon {
    position: fixed;
    font-size: 23px;
    color: #4285f4;
    cursor: pointer;
  }

  /* 修改点：两种输入框容器样式 */
  .input-container {
    max-width: 850px;
    width: 100%;
    margin: 0 auto 20px;
    position: relative;

    /* 1. textarea容器样式（无历史对话时） */
    &.textarea-container {
      margin:0 auto; /* 与原始样式保持一致 */
      
      .textarea-input {
        width: 100%;
        
        :deep(.el-textarea__inner) {
          padding: 16px;
          font-size: 16px;
          border-radius: 8px;
          border: 1px solid #e4e7ed;
          resize: none;
          
          &:focus {
            border-color: #409eff;
          }
        }
      }
      
      .send-btn {
        position: absolute;
        right: 15px;
        bottom: 13px;
        background: #1890ff;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 10px 20px;
        font-size: 14px;
        cursor: pointer;
        transition: background-color 0.2s;
        display: flex;
        align-items: center;
        
        &:hover:not(:disabled) {
          background-color: #40a9ff;
        }
        
        &:disabled {
          background: #c0c4cc;
          cursor: not-allowed;
        }
        
        .mr-8 {
          margin-right: 8px;
        }
      }
    }
    
    /* 2. 单行输入框容器样式（有历史对话时） */
    &.single-line-container {
      padding: 20px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
      filter: drop-shadow(0px 5px 5px rgba(0, 0, 0, 0.19215686274509805));
      margin-bottom: 70px;
      
      .single-line-input {
        :deep(.el-input__wrapper) {
          border-radius: 20px;
          padding: 0 20px;
          font-size: 15px;
          border: 1px solid #e4e7ed;
          transition: all 0.3s ease;
          
          &:hover,
          &:focus,
          &.is-focus {
            border-color: #409eff;
            box-shadow: none;
          }
        }
      }
      
      .send-btn {
        position: absolute;
        right: 35px;
        bottom: 30px;
        background: #1890ff;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 10px 24px;
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
        
        &.bottom {
          bottom: 33px;
          right: 33px;
        }
      }
    }
  }

  .action-buttons {
    display: flex;
    padding: 10px;
    gap: 12px;
    justify-content: flex-end;

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