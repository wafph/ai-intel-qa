/**
 * 前端路由定义，包含登录、问答、检索、起草、审核和收藏页面。
 * 采用嵌套路由模式：AppLayout 作为业务页面的布局外壳，独立页面（登录、404 等）不套布局。
 */
import { createRouter, createWebHistory } from 'vue-router';
import AppLayout from '@/components/AppLayout.vue';
import { isAuthenticatedByStorage } from '@/services/authStorage';
import { isExternalDraftLocation } from '@/services/externalDraftAccess';

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
    // 外部嵌套起草页：主系统 iframe 嵌入使用，不套 AppLayout、不强制本地登录态（由 externalDraftAccess 独立校验）
    path: '/external-draft',
    name: 'ExternalDraft',
    component: () => import('@/views/ExternalDraft.vue'),
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

/** 是否为外部系统 iframe 嵌入场景（顶层窗口直接访问不算嵌入）。 */
const isEmbeddedInParent = () => {
  try {
    return window.parent !== window;
  } catch {
    // 跨域访问 window.parent 属性可能抛错，保守按嵌入场景处理
    return true;
  }
};

// 外部入口不借用内部登录态；iframe 接入后只停留在独立页面。
let enteredExternal = isExternalDraftLocation();
router.beforeEach((to) => {
  if (to.path === '/external-draft') { enteredExternal = true; return true; }
  if (enteredExternal && isEmbeddedInParent() && to.path !== '/not-found') return { path: '/external-draft' };
  if (to.meta.public) return true;
  if (to.meta.requiresAuth && !isAuthenticatedByStorage()) return { path: '/login' };
  return true;
});

export default router;
