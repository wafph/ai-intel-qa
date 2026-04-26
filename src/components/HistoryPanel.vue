<template>
  <div class="history-panel" :class="{ 'is-collapsed': collapsed }">
    <!-- 顶部区域 -->
    <div class="logo" v-show="!collapsed">
      <img src="/images/logos.png" alt="Logo" />
      <span>AI+规章制度智能体</span>
    </div>

    <div class="panel-header">
      <button class="new-chat-btn" v-show="!collapsed" @click="handleNewChat">
        <img src="/images/chats.png" alt="" />
        <span class="btn-text">新聊天</span>
      </button>
    </div>

    <!-- 历史列表 -->
    <div class="history-list" v-show="!collapsed">
      <div class="list-header">
        <h3>历史对话</h3>
        <button
          v-if="filteredHistory.length > 0"
          class="clear-btn"
          @click="handleClearAllHistory"
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
        <div v-for="item in groupedHistory" :key="item.date" class="history-group">
          <div class="group-date">{{ item.date }}</div>
          <div
            v-for="history in item.items"
            :key="history.id"
            :class="[
              'history-item',
              {
                active: activeChatId === history.id,
                collected: history.isCollected,
              },
            ]"
            @mouseenter="handleMouseEnter(history.id)"
            @mouseleave="handleMouseLeave(history.id)"
            @click="handleSelectChat(history.id)"
          >
            <div class="item-content">
              <div class="item-title">
                <span
                  v-if="history.isCollected && hoveredItemId === history.id"
                  class="favorite-icon"
                >
                  ★
                </span>
                {{ history.title }}
              </div>
              <div class="item-meta">
                <span class="item-type">{{ history.type }}</span>
                <span class="item-time">{{ history.formattedTime }}</span>
              </div>
            </div>

            <div
              v-if="hoveredItemId === history.id"
              class="item-menu-container"
              @click.stop
            >
              <button class="menu-toggle-btn" @click="toggleMenu(history.id)">⋮</button>

              <div v-if="visibleMenuId === history.id" class="dropdown-menu">
                <button
                  class="menu-item"
                  :class="{ favorited: history.isCollected }"
                  @click="handleToggleFavorite(history.id)"
                >
                  <span class="menu-icon">★</span>
                  <span class="menu-text">
                    {{ history.isCollected ? '取消收藏' : '收藏' }}
                  </span>
                </button>

                <button class="menu-item delete" @click="handleDeleteChat(history.id)">
                  <span class="menu-icon">🗑️</span>
                  <span class="menu-text">删除</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右下角个人中心 -->
    <div class="user-center-bottom" v-show="!collapsed">
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

      <div v-if="showUserMenu" class="user-menu">
        <div class="menu-item" @click="goToMyCollections">
          <el-icon><StarFilled /></el-icon>
          <span>我的收藏</span>
        </div>
        <div class="menu-item" @click="goToFeedback">
          <el-icon><Document /></el-icon>
          <span>我的反馈</span>
        </div>
        <div class="menu-divider"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox, ElMessage } from 'element-plus';

interface Props {
  historyList: any[];
  activeChatId: string | null;
  user: any;
  collapsed?: boolean; // 新增折叠状态
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'select-chat': [chatId: string];
  'new-chat': [];
  'delete-chat': [chatId: string];
  'clear-history': [];
  'toggle-favorite': [chatId: string];
  'switch-tab': [tabName: string];
  'toggle-collapse': [];
}>();

const router = useRouter();

const showUserMenu = ref(false);
const hoveredItemId = ref<string | null>(null);
const visibleMenuId = ref<string | null>(null);

const filteredHistory = computed(() => {
  return props.historyList || [];
});

