import { createRouter, createWebHistory } from 'vue-router'
import { useAppStore } from '../stores/app'

const routes = [
  {
    path: '/',
    redirect: '/qa'
  },
  {
    path: '/qa',
    name: '智能问答',
    component: () => import('../components/IntelligentQA.vue')
  },
  {
    path: '/retrieval',
    name: '智能检索',
    component: () => import('../components/IntelligentRetrieval.vue')
  },
  {
    path: '/drafting',
    name: '辅助起草',
    component: () => import('../components/AuxiliaryDraft.vue')
  },
  {
    path: '/review',
    name: '合规审核',
    component: () => import('../components/ComplianceReview.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫，同步菜单状态
router.beforeEach((to) => {
  const appStore = useAppStore()
  const menuId = to.path.substring(1) || 'qa'
  appStore.switchMenu(menuId)
})

export default router