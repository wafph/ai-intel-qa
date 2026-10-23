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
// 开发代理按要求显式配置 IP；更换服务地址时修改下方各 target 并重启 npm run dev。
// DEV_* 环境项仅保留供版本兼容，本配置不读取；生产代理仍由现场 Nginx 管理。
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
    port: 5100, // 本地前端端口，修改后使用相应访问地址
    strictPort: true, // 如果端口被占用，直接退出而不是尝试下一个可用端口
    host: '0.0.0.0',
    open: true,
    proxy: {
      '/v1': {
        target: 'http://10.210.101.117:8000', // 业务与统一上传均转发到自建后端
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: 'http://10.210.101.117:8000', // 用户授权与会话等业务接口，转发时去掉 /api
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
        // 统一后端已集成 PDF 服务：去掉浏览器代理前缀后请求 /v1/review/pdf/...。
        target: 'http://10.210.101.117:8000',
        rewrite: (path) => path.replace(/^\/review-pdf-api/, ''),
        changeOrigin: true,
        secure: false,
      },
      '/watermark-api': {
        target: 'http://10.210.101.117:8000', // 统一文件服务：水印下载
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/watermark-api/, '/v1/files'), // /watermark-api/watermark/download -> /v1/files/watermark/download
      },
      '/external-file-download': {
        // 外部页读取转换结果文件，保持浏览器同源；第三方接收的仍是原始公共下载地址。
        target: 'http://10.210.101.117:8000', changeOrigin: true,
        rewrite: (path) => path.replace(/^\/external-file-download/, ''),
      },
      '/markdown-word-api': {
        target: 'http://10.210.101.117:8000', // 统一文件服务：Markdown 转 Word
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/markdown-word-api/, '/v1/markdown-word'), // /markdown-word-api/convert -> /v1/markdown-word/convert
      },
    },
  },
});