const formatRelativeTime = (timestamp: number | string) => {
  //  修复：正确处理数字时间戳
  let date: Date;
  
  if (typeof timestamp === 'string') {
    // 如果是字符串，尝试解析
    date = new Date(timestamp);
  } else {
    // 如果是数字（时间戳），直接使用
    date = new Date(timestamp);
  }
  // 检查日期是否有效
  if (isNaN(date.getTime())) {
    console.error('无效的日期:', timestamp);
    return '未知时间';
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffDays = Math.round(
    (today.getTime() - thatDay.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) {
    return `今天 ${date.getHours().toString().padStart(2, '0')}:${date
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
  }

  if (diffDays === 1) {
    return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
  }

  if (diffDays === 2) {
    return `前天 ${date.getHours().toString().padStart(2, '0')}:${date
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
  }

  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
};

// ✅ 修复：分组逻辑
const groupedHistory = computed(() => {
  const groups: Record<string, any[]> = {};

  filteredHistory.value.forEach((item) => {
    // ✅ 使用修复后的格式化函数
    const relativeTime = formatRelativeTime(item.time);
    
    // ✅ 提取日期部分用于分组
    let groupKey = '';
    
    if (relativeTime.includes('今天')) {
      groupKey = '今天';
    } else if (relativeTime.includes('昨天')) {
      groupKey = '昨天';
    } else if (relativeTime.includes('前天')) {
      groupKey = '前天';
    } else {
      // 提取日期部分（YYYY-MM-DD）
      const date = new Date(item.time);
      if (!isNaN(date.getTime())) {
        groupKey = `${date.getFullYear()}-${(date.getMonth() + 1)
          .toString()
          .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
      } else {
        groupKey = '未知日期';
      }
    }

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push({
      ...item,
      formattedTime: relativeTime,
    });
  });

  return Object.entries(groups).map(([date, items]) => ({
    date,
    items,
  }));
});

const handleSelectChat = (chatId: string) => {
  emit('select-chat', chatId);
  closeMenu();
};

const handleNewChat = () => {
  emit('new-chat');
  closeMenu();
};

const handleDeleteChat = (chatId: string) => {
  ElMessageBox.confirm('确定要删除这条对话记录吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(() => {
      emit('delete-chat', chatId);
      closeMenu();
      ElMessage.success('删除成功');
    })
    .catch(() => {});
};

const handleClearAllHistory = () => {
  ElMessageBox.confirm(
    '此操作将清空所有菜单的历史记录，且当前对话也会被清空，确定要清空所有历史对话吗？',
    '提示',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
      customClass: 'clear-history-dialog',
    },
  )
    .then(() => {
      emit('clear-history');
      closeMenu();
      ElMessage.success('已清空所有历史记录');
    })
    .catch(() => {});
};

const handleToggleFavorite = (chatId: string) => {
  emit('toggle-favorite', chatId);
  closeMenu();
};

const handleMouseEnter = (itemId: string) => {
  hoveredItemId.value = itemId;
};

const handleMouseLeave = (itemId: string) => {
  if (hoveredItemId.value === itemId && visibleMenuId.value !== itemId) {
    hoveredItemId.value = null;
  }
};

const toggleMenu = (itemId: string) => {
  visibleMenuId.value = visibleMenuId.value === itemId ? null : itemId;
};

const closeMenu = () => {
  visibleMenuId.value = null;
  hoveredItemId.value = null;
};

const handleClickOutsideMenu = (event: MouseEvent) => {
  const menuContainer = document.querySelector('.item-menu-container');
  if (menuContainer && !menuContainer.contains(event.target as Node)) {
    closeMenu();
  }
};

const toggleUserMenu = () => {
  showUserMenu.value = !showUserMenu.value;
};

const goToMyCollections = () => {
  showUserMenu.value = false;
  router.push('/my-collections');
};

const goToFeedback = () => {
  showUserMenu.value = false;
  router.push('/feedback');
};

const handleClickOutsideUserMenu = (event: MouseEvent) => {
  const userCenter = document.querySelector('.user-center-bottom');
  if (userCenter && !userCenter.contains(event.target as Node)) {
    showUserMenu.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutsideMenu);
  document.addEventListener('click', handleClickOutsideUserMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutsideMenu);
  document.removeEventListener('click', handleClickOutsideUserMenu);
});
</script>

<style lang="less" scoped>
.history-panel {
  width: 280px;
  background: #ffffff;
  border-right: 1px solid #e9ecef;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05);
  transition: width 0.3s ease; /* 添加过渡动画 */

  .logo {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: black;
    font-size: 20px;
    font-weight: 600;
    text-decoration: none;
    height: 70px;
    box-shadow: 0 2px 8px rgba(24, 144, 255, 0.2);
    z-index: 100;

    span {
      margin-right: 20px;
    }
  }

  .logo img {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    object-fit: contain;
    background: white;
    padding: 4px;
  }

  &.is-collapsed {
    width: 0; /* 折叠后的宽度 */
  }
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
  border: 2px solid #1c73eb;
  background: #fff;
  color: #1c73eb;
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

.btn-text {
  font-weight: 500;
  font-size: 18px;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding-bottom: 100px;
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
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s;
  border-left: 3px solid transparent;
  position: relative;
  min-height: 60px;
}

.history-item:hover {
  background: #e6f7ff;
  border-left-color: #91d5ff;
}

.history-item.active {
  background: #e6f7ff;
  box-shadow: inset 2px 0 0 #1890ff;

  .item-type {
    background: #f0f7ff;
    color: #1890ff;
  }
}

.item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item-title {
  font-size: 15px;
  font-weight: 500;
  color: #333;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.favorite-icon {
  color: #f6c542;
  font-size: 12px;
  flex-shrink: 0;
  transition: opacity 0.2s;
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
  white-space: nowrap;
}

.item-time {
  color: #bfbfbf;
  white-space: nowrap;
  margin-left: 8px;
}

/* 菜单相关样式 */
.item-menu-container {
  position: relative;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 2;
}

.history-item:hover .item-menu-container {
  opacity: 1;
}

.menu-toggle-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: #999;
  font-size: 18px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  font-weight: bold;
  line-height: 1;
  padding: 0;
}

.menu-toggle-btn:hover {
  background: #f0f0f0;
  color: #666;
}

.dropdown-menu {
  position: absolute;
  top: 28px;
  right: 0;
  background: white;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  min-width: 120px;
  z-index: 100;
  overflow: hidden;
  border: 1px solid #e9ecef;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.menu-item {
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #333;
  transition: all 0.2s;
  text-align: left;
  white-space: nowrap;
}

.menu-item:hover {
  background: #f0f7ff;
  color: #1890ff;
}

.menu-item.favorited {
  color: #f6c542;
}

.menu-item.delete:hover {
  background: #fff2f0;
  color: #ff4d4f;
}

.menu-icon {
  font-size: 14px;
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.menu-text {
  flex: 1;
}

/* 右下角个人中心样式 */
.user-center-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 3px 10px;
  background: linear-gradient(to top, #fff 80%, transparent);
  border-top: 1px solid #e9ecef;
  z-index: 20;
}

.user-info-container {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #f8f9fa;
  cursor: pointer;
  padding: 0 10px;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.user-info-container:hover {
  background: #e9ecef;
}

.user-info-container.active {
  background: #e7f3ff;
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
  bottom: 100%;
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
