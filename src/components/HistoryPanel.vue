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
          v-if="filteredHistory.length > 0"
          class="clear-btn"
          @click="handleClearHistory"
        >
          清空
        </button>
      </div>
      
      <div v-if="filteredHistory.length === 0" class="empty-state">
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
            :class="['history-item', { 
              active: activeChatId === history.id,
              collected: history.isCollected 
            }]"
            @click="handleSelectChat(history.id)"
          >
            <div class="item-content">
              <div class="item-title">
                <span v-if="history.isCollected" class="favorite-icon">★</span>
                {{ history.title }}
              </div>
              <div class="item-preview">{{ history.preview }}</div>
              <div class="item-meta">
                <span class="item-type">{{ history.type }}</span>
                <span class="item-time">{{ history.time }}</span>
              </div>
            </div>
            <button 
              class="favorite-btn"
              :class="{ 'favorited': history.isCollected }"
              @click.stop="handleToggleFavorite(history.id)"
            >
              ★
            </button>
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
    
    <!-- 右下角个人中心 -->
    <div class="user-center-bottom">
      <div 
        class="user-info-container"
        @click="toggleUserMenu"
        :class="{ active: showUserMenu }"
      >
        <img 
          :src="user.avatar || '/images/user.png'" 
          alt="用户头像" 
          class="user-avatar"
        />
        <div class="user-details">
          <span class="user-name">{{ user.name || '用户' }}</span>
        </div>
        <i class="arrow-icon" :class="{ rotated: showUserMenu }">▼</i>
      </div>
      
      <!-- 用户菜单 -->
      <div v-if="showUserMenu" class="user-menu">
        <div class="menu-item" @click="goToMyCollections">
          <i class="menu-icon">⭐</i>
          <span>我的收藏</span>
        </div>
        <div class="menu-item" @click="goToFeedback">
          <i class="menu-icon">📋</i>
          <span>我的反馈</span>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item" @click="goToSettings">
          <i class="menu-icon">⚙️</i>
          <span>个人设置</span>
        </div>
        <div class="menu-item logout" @click="handleLogout">
          <i class="menu-icon">🚪</i>
          <span>退出登录</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '../stores/user';

interface Props {
  historyList: any[]
  activeChatId: string | null
  user: any
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'select-chat': [chatId: string]
  'new-chat': []
  'delete-chat': [chatId: string]
  'clear-history': []
  'toggle-favorite': [chatId: string]
}>()

const router = useRouter();
const userStore = useUserStore();

// 新增状态
const showUserMenu = ref(false);

// 计算属性
const filteredHistory = computed(() => {
  return props.historyList || [];
});

const groupedHistory = computed(() => {
  const groups: Record<string, any[]> = {}
  
  filteredHistory.value.forEach(item => {
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

// 原有的方法
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

// 新增：切换收藏状态
const handleToggleFavorite = (chatId: string) => {
  emit('toggle-favorite', chatId)
}

// 切换用户菜单显示
const toggleUserMenu = () => {
  showUserMenu.value = !showUserMenu.value
}

// 前往我的收藏页面
const goToMyCollections = () => {
  showUserMenu.value = false
  router.push('/my-collections')
}

// 前往我的反馈页面
const goToFeedback = () => {
  showUserMenu.value = false
  router.push('/feedback')
}

// 前往个人设置
const goToSettings = () => {
  showUserMenu.value = false
  router.push('/settings')
}

// 处理退出登录
const handleLogout = () => {
  showUserMenu.value = false
  if (confirm('确定要退出登录吗？')) {
    userStore.logout()
    router.push('/login')
  }
}

// 点击外部关闭用户菜单
const handleClickOutside = (event: MouseEvent) => {
  const userCenter = document.querySelector('.user-center-bottom')
  if (userCenter && !userCenter.contains(event.target as Node)) {
    showUserMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
/* 原有的样式保持不变 */
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
  border: 2px solid #8287a4;
  background: #fff;
  color: #333;
  border-radius: 20px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.new-chat-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(24, 144, 255, 0.3);
}

.btn-icon {
  font-size: 23px;
  font-weight: 300;
}

.btn-text {
  font-weight: 500;
  font-size: 18px;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding-bottom: 100px; /* 为底部的个人中心留出空间 */
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

.history-item.collected {
  border-left-color: #f6c542;
}

.item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-title {
  font-size: 15px;
  font-weight: 500;
  color: #333;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  display: flex;
  align-items: center;
  gap: 4px;
}

.favorite-icon {
  color: #f6c542;
  font-size: 12px;
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

.item-time {
  color: #bfbfbf;
  white-space: nowrap;
}

/* 收藏按钮样式 */
.favorite-btn {
  position: absolute;
  right: 40px;
  top: 12px;
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  font-size: 16px;
  color: #ccc;
  cursor: pointer;
  transition: all 0.2s;
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.history-item:hover .favorite-btn {
  opacity: 1;
}

.favorite-btn.favorited {
  color: #f6c542;
  opacity: 1;
}

.favorite-btn:hover {
  transform: scale(1.2);
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
  top: 12px;
}

.history-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: #ff7875;
  transform: scale(1.1);
}

/* 右下角个人中心样式 */
.user-center-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px;
  background: linear-gradient(to top, #fff 80%, transparent);
  border-top: 1px solid #e9ecef;
  z-index: 20;
}

.user-info-container {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.user-info-container:hover {
  background: #e9ecef;
  border-color: #dee2e6;
}

.user-info-container.active {
  background: #e7f3ff;
  border-color: #91d5ff;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.1);
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.user-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.arrow-icon {
  font-size: 12px;
  color: #666;
  transition: transform 0.3s ease;
  margin-left: auto;
}

.arrow-icon.rotated {
  transform: rotate(180deg);
}

/* 用户菜单样式 */
.user-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 20px;
  right: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 8px 0;
  animation: slideUp 0.2s ease;
  z-index: 100;
  border: 1px solid #e9ecef;
  overflow: hidden;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  transition: all 0.2s ease;
  border-left: 3px solid transparent;
}

.menu-item:hover {
  background: #f8f9fa;
  border-left-color: #1890ff;
  color: #1890ff;
}

.menu-item.logout {
  color: #ff4d4f;
}

.menu-item.logout:hover {
  background: #fff2f0;
  border-left-color: #ff4d4f;
  color: #ff4d4f;
}

.menu-icon {
  font-size: 16px;
  width: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.menu-divider {
  height: 1px;
  background: #e9ecef;
  margin: 8px 0;
}
</style>