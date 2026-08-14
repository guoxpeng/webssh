<template>
  <div class="page-view">
    <header class="page-head">
      <h1 class="page-title"><CableIcon :size="20"/> {{ t('mcp.serverTitle') }}</h1>
      <p class="page-desc">{{ t('mcp.serverDesc') }}</p>
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
      <!-- Status card -->
      <section class="mcp-card">
        <div class="mcp-card-head">
          <h3 class="mcp-card-title"><ActivityIcon :size="15"/> {{ t('mcp.serverStatus') }}</h3>
          <span class="status-badge" :class="available ? 'ok' : 'bad'">
            <span class="status-dot"></span>{{ available ? t('mcp.available') : t('mcp.unavailable') }}
          </span>
        </div>
        <p class="mcp-hint" v-if="!available">{{ t('mcp.stableTokenHint') }}</p>
        <div class="mcp-meta" v-else>
          <span class="mcp-meta-item"><code>{{ status.mcpServer?.name }}</code> v{{ status.mcpServer?.version }}</span>
          <span class="mcp-meta-item">{{ t('mcp.transport') }}: stdio</span>
          <span class="mcp-meta-item">{{ t('mcp.managedServers') }}: {{ status.modelApi?.servers ?? 0 }}</span>
        </div>
      </section>

      <!-- Connection config -->
      <section class="mcp-card">
        <h3 class="mcp-card-title"><PlugIcon :size="15"/> {{ t('mcp.configTitle') }}</h3>
        <p class="mcp-hint">{{ t('mcp.configHint') }}</p>
        <div class="config-box">
          <pre class="config-pre">{{ configSnippet }}</pre>
          <button class="pw-btn minor" @click="copyText(configSnippet, 'mcp.copied')">
            <CopyIcon :size="13"/> {{ t('mcp.copyConfig') }}
          </button>
        </div>
        <div class="cli-row">
          <p class="mcp-hint">{{ t('mcp.claudeCodeTitle') }}</p>
          <div class="cli-box">
            <code class="cli-code">{{ cliSnippet }}</code>
            <button class="pw-btn minor" @click="copyText(cliSnippet, 'mcp.copied')">
              <CopyIcon :size="13"/> {{ t('mcp.copyCli') }}
            </button>
          </div>
        </div>
      </section>

      <!-- Exposed tools -->
      <section class="mcp-card">
        <h3 class="mcp-card-title"><WrenchIcon :size="15"/> {{ t('mcp.toolsTitle') }}</h3>
        <div class="tool-list">
          <div class="tool-item" v-for="tool in status.mcpServer?.tools || []" :key="tool.name">
            <code class="tool-name">{{ tool.name }}</code>
            <span class="tool-desc">{{ tool.description }}</span>
          </div>
        </div>
      </section>

      <!-- Managed servers -->
      <section class="mcp-card">
        <h3 class="mcp-card-title"><ServerIcon :size="15"/> {{ t('mcp.managedServers') }}</h3>
        <p class="mcp-hint">{{ t('mcp.managedServersHint') }}</p>
        <div class="server-list" v-if="(status.modelApi?.registry || []).length">
          <div class="server-item" v-for="s in status.modelApi.registry" :key="s.id">
            <ServerIcon :size="15" class="server-icon"/>
            <div class="server-main">
              <div class="server-name">{{ s.name }}</div>
              <div class="server-meta">{{ s.username }}@{{ s.host }}:{{ s.port }}</div>
            </div>
            <span class="probe-badge" :class="probeClass(s)">
              {{ probeLabel(s) }}
            </span>
          </div>
        </div>
        <p class="mcp-hint" v-else>{{ t('mcp.noServers') }}</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Cable as CableIcon, Activity as ActivityIcon, Plug as PlugIcon, Wrench as WrenchIcon, Server as ServerIcon, Copy as CopyIcon, WifiOff as WifiOffIcon, RefreshCw as RefreshCwIcon, Loader as LoaderIcon } from 'lucide-vue-next';
import { useMcpStore } from '@/stores/mcpStore';
import { useNotifications } from '@/composables/useNotifications';

const { t } = useI18n();
const { showSuccess, showError } = useNotifications();
const store = useMcpStore();

const status = ref(null);
const loading = ref(true);
const error = ref('');

const available = computed(() => !!status.value?.mcpServer?.available);

const configSnippet = computed(() => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:9627';
  return JSON.stringify({
    mcpServers: {
      webssh: {
        command: 'node',
        args: ['webssh/core/mcp/server.mjs'],
        env: { WEBSSH_URL: origin, WEBSSH_TOKEN: '<AUTH_TOKEN>' },
      },
    },
  }, null, 2);
});

