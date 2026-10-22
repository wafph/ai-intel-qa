/**
 * 前端路由定义，包含登录、问答、检索、起草、审核和收藏页面。
 * 采用嵌套路由模式：AppLayout 作为业务页面的布局外壳，独立页面（登录、404 等）不套布局。
 */
import { createRouter, createWebHistory } from 'vue-router';
import AppLayout from '@/components/AppLayout.vue';
import {
  isAuthenticatedByStorage,
  isExternalEntrySession,
  markExternalEntry,
  clearExternalEntry,
} from '@/services/authStorage';

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
    // 外部嵌套起草页：主系统 iframe 嵌入使用，不套 AppLayout、不强制本地登录态（走 agentAccess 授权）
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

// 路由守卫：外部主系统 iframe 嵌入时只允许停留在外部起草页；顶层窗口不限制；其余页面在无授权时进入登录页。
router.beforeEach((to) => {
  const embedded = isEmbeddedInParent();
  const isExternalRoute = to.path === '/external-draft' || to.path === '/not-found';

  // iframe 内进入过外部起草页即认定为外部接入会话（URL 无 token、token 改由 postMessage 传入时同样生效）
  if (embedded && to.path === '/external-draft' && !isExternalEntrySession()) {
    markExternalEntry();
  }

  if (isExternalEntrySession() && !isExternalRoute) {
    // 嵌入场景：只允许访问外部起草页，避免外部用户越权进入内部业务路由；
    // 顶层窗口（本地开发、自有浏览器直接访问）不做限制，并清除标记避免后续访问被持续锁定
    if (embedded) return { path: '/external-draft' };
    clearExternalEntry();
  }

  if (to.meta.public) return true;
  if (to.meta.requiresAuth && !isAuthenticatedByStorage()) {
    // 不再携带 redirect 参数：登录成功后统一进入第一个菜单 /intelligent-qa，
    // 避免被带回登录前访问的菜单路由
    return {
      path: '/login',
    };
  }
  return true;
});

export default router;
