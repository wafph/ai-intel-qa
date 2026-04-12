<template>
  <div class="app-container">
    <!-- 顶部菜单 -->
    <HeaderMenu 
      :active-tab="activeTab"
      @tab-change="handleTabChange"
    />
    
    <div class="main-layout">
      <!-- 左侧历史对话面板 -->
      <HistoryPanel 
        :history-list="historyList"
        :active-chat-id="activeChatId"
        @select-chat="handleSelectChat"
        @new-chat="handleNewChat"
        @delete-chat="handleDeleteChat"
        @clear-history="handleClearHistory"
      />
      
      <!-- 右侧主内容区域 -->
      <div class="content-area">
        <!-- 动态组件区域 -->
        <div class="dynamic-content">
          <KeepAlive>
            <component 
              :is="activeComponent" 
              :key="activeChatId"
              :chat-data="currentChatData"
              :streaming="isStreaming"
              :current-reasoning="currentReasoning"
              :current-answer="currentAnswer"
              :current-streaming-message-id="currentStreamingMessageId"
              @stop-stream="stopStream"
            />
          </KeepAlive>
        </div>
        
        <!-- 底部固定输入框 -->
        <div class="input-container">
          <ChatInput 
            :placeholder="inputPlaceholder"
            :disabled="isStreaming"
            @send="handleSendMessage"
          />
          
          <!-- 流式传输控制 -->
          <div v-if="isStreaming" class="stream-controls">
            <button class="stop-btn" @click="stopStream">
              <span class="stop-icon">■</span>
              停止生成
            </button>
            <div class="stream-status">
              <span class="streaming-indicator"></span>
              生成中...
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, onUnmounted } from 'vue'
import HeaderMenu from './components/HeaderMenu.vue'
import HistoryPanel from './components/HistoryPanel.vue'
import ChatInput from './components/ChatInput.vue'
import IntelligentQA from './views/IntelligentQA.vue'
import AuxiliaryDraft from './views/AuxiliaryDraft.vue'
import { useAppStore } from './stores/app';
const appStore = useAppStore();
// 定义类型接口
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  timestamp: Date
  streaming?: boolean
}

interface ChatSession {
  id: string
  title: string
  time: string
  type: string
  messages: ChatMessage[]
}

interface HistoryItem {
  id: string
  title: string
  time: string
  type: string
  preview: string
}

interface StreamChunk {
  event: string
  data?: {
    text?: string
    reasoning_content?: string
    index?: number
    node_id?: string
    node_type?: string
    node_name?: string
    workflow_id?: string
    workflow_name?: string
    createdTime?: number
  }
  createdTime?: number
}

// 状态管理
 // 示例token
const activeTab = ref<string>('智能问答')
const activeChatId = ref<string | null>(null)
const chatSessions = ref<Record<string, ChatSession>>({})

// 流式相关状态
const isStreaming = ref<boolean>(false)
const currentReasoning = ref<string>('')
const currentAnswer = ref<string>('')
let abortController: AbortController | null = null
let currentStreamingMessageId: string | null = null

// 历史记录数据
const historyList = ref<HistoryItem[]>([
  { 
    id: '1', 
    title: '查询员工报销规定',
    time: '今天 10:30',
    type: '智能问答',
    preview: '请问公司的员工报销有什么规定？'
  },
  { 
    id: '2', 
    title: '党委会议事规则',
    time: '今天 09:15',
    type: '辅助起草',
    preview: '请帮我起草党委会议事规则...'
  }
])

// 计算属性
const currentChatData = computed(() => {
  if (!activeChatId.value) return null
  return chatSessions.value[activeChatId.value] || null
})

const activeComponent = computed(() => {
  const componentMap: Record<string, any> = {
    '智能问答': IntelligentQA,
    '智能检索': IntelligentQA,
    '辅助起草': AuxiliaryDraft,
    '合规审核': AuxiliaryDraft
  }
  return componentMap[activeTab.value] || IntelligentQA
})

const inputPlaceholder = computed(() => {
  if (activeTab.value === '辅助起草') {
    return '请输入起草内容或要求...'
  }
  return '你好，请输入你的问题'
})

// 方法
const handleTabChange = (tabName: string) => {
  activeTab.value = tabName
  handleNewChat()
}

const handleNewChat = () => {
  const newChatId = Date.now().toString()
  activeChatId.value = newChatId
  
  const chatTitle = `${activeTab.value} - ${new Date().toLocaleTimeString()}`
  
  chatSessions.value[newChatId] = {
    id: newChatId,
    title: chatTitle,
    time: '刚刚',
    type: activeTab.value,
    messages: []
  }
  
  historyList.value.unshift({
    id: newChatId,
    title: chatTitle,
    time: '刚刚',
    type: activeTab.value,
    preview: '新对话'
  })
  
  if (historyList.value.length > 50) {
    historyList.value = historyList.value.slice(0, 50)
  }
  
  saveToLocalStorage()
  scrollToBottom()
}

