<template>
  <div class="auxiliary-draft">
    <div class="draft-header">
      <h1>我是制度起草助手，很高兴见到你</h1>
      <p>请描述你的制度要求，包括使用范围、核心条款、特殊要求等</p>
    </div>
    
    <div class="input-container">
      <el-input
        v-model="draftInput"
        type="textarea"
        placeholder="你好，请描述你的制度要求，包括使用范围、核心条款、特殊要求等..."
        :autosize="{ minRows: 6, maxRows: 8 }"
      />
      <div class="template-select">
        <el-select v-model="selectedTemplate" placeholder="请选择模板" style="width: 100%; margin-top: 16px;">
          <el-option label="党委会议事规则模板" value="party" />
          <el-option label="IT安全管理制度模板" value="it" />
          <el-option label="工程建设项目管理制度模板" value="project" />
        </el-select>
      </div>
      <button class="send-btn" @click="handleDraft">
        <el-icon class="mr-8">
          <Star />
        </el-icon>
        生成草案
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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../stores/app'
import { Star, ArrowRight } from '@element-plus/icons-vue'

const appStore = useAppStore()

// 起草输入
const draftInput = ref('')
const selectedTemplate = ref('')
const recommendQuestions = [
  '编写党委会议事规则',
  '编写适用于全集团的IT安全管理制度',
  '编写工程建设项目管理制度'
]

// 设置起草内容
const setDraft = (question: string) => {
  draftInput.value = question
  
  // 根据内容选择模板
  if (question.includes('党委会')) {
    selectedTemplate.value = 'party'
  } else if (question.includes('IT')) {
    selectedTemplate.value = 'it'
  } else if (question.includes('工程')) {
    selectedTemplate.value = 'project'
  }
}

// 处理起草
const handleDraft = () => {
  if (!draftInput.value.trim()) {
    ElMessage.warning('请输入制度要求')
    return
  }
  
  if (!selectedTemplate.value) {
    ElMessage.warning('请选择模板')
    return
  }
  
  ElMessage.success(`正在根据"${draftInput.value}"生成制度草案，请稍候...`)
  
  // 添加到历史记录
  appStore.addHistory(draftInput.value)
}
</script>

<style lang="less" scoped>
.auxiliary-draft {
  .draft-header {
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
  
  .recommend-questions {
    max-width: 800px;
    margin: 40px auto 0;
    
    .recommend-title {
      font-size: 16px;
      font-weight: 500;
      color: @text-color-secondary;
      margin-bottom: 16px;
    }
    
    .recommend-item {
      padding: 16px;
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
</style>