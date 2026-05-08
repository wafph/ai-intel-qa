import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';

import App from './App.vue';
import router from './router';

import './style.less';
async function bootstrap() {
  // 1. 先从 URL 拿 token
  let agentToken = new URLSearchParams(window.location.search).get('agentToken');
  console.log('agentToken', agentToken);
  // 2. 没有就监听 postMessage
  if (!agentToken) {
    let targetOrigin = "http://1.94.244.72:11316 || '*"; // 或者*
    await new Promise((resolve) => {
      const handler = (event: any) => {
        targetOrigin = event.origin || '*';
        if (event.data?.data?.type === 'SET_AGENTTOKEN') {
          agentToken = event.data.data.value;
          window.removeEventListener('message', handler);
          resolve(event);
        }
      };
      window.addEventListener('message', handler);

      // 通知父页面：智能体已 ready
      window.parent.postMessage(
        {
          platform: '制度智能体',
          timestamp: Date.now(),
          data: { type: 'READY', value: '' },
        },
        targetOrigin,
      );
    });
  }

  // 3. 存 token
  window.__AGENT_TOKEN__ = agentToken;
}
bootstrap();
const app = createApp(App);
const pinia = createPinia();

// 注册Element Plus图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(pinia);
app.use(router);
app.use(ElementPlus);
app.mount('#app');
