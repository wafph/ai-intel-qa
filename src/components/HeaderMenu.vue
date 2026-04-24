<template>
  <header class="header-menu">
    <!-- 折叠按钮 -->
    <div class="header-left">
      <button class="collapse-btn" @click="$emit('toggle-sidebar')">
        <el-icon v-if="collapsed">
          <Expand />
        </el-icon>
        <el-icon v-else>
          <Fold />
        </el-icon>
      </button>
    </div>

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
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Expand, Fold } from '@element-plus/icons-vue';

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
  padding: 0 24px;
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