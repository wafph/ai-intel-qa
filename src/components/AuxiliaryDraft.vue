<template>
  <div class="auxiliary-draft">
    <div class="draft-header" v-if="!showAnswer && !loadingAnswer">
      <h1>我是制度起草助手，很高兴见到你</h1>
      <p>帮助您快速生成合规、专业的制度文档，降低起草难度，节约时间成本</p>
    </div>

    <el-card class="cards" v-if="!showAnswer && !loadingAnswer">
      <div class="input-container">
        <el-input
          v-model="draftInput"
          type="textarea"
          placeholder="你好，请描述你的制度要求，包括使用范围、核心条款、特殊要求等..."
          :autosize="{ minRows: 6, maxRows: 8 }"
        />
        <div class="template-select">
          <el-select
            v-model="selectedTemplate"
            placeholder="请选择模板"
            style="width: 50%; margin-top: 16px"
          >
            <el-option label="党委会议事规则模板" value="party" />
            <el-option label="IT安全管理制度模板" value="it" />
            <el-option label="工程建设项目管理制度模板" value="project" />
          </el-select>
        </div>
        <button class="send-btn" @click="handleDraft">
          <el-icon class="mr-8">
            <Star />
          </el-icon>
          发送
        </button>
      </div>
      <div class="recommend-questions">
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
    </el-card>
    <el-card class="res-container" v-if="loadingAnswer || showAnswer">
      <div class="anser-input">
        <div class="right-input">{{ draftInput }}</div>
        <img src="../../public/user.svg" alt="" />
      </div>
    </el-card>
    <!-- 回答加载中 -->
    <div v-if="loadingAnswer" class="result-container">
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
        v-html="renderefinalContentdMarkdown"
        v-if="!isStreaming"
      ></div>
      <div style="display: flex; align-items: center; margin-top: 20px">
        <div class="action-buttons">
          <el-button size="small" @click="resetAnswer">
            <el-icon>
              <Refresh />
            </el-icon>
            重新生成
          </el-button>
          <!-- <el-button size="small" @click="resetAnswer">
            <el-icon>
              <Refresh />
            </el-icon>
            预览
          </el-button> -->
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
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { useAppStore } from '../stores/app';
import { Star, ArrowRight } from '@element-plus/icons-vue';
import htmlToPdf from '../utils/htmlToPdf';
import MarkdownIt from 'markdown-it';
import { ElMessage } from 'element-plus';
const appStore = useAppStore();
const finalContent = ref('');
const showAnswer = ref(false);
const reasoningContent = ref('');
const isStreaming = ref(false);
const loading = ref(false);
const events = ref<Array<string>>([]);
const reader = ref<ReadableStreamDefaultReader<Uint8Array> | null>(null);
const abortController = ref<AbortController | null>(null);
let isCancelled = false;
// 回答状态
const loadingAnswer = ref(false);
// 起草输入
const draftInput = ref('');
const selectedTemplate = ref('');
const recommendQuestions = [
  '编写党委会议事规则',
  '编写适用于全集团的IT安全管理制度',
  '编写工程建设项目管理制度',
];

// 重置答案
const resetAnswer = () => {
  showAnswer.value = false;
  // draftInput.value = '';
  handleDraft();
};

// 设置起草内容
const setDraft = (question: string) => {
  draftInput.value = question;

  // 根据内容选择模板
  if (question.includes('党委会')) {
    selectedTemplate.value = 'party';
  } else if (question.includes('IT')) {
    selectedTemplate.value = 'it';
  } else if (question.includes('工程')) {
    selectedTemplate.value = 'project';
  }
};

// 处理起草
const handleDraft = () => {
  if (!draftInput.value.trim()) {
    ElMessage.warning('请输入制度要求');
    return;
  }

  if (!selectedTemplate.value) {
    ElMessage.warning('请选择模板');
    return;
  }
  loadingAnswer.value = true;
  showAnswer.value = false;
  startStream();

  // 添加到历史记录
  appStore.addHistory(draftInput.value);
};

