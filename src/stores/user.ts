import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUserStore = defineStore('user', () => {
  const user = ref({
    id: '1',
    name: '张三',
    avatar: '/user.png',
    email: 'zhangsan@example.com'
  });

  const isLoggedIn = ref(true);

  const login = (username: string, password: string) => {
    // 这里应该是实际的登录逻辑
    user.value.name = username;
    isLoggedIn.value = true;
  };

  const logout = () => {
    isLoggedIn.value = false;
  };

  const updateUserInfo = (info: Partial<typeof user.value>) => {
    user.value = { ...user.value, ...info };
  };

  return {
    user,
    isLoggedIn,
    login,
    logout,
    updateUserInfo
  };
});