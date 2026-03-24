<template>
  <div class="intelligent-retrieval">
    <div class="retrieval-header">
      <h1>我是检索助手，很高兴见到你</h1>
      <p>你可以使用自然语言提问，我来帮你快速获取相关制度条款</p>
    </div>
    
    <div class="input-container">
      <el-input
        v-model="retrievalInput"
        type="textarea"
        placeholder="你好，请输入你的问题，比如：查询考勤相关的制度？"
        :autosize="{ minRows: 4, maxRows: 6 }"
        @keydown.enter.exact.prevent="handleRetrieval"
      />
      <button class="send-btn" @click="handleRetrieval">
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
    
    <!-- 检索加载中 -->
    <div v-if="loadingRetrieval" class="loading-container">
      <div class="loading-spinner"></div>
      <p>正在智能检索中...</p>
      <p>系统正在分析您的查询并匹配相关制度条款</p>
    </div>
    
    <!-- 检索结果 -->
    <div v-if="showRetrievalResult" class="retrieval-result">
      <div 
        v-for="(result, index) in retrievalResults" 
        :key="index"
        class="result-item"
      >
        <div class="result-item-header">
          <div class="result-item-title">{{ result.title }}</div>
          <div class="result-item-source">{{ result.source }} 更新日期:{{ result.updateDate }}</div>
        </div>
        <div class="result-content">{{ result.content }}</div>
        <div class="action-buttons">
          <el-button size="small" type="primary" plain>
            <el-icon>
              <Download />
            </el-icon>
            导出
          </el-button>
          <el-button size="small">
            <el-icon>
              <View />
            </el-icon>
            查看详情
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../stores/app'
import { Search, Download, View } from '@element-plus/icons-vue'

interface RetrievalResult {
  title: string
  source: string
  updateDate: string
  content: string
}

const appStore = useAppStore()

// 检索输入
const retrievalInput = ref('')
const popularTags = ['报销审批流程', '员工晋升条件', '信息安全政策']

// 检索状态
const loadingRetrieval = ref(false)
const showRetrievalResult = ref(false)
const retrievalResults = ref<RetrievalResult[]>([])

// 设置检索
const setRetrieval = (query: string) => {
  retrievalInput.value = query
  handleRetrieval()
}

// 处理检索
const handleRetrieval = () => {
  if (!retrievalInput.value.trim()) return
  
  loadingRetrieval.value = true
  showRetrievalResult.value = false
  
  // 模拟API请求延迟
  setTimeout(() => {
    loadingRetrieval.value = false
    showRetrievalResult.value = true
    
    // 根据查询内容返回不同结果
    if (retrievalInput.value.includes('绩效') || retrievalInput.value.includes('等级')) {
      retrievalResults.value = [
        {
          title: '第五条 等级设定',
          source: '人力资源管理制度',
          updateDate: '2018-1-18',
          content: '员工绩效结果根据年度综合考核得分(月度/季度绩效加权占比80%，年度述职/综合评价占比20%)划分为5个等级，从高到低依次为:S级(卓越)、A级(优秀)、B级(合格)、C级(待改进)、D级(不合格)'
        },
        {
          title: '晋升基本条件',
          source: '人力资源管理制度',
          updateDate: '2018-1-18',
          content: '员工申请岗位层级晋升，需满足以下绩效基本条件，特殊岗位(如核心技术岗、管理岗)可增加专业能力、管理能力等附加条件: 1、晋升基本门槛:近1个考核年度绩效等级为A级及以上，或近2个考核年度绩效等级均为B级及以上且至少1次A级; 2、优先晋升条件:近1个考核年度绩效等级为S级的员工，在岗位空缺时，同等条件下优先纳入晋升评审范围;'
        }
      ]
    } else {
      retrievalResults.value = [
        {
          title: '报销审批流程',
          source: '财务管理制度',
          updateDate: '2022-5-10',
          content: '所有报销申请需通过线上审批系统提交，审批流程为：申请人提交 → 部门主管审批 → 财务专员审核 → 财务经理审批 → 出纳支付。特殊事项需额外增加一级审批。'
        }
      ]
    }
    
    // 添加到历史记录
    appStore.addHistory(retrievalInput.value)
  }, 1200)
}
</script>

<style lang="less" scoped>
.intelligent-retrieval {
  .retrieval-header {
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
  
  .retrieval-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    max-width: 800px;
    margin: 0 auto 30px;
    
    .retrieval-tag {
      padding: 12px 24px;
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
  
  .retrieval-result {
    max-width: 800px;
    margin: 30px auto 0;
    
    .result-item {
      padding: 20px;
      border: 1px solid @border-color-light;
      border-radius: 8px;
      margin-bottom: 16px;
      background-color: @white;
      
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
      }
      
      .action-buttons {
        display: flex;
        gap: 12px;
      }
    }
  }
}
</style>