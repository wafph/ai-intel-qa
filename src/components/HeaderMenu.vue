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
  collapsed?: boolean; // 新增折叠状态
}

interface TabItem {
  value: string;
  label: string;
}

import { useRouter } from 'vue-router';

const router = useRouter();

// 修改handleTabClick方法
const handleTabClick = (tabName: string) => {
  if (props.activeTab !== tabName) {
    const routeMap: Record<string, string> = {
      智能问答: '/intelligent-qa',
      智能检索: '/intelligent-retrieval',
      辅助起草: '/auxiliary-draft',
      合规审核: '/compliance-review',
    };

    router.push(routeMap[tabName] || '/intelligent-qa');
    emit('tab-change', tabName);
  }
};
const props = defineProps<Props>();
const emit = defineEmits<{
  'tab-change': [tabName: string];
  'toggle-sidebar': []; // 新增折叠事件
}>();


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
  height: 70px;
  display: flex;
  align-items: center;
  padding: 0 54px;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.2);
  z-index: 100;
  position: relative;
  background: #fff; /* 添加背景色 */
}

.header-left {
  display: flex;
  align-items: center;
  margin-right: 40px;
}

.collapse-btn {
  width: 40px;
  height: 40px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #606266;
  font-size: 18px;
  transition: all 0.3s;
}

.collapse-btn:hover {
  background: #f5f7fa;
  border-radius: 4px;
}

.nav-tabs {
  display: flex;
  flex: 1;
  gap: 4px;
  justify-content: flex-start;
}

.tab-btn {
  width: 75px;
  margin-right: 40px;
  height: 40px;
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
  font-size: 18px;
  font-weight: 600;
  color: black;
}

.header-right {
  display: flex;
  align-items: center;
  margin-left: auto;
}

.user-entry {
  min-width: 160px;
  height: 42px;
  padding: 0 12px;
  border: 1px solid #e6edf7;
  background: #f8fbff;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.user-entry:hover {
  border-color: #1c73eb;
  box-shadow: 0 4px 14px rgba(28, 115, 235, 0.14);
}

.user-name {
  max-width: 86px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #1f2d3d;
  font-size: 14px;
  font-weight: 600;
}

.auth-tag {
  color: #1c73eb;
  background: #eaf3ff;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 12px;
}

.user-btn {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.user-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.user-avatar {
  width: 30px;
  height: 25px;
}
</style>
