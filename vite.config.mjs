import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'url';
import { gzipSync } from 'zlib';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const APP_VERSION = JSON.parse(readFileSync('./package.json', 'utf8')).version;

function versionPlugin() {
  return {
    name: 'version',
    transformIndexHtml(html) {
      return html.replace(/%APP_VERSION%/g, APP_VERSION);
    },
  };
}

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
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    // Target modern evergreen browsers/Electron/WebView — smaller, faster output.
    target: 'es2020',
    cssCodeSplit: true,
    // Inline tiny assets to cut request count on slow/mobile links.
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Terminal is the heaviest feature — isolate it so it never blocks
          // the connection/home screen first paint.
          if (id.includes('@xterm/')) return 'xterm';
          if (id.includes('jszip')) return 'zip';
          if (id.includes('node_modules/lucide-vue-next')) return 'icons';
          if (
            id.includes('node_modules/vue') ||
            id.includes('node_modules/pinia') ||
            id.includes('node_modules/vue-router') ||
            id.includes('node_modules/vue-i18n') ||
            id.includes('@vue')
          ) return 'vendor';
        },
      },
    },
  },
  plugins: [
    vue(),
    versionPlugin(),
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
    // Node 26+ 的实验性 localStorage 访问器会遮蔽 jsdom 注入的存储对象，
    // setup 里补内存版兜底（见 storage-setup.js）
    setupFiles: ['src/__tests__/storage-setup.js'],
    css: false,
  },
});
