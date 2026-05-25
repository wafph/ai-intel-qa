/**
 * 前端路由定义，包含登录、问答、检索、起草、审核和收藏页面。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
import { createRouter, createWebHistory } from 'vue-router';
import IntelligentQA from '../views/IntelligentQA.vue';
import IntelligentRetrieval from '../views/IntelligentRetrieval.vue';
import AuxiliaryDraft from '../views/AuxiliaryDraft.vue';
import ComplianceReview from '../views/ComplianceReview.vue';
import { isAuthenticatedByStorage } from '@/services/authStorage';

const routes = [
  {
    path: '/',
    redirect: '/intelligent-qa',
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/intelligent-qa',
    name: 'IntelligentQA',
    component: IntelligentQA,
    meta: { requiresAuth: true },
  },
  {
    path: '/intelligent-retrieval',
    name: 'IntelligentRetrieval',
    component: IntelligentRetrieval,
    meta: { requiresAuth: true },
  },
  {
    path: '/auxiliary-draft',
    name: 'AuxiliaryDraft',
    component: AuxiliaryDraft,
    meta: { requiresAuth: true },
  },
  {
    path: '/compliance-review',
    name: 'ComplianceReview',
    component: ComplianceReview,
    meta: { requiresAuth: true },
  },
  {
    path: '/my-collections',
    name: 'MyCollections',
    component: () => import('../views/MyCollections.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/not-found',
    name: 'NotFound',
    component: () => import('../views/NotFond.vue'),
    meta: { public: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/not-found',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫：没有 agentToken 外部授权，也没有本地登录 token 时，直接访问业务页面需要进入登录页。
router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (to.meta.requiresAuth && !isAuthenticatedByStorage()) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    };
  }
  return true;
});

export default router;
