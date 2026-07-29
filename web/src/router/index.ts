import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useTerminalStore } from '@/stores/terminalStore';
import { useConnectionStore } from '@/stores/connectionStore';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'ConnectionHome',
    component: () => import('@/views/ConnectionView.vue'),
    meta: { title: 'Connect' }
  },
  {
    path: '/terminal',
    name: 'Terminal',
    component: () => import('@/views/TerminalView.vue'),
    meta: { title: 'Terminal' },
  },
  {
    path: '/sftp',
    name: 'Sftp',
    component: () => import('@/views/SftpView.vue'),
    meta: { title: 'File Manager' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Page Not Found' }
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    return { top: 0, behavior: 'smooth' };
  },
});

declare const __APP_VERSION__: string;

router.beforeEach((to, from, next) => {
  document.title = `WebSSH v${__APP_VERSION__}`;
  if (to.name === 'Terminal') {
    const store = useTerminalStore();
    const connectionStore = useConnectionStore();
    if (store.sessionCount === 0 && connectionStore.pendingConnections.length === 0 && store.paneConfigs.length === 0) {
      return next({ name: 'ConnectionHome' });
    }
  }
  next();
});

export default router;
