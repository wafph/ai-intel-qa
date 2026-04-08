<template>
  <div class="intelligent-qa">
    <!-- 头部区域 -->
    <div class="qa-header" v-if="!loadingAnswer && conversationHistory.length === 0">
      <h1>我是问答助手，很高兴见到你</h1>
      <p>你可以使用自然语言提问，我来精准回答</p>
    </div>

    <!-- 历史对话列表 -->
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
              <p class="anser">回复</p>
              <!-- 双列布局容器 -->
              <div
                class="two-column-layout"
                v-if="item.showCitation && item.answerContent && item.citationContent"
              >
                <!-- 左列：回答内容（65%） -->
                <div class="answer-column">
                  <div
                    class="message-content pad"
                    v-html="renderedMarkdown(item.answerContent)"
                  ></div>
                </div>

                <!-- 右列：引用来源（35%） -->
                <div class="citation-column">
                  <div class="citation-header">
                    <el-icon><Document /></el-icon>
                    <span>来源</span>
                  </div>
                  <div
                    class="citation-content"
                    v-html="renderedMarkdown(item.citationContent)"
                  ></div>
                </div>
              </div>

              <!-- 单列布局（默认） -->
              <div v-else>
                <div
                  class="message-content pad"
                  id="pdfDom"
                  v-html="renderedMarkdown(item.content)"
                ></div>
              </div>
              <div class="message-time">{{ formatTime(item.timestamp) }}</div>
            </div>
          </div>

          <div class="action-buttons">
            <el-button size="small" type="primary" plain @click="toggleCitation(item.id)">
              {{ item.showCitation ? '隐藏来源' : '引用来源' }}
              <el-icon>
                <ArrowRightBold />
              </el-icon>
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
              class="message-content pad"
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

    <!-- 输入区域（始终显示） -->
    <div class="input-container">
      <el-input
        v-model="currentQuestion"
        :placeholder="questionPlaceholder"
        style="height: 60px; border-radius: 20px"
        @keydown.enter.exact.prevent="handleSendQuestion"
        clearable
        :disabled="loadingAnswer"
      />
      <button
        class="send-btn"
        @click="handleSendQuestion"
        :disabled="!currentQuestion.trim() || loadingAnswer"
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
import { Promotion, Download, Document } from '@element-plus/icons-vue';
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

// 输入框变量
const currentQuestion = ref('');
const questionPlaceholder = '您好，请输入您的问题';

// 对话历史
interface ConversationItem {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  id: string;
  showCitation?: boolean; // 是否显示引用来源
  answerContent?: string; // 分割后的回答内容
  citationContent?: string; // 分割后的引用来源
}

const conversationHistory = ref<ConversationItem[]>([]);
const currentDisplayQuestion = ref('');

// 回答状态
const loadingAnswer = ref(false);
const showAnswer = ref(false);

// 加载历史对话
const loadConversationHistory = () => {
  const saved = localStorage.getItem('conversationHistory');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      conversationHistory.value = parsed.map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp),
        // 确保有分割内容字段
        showCitation: item.showCitation || false,
        answerContent: item.answerContent || '',
        citationContent: item.citationContent || '',
      }));
    } catch (e) {
      console.error('加载历史对话失败:', e);
    }
  }
};

