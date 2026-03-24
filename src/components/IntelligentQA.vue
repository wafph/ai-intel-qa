<template>
  <div class="intelligent-qa">
    <div class="qa-header">
      <h1>我是问答助手，很高兴见到你</h1>
      <p>你可以使用自然语言提问，我来精准回答</p>
    </div>
    
    <div class="input-container">
      <el-input
        v-model="questionInput"
        type="textarea"
        :placeholder="questionPlaceholder"
        :autosize="{ minRows: 4, maxRows: 6 }"
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
    <div v-if="loadingAnswer" class="loading-container">
      <div class="loading-spinner"></div>
      <p>正在智能分析中...</p>
      <p>系统正在分析您的问题并整理对应答复</p>
    </div>
    
    <!-- 回答结果 -->
    <div v-if="showAnswer" class="result-container">
      <div class="result-header">
        <div class="result-title">回复</div>
        <div class="action-buttons">
          <el-button size="small" type="primary" plain>
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
      
      <div class="result-content" v-html="answerContent"></div>
      
      <div class="source-tag">3个来源</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { Promotion, Download, Refresh } from '@element-plus/icons-vue'

const appStore = useAppStore()

// 问题输入
const questionInput = ref('')
const questionPlaceholder = '你好，请输入你的问题，比如：湖北交投的核心业务板块有哪些？'
const suggestions = [
  '湖北交投的核心业务板块有哪些？',
  '查询员工报销规定',
  '员工绩效等级制度有哪些？',
  '考勤相关的制度？'
]

// 回答状态
const loadingAnswer = ref(false)
const showAnswer = ref(false)
const answerContent = ref('')

// 设置问题
const setQuestion = (question: string) => {
  questionInput.value = question
  handleSendQuestion()
}

// 发送问题
const handleSendQuestion = () => {
  if (!questionInput.value.trim()) return
  
  loadingAnswer.value = true
  showAnswer.value = false
  
  // 模拟API请求延迟
  setTimeout(() => {
    loadingAnswer.value = false
    showAnswer.value = true
    
    // 根据问题内容返回不同答案
    if (questionInput.value.includes('湖北交投') || questionInput.value.includes('核心业务板块')) {
      answerContent.value = `
        <p>湖北交投核心业务板块围绕"交通规划、设计、建设、管理全生命周期运营商"定位展开，共7大核心板块，结合其业务实际及公开信息，具体如下：</p>
        <ol>
          <li><strong>规划设计</strong>：涵盖交通行业规划、工程设计、工程勘察等，依托旗下中南勘察设计院集团、省交规院等主体，拥有齐全甲级资质，打造交通科技型综合服务体系。</li>
          <li><strong>工程建设</strong>：包含工程施工、工程管理、养护服务、工程总承包等，旗下建设集团具备公路、市政总承包"双壹级资质"，业务覆盖省内、全国及海外，承建多个重点交通项目。</li>
          <li><strong>现代物流</strong>：涉及物流基础设施运营、智慧物流、供应链金融、物资贸易等，旗下物流集团为5A级物流企业，拥有华中地区大型沥青产销基地，实现大宗物资"买全球，卖全国"。</li>
          <li><strong>区域开发</strong>：秉持"建设一条高速，开发一片区域、服务一方经济"理念，深耕三大都市圈，打造武汉长江国际绿创中心等标杆项目，助力城市发展。</li>
          <li><strong>交通服务</strong>：涵盖服务区运营、交通能源、交通商贸等，运营大量高速公路服务区及自营加油站，独家运营"荆楚优品"公共品牌，拓展通道经济功能。</li>
          <li><strong>交通科技</strong>：聚焦智慧交通设施建设、数据开发应用、智能检测及技术研发，成立智慧交通研究院，建设智慧高速试点，旗下多家企业入选"科改示范企业""专精特新小巨人"。</li>
          <li><strong>交通金融</strong>：包含金融服务、资本运作、投资运营等，拥有省属国企首家财务公司，参股多家金融机构及基金，推出"楚道云链"供应链金融平台，助力产业发展。</li>
        </ol>
        <p>以上板块贴合湖北交投主责主业，也是当前项目（规章制度、知识库、会议助手等）需重点适配的业务场景</p>
      `
    } else {
      answerContent.value = `
        <p>根据查询"${questionInput.value}"，以下是相关制度规定：</p>
        <p>1. 员工报销需在费用发生后15个工作日内提交报销申请。</p>
        <p>2. 报销审批流程：员工提交 → 直接主管审批 → 部门负责人审批 → 财务审核 → 出纳支付。</p>
        <p>3. 单笔报销金额超过5000元需额外增加一级审批。</p>
        <p>4. 所有报销需附上合规发票及相关证明材料。</p>
        <p>5. 差旅费报销需在返回后7个工作日内提交。</p>
      `
    }
    
    // 添加到历史记录
    appStore.addHistory(questionInput.value)
  }, 1500)
}

// 重置答案
const resetAnswer = () => {
  showAnswer.value = false
  questionInput.value = ''
}

onMounted(() => {
  // 初始化
})
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
    max-width: 800px;
    margin: 0 auto 40px;
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
  }
  
  .send-btn {
    position: absolute;
    right: 12px;
    bottom: 12px;
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
    max-width: 800px;
    margin: 0 auto;
    
    .suggestion-btn {
      padding: 10px 20px;
      background-color: @bg-color;
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
  
  .loading-container {
    text-align: center;
    padding: 40px;
    color: @text-color-secondary;
    
    p {
      margin-top: 8px;
      
      &:last-child {
        font-size: 14px;
        color: @info-color;
      }
    }
  }
  
  .result-container {
    max-width: 800px;
    margin: 40px auto 0;
    padding: 24px;
    background-color: @bg-color-light;
    border-radius: 8px;
    border-left: 4px solid @primary-color;
    
    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      
      .result-title {
        font-size: 18px;
        font-weight: 600;
        color: @text-color;
      }
      
      .action-buttons {
        display: flex;
        gap: 12px;
      }
    }
    
    .result-content {
      line-height: 1.6;
      color: @text-color-secondary;
      
      ol {
        padding-left: 20px;
        margin: 12px 0;
        
        li {
          margin-bottom: 8px;
        }
      }
    }
    
    .source-tag {
      display: inline-block;
      padding: 4px 12px;
      background-color: #e6f7ff;
      color: @primary-color;
      border-radius: 4px;
      font-size: 12px;
      margin-top: 16px;
    }
  }
}
</style>