import { createRouter, createWebHistory } from 'vue-router';
import { useAppStore } from '../stores/app';
import IntelligentQA from '../views/IntelligentQA.vue';
import IntelligentRetrieval from '../views/IntelligentRetrieval.vue';
import AuxiliaryDraft from '../views/AuxiliaryDraft.vue';
import ComplianceReview from '../views/ComplianceReview.vue';
const routes = [
  {
    path: '/',
    redirect: '/intelligent-qa',
  },
    {
    path: '/intelligent-qa',
    name: 'IntelligentQA',
    component: IntelligentQA,
  },
  {
    path: '/intelligent-retrieval',
    name: 'IntelligentRetrieval',
    component: IntelligentRetrieval,
  },
  {
    path: '/auxiliary-draft',
    name: 'AuxiliaryDraft',
    component: AuxiliaryDraft,
  },
  {
    path: '/compliance-review',
    name: 'ComplianceReview',
    component: ComplianceReview,
  },
  
  {
    path: '/my-collections',
    name: '我的收藏',
    component: () => import('../views/MyCollections.vue'),
  },
  {
    path: '/feedback',
    name: '合规审核',
    component: () => import('../views/Feedback.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫，同步菜单状态
router.beforeEach((to) => {
  const appStore = useAppStore();
  const menuId = to.path.substring(1) || 'qa';
  appStore.switchMenu(menuId);
});

export default router;
