import { createRouter, createWebHistory } from 'vue-router';
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
    name: 'MyCollections',
    component: () => import('../views/MyCollections.vue'),
  },
  {
    path: '/not-found',
    name: 'NotFound',
    component: () => import('../views/NotFond.vue'),
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

export default router;