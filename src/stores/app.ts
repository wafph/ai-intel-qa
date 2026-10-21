/**
 * Pinia 应用状态仓库，维护当前功能页、全局加载与布局状态。
 *
 * IAM 手动方法保留供比对；初始化与上传主流程不再请求 IAM Token。
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { API } from '@/api/api';
import { isSuccessStatus, request } from '@/services/http';
/** 封装当前模块内的业务逻辑：useAppStore。 */
export const useAppStore = defineStore('app', () => {
  // 侧边栏折叠状态
  const sidebarCollapsed = ref(false);

  // 当前激活的菜单
  const activeMenu = ref('qa');
  const sharedDataToken = ref<string | undefined>();
  const loading = ref(false);
  const error = ref<string | null>(null);
  // 菜单项
  const menuItems = ref([
    { id: 'qa', name: '智能问答', icon: 'ChatDotRound' },
    { id: 'retrieval', name: '智能检索', icon: 'Search' },
    { id: 'drafting', name: '辅助起草', icon: 'EditPen' },
    { id: 'review', name: '合规审核', icon: 'Flag' },
  ]);

  // 历史记录
  const historyItems = ref([
    { id: 1, query: '查询员工报销规定', date: '2026-02-01' },
    { id: 2, query: '湖北交投的核心业务板块有哪些？', date: '2026-02-01' },
    { id: 4, query: '考勤相关的制度？', date: '2026-01-31' },
  ]);

  // 计算属性
  const currentMenu = computed(() => {
    return menuItems.value.find((item) => item.id === activeMenu.value);
  });

  // Actions
  const toggleSidebar = () => {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  };

  /** 封装当前模块内的业务逻辑：switchMenu。 */
  const switchMenu = (menuId: string) => {
    activeMenu.value = menuId;
  };

  // 异步 Action 获取数据
  async function fetchTokenFromBackend() {
    loading.value = true;
    error.value = null;
    const params = {
      auth: {
        identity: {
          methods: ['password'],
          password: {
            user: {
              domain: {
                name: import.meta.env.VITE_IAM_DOMAIN || '',
              },
              name: import.meta.env.VITE_IAM_USERNAME || '',
              password: import.meta.env.VITE_IAM_PASSWORD || '',
            },
          },
        },
        scope: {
          project: {
            name: 'cn-north-4',
          },
        },
      },
    };

    try {
      const response = await request({
        url: API.token,
        method: 'post',
        data: params,
      });
      if (!isSuccessStatus(response.status)) throw new Error('网络请求失败');
      const data = response.data;
      sharedDataToken.value = data['X-Subject-Token'];
      return sharedDataToken.value;
    } finally {
      loading.value = false;
    }
  }

  // 旧手动取 IAM Token 的方法保留，但不再在页面初始化或上传主流程中调用。
  // 上传凭证由后端内部取得，AgentOS 模式不请求 IAM。
  /** 封装当前模块内的业务逻辑：addHistory。 */
  const addHistory = (query: string) => {
    const today = new Date().toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
    });
    historyItems.value.unshift({
      id: Date.now(),
      query,
      date: `(${today})`,
    });

    // 保持最多10条历史记录
    if (historyItems.value.length > 10) {
      historyItems.value = historyItems.value.slice(0, 10);
    }
  };
  return {
    sharedDataToken,
    fetchTokenFromBackend,
    sidebarCollapsed,
    activeMenu,
    menuItems,
    historyItems,
    currentMenu,
    toggleSidebar,
    switchMenu,
    addHistory,
  };
});