const handleSelectChat = (chatId: string) => {
  if (isStreaming.value) {
    stopStream()
  }
  
  activeChatId.value = chatId
  if (!chatSessions.value[chatId]) {
    loadFromLocalStorage(chatId)
  }
  
  resetStreamState()
  scrollToBottom()
}

const handleDeleteChat = (chatId: string) => {
  delete chatSessions.value[chatId]
  const index = historyList.value.findIndex(h => h.id === chatId)
  if (index !== -1) {
    historyList.value.splice(index, 1)
  }
  
  if (activeChatId.value === chatId) {
    if (historyList.value.length > 0) {
      activeChatId.value = historyList.value[0].id
    } else {
      handleNewChat()
    }
  }
  
  saveToLocalStorage()
}

const handleClearHistory = () => {
  historyList.value = []
  chatSessions.value = {}
  handleNewChat()
  saveToLocalStorage()
}

const handleSendMessage = async (content: string) => {
  if (!content.trim() || isStreaming.value) return
  
  if (!activeChatId.value) {
    handleNewChat()
  }
  
  const chat = chatSessions.value[activeChatId.value!]
  if (!chat) return
  
  // 添加用户消息
  const userMessage: ChatMessage = {
    id: Date.now().toString(),
    role: 'user',
    content: content.trim(),
    timestamp: new Date()
  }
  
  chat.messages.push(userMessage)
  
  // 如果是第一条消息，更新标题
  if (chat.messages.length === 1) {
    const newTitle = content.length > 20 
      ? content.substring(0, 20) + '...' 
      : content
    
    chat.title = newTitle
    
    const historyItem = historyList.value.find(h => h.id === chat.id)
    if (historyItem) {
      historyItem.title = newTitle
      historyItem.preview = content
    }
  }
  
  // 添加AI消息占位符
  const aiMessageId = (Date.now() + 1).toString()
  const aiMessage: ChatMessage = {
    id: aiMessageId,
    role: 'assistant',
    content: '',
    timestamp: new Date(),
    streaming: true
  }
  
  chat.messages.push(aiMessage)
  currentStreamingMessageId = aiMessageId
  
  // 重置流式状态
  resetStreamState()
  
  // 开始流式输出
  await startStream(content, aiMessageId)
  
  // 保存历史
  saveToLocalStorage()
  scrollToBottom()
}

// 流式请求
const startStream = async (queryText: string, messageId: string) => {
  isStreaming.value = true
  currentReasoning.value = ''
  currentAnswer.value = ''
  
  try {
    abortController = new AbortController()
    
    const params = {
      inputs: {
        query: queryText
      }
    }
    
    const token = appStore.sharedDataToken
    if (!token) {
      throw new Error('未找到认证token，请先登录')
    }
    const response = await fetch(
      '/api1/v1/1725c43e3fa54828a078fce60f5a3773/workflows/60a15b33-e781-4d5d-88d3-5ed90054d9b0/conversations/0bcf02aa-9651-4a9c-a747-09d4a440aec9?version=1775639876207',
      {
        method: 'POST',
        headers: {
          'X-Auth-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
        signal: abortController.signal,
      }
    )
    
    if (!response.ok || !response.body) {
      throw new Error(`网络响应异常: ${response.status}`)
    }
    
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      
      for (const line of lines) {
        if (line.trim() === '') continue
        if (line.startsWith('data: ')) {
          const data = line.substring(5).trim()
          if (data === '[DONE]') continue
          
          try {
            const parsed: StreamChunk = JSON.parse(data)
            await processStreamChunk(parsed, messageId)
          } catch (error) {
            console.error('解析流数据失败:', error, '原始数据:', data)
          }
        }
      }
    }
    
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('流式请求被取消')
    } else {
      console.error('流式请求失败:', error)
      handleStreamError(messageId, error.message)
    }
  } finally {
    finishStream(messageId)
  }
}

// 🚨 关键修改：正确处理流式数据，确保累加 reasoning_content 和 text
const processStreamChunk = async (chunk: StreamChunk, messageId: string) => {
  console.log('收到流式数据块:', chunk)
  
  if (chunk.event === 'message') {
    // 处理推理过程 - 确保累加
    if (chunk.data?.reasoning_content !== undefined) {
      const reasoning = chunk.data.reasoning_content
      // 🚨 关键：必须用 .value 进行累加
      debugger
      currentReasoning.value += reasoning
      console.log('更新推理内容:', currentReasoning.value)
    }
    
    // 处理回复内容 - 确保累加
    if (chunk.data?.text !== undefined) {
      const text = chunk.data.text
      // 🚨 关键：必须用 .value 进行累加
      currentAnswer.value += text
      console.log('更新回复内容:', currentAnswer.value)
      
      // 更新对应的AI消息内容
      const chat = chatSessions.value[activeChatId.value!]
      if (chat) {
        const message = chat.messages.find(m => m.id === messageId)
        if (message) {
          message.content = currentAnswer.value
        }
      }
    }
    
    // 触发视图更新
    await nextTick()
    scrollToBottom()
  }
}

