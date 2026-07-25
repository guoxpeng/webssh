import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  root: 'web',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@xterm/')) return 'xterm';
          if (id.includes('node_modules/lucide-vue-next') || id.includes('node_modules/vue') || id.includes('node_modules/pinia') || id.includes('node_modules/vue-router') || id.includes('node_modules/vue-i18n')) return 'vendor';
        },
      },
    },
  },
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
