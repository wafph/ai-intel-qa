import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useAppStore = defineStore('app', () => {
  // 侧边栏折叠状态
  const sidebarCollapsed = ref(false);

  // 当前激活的菜单
  const activeMenu = ref('qa');
  const sharedDataToken = ref<string | undefined>();
  const loading = ref(false);
  const error = ref(null);
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
                name: 'hid_b5htrig1x-jcljn', //IAM⽤户所属账号名
              },
              name: 'agent-dev05', //IAM⽤户名
              password: 'agent202605', //IAM⽤户密码
            },
          },
        },
        scope: {
          project: {
            name: 'cn-north-4', //项⽬名称
          },
        },
      },
    };

    try {
      // 1. 使用 fetch API
      const response = await fetch('/v1/x-subject-token', {
        method: 'post',
        body: JSON.stringify(params),
      });
      if (!response.ok) throw new Error('网络请求失败');
      const data = await response.json();
      sharedDataToken.value = data['X-Subject-Token'];
      return sharedDataToken.value;
    } finally {
      loading.value = false;
    }
  }

  fetchTokenFromBackend();
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
