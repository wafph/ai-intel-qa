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
import { useRouter } from 'vue-router';
import { useAppStore } from './stores/app';

const router = useRouter();
const appStore = useAppStore();

// 处理历史记录点击
const handleHistoryClick = () => {
  // 切换到智能问答页面
  appStore.switchMenu('qa');
  router.push('/qa');
};
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
  background-color: @bg-color;
  .header{
    position: fixed;
    width: calc(100% - 260px);
  }

  .content-card {
    border-radius: 8px;
    padding: 24px;
    min-height: calc(100% - 65px);
    margin-top: 60px;
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