// 完成流式输出
const finishStream = (messageId: string) => {
  isStreaming.value = false
  currentStreamingMessageId = null
  
  const chat = chatSessions.value[activeChatId.value!]
  if (chat) {
    const message = chat.messages.find(m => m.id === messageId)
    if (message) {
      message.streaming = false
      
      // 更新历史记录预览
      const historyItem = historyList.value.find(h => h.id === activeChatId.value)
      if (historyItem && chat.messages.length === 2) {
        const firstQuestion = chat.messages[0].content
        historyItem.preview = firstQuestion.length > 50 
          ? firstQuestion.substring(0, 50) + '...' 
          : firstQuestion
      }
    }
  }
  
  // 重置流式状态
  resetStreamState()
  saveToLocalStorage()
  scrollToBottom()
}

// 处理流式错误
const handleStreamError = (messageId: string, errorMessage: string) => {
  const chat = chatSessions.value[activeChatId.value!]
  if (chat) {
    const message = chat.messages.find(m => m.id === messageId)
    if (message) {
      message.content = `抱歉，回答过程中出现错误：${errorMessage}`
      message.streaming = false
    }
  }
  isStreaming.value = false
  currentStreamingMessageId = null
  resetStreamState()
}

// 停止流式输出
const stopStream = () => {
  if (abortController) {
    abortController.abort()
  }
  
  if (currentStreamingMessageId) {
    const chat = chatSessions.value[activeChatId.value!]
    if (chat) {
      const message = chat.messages.find(m => m.id === currentStreamingMessageId)
      if (message) {
        message.streaming = false
        if (message.content === '') {
          message.content = '用户停止了生成'
        }
      }
    }
  }
  
  isStreaming.value = false
  currentStreamingMessageId = null
  resetStreamState()
  saveToLocalStorage()
}

// 重置流式状态
const resetStreamState = () => {
  currentReasoning.value = ''
  currentAnswer.value = ''
  abortController = null
}

// 工具函数
const saveToLocalStorage = () => {
  try {
    localStorage.setItem('chatSessions', JSON.stringify(chatSessions.value))
    localStorage.setItem('historyList', JSON.stringify(historyList.value))
    localStorage.setItem('activeChatId', activeChatId.value || '')
  } catch (error) {
    console.error('保存到localStorage失败:', error)
  }
}

const loadFromLocalStorage = (chatId?: string) => {
  try {
    const savedSessions = localStorage.getItem('chatSessions')
    const savedHistory = localStorage.getItem('historyList')
    const savedActiveId = localStorage.getItem('activeChatId')
    
    if (savedSessions) {
      chatSessions.value = JSON.parse(savedSessions)
    }
    
    if (savedHistory) {
      historyList.value = JSON.parse(savedHistory)
    }
    
    if (savedActiveId && !chatId) {
      activeChatId.value = savedActiveId
    }
  } catch (error) {
    console.error('从localStorage加载失败:', error)
  }
}

const scrollToBottom = () => {
  nextTick(() => {
    const container = document.querySelector('.dynamic-content')
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  })
}

// 生命周期
onMounted(() => {
  loadFromLocalStorage()
  if (!activeChatId.value && historyList.value.length > 0) {
    activeChatId.value = historyList.value[0].id
  }
})

onUnmounted(() => {
  if (isStreaming.value) {
    stopStream()
  }
})
</script>

<style lang="less" scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  overflow: hidden;
}

.main-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f5f5f5;
  position: relative;
}

.dynamic-content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  position: relative;
  scroll-behavior: smooth;
}

.input-container {
  padding: 20px;
  border-top: 1px solid #e9ecef;
  background: #ffffff;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
  z-index: 10;
  position: relative;
}

.stream-controls {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
  animation: slideInUp 0.3s ease;
}

.stop-btn {
  padding: 8px 16px;
  background: linear-gradient(135deg, #ff4d4f, #f5222d);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 8px rgba(245, 34, 45, 0.2);
}

.stop-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 34, 45, 0.3);
}

.stop-icon {
  font-size: 12px;
  font-weight: bold;
}

.stream-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #666;
  animation: pulse 1.5s ease-in-out infinite;
}

.streaming-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #52c41a;
  animation: blink 1.5s infinite;
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

@keyframes blink {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
</style>