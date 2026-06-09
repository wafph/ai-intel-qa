<!--
  登录页面，支持平台登录、agentToken 鉴权入口和本地登录兼容。
  本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
-->
<template>
  <div class="login-page">
    <div class="login-bg login-bg-one"></div>
    <div class="login-bg login-bg-two"></div>

    <section class="login-card">
      <div class="login-brand">
        <!-- 保留原来的 AI 图标，只调整登录页文案为“规章制度智能体”。 -->
        <div class="brand-icon">AI</div>
        <div>
          <h1>规章制度智能体</h1>
        </div>
      </div>

      <div class="mode-switch" :class="{ single: !isLocalAuthMode }">
        <button
          :class="['mode-btn', { active: mode === 'login' }]"
          @click="switchMode('login')"
        >
          账号登录
        </button>
        <!-- 注册逻辑暂时注释：V12 默认走中台 platform 登录，不展示首页注册入口。
        <button
          v-if="isLocalAuthMode"
          :class="['mode-btn', { active: mode === 'register' }]"
          @click="switchMode('register')"
        >
          用户注册
        </button>
        -->
      </div>

      <el-form
        ref="formRef"
        class="login-form"
        :model="form"
        :rules="rules"
        label-position="top"
        @keyup.enter="handleSubmit"
      >
        <el-form-item label="账号" prop="username">
          <el-input
            v-model.trim="form.username"
            size="large"
            placeholder="请输入账号"
            clearable
            autocomplete="username"
          />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            size="large"
            type="password"
            placeholder="请输入密码"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>

        <template v-if="mode === 'register'">
          <el-form-item label="确认密码" prop="confirmPassword">
            <el-input
              v-model="form.confirmPassword"
              size="large"
              type="password"
              placeholder="请再次输入密码"
              show-password
              autocomplete="new-password"
            />
          </el-form-item>

          <el-form-item label="姓名/昵称" prop="nickname">
            <el-input
              v-model.trim="form.nickname"
              size="large"
              placeholder="请输入姓名或昵称"
              clearable
            />
          </el-form-item>

          <el-form-item label="手机号" prop="phone">
            <el-input
              v-model.trim="form.phone"
              size="large"
              placeholder="请输入手机号，可选"
              clearable
            />
          </el-form-item>

          <el-form-item label="邮箱" prop="email">
            <el-input
              v-model.trim="form.email"
              size="large"
              placeholder="请输入邮箱，可选"
              clearable
            />
          </el-form-item>
        </template>

        <el-button
          class="login-btn"
          type="primary"
          size="large"
          :loading="userStore.loading"
          @click="handleSubmit"
        >
          {{ mode === 'login' ? '登录' : '注册' }}
        </el-button>

        <!-- 注册入口暂时注释。local 模式需要恢复注册入口时，可打开下面这段提示。
        <div v-if="isLocalAuthMode" class="form-tip">
          <template v-if="mode === 'login'">
            没有账号？<button type="button" @click="switchMode('register')">
              立即注册
            </button>
          </template>
          <template v-else>
            已有账号？<button type="button" @click="switchMode('login')">返回登录</button>
          </template>
        </div>
        -->
      </el-form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';
import { FRONTEND_AUTH_MODE } from '@/services/config';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const formRef = ref<FormInstance>();
const mode = ref<'login' | 'register'>('login');
const isLocalAuthMode = FRONTEND_AUTH_MODE === 'local';

const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  nickname: '',
  phone: '',
  email: '',
});

/** 封装当前模块内的业务逻辑：rules。 */
const rules = computed<FormRules>(() => {
  const baseRules: FormRules = {
    username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
    password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  };

  if (mode.value === 'register') {
    baseRules.password = [
      { required: true, message: '请输入密码', trigger: 'blur' },
      { min: 8, message: '密码至少 8 位', trigger: 'blur' },
    ];
    baseRules.confirmPassword = [
      { required: true, message: '请再次输入密码', trigger: 'blur' },
      {
        validator: (_rule, value, callback) => {
          if (value !== form.password) callback(new Error('两次输入的密码不一致'));
          else callback();
        },
        trigger: 'blur',
      },
    ];
  }

  return baseRules;
});

/** 封装当前模块内的业务逻辑：switchMode。 */
const switchMode = (nextMode: 'login' | 'register') => {
  if (nextMode === 'register' && !isLocalAuthMode) return;
  mode.value = nextMode;
  formRef.value?.clearValidate();
};

/** 封装当前模块内的业务逻辑：afterLoginRedirect。 */
const afterLoginRedirect = () => {
  const redirect =
    typeof route.query.redirect === 'string' ? route.query.redirect : '/intelligent-qa';
  router.replace(redirect);
};

