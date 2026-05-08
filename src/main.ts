import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from './App.vue';
import router from './router';
import './style.less';
declare global {
  interface ImportMeta {
    env: {
      VITE_API_BASE_URL?: string;
    };
  }
}
declare global {
  interface Window {
    __API_BASE_URL__: string;
  }
}

window.__API_BASE_URL__ = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const API_BASE_URL = window.__API_BASE_URL__;
async function getAgentToken() {
  let agentToken = new URLSearchParams(window.location.search).get('agentToken');
  if (!agentToken) {
    //  let targetOrigin = "http://1.94.244.72:11316 || '*"; // 或者*
    let targetOrigin = '*'; // 或者*
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
          data: {
            type: 'READY',
            value: '',
          },
        },
        targetOrigin,
      );
    });
  }

  // 3. 存 token
  window.__AGENT_TOKEN__ = agentToken;

  // 4. 调用 /v1/scopes 接口获取 scopes 数据
  if (agentToken) {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/scopes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: agentToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const scopesData = await response.json();
      console.log('scopesData:', scopesData);
      // 将 scopes 数据存储到全局变量，供应用使用
      window.__SCOPES_DATA__ = scopesData;
    } catch (error) {
      console.error('Failed to fetch scopes:', error);
      // 设置默认值以防接口调用失败
      window.__SCOPES_DATA__ = {
        ancestorScope: [],
        descendantScope: [],
        user: '1',
        query: '',
      };
    }
  } else {
    // 如果没有 token，设置默认值
    window.__SCOPES_DATA__ = {
      ancestorScope: [],
      descendantScope: [],
      user: '1',
      query: '',
    };
  }
}

getAgentToken();

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
