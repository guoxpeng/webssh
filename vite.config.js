// vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // (可选) 配置开发服务器端口和代理 (如果后端在不同端口)
  server: {
    port: 5173, // Vite 默认端口
    // proxy: {
    //   '/api': {
    //     target: 'http://localhost:3000', // 假设您的 Node.js 后端在 3000 端口
    //     changeOrigin: true,
    //   },
    //   '/ws': {
    //     target: 'ws://localhost:3000', // WebSocket 代理
    //     ws: true,
    //     changeOrigin: true,
    //   }
    // }
  }
});

