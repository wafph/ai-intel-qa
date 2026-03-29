<template>
  <div class="intelligent-qa">
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
        class="suggestion-btn"
        @click="setQuestion(suggestion)"
      >
        {{ suggestion }}
      </el-button>
    </div>
    <!-- {{ isStreaming }} {{ loadingAnswer }} {{ isStreaming }} -->
    <el-card class="res-container" v-if="loadingAnswer || showAnswer">
      <div class="anser-input">
        <div class="right-input">{{ questionInput }}</div>
        <img src="../../public/user.svg" alt="" />
      </div>
    </el-card>
    <!-- 回答加载中 -->
    <div v-if="loadingAnswer && isStreaming" class="result-container">
      <div class="result-header">
        <div class="result-title">思考中</div>
      </div>
      <div class="loading-spinner"></div>
      <div class="text-center">
        <p>正在智能分析中...</p>
        <p>系统正在分析您的问题并整理对应答复</p>
        <div class="reasoning-content">{{ reasoningContent }}</div>
      </div>
    </div>

    <!-- 回答结果 -->
    <div v-if="showAnswer" class="result-container">
      <div class="result-header">
        <div class="result-title">回复</div>
      </div>
      <div
        class="result-content"
        id="pdfDom"
        v-if="!isStreaming"
        v-html="renderedMarkdown"
      ></div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue';