const md = new MarkdownIt();
const renderefinalContentdMarkdown = computed(() => md.render(finalContent.value));
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
        query: draftInput.value,
      },
    };
    // 创建AbortController用于取消请求
    abortController.value = new AbortController();

    // 使用Fetch API发起请求
    const response = await fetch(
      '/rest/api4/v1/1725c43e3fa54828a078fce60f5a3773/agents/37fc417e-982b-413d-a9cb-a86e08f45cbb/conversations/dd73b80e-efeb-4991-8b9d-f581f41c36d9?version=1774405492195',
      {
        method: 'post',
        headers: {
          'X-Auth-Token':
            'MIIPrQYJKoZIhvcNAQcCoIIPnjCCD5oCAQExDTALBglghkgBZQMEAgEwgg2-BgkqhkiG9w0BBwGggg2wBIINrHsidG9rZW4iOnsiZXhwaXJlc19hdCI6IjIwMjYtMDMtMzBUMDI6NTU6MTMuNDk2MDAwWiIsInNpZ25hdHVyZSI6IkVBcGpiaTF1YjNKMGFDMDBBQUFBQUFBQUJMZDAyVDNVVEN5ZzFuV0kvR2lHOWN0UkZPSC9kRWQ3dXZRVmRjWk9ZNXpVaDd1M1ZJUThxSHFiT2FiMmpzM0tMUDJrQ1J4OUZ0Tks0Q2RvZ3hMdkpUUHREMytYM0ppUW93cGFqYWIwVEp4eXMrWjJsTGdsLzZiVjAxeGxGWEs4Sm9IRjZyRGFRL3F3QXdvUHkvTnZQWEdVRHFkWDlyaWx0TjE5K0huWjA1c0EzMUc5UzJ4VXhLNTBWY2YwdjgxL1RzeHBKRGJrV2dMcXp0Y1AzYVJoMDNsUlo3UDA1eFJQL3I1RmFya2ZkUUVMcTFiZXYvVmROUyswZE5sNGFpaytZUjdYYllSb211SnF3R0ZTODFTK2g5dW51Y1cyMTlwaS82eTRIWnk3ZmtPeGllbysySVptQ01veXhNVWdJbnhaWEJ3YUd3Nkt5YklSbHhmSDF0RHlWRTR4IiwibWV0aG9kcyI6WyJwYXNzd29yZCJdLCJjYXRhbG9nIjpbXSwicm9sZXMiOlt7Im5hbWUiOiJhcGlnX2FkbSIsImlkIjoiMCJ9LHsibmFtZSI6ImFwbV9hZG0iLCJpZCI6IjAifSx7Im5hbWUiOiJhcGlnd19hZG0iLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9jc2JzX3JlcF9hY2NlbGVyYXRpb24iLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9lY3NfZGlza0FjYyIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2Rzc19tb250aCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX29ic19kZWVwX2FyY2hpdmUiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9hX2NuLXNvdXRoLTRjIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZGVjX21vbnRoX3VzZXIiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9jYnJfc2VsbG91dCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2Vjc19vbGRfcmVvdXJjZSIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2V2c19Sb3lhbHR5IiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfd2VsaW5rYnJpZGdlX2VuZHBvaW50X2J1eSIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2Nicl9maWxlIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZG1zLXJvY2tldG1xNS1iYXNpYyIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2V2c19FU2luZ2xlX2NvcHlTU0QiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9kbXMta2Fma2EzIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfb2JzX2RlY19tb250aCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2NzYnNfcmVzdG9yZSIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2Nicl92bXdhcmUiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9pZG1lX21ibV9mb3VuZGF0aW9uIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfcGNfdmVuZG9yX3N1YnVzZXIiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9tdWx0aV9iaW5kIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZXZzX3NzZF9lbnRyeSIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX3Ntbl9jYWxsbm90aWZ5IiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfYV9hcC1zb3V0aGVhc3QtM2QiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9jc2JzX3Byb2dyZXNzYmFyIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfY2VzX3Jlc291cmNlZ3JvdXBfdGFnIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZXZzX3JldHlwZSIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2tvb21hcCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2Rtcy1hbXFwLWJhc2ljIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZXZzX3Bvb2xfY2EiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9hX2NuLXNvdXRod2VzdC0yYiIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2h3Y3BoIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZWNzX29mZmxpbmVfZGlza180IiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfc21uX3dlbGlua3JlZCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2h2X3ZlbmRvciIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2FfY24tbm9ydGgtNGUiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9hX2NuLW5vcnRoLTRkIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZWNzX2hlY3NfeCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2Nicl9maWxlc19iYWNrdXAiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9lY3NfYWM3IiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfY3Nic19yZXN0b3JlX2FsbCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2FfY24tbm9ydGgtNGYiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9vcF9nYXRlZF9yb3VuZHRhYmxlIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZXZzX2V4dCIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX3Bmc19kZWVwX2FyY2hpdmUiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9hX2FwLXNvdXRoZWFzdC0xZSIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2FfcnUtbW9zY293LTFiIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfYV9hcC1zb3V0aGVhc3QtMWQiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9hX2FwLXNvdXRoZWFzdC0xZiIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX3Ntbl9hcHBsaWNhdGlvbiIsImlkIjoiMCJ9LHsibmFtZSI6Im9wX2dhdGVkX2V2c19jb2xkIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZWNzX2dwdV9nNXIiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9vcF9nYXRlZF9tZXNzYWdlb3ZlcjVnIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfZWNzX3JpIiwiaWQiOiIwIn0seyJuYW1lIjoib3BfZ2F0ZWRfYV9ydS1ub3J0aHdlc3QtMmMiLCJpZCI6IjAifSx7Im5hbWUiOiJvcF9nYXRlZF9pZWZfcGxhdGludW0iLCJpZCI6IjAifSx7Im5hbWUiOiIzMTIsMjU5LDE0NCwyOSwzNiwyNTcsMzAsMjU2LDcyLDI2MCw0OTQsNjUsNDkzLDIyOSwxMTEsMjU4LDExMCIsImlkIjoiOCJ9LHsibmFtZSI6IjQsMTEsMCwxMywyLDEsMywxNSwxNCwxMiIsImlkIjoiOSJ9LHsibmFtZSI6Im9wX2ZpbmVfZ3JhaW5lZCIsImlkIjoiNyJ9XSwicHJvamVjdCI6eyJkb21haW4iOnsibmFtZSI6ImhpZF9iNWh0cmlnMXgtamNsam4iLCJpZCI6IjgzN2M3YzdhYmU3ZjQxYmY5MzU2OWI4MmQ3MTQwYTdhIn0sIm5hbWUiOiJjbi1ub3J0aC00IiwiaWQiOiIxNzI1YzQzZTNmYTU0ODI4YTA3OGZjZTYwZjVhMzc3MyJ9LCJpc3N1ZWRfYXQiOiIyMDI2LTAzLTI5VDAyOjU1OjEzLjQ5NjAwMFoiLCJ1c2VyIjp7ImRvbWFpbiI6eyJuYW1lIjoiaGlkX2I1aHRyaWcxeC1qY2xqbiIsImlkIjoiODM3YzdjN2FiZTdmNDFiZjkzNTY5YjgyZDcxNDBhN2EifSwibmFtZSI6ImFnZW50LWRldjA1IiwicGFzc3dvcmRfZXhwaXJlc19hdCI6IiIsImlkIjoiOTIzOTZhYjI3ZTc1NDgyY2EyYjljMjk4MzcxZjliMmQifX19MYIBwTCCAb0CAQEwgZcwgYkxCzAJBgNVBAYTAkNOMRIwEAYDVQQIDAlHdWFuZ0RvbmcxETAPBgNVBAcMCFNoZW5aaGVuMS4wLAYDVQQKDCVIdWF3ZWkgU29mdHdhcmUgVGVjaG5vbG9naWVzIENvLiwgTHRkMQ4wDAYDVQQLDAVDbG91ZDETMBEGA1UEAwwKY2EuaWFtLnBraQIJANyzK10QYWoQMAsGCWCGSAFlAwQCATANBgkqhkiG9w0BAQEFAASCAQCOuroxNblPzieaAnAhsthfgBIoYoZzHPlX9zVY9XtEUPTQLi-El9K2YTJqMYj5+4ZdR87Wms7hpIhZ0jiGvU+SaUyorYARD8aHY13j+0QpvlMk13TzU75HanbgpkarqugGlt2ReKhfP4Vu8MNmrNumo2mvK8a0yEJdiXuM1H6ie165wTAGi3RZJ6Crajmj--eOsCPReESt4y-05BlhHTXyOiSS5RRh1XD1hib5BoZ6jZRcGoHNUpr+FHFRPcabHGLB9uv05o1hvoBwg47HQxYxTblwCd4W47kzWnP9-HRi1RWpp4uic1W6Mm2vqKu7kDJEvF5jKnB9XnAqWAOovFNZ',
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

// 组件卸载时清理
onUnmounted(() => {
  stopStream();
});
</script>

<style lang="less" scoped>
.auxiliary-draft {
  .draft-header {
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
  .cards {
    max-width: 850px;
    margin: auto;

    .input-container {
      max-width: 850px;
      margin: 0 auto;
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

    .send-btn {
      position: absolute;
      right: 12px;
      bottom: 60px;
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

    .recommend-questions {
      max-width: 850px;
      margin: 10px auto 0;

      .recommend-title {
        font-size: 16px;
        font-weight: 500;
        color: @text-color-secondary;
        margin-bottom: 16px;
      }

      .recommend-item {
        padding: 8px 8px 8px 25px;
        border: 1px solid @border-color-light;
        border-radius: 8px;
        margin-bottom: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
          border-color: @primary-color;
          background-color: @bg-color;
        }

        .el-icon {
          color: @info-color;
        }
      }
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

  .result-container {
    max-width: 850px;
    min-height: 400px;
    margin: 40px auto 0;
    padding: 24px;
    filter: drop-shadow(0px 5px 5px rgba(0, 0, 0, 0.19215686274509805));
    background-color: @white;
    border-radius: 10px;

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
