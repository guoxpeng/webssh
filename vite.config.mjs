import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'url';
import { gzipSync } from 'zlib';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

function gzipPlugin() {
  return {
    name: 'gzip',
    closeBundle() {
      const outDir = join(__dirname, 'dist/client');
      if (!existsSync(outDir)) return;
      const walk = (dir) => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) { walk(full); continue; }
          if (!/\.(js|css|html|svg|json|ico|woff2?)$/i.test(extname(full))) continue;
          const gzPath = full + '.gz';
          if (existsSync(gzPath)) continue;
          writeFileSync(gzPath, gzipSync(readFileSync(full), { level: 6 }));
        }
      };
      walk(outDir);
      console.log('[gzip] Pre-compressed assets in dist/client/');
    },
  };
}

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
    gzipPlugin(),
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
    include: ['src/**/*.{test,spec}.{js,ts}'],
    css: false,
  },
});
