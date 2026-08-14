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
    path: '/tunnels',
    name: 'Tunnels',
    component: () => import('@/views/TunnelsView.vue'),
    meta: { title: 'Port Forwarding' },
  },
  {
    path: '/keys',
    name: 'Keys',
    component: () => import('@/views/KeysView.vue'),
    meta: { title: 'Keychain' },
  },
  {
    path: '/history',
    name: 'History',
    component: () => import('@/views/HistoryView.vue'),
    meta: { title: 'History' },
  },
  {
    path: '/known-hosts',
    name: 'KnownHosts',
    component: () => import('@/views/KnownHostsView.vue'),
    meta: { title: 'Known Hosts' },
  },
  {
    path: '/mcp/server',
    name: 'McpServer',
    component: () => import('@/views/mcp/McpServerView.vue'),
    meta: { title: 'MCP Server' },
  },
  {
    path: '/mcp/clients',
    name: 'McpClients',
    component: () => import('@/views/mcp/McpClientView.vue'),
    meta: { title: 'MCP Clients' },
  },
  {
    path: '/mcp/tokens',
    name: 'McpTokens',
    component: () => import('@/views/mcp/McpTokenView.vue'),
    meta: { title: 'Token Usage' },
  },
  {
    path: '/mcp/status',
    name: 'McpStatus',
    component: () => import('@/views/mcp/McpStatusView.vue'),
    meta: { title: 'Service Status' },
  },
  {
    path: '/help',
    name: 'Help',
    component: () => import('@/views/HelpView.vue'),
    meta: { title: 'Help & Feedback' },
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
