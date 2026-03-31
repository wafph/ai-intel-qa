import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

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
      '/api': {
        target: 'https://123.249.99.67', // 软通后端服务器地址
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''), // 移除前缀
      },
    },
  },
});
