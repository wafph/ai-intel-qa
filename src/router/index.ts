import { createRouter, createWebHistory } from 'vue-router';
import { useAppStore } from '../stores/app';

const routes = [
  {
    path: '/',
    redirect: '/intelligent-qa',
  },
  {
    path: '/intelligent-qa',
    name: '智能问答',
    component: () => import('../views/IntelligentQA.vue'),
  },
  {
    path: '/intelligent-retrieval',
    name: '智能检索',
    component: () => import('../views/IntelligentRetrieval.vue'),
  },
   {
    path: '/auxiliary-draft',
    name: '智能检索',
    component: () => import('../views/AuxiliaryDraft.vue'),
  },
  {
    path: '/compliance-review',
    name: '合规审核',
    component: () => import('../views/ComplianceReview.vue'),
  },
  {
    path: '/my-collections',
    name: '我的收藏',
    component: () => import('../views/MyCollections.vue'),
  },
  // {
  //   path: '/review',
  //   name: '合规审核',
  //   component: () => import('../views/ComplianceReview.vue'),
  // },
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
