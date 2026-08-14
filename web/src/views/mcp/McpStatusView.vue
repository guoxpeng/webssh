<template>
  <div class="page-view">
    <header class="page-head">
      <div class="head-row">
        <div>
          <h1 class="page-title"><ActivityIcon :size="20"/> {{ t('mcp.statusTitle') }}</h1>
          <p class="page-desc">{{ t('mcp.statusDesc') }}</p>
        </div>
        <div class="head-actions">
          <button class="pw-btn minor" @click="load"><RefreshCwIcon :size="13" :class="{ spin: loading }"/> {{ t('mcp.refresh') }}</button>
        </div>
      </div>
    </header>

    <div class="page-empty" v-if="loading">
      <LoaderIcon :size="30" class="empty-icon spin"/>
      <p>{{ t('sftp.loading') }}</p>
    </div>

    <div class="page-empty" v-else-if="error">
      <WifiOffIcon :size="38" class="empty-icon"/>
      <p>{{ error }}</p>
      <button class="pw-btn minor" @click="load"><RefreshCwIcon :size="13"/> {{ t('common.retry') }}</button>
    </div>

    <template v-else>
      <!-- Backend -->
      <section class="status-card">
        <div class="status-head">
          <div class="status-id">
            <ServerIcon :size="16" class="status-icon"/>
            <h3 class="status-title">{{ t('mcp.backend') }}</h3>
          </div>
          <span class="status-badge ok"><span class="status-dot"></span>{{ t('mcp.backendUp') }}</span>
        </div>
        <div class="status-meta">
          <span class="meta-item">{{ t('mcp.port') }}: <b>{{ status.backend?.port || '—' }}</b></span>
          <span class="meta-item">{{ t('mcp.uptime', { s: status.backend?.uptime || 0 }) }}</span>
          <span class="meta-item">{{ t('mcp.version') }}: <b>v{{ APP_VERSION }}</b></span>
        </div>
      </section>

      <!-- MCP server -->
      <section class="status-card">
        <div class="status-head">
          <div class="status-id">
            <CableIcon :size="16" class="status-icon"/>
            <h3 class="status-title">{{ t('mcp.mcpServerStatus') }}</h3>
          </div>
          <span class="status-badge" :class="status.mcpServer?.available ? 'ok' : 'bad'">
            <span class="status-dot"></span>{{ status.mcpServer?.available ? t('mcp.available') : t('mcp.unavailable') }}
          </span>
        </div>
        <p class="status-hint">{{ t('mcp.mcpServerHint') }}</p>
        <div class="status-meta">
          <span class="meta-item">{{ t('mcp.stableTokenLabel') }}:
            <b :class="status.mcpServer?.available ? 'good' : 'warn'">{{ status.mcpServer?.available ? t('mcp.set') : t('mcp.notSet') }}</b>
          </span>
          <span class="meta-item">{{ t('mcp.tools') }}: <b>{{ (status.mcpServer?.tools || []).length }}</b></span>
          <span class="meta-item">stdio</span>
        </div>
      </section>

      <!-- Model API -->
      <section class="status-card">
        <div class="status-head">
          <div class="status-id">
            <DatabaseIcon :size="16" class="status-icon"/>
            <h3 class="status-title">{{ t('mcp.modelApiStatus') }}</h3>
          </div>
          <span class="status-badge" :class="status.modelApi?.enabled ? 'ok' : 'bad'">
            <span class="status-dot"></span>{{ status.modelApi?.enabled ? t('mcp.enabledState') : t('mcp.disabledState') }}
          </span>
        </div>
        <p class="status-hint">{{ t('mcp.modelApiHint') }}</p>
        <div class="status-meta">
          <span class="meta-item">{{ t('mcp.syncedServers', { count: status.modelApi?.servers || 0 }) }}</span>
        </div>
      </section>

      <!-- AI model -->
      <section class="status-card">
        <div class="status-head">
          <div class="status-id">
            <BrainIcon :size="16" class="status-icon"/>
            <h3 class="status-title">{{ t('mcp.aiStatus') }}</h3>
          </div>
          <span class="status-badge" :class="aiReady ? 'ok' : 'bad'">
            <span class="status-dot"></span>{{ aiReady ? t('mcp.aiConfigured') : t('mcp.aiNotConfigured') }}
          </span>
        </div>
        <div class="status-meta">
          <span class="meta-item">{{ t('mcp.enabledState') }}: <b>{{ status.ai?.enabled ? t('common.on') : t('common.off') }}</b></span>
          <span class="meta-item">{{ t('mcp.model') }}: <b>{{ status.ai?.model || '—' }}</b></span>
        </div>
      </section>

      <!-- MCP clients -->
      <section class="status-card">
        <div class="status-head">
          <div class="status-id">
            <BlocksIcon :size="16" class="status-icon"/>
            <h3 class="status-title">{{ t('mcp.mcpClientsStatus') }}</h3>
          </div>
          <span class="status-badge" :class="clientCount > 0 ? 'ok' : 'untested'">
            <span class="status-dot"></span>{{ clientCount }} / {{ totalClients }}
          </span>
        </div>
        <p class="status-hint">{{ t('mcp.mcpClientsHint') }}</p>
        <div class="status-meta">
          <span class="meta-item">{{ t('mcp.enabledState') }}: <b>{{ clientCount }}</b></span>
        </div>
      </section>

      <!-- R2 / cloud backup -->
      <section class="status-card">
        <div class="status-head">
          <div class="status-id">
            <CloudIcon :size="16" class="status-icon"/>
            <h3 class="status-title">{{ t('mcp.backupBucketStatus') }}</h3>
          </div>
          <span class="status-badge" :class="bucketBound ? 'ok' : 'bad'">
            <span class="status-dot"></span>{{ bucketBound ? t('mcp.backupBucketBound') : t('mcp.backupBucketUnbound') }}
          </span>
        </div>
        <p class="status-hint">{{ t('mcp.backupBucketHint') }}</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Activity as ActivityIcon, Server as ServerIcon, Cable as CableIcon, Database as DatabaseIcon, Brain as BrainIcon, Blocks as BlocksIcon, Cloud as CloudIcon, RefreshCw as RefreshCwIcon, WifiOff as WifiOffIcon, Loader as LoaderIcon } from 'lucide-vue-next';
