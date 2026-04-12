<template>
  <div class="history-panel">
    <!-- 顶部区域 -->
    <div class="panel-header">
      <button class="new-chat-btn" @click="handleNewChat">
        <span class="btn-icon">+</span>
        <span class="btn-text">新对话</span>
      </button>
    </div>
    
    <!-- 历史列表 -->
    <div class="history-list">
      <div class="list-header">
        <h3>历史对话</h3>
        <button 
          v-if="historyList.length > 0"
          class="clear-btn"
          @click="handleClearHistory"
        >
          清空
        </button>
      </div>
      
      <div v-if="historyList.length === 0" class="empty-state">
        <div class="empty-icon">📁</div>
        <p>暂无历史对话</p>
        <p class="empty-tip">开始新的对话吧</p>
      </div>
      
      <div v-else class="history-items">
        <div
          v-for="item in groupedHistory"
          :key="item.date"
          class="history-group"
        >
          <div class="group-date">{{ item.date }}</div>
          <div
            v-for="history in item.items"
            :key="history.id"
            :class="['history-item', { active: activeChatId === history.id }]"
            @click="handleSelectChat(history.id)"
          >
            <div class="item-icon">
              <span v-if="history.type === '智能问答'">💬</span>
              <span v-else-if="history.type === '辅助起草'">✍️</span>
              <span v-else>📄</span>
            </div>
            <div class="item-content">
              <div class="item-title">{{ history.title }}</div>
              <div class="item-preview">{{ history.preview }}</div>
              <div class="item-meta">
                <span class="item-type">{{ history.type }}</span>
                <span class="item-time">{{ history.time }}</span>
              </div>
            </div>
            <button 
              class="delete-btn"
              @click.stop="handleDeleteChat(history.id)"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  historyList: HistoryItem[]
  activeChatId: string | null
}

interface HistoryItem {
  id: string
  title: string
  time: string
  type: string
  preview: string
}

interface HistoryGroup {
  date: string
  items: HistoryItem[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'select-chat': [chatId: string]
  'new-chat': []
  'delete-chat': [chatId: string]
  'clear-history': []
}>()

// 计算属性
const groupedHistory = computed(() => {
  const groups: Record<string, HistoryItem[]> = {}
  
  props.historyList.forEach(item => {
    const date = item.time.includes('今天') ? '今天' : 
                 item.time.includes('昨天') ? '昨天' : 
                 item.time.split(' ')[0]
    
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(item)
  })
  
  return Object.entries(groups).map(([date, items]) => ({
    date,
    items
  }))
})

// 方法
const handleSelectChat = (chatId: string) => {
  emit('select-chat', chatId)
}

const handleNewChat = () => {
  emit('new-chat')
}

const handleDeleteChat = (chatId: string) => {
  if (confirm('确定要删除这条对话记录吗？')) {
    emit('delete-chat', chatId)
  }
}

const handleClearHistory = () => {
  if (confirm('确定要清空所有历史记录吗？')) {
    emit('clear-history')
  }
}
</script>

<style scoped>
.history-panel {
  width: 280px;
  background: #ffffff;
  border-right: 1px solid #e9ecef;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05);
}

.panel-header {
  padding: 20px;
  border-bottom: 1px solid #e9ecef;
  background: #ffffff;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.new-chat-btn {
  width: 100%;
  height: 44px;
  background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.2);
}

.new-chat-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(24, 144, 255, 0.3);
}

.new-chat-btn:active {
  transform: translateY(0);
}

.btn-icon {
  font-size: 20px;
  font-weight: 300;
}

.btn-text {
  font-weight: 500;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.list-header {
  padding: 16px 20px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #f0f0f0;
  background: #ffffff;
  position: sticky;
  top: 0;
  z-index: 5;
}

.list-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.clear-btn {
  padding: 4px 12px;
  background: #f5f5f5;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: #ff4d4f;
  border-color: #ff4d4f;
  color: white;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #bfbfbf;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.4;
}

.empty-state p {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #999;
}

.empty-tip {
  font-size: 12px;
  color: #bfbfbf;
}

.history-items {
  padding: 0 0 20px 0;
}

.history-group {
  margin-bottom: 16px;
}

.group-date {
  padding: 8px 20px;
  font-size: 12px;
  color: #8c8c8c;
  font-weight: 500;
  background: #fafafa;
  border-left: 3px solid #1890ff;
  margin: 8px 0 4px 0;
  position: sticky;
  top: 60px;
  z-index: 4;
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.9);
}

.history-item {
  padding: 12px 20px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s;
  border-left: 3px solid transparent;
  position: relative;
  min-height: 70px;
}

.history-item:hover {
  background: #f0f7ff;
  border-left-color: #91d5ff;
}

.history-item.active {
  background: #e6f7ff;
  border-left-color: #1890ff;
  box-shadow: inset 2px 0 0 #1890ff;
}

.history-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 2px;
  background: #1890ff;
}

.item-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #1890ff;
  transition: all 0.2s;
}

.history-item.active .item-icon {
  background: #1890ff;
  color: white;
}

.item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.item-preview {
  font-size: 12px;
  color: #8c8c8c;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  opacity: 0.8;
}

.item-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-top: 2px;
}

.item-type {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 3px;
  color: #666;
  font-weight: 500;
}

.history-item.active .item-type {
  background: rgba(24, 144, 255, 0.1);
  color: #1890ff;
}

.item-time {
  color: #bfbfbf;
  white-space: nowrap;
}

.delete-btn {
  opacity: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: #ff4d4f;
  color: white;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
}

.history-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: #ff7875;
  transform: translateY(-50%) scale(1.1);
}
</style>