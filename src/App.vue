<template>
  <div class="app-container">
    <div class="main-container">
      <Sidebar @history-click="handleHistoryClick" />
      <div class="content-area">
        <div class="header"></div>
        <div class="content-card">
          <RouterView />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import Sidebar from './components/Sidebar.vue'
import { useAppStore } from './stores/app'

const router = useRouter()
const appStore = useAppStore()

// 处理历史记录点击
const handleHistoryClick = (query: string) => {
  // 切换到智能问答页面
  appStore.switchMenu('qa')
  router.push('/qa')
}
</script>

<style lang="less" scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  background-color: @bg-color;
  
  .content-card {
    // background-color: @white;
    border-radius: 8px;
    // box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
    padding: 24px;
    min-height: 100%;
  }
}

@media (max-width: 768px) {
  .main-container {
    flex-direction: column;
  }
  
  .content-area {
    padding: 16px;
  }
}
</style>