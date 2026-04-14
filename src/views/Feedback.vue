<template>
  <div class="feedback-page">
    <!-- 顶部标题栏 -->
    <div class="page-header">
      <h1>我的反馈</h1>
      <div class="header-actions">
        <button 
          class="back-btn"
          @click="goBack"
        >
          ← 返回
        </button>
      </div>
    </div>

    <div class="feedback-container">
      <!-- 反馈表单 -->
      <div class="feedback-form">
        <div class="form-section">
          <h3>提交反馈</h3>
          <p class="form-description">请描述您遇到的问题或建议，我们会尽快处理。</p>
        </div>

        <!-- 反馈类型 -->
        <div class="form-section">
          <label class="form-label">反馈类型</label>
          <div class="feedback-types">
            <div
              v-for="type in feedbackTypes"
              :key="type.id"
              class="type-option"
              :class="{ active: selectedType === type.id }"
              @click="selectType(type.id)"
            >
              <i :class="type.icon"></i>
              <span>{{ type.label }}</span>
            </div>
          </div>
        </div>

        <!-- 标题 -->
        <div class="form-section">
          <label class="form-label">标题</label>
          <input
            v-model="feedbackTitle"
            type="text"
            placeholder="请简要描述反馈内容"
            class="form-input"
            maxlength="50"
          />
        </div>

        <!-- 内容 -->
        <div class="form-section">
          <label class="form-label">详细描述</label>
          <textarea
            v-model="feedbackContent"
            placeholder="请详细描述您遇到的问题或建议..."
            class="form-textarea"
            rows="6"
            maxlength="1000"
          ></textarea>
          <div class="char-count">
            {{ feedbackContent.length }}/1000
          </div>
        </div>

        <!-- 文件上传 -->
        <div class="form-section">
          <label class="form-label">附件上传</label>
          <div class="upload-area">
            <input
              type="file"
              ref="fileInput"
              @change="handleFileUpload"
              multiple
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt"
              class="file-input"
            />
            <div 
              class="upload-box"
              @click="triggerFileInput"
              :class="{ 'has-files': uploadedFiles.length > 0 }"
            >
              <i class="upload-icon">📁</i>
              <p class="upload-text">点击上传文件或拖拽文件到这里</p>
              <p class="upload-hint">支持 PDF, Word, 图片, TXT 格式，最大 10MB</p>
            </div>
            
            <!-- 上传的文件列表 -->
            <div v-if="uploadedFiles.length > 0" class="file-list">
              <div
                v-for="(file, index) in uploadedFiles"
                :key="index"
                class="file-item"
              >
                <div class="file-info">
                  <i class="file-icon">📄</i>
                  <div class="file-details">
                    <span class="file-name">{{ file.name }}</span>
                    <span class="file-size">{{ formatFileSize(file.size) }}</span>
                  </div>
                </div>
                <button 
                  class="remove-file-btn"
                  @click="removeFile(index)"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 提交按钮 -->
        <div class="form-actions">
          <button 
            class="submit-btn"
            :disabled="!canSubmit"
            @click="submitFeedback"
          >
            <span v-if="isSubmitting">提交中...</span>
            <span v-else>提交反馈</span>
          </button>
        </div>
      </div>

      <!-- 反馈历史 -->
      <div class="feedback-history">
        <h3>反馈记录</h3>
        <div v-if="feedbackList.length === 0" class="empty-history">
          <i class="empty-icon">📋</i>
          <p>暂无反馈记录</p>
        </div>
        
        <div v-else class="history-list">
          <div
            v-for="item in feedbackList"
            :key="item.id"
            class="history-item"
            :class="item.status"
          >
            <div class="history-header">
              <div class="history-title">{{ item.title }}</div>
              <div class="history-status" :class="item.status">
                {{ getStatusText(item.status) }}
              </div>
            </div>
            <div class="history-content">
              {{ item.content }}
            </div>
            <div class="history-meta">
              <span class="history-type">{{ getTypeText(item.type) }}</span>
              <span class="history-time">{{ formatTime(item.time) }}</span>
            </div>
            <div v-if="item.reply" class="history-reply">
              <strong>回复：</strong>{{ item.reply }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

// 反馈类型
const feedbackTypes = [
  { id: 'bug', icon: '🐛', label: 'Bug 报告' },
  { id: 'suggestion', icon: '💡', label: '功能建议' },
  { id: 'question', icon: '❓', label: '使用问题' },
  { id: 'other', icon: '📝', label: '其他' }
];

// 反馈表单数据
const selectedType = ref('bug');
const feedbackTitle = ref('');
const feedbackContent = ref('');
const uploadedFiles = ref<File[]>([]);
const isSubmitting = ref(false);

// 反馈历史数据
const feedbackList = ref([
  {
    id: '1',
    title: '上传文件时遇到问题',
    content: '在上传PDF文件时，系统提示文件过大，但实际上文件只有5MB',
    type: 'bug',
    status: 'resolved',
    time: '2024-01-15 10:30:00',
    reply: '感谢您的反馈，我们已经修复了这个问题，请重新尝试上传。'
  },
  {
    id: '2',
    title: '希望增加历史搜索功能',
    content: '希望能够按关键词搜索历史对话记录，更方便找到之前的对话内容',
    type: 'suggestion',
    status: 'processing',
    time: '2024-01-14 14:20:00',
    reply: '您的建议已收到，我们正在评估这个功能的需求。'
  }
]);

// 计算是否可提交
const canSubmit = computed(() => {
  return feedbackTitle.value.trim() && 
         feedbackContent.value.trim() && 
         !isSubmitting.value;
});

// 选择反馈类型
const selectType = (type: string) => {
  selectedType.value = type;
};

// 处理文件上传
const fileInput = ref<HTMLInputElement | null>(null);
const triggerFileInput = () => {
  fileInput.value?.click();
};

const handleFileUpload = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    const files = Array.from(input.files);
    
    // 检查文件大小（最大10MB）
    const validFiles = files.filter(file => {
      if (file.size > 10 * 1024 * 1024) {
        alert(`文件 ${file.name} 超过10MB限制，已跳过`);
        return false;
      }
      return true;
    });
    
    uploadedFiles.value.push(...validFiles);
  }
  
  // 清空input，以便可以重复选择相同文件
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

