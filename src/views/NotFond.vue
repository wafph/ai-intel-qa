<!--
  404 页面，用于未知路由兜底展示。
  本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
-->
<template>
  <div class="not-found-page">
    <section class="not-found-card">
      <div class="brand-icon">AI</div>
      <h1>访问异常</h1>
      <p>{{ errorInfo.message || '页面不存在或当前授权校验失败' }}</p>
      <div class="actions">
        <el-button type="primary" size="large" @click="goHome">返回首页</el-button>
        <el-button size="large" @click="goBack">返回上一页</el-button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { consumeNotFoundError, type FriendlyErrorInfo } from '@/services/authStorage';

const router = useRouter();
const route = useRoute();

const defaultError: FriendlyErrorInfo = {
  code: String(route.query.code || 404),
  status: route.query.status ? Number(route.query.status) : 404,
  title: '访问异常',
  message: String(route.query.message || '页面不存在或当前授权校验失败'),
  detail: '',
  path: '',
  time: '',
};

// 404 页面只保留简洁提示，不再展示状态码、访问地址、发生时间和错误详情。
const errorInfo = consumeNotFoundError() || defaultError;

/** 封装当前模块内的业务逻辑：goHome。 */
const goHome = () => {
  router.push('/');
};

/** 封装当前模块内的业务逻辑：goBack。 */
const goBack = () => {
  if (window.history.length > 1) router.back();
  else router.push('/');
};
</script>

<style lang="less" scoped>
.not-found-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background:
    radial-gradient(circle at 18% 16%, rgba(28, 115, 235, 0.14), transparent 30%),
    linear-gradient(135deg, #eef5ff 0%, #f8fbff 52%, #eaf2ff 100%);
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.not-found-card {
  width: min(460px, 100%);
  padding: 48px 42px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 80px rgba(28, 115, 235, 0.18);
  border: 1px solid rgba(28, 115, 235, 0.08);
  text-align: center;
}

.brand-icon {
  width: 68px;
  height: 68px;
  margin: 0 auto 22px;
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 26px;
  font-weight: 900;
  background: linear-gradient(135deg, #1c73eb 0%, #0f58c8 100%);
  box-shadow: 0 14px 32px rgba(28, 115, 235, 0.24);
}

h1 {
  margin: 0 0 12px;
  color: #1f2d3d;
  font-size: 30px;
}

p {
  margin: 0;
  color: #64748b;
  line-height: 1.8;
}

.actions {
  margin-top: 30px;
  display: flex;
  justify-content: center;
  gap: 12px;
}
</style>
