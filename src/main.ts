import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { i18n } from '@/i18n';
import 'bulma/css/bulma.min.css';
import '@/assets/scss/main.scss';

const app = createApp(App);

app.config.errorHandler = (err, _instance, info) => {
  console.error('Vue error:', err, info);
  const notificationEl = document.createElement('div');
  notificationEl.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;background:#ef4444;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;max-width:360px;box-shadow:0 4px 12px rgba(0,0,0,0.2)';
  const msg = (err instanceof Error ? err.message : String(err)) || 'Unknown error';
  notificationEl.textContent = `Application error: ${msg}`;
  document.body.appendChild(notificationEl);
  setTimeout(() => notificationEl.remove(), 6000);
};
app.use(createPinia());
app.use(router);
app.use(i18n);
app.mount('#app');
