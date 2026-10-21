/**
 * Vite 构建配置，包含 Vue 插件、自动导入、组件自动注册和开发代理。
 *
 * 业务及统一上传代理指向自建后端；旧外部上传代理保留且不由主流程使用。
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
        target: 'http://10.210.101.216:8000', // 业务与统一上传均转发到自建后端
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: 'http://10.210.101.216:8000', //token获取服务器地址
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''), // 移除前缀
      },
      // 旧直传代理保留供比对，当前上传主流程不请求此路径。
      '/review-upload-api': {
        target: 'https://10.210.101.211:31113', // 智能审核上传接口，通过代理绕开浏览器 HTTPS 自签名证书校验
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/review-upload-api/, ''), // /review-upload-api/v1/... -> /v1/...
      },
      '/review-pdf-api': {
        // 本地开发复用服务器已配置好的 Nginx 路由；PDF 服务未运行在开发机本地。
        target: 'http://10.210.101.209:11316',
        changeOrigin: true,
        secure: false,
      },
      '/watermark-api': {
        target: 'http://10.210.101.209:8000', // 统一文件服务：水印下载
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/watermark-api/, '/v1/files'), // /watermark-api/watermark/download -> /v1/files/watermark/download
      },
      '/markdown-word-api': {
        target: 'http://10.210.101.209:8000', // 统一文件服务：Markdown 转 Word
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/markdown-word-api/, '/v1/markdown-word'), // /markdown-word-api/convert -> /v1/markdown-word/convert
      },
    },
  },
});
