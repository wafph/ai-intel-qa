<template>
  <div class="auxiliary-draft">
    <!-- 空状态 -->
    <div v-if="!chatData?.messages?.length" class="empty-state">
      <div class="empty-icon">✍️</div>
      <h2>辅助起草助手</h2>
      <p>帮助您快速生成合规、专业的制度文档，降低起草难度，节约时间成本</p>
      
      <div class="templates">
        <div class="template-title">常用模板：</div>
        <div class="template-grid">
          <div
            v-for="template in templates"
            :key="template.id"
            class="template-item"
            @click="handleTemplateClick(template)"
          >
            <div class="template-icon">{{ template.icon }}</div>
            <div class="template-content">
              <h4>{{ template.title }}</h4>
              <p>{{ template.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 起草内容 -->
    <div v-else class="draft-container">
      <div class="draft-header">
        <h3>{{ chatData.title }}</h3>
        <div class="draft-actions">
          <button class="action-btn" @click="handleExport">
            <span class="action-icon">📥</span>
            导出
          </button>
          <button class="action-btn" @click="handleCopy">
            <span class="action-icon">📋</span>
            复制
          </button>
          <button class="action-btn" @click="handleFormat">
            <span class="action-icon">✨</span>
            格式化
          </button>
        </div>
      </div>
      
      <div class="messages-list">
        <div
          v-for="message in chatData.messages"
          :key="message.id"
          :class="['message-item', message.role]"
        >
          <!-- 用户消息 -->
          <div v-if="message.role === 'user'" class="message-user">
            <div class="message-avatar">
              <div class="avatar">您</div>
            </div>
            <div class="message-content">
              <div class="message-label">起草要求：</div>
              <div class="message-text">{{ message.content }}</div>
              <div class="message-time">
                {{ formatTime(message.timestamp) }}
              </div>
            </div>
          </div>
          
          <!-- AI消息 -->
          <div v-else class="message-assistant">
            <div class="message-avatar">
              <div class="avatar">AI</div>
            </div>
            <div class="message-content">
              <div class="message-label">起草内容：</div>
              <div class="message-text" v-html="renderMarkdown(message.content)"></div>
              
              <!-- 文档属性 -->
              <div v-if="message.metadata" class="document-meta">
                <div class="meta-item">
                  <span class="meta-label">文档类型：</span>
                  <span class="meta-value">{{ message.metadata.type }}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">字数统计：</span>
                  <span class="meta-value">{{ message.metadata.wordCount }}字</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">生成时间：</span>
                  <span class="meta-value">{{ formatTime(message.timestamp) }}</span>
                </div>
              </div>
              
              <div class="message-time">
                {{ formatTime(message.timestamp) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import MarkdownIt from 'markdown-it'

interface Props {
  chatData: ChatSession | null
}

interface ChatSession {
  id: string
  title: string
  time: string
  type: string
  messages: DraftMessage[]
}

interface DraftMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  metadata?: {
    type: string
    wordCount: number
  }
}

interface Template {
  id: number
  icon: string
  title: string
  description: string
  prompt: string
}

const props = defineProps<Props>()

// 响应式状态
const md = new MarkdownIt()

// 计算属性
const templates = computed<Template[]>(() => [
  { id: 1, icon: '📄', title: '党委会议事规则', description: '生成党委会议事规则的完整文档模板', prompt: '请帮我起草党委会议事规则，包括会议组织、议题准备、议事程序等内容' },
  { id: 2, icon: '🔐', title: 'IT安全管理制度', description: '适用于全集团的信息安全管理制度', prompt: '请起草适用于全集团的IT安全管理制度，包括访问控制、数据保护、应急响应等' },
  { id: 3, icon: '🏗️', title: '工程项目管理制度', description: '工程建设项目全流程管理规范', prompt: '请编写工程建设项目管理制度，涵盖项目立项、实施、验收等环节' },
  { id: 4, icon: '💰', title: '财务报销制度', description: '员工费用报销流程和标准', prompt: '请制定员工财务报销制度，明确报销范围、标准和审批流程' },
  { id: 5, icon: '👥', title: '员工手册', description: '新员工入职培训和日常行为规范', prompt: '请起草员工手册，包含企业文化、行为规范、权利义务等内容' },
  { id: 6, icon: '⚖️', title: '劳动合同', description: '标准劳动合同模板及补充协议', prompt: '请生成标准劳动合同模板，包含必备条款和常见补充协议' }
])

// 方法
const formatTime = (date: Date) => {
  if (!(date instanceof Date)) {
    date = new Date(date)
  }
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

const renderMarkdown = (content: string) => {
  return md.render(content)
}

const handleTemplateClick = (template: Template) => {
  console.log('选择模板:', template)
  // 这里可以通过事件或props触发父组件的消息发送
  // 实际使用中可以通过事件总线或provide/inject传递
}

const handleExport = () => {
  if (!props.chatData) return
  
  const content = props.chatData.messages
    .filter(msg => msg.role === 'assistant')
    .map(msg => msg.content)
    .join('\n\n')
  
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.chatData.title}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const handleCopy = async () => {
  if (!props.chatData) return
  
  const content = props.chatData.messages
    .filter(msg => msg.role === 'assistant')
    .map(msg => msg.content)
    .join('\n\n')
  
  try {
    await navigator.clipboard.writeText(content)
    alert('复制成功！')
  } catch (err) {
    console.error('复制失败:', err)
    alert('复制失败，请手动复制')
  }
}

const handleFormat = () => {
  // 格式化文档逻辑
  alert('文档格式化功能开发中...')
}

// 监听聊天数据变化
watch(() => props.chatData, () => {
  nextTick(() => {
    scrollToBottom()
  })
}, { deep: true })

const scrollToBottom = () => {
  const container = document.querySelector('.messages-list')
  if (container) {
    container.scrollTop = container.scrollHeight
  }
}
</script>

<style scoped>
.auxiliary-draft {
  height: 100%;
  overflow-y: auto;
  padding: 0;
  background: linear-gradient(135deg, #f9f9f9 0%, #f0f0f0 100%);
  position: relative;
}

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  max-width: 800px;
  margin: 0 auto;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 24px;
  opacity: 0.8;
  animation: bounce 2s ease-in-out infinite;
}

.empty-state h2 {
  margin: 0 0 12px 0;
  font-size: 28px;
  color: #2c3e50;
  font-weight: 600;
  background: linear-gradient(135deg, #1890ff, #096dd9);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.empty-state p {
  margin: 0 0 40px 0;
  font-size: 16px;
  color: #666;
  line-height: 1.6;
  max-width: 600px;
}

.templates {
  width: 100%;
  text-align: left;
  margin-top: 20px;
}

.template-title {
  font-size: 18px;
  font-weight: 500;
  color: #2c3e50;
  margin-bottom: 20px;
  text-align: center;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.template-item {
  background: white;
  border: 1px solid #e8e8e8;
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  text-align: left;
  position: relative;
  overflow: hidden;
}

.template-item:hover {
  border-color: #1890ff;
  background: #f0f7ff;
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(24, 144, 255, 0.15);
}

.template-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(to bottom, #1890ff, #096dd9);
  opacity: 0;
  transition: opacity 0.3s;
}

.template-item:hover::before {
  opacity: 1;
}

.template-icon {
  font-size: 32px;
  flex-shrink: 0;
  width: 50px;
  height: 50px;
  border-radius: 10px;
  background: #f0f7ff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1890ff;
  transition: all 0.3s;
}

.template-item:hover .template-icon {
  background: #1890ff;
  color: white;
  transform: scale(1.1);
}

.template-content {
  flex: 1;
}

.template-content h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  line-height: 1.4;
}

.template-content p {
  margin: 0;
  font-size: 13px;
  color: #666;
  line-height: 1.5;
  opacity: 0.8;
}

.draft-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  margin: 20px;
  position: relative;
}

.draft-header {
  padding: 20px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 10;
}

.draft-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  font-size: 13px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  backdrop-filter: blur(10px);
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateY(-1px);
}

.action-icon {
  font-size: 14px;
}

.messages-list {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  background: #fafafa;
}

.message-item {
  animation: slideIn 0.3s ease;
}

.message-user {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.message-assistant {
  display: flex;
  gap: 16px;
}

.message-avatar {
  flex-shrink: 0;
}

.message-avatar .avatar {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  color: white;
}

.message-user .avatar {
  background: linear-gradient(135deg, #667eea, #764ba2);
}

.message-assistant .avatar {
  background: linear-gradient(135deg, #4facfe, #00f2fe);
}

.message-content {
  flex: 1;
  max-width: calc(100% - 60px);
}

.message-label {
  font-size: 12px;
  color: #8c8c8c;
  margin-bottom: 4px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.message-user .message-text {
  background: white;
  border: 1px solid #e8e8e8;
  border-radius: 12px;
  padding: 16px 20px;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  border-left: 4px solid #667eea;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-assistant .message-text {
  background: white;
  border: 1px solid #e8e8e8;
  border-radius: 12px;
  padding: 20px 24px;
  font-size: 14px;
  line-height: 1.8;
  color: #333;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-left: 4px solid #4facfe;
  position: relative;
  overflow: hidden;
}

.message-assistant .message-text::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(to right, #4facfe, #00f2fe);
  opacity: 0.8;
}

.message-assistant .message-text :deep(h1),
.message-assistant .message-text :deep(h2),
.message-assistant .message-text :deep(h3) {
  color: #2c3e50;
  margin: 20px 0 12px 0;
  font-weight: 600;
  padding-bottom: 8px;
  border-bottom: 2px solid #f0f0f0;
}

.message-assistant .message-text :deep(h1) {
  font-size: 20px;
}

.message-assistant .message-text :deep(h2) {
  font-size: 18px;
}

.message-assistant .message-text :deep(h3) {
  font-size: 16px;
}

.message-assistant .message-text :deep(p) {
  margin: 12px 0;
  text-indent: 2em;
}

.message-assistant .message-text :deep(ul),
.message-assistant .message-text :deep(ol) {
  margin: 12px 0;
  padding-left: 2em;
}

.message-assistant .message-text :deep(li) {
  margin: 6px 0;
  line-height: 1.6;
}

.message-assistant .message-text :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  border: 1px solid #e8e8e8;
}

.message-assistant .message-text :deep(th) {
  background: #fafafa;
  padding: 12px;
  text-align: left;
  font-weight: 600;
  border: 1px solid #e8e8e8;
  color: #2c3e50;
}

.message-assistant .message-text :deep(td) {
  padding: 12px;
  border: 1px solid #e8e8e8;
  vertical-align: top;
}

.message-assistant .message-text :deep(pre) {
  background: #f6f8fa;
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
  margin: 12px 0;
  border: 1px solid #e1e4e8;
  border-left: 4px solid #4facfe;
}

.message-assistant .message-text :deep(code) {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.9em;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f6f8fa;
  color: #e74c3c;
}

.message-assistant .message-text :deep(blockquote) {
  border-left: 4px solid #4facfe;
  margin: 16px 0;
  padding: 0 0 0 20px;
  color: #666;
  font-style: italic;
  background: #f0f7ff;
  border-radius: 0 8px 8px 0;
  padding: 12px 20px;
}

.document-meta {
  margin-top: 16px;
  padding: 16px;
  background: #f9f9f9;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-label {
  font-size: 12px;
  color: #8c8c8c;
  font-weight: 500;
}

.meta-value {
  font-size: 13px;
  color: #333;
  font-weight: 600;
}

.message-time {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
  padding: 0 4px;
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
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
</style>