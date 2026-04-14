<template>
  <header class="header-menu">
    <div class="header-left">
      <div class="logo">
        <img src="/logos.png" alt="Logo" />
        <span>AI+规章制度智能体</span>
      </div>
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

    <div class="header-right">
      <button class="user-btn">
        <img class="user-avatar" src="../../public/user.png" alt="" />
      </button>
    </div>
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
}>();

// 标签数据
const tabs = computed<TabItem[]>(() => [
  { value: '智能问答', label: '智能问答' },
  { value: '智能检索', label: '智能检索' },
  { value: '辅助起草', label: '辅助起草' },
  { value: '合规审核', label: '合规审核' },
]);
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
}

.header-left {
  display: flex;
  align-items: center;
  margin-right: 40px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  color: black;
  font-size: 20px;
  font-weight: 600;
  text-decoration: none;

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

.nav-tabs {
  display: flex;
  flex: 1;
  gap: 4px;
  justify-content: flex-start;
}

.tab-btn {
  /* width: 15%; */
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
  border-bottom: 3px solid #b6bfdc;
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