import { useMcpStore } from '@/stores/mcpStore';

const { t } = useI18n();
const store = useMcpStore();

// Init as an empty object (not null): the template reads status.backend?.port
// etc. — a bare `status` of null throws before the optional chain can help.
const status = ref({});
const loading = ref(false);
const error = ref('');
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

const aiReady = computed(() => !!(status.value?.ai?.enabled && status.value?.ai?.apiConfigured));
const bucketBound = computed(() => status.value?.backupBucket === 'bound');
const totalClients = computed(() => store.clients.length);
const clientCount = computed(() => store.clients.filter((c) => c.enabled).length);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    status.value = await store.fetchStatus();
  } catch {
    error.value = t('mcp.checkFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.page-view { max-width: 900px; margin: 0 auto; padding: 32px 24px 80px; }
.page-head { margin-bottom: 22px; }
.head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.page-title { display: flex; align-items: center; gap: 9px; font-size: 19px; font-weight: 600; color: var(--app-text); letter-spacing: .2px; }
.page-desc { margin-top: 6px; font-size: 13px; color: var(--app-text-dim); }
.head-actions { display: flex; gap: 8px; flex: none; }
.page-empty { text-align: center; padding: 70px 0; color: var(--app-text-dim); font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty-icon { opacity: .35; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.pw-btn { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 7px 14px; border-radius: 8px; border: 1px solid var(--app-border); background: var(--app-surface); color: var(--app-text-dim); cursor: pointer; }
.pw-btn:hover { background: var(--app-surface-hover); color: var(--app-text); }

.status-card { background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; }
.status-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.status-id { display: flex; align-items: center; gap: 9px; }
.status-icon { color: var(--bulma-primary); }
.status-title { margin: 0; font-size: 14.5px; font-weight: 600; color: var(--app-text); }
.status-hint { font-size: 12.5px; color: var(--app-text-dim); margin: 0 0 8px; }
.status-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: var(--app-text-dim); }
.meta-item b { color: var(--app-text); font-weight: 600; }
.meta-item b.good { color: #22c55e; }
.meta-item b.warn { color: #f59e0b; }

.status-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 999px; flex: none; }
.status-badge .status-dot { width: 8px; height: 8px; border-radius: 50%; }
.status-badge.ok { background: rgba(34, 197, 94, .12); color: #22c55e; }
.status-badge.ok .status-dot { background: #22c55e; }
.status-badge.bad { background: rgba(239, 68, 68, .12); color: #ef4444; }
.status-badge.bad .status-dot { background: #ef4444; }
.status-badge.untested { background: var(--app-surface-hover); color: var(--app-text-dim); }
.status-badge.untested .status-dot { background: var(--app-text-dim); }
</style>
