import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

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

router.beforeEach((to, from, next) => {
    document.title = `${to.meta.title ? to.meta.title + ' | ' : ''}WebSSH`;
  next();
});

export default router;
