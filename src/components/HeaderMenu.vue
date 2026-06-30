<!--
  顶部功能导航组件，负责功能页切换意图传递。
  本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
-->
<template>
  <header class="header-menu">
    <!-- 折叠按钮 -->
    <nav class="nav-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        :class="['tab-btn', { active: activeTab === tab.value }]"
        @click="handleTabClick(tab.value)"
      >
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </nav>

    <!-- 用户信息与退出登录已移至左侧历史面板底部，顶部只保留功能导航。 -->
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  activeTab: string;
}

interface TabItem {
  value: string;
  label: string;
}

// 只向外抛出切换意图，不在组件内直接 router.push。
// 父组件会先弹出“当前会话正在输出”确认框；用户选择“留在当前会话”时，不能提前跳转。
const handleTabClick = (tabName: string) => {
  if (props.activeTab !== tabName) {
    emit('tab-change', tabName);
  }
};
const props = defineProps<Props>();
const emit = defineEmits<{
  'tab-change': [tabName: string];
}>();


/** 封装当前模块内的业务逻辑：tabs。 */
const tabs = computed<TabItem[]>(() => {
  const allTabs = [
    { value: '智能问答', label: '智能问答' },
    { value: '智能检索', label: '智能检索' },
    { value: '辅助起草', label: '辅助起草' },
    { value: '合规审核', label: '合规审核' },
  ];

  return allTabs;
});
</script>

<style scoped>
.header-menu {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 42px;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.2);
  z-index: 100;
  position: relative;
  background: #fff; /* 添加背景色 */
}

.nav-tabs {
  display: flex;
  flex: 1;
  gap: 4px;
  justify-content: flex-start;
}

.tab-btn {
  width: 75px;
  margin-right: 28px;
  height: 34px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  position: relative;
  overflow: hidden;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  transform: translateY(-1px);
}

.tab-btn.active {
  border-bottom: 3px solid #1c73eb;
  color: white;
}

.tab-btn.active::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 40%;
  height: 3px;
  background: white;
  border-radius: 2px 2px 0 0;
}

.tab-label {
  font-size: 16px;
  font-weight: 600;
  color: black;
}


</style>
