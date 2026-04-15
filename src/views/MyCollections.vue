<template>
  <div class="my-collections">
    <!-- 顶部标题栏 -->
    <div class="page-header">
      <h1>我的收藏</h1>
      <div class="header-actions">
        <button 
          class="back-btn"
          @click="goBack"
        >
          ← 返回
        </button>
      </div>
    </div>

    <!-- 收藏列表 -->
    <div class="collections-container">
      <!-- 搜索和过滤 -->
      <div class="filter-bar">
        <div class="search-box">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索收藏内容..."
            class="search-input"
          />
        </div>
        
        <div class="filter-options">
          <div 
            v-for="tab in filterTabs" 
            :key="tab.id"
            class="filter-tab"
            :class="{ active: activeFilter === tab.id }"
            @click="setActiveFilter(tab.id)"
          >
            {{ tab.name }}
          </div>
        </div>
      </div>

      <!-- 收藏内容 -->
      <div v-if="filteredCollections.length === 0" class="empty-state">
        <div class="empty-icon">⭐</div>
        <p>暂无收藏内容</p>
        <p class="empty-tip">快去收藏你喜欢的历史对话吧</p>
      </div>

      <div v-else class="collections-grid">
        <div
          v-for="item in filteredCollections"
          :key="item.id"
          class="collection-item"
          @click="viewCollection(item)"
        >
          <div class="collection-header">
            <div class="collection-title">
              <span class="favorite-icon">★</span>
              {{ item.title }}
            </div>
            <button 
              class="remove-favorite-btn"
              @click.stop="removeFromFavorites(item.id)"
            >
              ★
            </button>
          </div>
          
          <div class="collection-preview">
            {{ item.preview }}
          </div>
          
          <div class="collection-meta">
            <span class="collection-type">{{ item.type }}</span>
            <span class="collection-time">{{ formatTime(item.time) }}</span>
          </div>
          
          <div class="collection-actions">
            <button 
              class="action-btn view-btn"
              @click.stop="viewCollection(item)"
            >
              查看对话
            </button>
            <button 
              class="action-btn share-btn"
              @click.stop="shareCollection(item)"
            >
              分享
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useChatStore } from '../stores/chat';

const router = useRouter();
const chatStore = useChatStore();

// 搜索和过滤
const searchQuery = ref('');
const activeFilter = ref('all');
const filterTabs = [
  { id: 'all', name: '全部' },
  { id: '智能问答', name: '智能问答' },
  { id: '辅助起草', name: '辅助起草' },
  { id: '合规审核', name: '合规审核' },
  { id: '智能检索', name: '智能检索' }
];

// 过滤后的收藏列表
const filteredCollections = computed(() => {
  let collections = chatStore.collectedHistory;
  
  // 按类型过滤
  if (activeFilter.value !== 'all') {
    collections = collections.filter(item => item.type === activeFilter.value);
  }
  
  // 按搜索关键词过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    collections = collections.filter(item => 
      item.title.toLowerCase().includes(query) ||
      item.preview.toLowerCase().includes(query)
    );
  }
  
  return collections;
});

// 设置激活的过滤器
const setActiveFilter = (filterId: string) => {
  activeFilter.value = filterId;
};

// 查看收藏
const viewCollection = (item: any) => {
  // 这里可以跳转到对话页面
  router.push({
    path: '/chat',
    query: { id: item.id }
  });
};

// 从收藏中移除
const removeFromFavorites = (id: string) => {
  chatStore.toggleCollect(id);
};

// 分享收藏
const shareCollection = (item: any) => {
  // 这里可以实现分享功能
  alert(`分享收藏：${item.title}`);
};

// 格式化时间
const formatTime = (timeStr: string) => {
  const date = new Date(timeStr);
  return date.toLocaleString();
};

// 返回上一页
const goBack = () => {
  router.back();
};

onMounted(() => {
  // 加载收藏数据
  chatStore.loadFromLocalStorage();
});
</script>

<style scoped>
.my-collections {
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
  display: flex;
  align-items: center;
  gap: 10px;
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

.collections-container {
  padding: 30px 40px;
  margin: 0 auto;
}

.filter-bar {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  margin-bottom: 30px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.search-box {
  position: relative;
  width: 100%;
  max-width: 400px;
}

.search-input {
  width: 100%;
  padding: 12px 20px 12px 40px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.3s;
}

.search-input:focus {
  outline: none;
  border-color: #1890ff;
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #999;
  font-size: 16px;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-tab {
  padding: 8px 16px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 20px;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  transition: all 0.3s;
}

.filter-tab:hover {
  background: #e9ecef;
}

.filter-tab.active {
  background: #1890ff;
  border-color: #1890ff;
  color: white;
}

.empty-state {
  background: white;
  padding: 60px 20px;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.empty-icon {
  font-size: 60px;
  color: #f6c542;
  margin-bottom: 20px;
  opacity: 0.6;
}

.empty-state p {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #666;
}

.empty-tip {
  font-size: 14px;
  color: #999;
}

.collections-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.collection-item {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 2px solid transparent;
}

.collection-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: #1890ff;
}

.collection-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.collection-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.collection-title .favorite-icon {
  color: #f6c542;
  font-size: 14px;
  flex-shrink: 0;
}

.collection-title span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.remove-favorite-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  font-size: 18px;
  color: #f6c542;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.remove-favorite-btn:hover {
  transform: scale(1.2);
  color: #ff4d4f;
}

.collection-preview {
  font-size: 13px;
  color: #666;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  flex: 1;
  min-height: 60px;
}

.collection-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #999;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

.collection-type {
  background: #f0f7ff;
  color: #1890ff;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.collection-time {
  white-space: nowrap;
  margin-left: auto;
  color: #bfbfbf;
}

.collection-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.action-btn {
  flex: 1;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;
}

.view-btn {
  background: #1890ff;
  color: white;
}

.view-btn:hover {
  background: #40a9ff;
  transform: translateY(-1px);
}

.share-btn {
  background: #f0f0f0;
  color: #666;
}

.share-btn:hover {
  background: #e9ecef;
  transform: translateY(-1px);
}
</style>