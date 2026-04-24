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
      '/api2': {
        target: 'http://1.94.244.72:8000', //token获取服务器地址
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api2/, ''), // 移除前缀
      },
       '/api': {
        target: 'http://1.94.244.72:8001', // 历史记录地址
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