import MarkdownIt from 'markdown-it';
import { useAppStore } from '../stores/app';
import { Promotion, Download, Refresh } from '@element-plus/icons-vue';
import htmlToPdf from '../utils/htmlToPdf';
const loading = ref(false);
const pdfFunc = () => {
  loading.value = true;
  // 调用htmlToPdf工具函数
  htmlToPdf.getPdf('myPdf');
  // 定时器模拟按钮loading动画的时间
  setTimeout(() => {
    loading.value = false;
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
// 问题输入
const questionInput = ref('');
const questionPlaceholder = '你好，请输入你的问题，比如：湖北交投的核心业务板块有哪些？';
const suggestions = [
  '湖北交投的核心业务板块有哪些？',
  '投资管理文件规定的制定依据是什么？',
  // '项目立项阶段的项目建议书应包含哪些核心内容？',
  '项目实施完成后，后评价工作如何开展？',
];

// 回答状态
const loadingAnswer = ref(false);
const showAnswer = ref(false);
// 设置问题
const setQuestion = (question: string) => {
  questionInput.value = question;
  handleSendQuestion();
};

// 发送问题
const handleSendQuestion = () => {
  if (!questionInput.value.trim()) return;
  loadingAnswer.value = true;
  showAnswer.value = false;
  appStore.addHistory(questionInput.value);
  startStream();
};

// 开始流式请求
const startStream = async () => {
  try {
    // 重置状态
    isStreaming.value = true;
    finalContent.value = '';
    reasoningContent.value = '';
    events.value = [];
    isCancelled = false;
    const params = {
      inputs: {
        query: questionInput.value,
      },
    };
    // 创建AbortController用于取消请求
    abortController.value = new AbortController();

    // 使用Fetch API发起请求
    const response = await fetch(
      '/rest/api4/v1/1725c43e3fa54828a078fce60f5a3773/agents/52512531-0a97-480f-bd5c-5f4fd0df61c4/conversations/58f7d2f6-8054-4fdd-82a8-ebe918c2545d?version=1774407434420',
      {
        method: 'post',
        headers: {
          'X-Auth-Token':
            'MIIPrQYJKoZIhvcNAQcCoIIPnjCCD5oCAQExDTALBglghkgBZQMEAgEwgg2-BgkqhkiG9w0BBwGggg2wBIINrHsidG9rZW4iOnsiZXhwaXJlc19hdCI6IjIwMjYtMDMtMzBUMDI6NDk6MzMuNTA2MDAwWiIsInNpZ25hdHVyZSI6IkVBcGpiaTF1YjNKMGFDMDBBQUFBQUFBQUJMZVJSTFVsODZ6RUx1dDZzU3JYYlVtWlQvWXQyQzkxKy9UM04xTUJGbUltWkIxWmg0QzFpVHo2TXlwYkFQUVNzT2pCeC9UeXVFanEyZ0w5ZXNxRFJ6OHI0TG4wL2pyWWpjeXUyUFRxYXVUQzdoNmZsNnkwWnRpTy9RUUFCZGljVGg0UXBxVDdDV1Uwa1ZDRTBOT0I0SFhHWHVpRFFYNzdzalhWZFliMUVwbExIR1Q5T2xFK0FISVIxdU05bklubmFZcTlVZWl2dlZaOExXOVJNQnp5L3hpUS9RVktRaFFzTlQ3VCt6UnpKL2ZuMHBkQU01SHFJbkpiN1MrdFNjdjNQbVlXT1JhSjZ4UFNsbVNiZTNmWGpVcUhZdzY5dXI0WVdjeVJXOVBBMEl6LzdmRExod3VKU0dWNGpHbXorRWJETlVUcW0zanFkNSt4Y2FGalpYM2M1NTMvIiwibWV0aG9kcyI6WyJwYXNzd29yZCJdLCJjYXRhbG9nIjpbXSwicm9sZXMiOlt7Im5hbWUiOiJhcGlnX2FkbSIsImlkIjoiMCJ9LHsibmFtZSI6ImFwbV9hZG0iLCJpZCI6IjAifSx7Im5hbWUiOiJhcGlnd19hZG0iLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9jc2JzX3JlcF9hY2NlbGVyYXRpb24iLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9lY3NfZGlza0FjYyIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2Rzc19tb250aCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX29ic19kZWVwX2FyY2hpdmUiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9hX2NuLXNvdXRoLTRjIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZGVjX21vbnRoX3VzZXIiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9jYnJfc2VsbG91dCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2Vjc19vbGRfcmVvdXJjZSIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2V2c19Sb3lhbHR5IiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfd2VsaW5rYnJpZGdlX2VuZHBvaW50X2J1eSIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2Nicl9maWxlIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZG1zLXJvY2tldG1xNS1iYXNpYyIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2V2c19FU2luZ2xlX2NvcHlTU0QiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9kbXMta2Fma2EzIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfb2JzX2RlY19tb250aCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2NzYnNfcmVzdG9yZSIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2Nicl92bXdhcmUiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9pZG1lX21ibV9mb3VuZGF0aW9uIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfcGNfdmVuZG9yX3N1YnVzZXIiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9tdWx0aV9iaW5kIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZXZzX3NzZF9lbnRyeSIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX3Ntbl9jYWxsbm90aWZ5IiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfYV9hcC1zb3V0aGVhc3QtM2QiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9jc2JzX3Byb2dyZXNzYmFyIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfY2VzX3Jlc291cmNlZ3JvdXBfdGFnIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZXZzX3JldHlwZSIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2tvb21hcCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2Rtcy1hbXFwLWJhc2ljIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZXZzX3Bvb2xfY2EiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9hX2NuLXNvdXRod2VzdC0yYiIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2h3Y3BoIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZWNzX29mZmxpbmVfZGlza180IiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfc21uX3dlbGlua3JlZCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2h2X3ZlbmRvciIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2FfY24tbm9ydGgtNGUiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9hX2NuLW5vcnRoLTRkIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZWNzX2hlY3NfeCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2Nicl9maWxlc19iYWNrdXAiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9lY3NfYWM3IiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfY3Nic19yZXN0b3JlX2FsbCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2FfY24tbm9ydGgtNGYiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9vcF9nYXRlZF9yb3VuZHRhYmxlIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZXZzX2V4dCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX3Bmc19kZWVwX2FyY2hpdmUiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9hX2FwLXNvdXRoZWFzdC0xZSIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2FfcnUtbW9zY293LTFiIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfYV9hcC1zb3V0aGVhc3QtMWQiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9hX2FwLXNvdXRoZWFzdC0xZiIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX3Ntbl9hcHBsaWNhdGlvbiIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2V2c19jb2xkIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZWNzX2dwdV9nNXIiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9vcF9nYXRlZF9tZXNzYWdlb3ZlcjVnIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZWNzX3JpIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfYV9ydS1ub3J0aHdlc3QtMmMiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9pZWZfcGxhdGludW0iLCJpZCI6IjAifSx7Im5hbWUiOiIzMTIsMjU5LDE0NCwyOSwzNiwyNTcsMzAsMjU2LDcyLDI2MCw0OTQsNjUsNDkzLDIyOSwxMTEsMjU4LDExMCIsImlkIjoiOCJ9LHsibmFtZSI6IjQsMTEsMCwxMywyLDEsMywxNSwxNCwxMiIsImlkIjoiOSJ9LHsibmFtZSI6Im9wX2ZpbmVfZ3JhaW5lZCIsImlkIjoiNyJ9XSwicHJvamVjdCI6eyJkb21haW4iOnsibmFtZSI6ImhpZF9iNWh0cmlnMXgtamNsam4iLCJpZCI6IjgzN2M3YzdhYmU3ZjQxYmY5MzU2OWI4MmQ3MTQwYTdhIn0sIm5hbWUiOiJjbi1ub3J0aC00IiwiaWQiOiIxNzI1YzQzZTNmYTU0ODI4YTA3OGZjZTYwZjVhMzc3MyJ9LCJpc3N1ZWRfYXQiOiIyMDI2LTAzLTI5VDAyOjQ5OjMzLjUwNjAwMFoiLCJ1c2VyIjp7ImRvbWFpbiI6eyJuYW1lIjoiaGlkX2I1aHRyaWcxeC1qY2xqbiIsImlkIjoiODM3YzdjN2FiZTdmNDFiZjkzNTY5YjgyZDcxNDBhN2EifSwibmFtZSI6ImFnZW50LWRldjA1IiwicGFzc3dvcmRfZXhwaXJlc19hdCI6IiIsImlkIjoiOTIzOTZhYjI3ZTc1NDgyY2EyYjljMjk4MzcxZjliMmQifX19MYIBwTCCAb0CAQEwgZcwgYkxCzAJBgNVBAYTAkNOMRIwEAYDVQQIDAlHdWFuZ0RvbmcxETAPBgNVBAcMCFNoZW5aaGVuMS4wLAYDVQQKDCVIdWF3ZWkgU29mdHdhcmUgVGVjaG5vbG9naWVzIENvLiwgTHRkMQ4wDAYDVQQLDAVDbG91ZDETMBEGA1UEAwwKY2EuaWFtLnBraQIJANyzK10QYWoQMAsGCWCGSAFlAwQCATANBgkqhkiG9w0BAQEFAASCAQAMzEE3c7mwpLDXpE0OWQpqdJFzxx8giGovbskxYiBhkZNye0oQIv2Wo3w13Dtj-QugcGyYF00Vv1hJojL-UPzMjwpT887-rVfJoLlUGCofsdqpQqLYDzOv7Y-o-kuzmBFuQdWnoF9Sb8CGXGKaOXWZez7r-aeOosYIRgS-CgoUgEbeZ5i9331euu8JYJf9XTMT9EWcb3Ht0FOBDY24ieD2OSa7cYPwFD5q-TCykNRqP0VmpLf5Ys0lSEZyavthXUcw5Tyg8VsiwI33OKLf3Nyx6pu055-lV8My12AFH-8QPI9raJ9lXenqKw0fQa4n24OHpHY2OwDQZtGGwXXylgx-',
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
        console.log('流读取完成');
        loadingAnswer.value = false;
        showAnswer.value = true;
        break;
      }
      // 解码数据块
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
  // 按行分割
  const lines = chunk.split('\n');

  lines.forEach((line: any) => {
    if (line.startsWith('data:')) {
      const dataLine = line.substring(5).trim(); // 移除"data:"前缀

      if (dataLine) {
        try {
          const parsedData = JSON.parse(dataLine);
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
  // events.value.push(`${data.event} - ${new Date(data.createdTime).toLocaleTimeString()}`);

  switch (data.event) {
    case 'start':
      console.log('流开始');
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
      console.log('流结束');
      isStreaming.value = false;
      break;

    default:
      console.log('未知事件:', data.event);
  }
};
const md = new MarkdownIt();
const renderedMarkdown = computed(() => md.render(finalContent.value));

// 停止流
const stopStream = () => {
  if (abortController.value) {
    abortController.value?.abort();
  }
  if (reader.value) {
    reader.value.cancel();
  }
  isCancelled = true;
  isStreaming.value = false;
};

// 重置答案
const resetAnswer = () => {
  showAnswer.value = false;
  handleSendQuestion();
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
    margin: auto;
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
    flex-wrap: wrap;
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