// 移除文件
const removeFile = (index: number) => {
  uploadedFiles.value.splice(index, 1);
};

// 格式化文件大小
const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 获取状态文本
const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'pending': '待处理',
    'processing': '处理中',
    'resolved': '已解决',
    'rejected': '已拒绝'
  };
  return statusMap[status] || status;
};

// 获取类型文本
const getTypeText = (type: string) => {
  const typeMap: Record<string, string> = {
    'bug': 'Bug 报告',
    'suggestion': '功能建议',
    'question': '使用问题',
    'other': '其他'
  };
  return typeMap[type] || type;
};

// 格式化时间
const formatTime = (timeStr: string) => {
  const date = new Date(timeStr);
  return date.toLocaleString();
};

// 提交反馈
const submitFeedback = async () => {
  if (!canSubmit.value) return;
  
  isSubmitting.value = true;
  
  try {
    // 模拟提交过程
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 创建新的反馈记录
    const newFeedback = {
      id: Date.now().toString(),
      title: feedbackTitle.value,
      content: feedbackContent.value,
      type: selectedType.value,
      status: 'pending',
      time: new Date().toISOString(),
      reply: ''
    };
    
    feedbackList.value.unshift(newFeedback);
    
    // 清空表单
    feedbackTitle.value = '';
    feedbackContent.value = '';
    uploadedFiles.value = [];
    selectedType.value = 'bug';
    
    alert('反馈提交成功！我们会尽快处理您的反馈。');
  } catch (error) {
    console.error('提交反馈失败:', error);
    alert('提交失败，请稍后重试。');
  } finally {
    isSubmitting.value = false;
  }
};

// 返回上一页
const goBack = () => {
  router.back();
};

onMounted(() => {
  // 可以在这里加载真实的反馈历史
});
</script>

<style scoped>
.feedback-page {
  width: 100%;
  height: 100vh;
  background: #f5f7fa;
  overflow-y: auto;
}

.page-header {
  background: white;
  padding: 20px 40px;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  position: sticky;
  top: 0;
  z-index: 10;
}

.page-header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #333;
}

.back-btn {
  padding: 8px 16px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
  transition: all 0.3s;
}

.back-btn:hover {
  background: #e9ecef;
  color: #333;
}

.feedback-container {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 30px;
  padding: 30px 40px;
  max-width: 1200px;
  margin: 0 auto;
}

.feedback-form {
  background: white;
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.form-section {
  margin-bottom: 30px;
}

.form-section h3 {
  margin: 0 0 10px 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.form-description {
  margin: 0 0 20px 0;
  font-size: 14px;
  color: #666;
  line-height: 1.5;
}

.form-label {
  display: block;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.feedback-types {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}

.type-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 15px 10px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;
  gap: 8px;
}

.type-option:hover {
  border-color: #91d5ff;
  background: #f0f7ff;
}

.type-option.active {
  border-color: #1890ff;
  background: #e6f7ff;
  color: #1890ff;
}

.type-option i {
  font-size: 20px;
}

.type-option span {
  font-size: 12px;
  font-weight: 500;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.3s;
}

.form-input:focus {
  outline: none;
  border-color: #1890ff;
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
}

.form-textarea {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  transition: all 0.3s;
  font-family: inherit;
}

.form-textarea:focus {
  outline: none;
  border-color: #1890ff;
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
}

.char-count {
  text-align: right;
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.upload-area {
  position: relative;
}

.file-input {
  display: none;
}

.upload-box {
  border: 2px dashed #e9ecef;
  border-radius: 8px;
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  background: #fafafa;
}

.upload-box:hover {
  border-color: #91d5ff;
  background: #f0f7ff;
}

.upload-box.has-files {
  padding: 20px;
}

.upload-icon {
  font-size: 40px;
  color: #999;
  margin-bottom: 10px;
  display: block;
}

.upload-text {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 500;
  color: #333;
}

.upload-hint {
  margin: 0;
  font-size: 12px
}
</style>