// 保存历史对话
const saveConversationHistory = () => {
  try {
    // 保存前确保所有assistant消息都有分割后的内容
    conversationHistory.value.forEach((item) => {
      if (item.role === 'assistant' && item.showCitation && !item.answerContent) {
        splitContentForCitation(item);
      }
    });

    localStorage.setItem(
      'conversationHistory',
      JSON.stringify(conversationHistory.value),
    );
  } catch (e) {
    console.error('保存历史对话失败:', e);
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

// 新增：切换引用来源显示的函数
const toggleCitation = (messageId: string) => {
  const message = conversationHistory.value.find((item) => item.id === messageId);
  if (message && message.role === 'assistant') {
    // 切换显示状态
    message.showCitation = !message.showCitation;

    // 如果是第一次点击，分割内容
    if (message.showCitation && (!message.answerContent || !message.citationContent)) {
      splitContentForCitation(message);
    }
  }
};

// 新增：分割内容的函数
const splitContentForCitation = (message: ConversationItem) => {
  debugger;
  const content = message.content;

  // 查找"来源："在内容中的位置
  const sourceIndex = content.indexOf('来源：');
  debugger;

  if (sourceIndex !== -1) {
    // 分割内容和来源
    message.answerContent = content.substring(0, sourceIndex - 2).trim();
    console.log(message.answerContent);
    message.citationContent = content.substring(sourceIndex + 3).trim(); // +3 是为了跳过"来源："
  } else {
    // 如果没有找到"来源："，将整个内容作为回答，来源为空
    message.answerContent = content;
    message.citationContent = '暂无引用来源';
  }
};

// 组件挂载时加载历史记录
onMounted(() => {
  loadConversationHistory();
  // 自动滚动到底部
  setTimeout(() => {
    scrollToBottom();
  }, 100);
});

// 监听对话历史变化，自动保存
watch(
  conversationHistory,
  () => {
    saveConversationHistory();
    // 滚动到底部
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
const renderedMarkdown = computed(() => (content: string) => md.render(content));

// 发送问题
const handleSendQuestion = async () => {
  const question = currentQuestion.value.trim();
  if (!question || loadingAnswer.value) return;

  // 保存用户问题
  const userMessage: ConversationItem = {
    id: Date.now().toString(),
    role: 'user',
    content: question,
    timestamp: new Date(),
  };

  conversationHistory.value.push(userMessage);
  currentDisplayQuestion.value = question;
  currentQuestion.value = '';

  // 开始加载
  loadingAnswer.value = true;
  showAnswer.value = false;
  finalContent.value = '';
  reasoningContent.value = '';
  appStore.addHistory(question);

  // 调用API
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
      '/api1/v1/1725c43e3fa54828a078fce60f5a3773/workflows/60a15b33-e781-4d5d-88d3-5ed90054d9b0/conversations/0bcf02aa-9651-4a9c-a747-09d4a440aec9?version=1775639876207',
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
            showCitation: false, // 默认不显示引用来源
            answerContent: '', // 初始化为空
            citationContent: '', // 初始化为空
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
      // 添加错误消息
      const errorMessage: ConversationItem = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，回答过程中出现错误，请稍后重试。',
        timestamp: new Date(),
        showCitation: false,
        answerContent: '',
        citationContent: '',
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
          console.log(parsedData);
          if (parsedData.event === 'message') {
            if (parsedData?.data?.reasoning_content) {
              reasoningContent.value += parsedData?.data?.reasoning_content;
            } else if (parsedData.data.text) {
              content += parsedData.data.text;
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

const goback = () => {
  conversationHistory.value.length = 0;
  loadingAnswer.value = false;
};

// 组件卸载时停止流
onUnmounted(() => {
  stopStream();
});
</script>

<style lang="less" scoped>
.intelligent-qa {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 20px;
  background-color: #f5f7fa;
  position: relative;

  .qa-header {
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
            max-width: 850px; /* 固定AI消息内容区域最大宽度 */
            width: 100%; /* 确保宽度充满但不超过最大限制 */

            .anser {
              margin-top: 5px;
            }

            /* 双列布局样式 */
            .two-column-layout {
              display: flex;
              gap: 20px;
              width: 100%;
              max-width: 100%;
              margin: 10px 0;

              /* 左列：回答内容（65%） */
              .answer-column {
                flex: 0 0 65%; /* 占据65%宽度 */
                max-width: 65%;
                overflow: hidden;

                .message-content {
                  width: 100%;
                  max-width: 100%;
                  box-sizing: border-box;
                  background: white;
                  color: #303133;
                  border-radius: 12px;
                  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
                  padding: 20px;

                  /* Markdown 内容样式 */
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

                  :deep(p) {
                    margin: 0 0 10px 0;
                    line-height: 1.6;
                  }

                  :deep(ul),
                  :deep(ol) {
                    margin: 10px 0;
                    padding-left: 20px;
                  }

                  :deep(blockquote) {
                    border-left: 4px solid #409eff;
                    margin: 10px 0;
                    padding-left: 12px;
                    color: #666;
                  }
                }
              }

              /* 右列：引用来源（35%） */
              .citation-column {
                flex: 0 0 35%; /* 占据35%宽度 */
                max-width: 35%;
                background-color: @white;
                border-radius: 12px;
                border: 1px solid #e9ecef;
                overflow: hidden;
                display: flex;
                flex-direction: column;

                /* 引用来源头部 */
                .citation-header {
                  border-left: 2px solid red;
                  padding: 12px 20px;
                  font-weight: 600;
                  font-size: 16px;
                  display: flex;
                  align-items: center;
                  gap: 8px;

                  .el-icon {
                    font-size: 18px;
                  }
                }

                /* 引用来源内容 */
                .citation-content {
                  flex: 1;
                  padding: 20px;
                  overflow-y: auto;
                  max-height: 400px;
                  color: #495057;
                  font-size: 14px;
                  line-height: 1.5;

                  /* Markdown 内容样式 */
                  :deep(pre) {
                    background-color: #e9ecef;
                    border-radius: 4px;
                    padding: 8px 12px;
                    overflow-x: auto;
                    margin: 8px 0;
                    font-size: 12px;

                    code {
                      font-family: 'Consolas', 'Monaco', monospace;
                      background: none;
                      padding: 0;
                    }
                  }

                  :deep(code) {
                    background-color: #e9ecef;
                    padding: 2px 4px;
                    border-radius: 3px;
                    font-size: 12px;
                    color: #e83e8c;
                  }

                  :deep(p) {
                    margin: 0 0 8px 0;
                    line-height: 1.4;
                  }

                  :deep(ul),
                  :deep(ol) {
                    margin: 8px 0;
                    padding-left: 18px;
                  }

                  :deep(li) {
                    margin-bottom: 4px;
                  }

                  :deep(a) {
                    color: #409eff;
                    text-decoration: none;

                    &:hover {
                      text-decoration: underline;
                    }
                  }

                  :deep(strong) {
                    color: #212529;
                  }

                  :deep(blockquote) {
                    border-left: 3px solid #adb5bd;
                    margin: 8px 0;
                    padding-left: 10px;
                    color: #6c757d;
                    font-style: italic;
                  }
                }
              }
            }

            /* 响应式设计：在小屏幕上改为单列 */
            @media (max-width: 768px) {
              .two-column-layout {
                flex-direction: column;

                .answer-column,
                .citation-column {
                  flex: 0 0 100%;
                  max-width: 100%;
                }
              }
            }

            /* 单列布局样式 */
            .message-content {
              width: 100%; /* 固定内容宽度，不随内容撑开 */
              max-width: 100%; /* 覆盖之前的max-width: 700px */
              box-sizing: border-box; /* 确保padding和border包含在宽度内 */
              background: white;
              color: #303133;
              border-radius: 12px;
              box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);

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
              width: 100%; /* 固定思考指示器宽度 */
              box-sizing: border-box; /* 确保padding和border包含在宽度内 */
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

  .back-icon {
    position: fixed;
    font-size: 23px;
    color: #4285f4;
    cursor: pointer;
    z-index: 1000;
  }

  .input-container {
    max-width: 850px;
    width: 100%;
    margin: 0 auto 70px;
    padding: 20px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    position: relative;

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

    .send-btn {
      position: absolute;
      right: 35px;
      top: 50%;
      transform: translateY(-50%);
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
        transform: translateY(-50%) scale(1.05);
        box-shadow: 0 4px 12px rgba(64, 158, 255, 0.4);
      }

      &:disabled {
        background: #c0c4cc;
        cursor: not-allowed;
        transform: translateY(-50%);
        box-shadow: none;
      }

      .mr-8 {
        margin-right: 8px;
      }
    }
  }

  .suggestions {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex-wrap: wrap;
    max-width: 850px;
    gap: 20px;
    margin: 20px auto;

    .suggestion-btn {
      padding: 12px 24px;
      background-color: #f0f7ff;
      border: 1px solid #e4e7ed;
      border-radius: 20px;
      margin-left: 0;
      transition: all 0.2s;

      &:hover {
        border-color: #409eff;
        color: #409eff;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(64, 158, 255, 0.1);
      }
    }
  }

  .action-buttons {
    display: flex;
    padding: 10px;
    gap: 12px;
    margin-left: 45px;

    :deep(.el-button) {
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 500;
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

/* 引用来源区域的进入动画 */
.citation-column {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
