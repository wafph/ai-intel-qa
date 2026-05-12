import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from './App.vue';
import router from './router';
import './style.less';
import { useUserStore } from './stores/user';

const bootstrap = async () => {
  const app = createApp(App);
  const pinia = createPinia();

  // 注册 Element Plus 图标
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component);
  }

  app.use(pinia);
  app.use(ElementPlus);

  // 注意：必须先初始化认证上下文，再安装 router。
  // 否则首次访问带 agentToken 的业务 URL 时，路由守卫可能先判定未登录并跳到 /login。
  const userStore = useUserStore();
  await userStore.initializeAuth();

  app.use(router);
  await router.isReady();
  app.mount('#app');
};

bootstrap();
