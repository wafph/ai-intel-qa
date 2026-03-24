<template>
  <div 
    class="sidebar" 
    :class="{ collapsed: sidebarCollapsed }"
  >
    <div class="sidebar-header">
      <div class="logo">
        <el-icon :size="20" color="#1890ff">
          <Platform />
        </el-icon>
        <span v-if="!sidebarCollapsed">AI+规章制度智能体</span>
      </div>
      <div class="collapse-btn" @click="toggleSidebar">
        <el-icon>
          <component :is="sidebarCollapsed ? 'Expand' : 'Fold'" />
        </el-icon>
      </div>
    </div>
    
    <div class="menu-container">
      <div 
        v-for="item in menuItems" 
        :key="item.id"
        class="menu-item"
        :class="{ active: activeMenu === item.id }"
        @click="handleMenuClick(item.id)"
      >
        <el-icon>
          <component :is="item.icon" />
        </el-icon>
        <span v-if="!sidebarCollapsed">{{ item.name }}</span>
      </div>
    </div>
    
    <div v-if="!sidebarCollapsed" class="history-container">
      <div class="history-title">历史对话</div>
      <template v-for="group in groupedHistory" :key="group.date">
        <div class="history-date">{{ group.date }}</div>
        <div 
          v-for="item in group.items" 
          :key="item.id"
          class="history-item"
          @click="$emit('history-click', item.query)"
        >
          {{ item.query }}
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../stores/app'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'  // 添加这行
import { Platform, Fold, Expand } from '@element-plus/icons-vue'

const router = useRouter()
const appStore = useAppStore()

// 使用 storeToRefs 来保持响应性
const { sidebarCollapsed, activeMenu, menuItems, historyItems } = storeToRefs(appStore)

const emit = defineEmits<{
  (e: 'history-click', query: string): void
}>()

// 按日期分组的历史记录
const groupedHistory = computed(() => {
  const groups: Record<string, any[]> = {}
  
  // 注意：historyItems 现在是 ref，需要使用 .value
  historyItems.value.forEach(item => {
    if (!groups[item.date]) {
      groups[item.date] = []
    }
    groups[item.date].push(item)
  })
  
  return Object.entries(groups).map(([date, items]) => ({
    date,
    items
  }))
})

// 切换侧边栏
const toggleSidebar = () => {
  appStore.toggleSidebar()
}

// 菜单点击
const handleMenuClick = (menuId: string) => {
  router.push(`/${menuId}`)
}
</script>

<style lang="less" scoped>
.sidebar {
  width: 260px;
  background-color: @white;
  border-right: 1px solid @border-color-light;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  overflow: hidden;
  
  &.collapsed {
    width: 64px;
  }
  
  &-header {
    padding: 20px 16px;
    border-bottom: 1px solid @border-color-light;
    display: flex;
    align-items: center;
    justify-content: space-between;
    
    .logo {
      display: flex;
      align-items: center;
      color: @primary-color;
      font-size: 18px;
      font-weight: 600;
      white-space: nowrap;
      
      .el-icon {
        margin-right: 8px;
      }
    }
  }
  
  .collapse-btn {
    cursor: pointer;
    color: @info-color;
    font-size: 18px;
    
    &:hover {
      color: @primary-color;
    }
  }
  
  .menu-container {
    flex: 1;
    padding: 16px 0;
    overflow-y: auto;
    
    .menu-item {
      padding: 12px 20px;
      margin: 4px 8px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
      
      &:hover {
        background-color: @bg-color;
      }
      
      &.active {
        background-color: #f0f7ff;
        color: @primary-color;
        font-weight: 500;
        box-shadow: 0 2px 4px rgba(24, 144, 255, 0.1);
        
        .el-icon {
          color: @primary-color;
        }
      }
      
      .el-icon {
        font-size: 18px;
        margin-right: 12px;
        width: 24px;
        text-align: center;
        color: @text-color-secondary;
        transition: color 0.2s;
      }
      
      span {
        overflow: hidden;
        text-overflow: ellipsis;
        transition: color 0.2s;
      }
    }
  }
  
  .history-container {
    padding: 16px;
    border-top: 1px solid @border-color-light;
    max-height: 300px;
    overflow-y: auto;
    
    .history-title {
      font-size: 14px;
      color: @text-color-secondary;
      margin-bottom: 12px;
      font-weight: 500;
    }
    
    .history-date {
      font-size: 12px;
      color: @info-color;
      margin-bottom: 4px;
    }
    
    .history-item {
      padding: 8px 12px;
      margin-bottom: 8px;
      background-color: @bg-color;
      border-radius: 4px;
      font-size: 13px;
      color: @text-color-secondary;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      
      &:hover {
        background-color: #eef5ff;
      }
    }
  }
}

@media (max-width: 768px) {
  .sidebar {
    width: 100%;
    height: auto;
    
    &.collapsed {
      width: 100%;
    }
  }
}
</style>