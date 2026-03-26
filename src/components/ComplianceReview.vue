<template>
  <div class="compliance-review">
    <div class="review-header">
      <h1>智能合规审核，守护业务合规底线</h1>
      <p>以科技赋能合规管理，自动校验，高效守护业务规范</p>
    </div>
    
    <div class="upload-area" @click="triggerFileUpload">
      <div class="upload-icon">
        <el-icon :size="48">
          <UploadFilled />
        </el-icon>
      </div>
      <p>请上传您的文档</p>
      <p class="upload-tip">支持 .doc, .docx, .pdf 格式文件</p>
      <input 
        type="file" 
        ref="fileInput" 
        style="display: none" 
        accept=".doc,.docx,.pdf"
        @change="handleFileUpload"
      >
    </div>
    
    <div class="check-options">
      <div class="check-title">选择审核维度</div>
      <div class="check-option">
        <el-checkbox v-model="checkOptions.all">全选</el-checkbox>
        <el-checkbox v-model="checkOptions.compliance">合规性审查</el-checkbox>
        <el-checkbox v-model="checkOptions.conflict">冲突性审查</el-checkbox>
        <el-checkbox v-model="checkOptions.standard">规范性审查</el-checkbox>
      </div>
      <div class="check-option">
      </div>
      <div class="check-option">
      </div>
    </div>
    
    <div class="action-container">
      <button class="send-btn" @click="handleReview">
        开始审核
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { UploadFilled, Checked } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

interface CheckOptions {
  all: boolean
  compliance: boolean
  conflict: boolean
  standard: boolean
}

const fileInput = ref<HTMLInputElement>()
const checkOptions = ref<CheckOptions>({
  all: true,
  compliance: true,
  conflict: true,
  standard: true
})

// 触发文件上传
const triggerFileUpload = () => {
  fileInput.value?.click()
}

// 处理文件上传
const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    ElMessage.success(`已选择文件: ${file.name}`)
  }
}

// 处理合规审核
const handleReview = () => {
  const selectedOptions = Object.keys(checkOptions.value).filter(key => checkOptions.value[key as keyof CheckOptions])
  if (selectedOptions.length === 0) {
    ElMessage.warning('请至少选择一个审核维度')
    return
  }
  
  ElMessage.success(`开始${selectedOptions.length}项合规审核，请稍候...`)
}
</script>

<style lang="less" scoped>
.compliance-review {
  .review-header {
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
  
  .upload-area {
    max-width: 600px;
    margin: 0 auto 40px;
    border: 2px dashed @border-color;
    border-radius: 8px;
    padding: 60px 20px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s;
    
    &:hover {
      border-color: @primary-color;
    }
    
    .upload-icon {
      color: @info-color;
      margin-bottom: 16px;
    }
    
    p {
      margin-bottom: 8px;
      color: @text-color;
    }
    
    .upload-tip {
      font-size: 14px;
      color: @info-color;
    }
  }
  
  .check-options {
    max-width: 600px;
    margin: 0 auto 40px;
    
    .check-title {
      font-size: 16px;
      font-weight: 500;
      color: @text-color-secondary;
      margin-bottom: 16px;
    }
    
    .check-option {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
      
      :deep(.el-checkbox) {
        width: 100%;
        padding: 12px;
        background-color: @bg-color;
        border-radius: 6px;
        transition: all 0.2s;
        
        &:hover {
          background-color: #eef5ff;
        }
      }
    }
  }
  
  .action-container {
    max-width: 600px;
    margin: 0 auto;
    
    .send-btn {
      width: 100%;
      background-color: @primary-color;
      color: @white;
      border: none;
      border-radius: 6px;
      padding: 12px 20px;
      font-size: 16px;
      cursor: pointer;
      transition: background-color 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      
      &:hover {
        background-color: #40a9ff;
      }
    }
  }
}
</style>