/** 处理用户交互或组件事件：handleLogin。 */
const handleLogin = async () => {
  await userStore.loginByPassword({ username: form.username, password: form.password });
  ElMessage.success({ message: '登录成功', offset: 72 });
  afterLoginRedirect();
};

/** 处理用户交互或组件事件：handleRegister。 */
const handleRegister = async () => {
  await userStore.registerUser({
    username: form.username,
    password: form.password,
    nickname: form.nickname || undefined,
    phone: form.phone || undefined,
    email: form.email || undefined,
  });
  ElMessage.success({ message: '注册成功，请使用新账号登录', offset: 72 });
  mode.value = 'login';
  form.password = '';
  form.confirmPassword = '';
};

/** 处理用户交互或组件事件：handleSubmit。 */
const handleSubmit = async () => {
  /** 封装当前模块内的业务逻辑：valid。 */
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  try {
    if (mode.value === 'login') await handleLogin();
    else await handleRegister();
  } catch (error: any) {
    ElMessage.error(
      error?.message ||
        (mode.value === 'login' ? '登录失败，请检查账号或密码' : '注册失败，请稍后重试'),
    );
  }
};
</script>

<style lang="less" scoped>
.login-page {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background:
    radial-gradient(circle at 18% 16%, rgba(28, 115, 235, 0.16), transparent 30%),
    linear-gradient(135deg, #eef5ff 0%, #f8fbff 52%, #eaf2ff 100%);
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.login-bg {
  position: absolute;
  border-radius: 999px;
  filter: blur(2px);
  pointer-events: none;
}

.login-bg-one {
  width: 360px;
  height: 360px;
  left: -120px;
  top: -120px;
  background: rgba(28, 115, 235, 0.14);
}

.login-bg-two {
  width: 460px;
  height: 460px;
  right: -160px;
  bottom: -180px;
  background: rgba(15, 88, 200, 0.12);
}

.login-card {
  position: relative;
  z-index: 1;
  width: min(450px, 100%);
  padding: 42px 42px 36px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 24px 80px rgba(28, 115, 235, 0.18);
  border: 1px solid rgba(28, 115, 235, 0.08);
  backdrop-filter: blur(16px);
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 28px;

  .brand-icon {
    width: 62px;
    height: 62px;
    flex: 0 0 62px;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 24px;
    font-weight: 800;
    background: linear-gradient(135deg, #1c73eb 0%, #0f58c8 100%);
    box-shadow: 0 14px 32px rgba(28, 115, 235, 0.24);
  }

  h1 {
    margin: 0;
    color: #1f2d3d;
    font-size: 30px;
    line-height: 1.2;
  }
}

.mode-switch {
  display: grid;
  grid-template-columns: 1fr;
  padding: 4px;
  margin-bottom: 24px;
  border-radius: 14px;
  background: #eef5ff;

  &.single {
    max-width: 220px;
    margin-left: auto;
    margin-right: auto;
  }
}

.mode-btn {
  height: 40px;
  border: none;
  border-radius: 11px;
  color: #64748b;
  background: transparent;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  transition: all 0.2s ease;

  &.active {
    color: #1c73eb;
    background: #fff;
    box-shadow: 0 8px 18px rgba(28, 115, 235, 0.12);
  }
}

.login-form {
  :deep(.el-form-item__label) {
    color: #334155;
    font-weight: 600;
  }

  :deep(.el-form-item--label-top) {
    margin-bottom: 20px;
  }

  :deep(.el-input__wrapper) {
    border-radius: 12px;
    min-height: 46px;
    box-shadow: 0 0 0 1px #dbe6f5 inset;
  }

  :deep(.el-input__wrapper.is-focus) {
    box-shadow: 0 0 0 1px #1c73eb inset;
  }
}

.login-btn {
  width: 100%;
  height: 48px;
  margin-top: 8px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(135deg, #1c73eb 0%, #0f58c8 100%);
  border: none;
  box-shadow: 0 14px 28px rgba(28, 115, 235, 0.18);
}

.form-tip {
  margin-top: 18px;
  text-align: center;
  color: #64748b;
  font-size: 14px;

  button {
    border: none;
    background: transparent;
    color: #1c73eb;
    cursor: pointer;
    font-weight: 700;
  }
}

@media (max-width: 640px) {
  .login-page {
    padding: 20px;
  }

  .login-card {
    padding: 34px 24px 28px;
    border-radius: 22px;
  }

  .login-brand {
    align-items: flex-start;
    flex-direction: column;

    h1 {
      font-size: 26px;
    }
  }
}
</style>
