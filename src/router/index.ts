/**
 * 前端路由定义，包含登录、问答、检索、起草、审核和收藏页面。
 * 采用嵌套路由模式：AppLayout 作为业务页面的布局外壳，独立页面（登录、404 等）不套布局。
 */
import { createRouter, createWebHistory } from 'vue-router';
import AppLayout from '@/components/AppLayout.vue';
import { isAuthenticatedByStorage } from '@/services/authStorage';

const routes = [
  {
    path: '/',
    component: AppLayout,
    redirect: '/intelligent-qa',
    children: [
      {
        path: 'intelligent-qa',
        name: 'IntelligentQA',
        component: () => import('@/views/IntelligentQA.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'intelligent-retrieval',
        name: 'IntelligentRetrieval',
        component: () => import('@/views/IntelligentRetrieval.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'auxiliary-draft',
        name: 'AuxiliaryDraft',
        component: () => import('@/views/AuxiliaryDraft.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'compliance-review',
        name: 'ComplianceReview',
        component: () => import('@/views/ComplianceReview.vue'),
        meta: { requiresAuth: true },
      },
    ],
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/my-collections',
    name: 'MyCollections',
    component: () => import('@/views/MyCollections.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/not-found',
    name: 'NotFound',
    component: () => import('@/views/NotFond.vue'),
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
