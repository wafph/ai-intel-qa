<template>
  <div class="intelligent-qa">
    <div class="qa-header">
      <h1>我是问答助手，很高兴见到你</h1>
      <p>你可以使用自然语言提问，我来精准回答</p>
    </div>

    <div class="input-container">
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

    <div v-if="!showAnswer" class="suggestions">
      <el-button
        v-for="(suggestion, index) in suggestions"
        :key="index"
        class="suggestion-btn"
        @click="setQuestion(suggestion)"
      >
        {{ suggestion }}
      </el-button>
    </div>

    <!-- 回答加载中 -->
    <div v-if="loadingAnswer" class="result-container">
      <div class="result-header">
        <div class="result-title">检索结果</div>
      </div>
      <div class="loading-spinner"></div>
      <div class="text-center">
        <p>正在智能分析中...</p>
        <p>系统正在分析您的问题并整理对应答复</p>
      </div>
    </div>

    <!-- 回答结果 -->
    <div v-if="showAnswer" class="result-container">
      <div class="result-header">
        <div class="result-title">回复</div>
      </div>
      <!-- <div class="result-content" v-html="answerContent"></div> -->
      <div class="result-content" v-if="showAnswer">
        {{ accumulatedContent }}
      </div>
      <div style="display: flex; align-items: center; margin-top: 20px">
        <div class="source-tag">3个来源</div>
        <div class="action-buttons">
          <el-button size="small" type="success" plain>
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
import { ref, onMounted } from 'vue';
import { useAppStore } from '../stores/app';
import { Promotion, Download, Refresh } from '@element-plus/icons-vue';

const appStore = useAppStore();

// 问题输入
const questionInput = ref('');
const questionPlaceholder = '你好，请输入你的问题，比如：湖北交投的核心业务板块有哪些？';
const suggestions = [
  '湖北交投的核心业务板块有哪些？',
  '查询员工报销规定',
  '员工绩效等级制度有哪些？',
  '考勤相关的制度？',
];