const cliSnippet = computed(() => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:9627';
  return `claude mcp add webssh -e WEBSSH_URL=${origin} -e WEBSSH_TOKEN=<AUTH_TOKEN> -- node webssh/core/mcp/server.mjs`;
});

function probeClass(s) {
  if (!s.last_probe) return 'untested';
  return s.last_probe.ok ? 'ok' : 'bad';
}
function probeLabel(s) {
  if (!s.last_probe) return t('mcp.untested');
  return s.last_probe.ok ? t('status.testSuccess') : t('status.testFailed');
}

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

async function copyText(text, okKey) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showSuccess(t(okKey));
    } else {
      showError(t('common.error'));
    }
  } catch {
    showError(t('common.error'));
  }
}

onMounted(load);
</script>

<style scoped>
.page-view { max-width: 900px; margin: 0 auto; padding: 32px 24px 80px; }
.page-head { margin-bottom: 22px; }
.page-title { display: flex; align-items: center; gap: 9px; font-size: 19px; font-weight: 600; color: var(--app-text); letter-spacing: .2px; }
.page-desc { margin-top: 6px; font-size: 13px; color: var(--app-text-dim); }
.page-empty { text-align: center; padding: 70px 0; color: var(--app-text-dim); font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty-icon { opacity: .35; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.mcp-card { background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 12px; padding: 18px 20px; margin-bottom: 14px; }
.mcp-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.mcp-card-title { display: flex; align-items: center; gap: 8px; font-size: 14.5px; font-weight: 600; color: var(--app-text); margin: 0 0 10px; }
.mcp-card-head .mcp-card-title { margin: 0; }
.mcp-hint { font-size: 12.5px; color: var(--app-text-dim); line-height: 1.55; margin: 0 0 10px; }
.mcp-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; color: var(--app-text-dim); }
.mcp-meta-item code { font-size: 12px; background: var(--app-surface-hover); padding: 1px 6px; border-radius: 5px; }

.status-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; flex: none; }
.status-badge .status-dot { width: 8px; height: 8px; border-radius: 50%; }
.status-badge.ok { background: rgba(34, 197, 94, .12); color: #22c55e; }
.status-badge.ok .status-dot { background: #22c55e; }
.status-badge.bad { background: rgba(239, 68, 68, .12); color: #ef4444; }
.status-badge.bad .status-dot { background: #ef4444; }

.config-box { border: 1px solid var(--app-border); border-radius: 10px; overflow: hidden; background: var(--app-surface-hover); margin-bottom: 14px; }
.config-pre { margin: 0; padding: 12px 14px; overflow-x: auto; font-family: var(--bulma-family-monospace); font-size: 12px; line-height: 1.5; color: var(--app-text); }
.config-box .pw-btn { margin: 0 10px 10px; }
.cli-row .mcp-hint { margin-bottom: 6px; }
.cli-box { display: flex; align-items: stretch; gap: 8px; border: 1px solid var(--app-border); border-radius: 10px; padding: 8px 10px; background: var(--app-surface-hover); }
.cli-code { flex: 1; font-family: var(--bulma-family-monospace); font-size: 12px; color: var(--app-text); word-break: break-all; padding: 4px 0; }
.cli-box .pw-btn { flex: none; align-self: center; }

.tool-list { display: flex; flex-direction: column; gap: 8px; }
.tool-item { display: flex; align-items: baseline; gap: 12px; padding: 10px 12px; border: 1px solid var(--app-border); border-radius: 9px; background: var(--app-surface); }
.tool-name { font-family: var(--bulma-family-monospace); font-size: 12.5px; color: var(--bulma-primary); flex: none; }
.tool-desc { font-size: 12.5px; color: var(--app-text-dim); }

.server-list { display: flex; flex-direction: column; gap: 8px; }
.server-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--app-border); border-radius: 9px; }
.server-icon { color: var(--app-text-dim); flex: none; }
.server-main { flex: 1; min-width: 0; }
.server-name { font-size: 13.5px; font-weight: 500; color: var(--app-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.server-meta { font-size: 12px; color: var(--app-text-dim); font-family: var(--bulma-family-monospace); }
.probe-badge { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; flex: none; }
.probe-badge.ok { background: rgba(34, 197, 94, .12); color: #22c55e; }
.probe-badge.bad { background: rgba(239, 68, 68, .12); color: #ef4444; }
.probe-badge.untested { background: var(--app-surface-hover); color: var(--app-text-dim); }

.pw-btn.minor { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--app-border); background: var(--app-surface); color: var(--app-text-dim); cursor: pointer; }
.pw-btn.minor:hover { background: var(--app-surface-hover); color: var(--app-text); }
</style>
