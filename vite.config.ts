/**
 * Vite 构建配置，包含 Vue 插件、自动导入、组件自动注册和开发代理。
 *
 * 本文件属于规章制度智能体前端最新版交付代码，整理时仅补充说明与注释，不改变业务逻辑。
 */
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import path from 'path';
export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
        additionalData: `@import "./src/style.less";`,
      },
    },
  },
  server: {
    port: 5100, // 设置默认端口为3001
    strictPort: true, // 如果端口被占用，直接退出而不是尝试下一个可用端口
    host: '0.0.0.0',
    open: true,
    proxy: {
      '/v1': {
        target: 'https://837c7c7abe7f41bf93569b82d7140a7a.studio.agentarts.cn-north-4.huaweiapaas.com', // 软通后端服务器地址
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: 'http://10.210.101.209:8000', //token获取服务器地址
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''), // 移除前缀
      },
      '/review-upload-api': {
        target: 'https://10.210.101.211:31113', // 智能审核上传接口，通过代理绕开浏览器 HTTPS 自签名证书校验
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/review-upload-api/, ''), // /review-upload-api/v1/... -> /v1/...
      },
      '/review-pdf-api': {
        target: 'http://127.0.0.1:8006', // 智能审核 PDF 预处理服务
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/review-pdf-api/, ''), // /review-pdf-api/v1/review/pdf -> /v1/review/pdf
      },
      '/watermark-api': {
        target: 'http://10.210.101.209:8005', // 统一文件服务：水印下载
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/watermark-api/, '/v1/files'), // /watermark-api/watermark/download -> /v1/files/watermark/download
      },
      '/markdown-word-api': {
        target: 'http://10.210.101.209:8005', // 统一文件服务：Markdown 转 Word
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/markdown-word-api/, '/v1/markdown-word'), // /markdown-word-api/convert -> /v1/markdown-word/convert
      },
    },
  },
});