// 回答状态
const loadingAnswer = ref(false);
const showAnswer = ref(false);
// const answerContent = ref('');
const accumulatedContent = ref('');
const answerContent = ref(false);

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

  // 模拟API请求延迟
  // setTimeout(() => {
  //   loadingAnswer.value = false;
  //   showAnswer.value = true;

  //   // 根据问题内容返回不同答案
  //   if (
  //     questionInput.value.includes('湖北交投') ||
  //     questionInput.value.includes('核心业务板块')
  //   ) {
  //     answerContent.value = `
  //       <p>湖北交投核心业务板块围绕"交通规划、设计、建设、管理全生命周期运营商"定位展开，共7大核心板块，结合其业务实际及公开信息，具体如下：</p>
  //       <ol>
  //         <li><strong>规划设计</strong>：涵盖交通行业规划、工程设计、工程勘察等，依托旗下中南勘察设计院集团、省交规院等主体，拥有齐全甲级资质，打造交通科技型综合服务体系。</li>
  //         <li><strong>工程建设</strong>：包含工程施工、工程管理、养护服务、工程总承包等，旗下建设集团具备公路、市政总承包"双壹级资质"，业务覆盖省内、全国及海外，承建多个重点交通项目。</li>
  //         <li><strong>现代物流</strong>：涉及物流基础设施运营、智慧物流、供应链金融、物资贸易等，旗下物流集团为5A级物流企业，拥有华中地区大型沥青产销基地，实现大宗物资"买全球，卖全国"。</li>
  //         <li><strong>区域开发</strong>：秉持"建设一条高速，开发一片区域、服务一方经济"理念，深耕三大都市圈，打造武汉长江国际绿创中心等标杆项目，助力城市发展。</li>
  //         <li><strong>交通服务</strong>：涵盖服务区运营、交通能源、交通商贸等，运营大量高速公路服务区及自营加油站，独家运营"荆楚优品"公共品牌，拓展通道经济功能。</li>
  //         <li><strong>交通科技</strong>：聚焦智慧交通设施建设、数据开发应用、智能检测及技术研发，成立智慧交通研究院，建设智慧高速试点，旗下多家企业入选"科改示范企业""专精特新小巨人"。</li>
  //         <li><strong>交通金融</strong>：包含金融服务、资本运作、投资运营等，拥有省属国企首家财务公司，参股多家金融机构及基金，推出"楚道云链"供应链金融平台，助力产业发展。</li>
  //       </ol>
  //       <p>以上板块贴合湖北交投主责主业，也是当前项目（规章制度、知识库、会议助手等）需重点适配的业务场景</p>
  //     `;
  //   } else {
  //     answerContent.value = `
  //       <p>根据查询"${questionInput.value}"，以下是相关制度规定：</p>
  //       <p>1. 员工报销需在费用发生后15个工作日内提交报销申请。</p>
  //       <p>2. 报销审批流程：员工提交 → 直接主管审批 → 部门负责人审批 → 财务审核 → 出纳支付。</p>
  //       <p>3. 单笔报销金额超过5000元需额外增加一级审批。</p>
  //       <p>4. 所有报销需附上合规发票及相关证明材料。</p>
  //       <p>5. 差旅费报销需在返回后7个工作日内提交。</p>
  //     `;
  //   }

  //   // 添加到历史记录
  //   appStore.addHistory(questionInput.value);
  // }, 1500);
  //
  // fetch('http://218.106.157.54:11305/v1/chat/completions', {
  //   method: 'post', // 显示请求方式为post
  //   headers: {
  //     'Content-Type': 'application/json',
  //   },
  // }).then((res) => {
  //   console.log(res);
  // });
  fetchData().catch(console.error);
};
const data = ref({});
async function fetchData() {
  const params = {
    model: 'Qwen3-30B-A3B-Instruct',
    stream: 'true',
    messages: [
      { role: 'user', content: 'Give me a short introduction to large language models.' },
    ],
    temperature: 0.7,
    top_p: 0.8,
    top_k: 20,
    min_p: 0,
    max_completion_tokens: 4096,
  };
  try {
    const response = await fetch('http://218.106.157.54:11305/v1/chat/completions', {
      method: 'post',
      headers: {
        Authorization:
          'Bearer ' +
          'sk-Qwen3-30B-A3B-Instruct-qenMb-piJgoWSqIfg~29Xw2H6ILO4NGu2EEKNqMSVT.ViIoD',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!response.ok || !response.body) {
      throw new Error(`网络响应异常: ${response.status}`);
    }

    // 3. 获取可读流
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    // let accumulatedContent = '';

    try {
      // 4. 循环读取流数据
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('流读取完毕');
          break;
        }

        // 5. 将二进制数据块解码为文本
        const chunk = decoder.decode(value, { stream: true });

        // 6. 按行分割（SSE 数据以 "data: " 和两个换行符为分隔）
        const lines = chunk.split('\n\n').filter((line) => line.trim());

        for (const line of lines) {
          // 7. 找到以 "data: " 开头的有效行
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6); // 去掉 "data: " 前缀

            // 跳过 "[DONE]" 等非JSON结束标记
            if (dataStr === '[DONE]') {
              console.log('流正常结束');
              break;
            }

            try {
              // 8. 解析 JSON
              const data = JSON.parse(dataStr);
              // 9. 提取 content 字段
              const contentChunk = data.choices?.[0]?.delta?.content || '';

              if (contentChunk) {
                // 10. 处理内容块
                accumulatedContent.value += contentChunk;
                console.log('当前内容块:', contentChunk);
                console.log('已累积全部内容:', accumulatedContent.value);
                // 在这里可以更新 UI 状态（如在 Vue 的 ref 变量中）
              }
            } catch (e) {
              console.error('解析行数据失败:', e, '原始行:', line);
            }
          }
        }
      }
    } finally {
      // 11. 释放读取器
      reader.releaseLock();
    }
    answerContent.value = true;
    loadingAnswer.value = false;
    showAnswer.value = true;
    // const json = await response.text();
    // data.value = json;
    // console.log(data.value);
  } catch (error) {
    console.error('There was a problem with the fetch operation:', error);
  }
}

// 重置答案
const resetAnswer = () => {
  showAnswer.value = false;
  questionInput.value = '';
};

onMounted(() => {
  // 初始化
});
</script>

<style lang="less" scoped>
.intelligent-qa {
  .qa-header {
    text-align: center;
    margin-bottom: 40px;

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
    margin: 40px auto 0;
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
