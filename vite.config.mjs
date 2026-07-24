import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  root: 'web',
  build: { outDir: '../dist' },
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./web/src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/ws/ssh': {
        target: 'http://localhost:9627',
        ws: true,
      },
      '/ws/sftp': {
        target: 'http://localhost:9627',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:9627',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['web/src/**/*.{test,spec}.{js,ts}'],
    css: false,
  },
});
