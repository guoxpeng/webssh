<template>
  <div class="audit-panel">
    <div class="panel-header">
      <h3 class="panel-title"><ScrollText :size="16"/> {{ t('audit.title') }}</h3>
      <div class="panel-actions">
        <button class="panel-action-btn" @click="refreshData" :disabled="loading" :title="t('common.refresh')">
          <RefreshCw :size="14"/>
        </button>
        <button class="panel-action-btn" @click="downloadLog" :disabled="entries.length === 0" :title="t('sftp.download')">
          <Download :size="14"/>
        </button>
        <button class="panel-action-btn is-danger" @click="clearLog" :title="t('common.deleteAll')">
          <Trash2 :size="14"/>
        </button>
        <button class="panel-action-btn" @click="$emit('close')" :title="t('common.close')">
          <X :size="14"/>
        </button>
      </div>
    </div>
    <div class="audit-stats">
      <span class="stat-item">{{ t('audit.totalEvents', { n: entries.length }) }}</span>
      <button class="stat-filter" :class="{ 'is-active': filter === '' }" @click="filter = ''">{{ t('audit.all') }}</button>
      <button class="stat-filter" :class="{ 'is-active': filter === 'ssh_connected' || filter === 'ssh_error' }" @click="filter = 'ssh_connected'">SSH</button>
      <button class="stat-filter" :class="{ 'is-active': filter === 'ssh_test' }" @click="filter = 'ssh_test'">{{ t('audit.test') }}</button>
      <button class="stat-filter" :class="{ 'is-active': filter === 'ai_request' || filter === 'ai_ssh_exec' }" @click="filter = 'ai_request'">AI</button>
    </div>
    <div class="audit-list" v-if="filtered.length > 0">
      <div v-for="entry in filtered" :key="entry.t" class="audit-item" :class="eventClass(entry.e)">
        <div class="audit-top">
          <span class="audit-event">{{ eventLabel(entry.e) }}</span>
          <span class="audit-time">{{ formatTime(entry.t) }}</span>
        </div>
        <div class="audit-detail">
          <template v-if="entry.host">
            <span class="audit-key">host:</span> {{ entry.host }}{{ entry.port && entry.port !== 22 ? ':' + entry.port : '' }}
          </template>
          <template v-if="entry.username">
            <span class="audit-key">user:</span> {{ entry.username }}
          </template>
          <template v-if="entry.command">
            <span class="audit-key">cmd:</span> <code>{{ entry.command }}</code>
          </template>
          <template v-if="entry.success !== undefined">
            <span :class="entry.success ? 'audit-success' : 'audit-error'">{{ entry.success ? t('audit.success') : t('audit.failure') }}</span>
          </template>
          <template v-if="entry.error">
            <span class="audit-error">{{ entry.error }}</span>
          </template>
        </div>
      </div>
    </div>
    <div v-else-if="!loading" class="audit-empty">{{ t('audit.noEvents') }}</div>
    <div v-if="loading" class="audit-loading">{{ t('sftp.loading') }}</div>

    <!-- Clear confirm modal -->
    <Teleport to="body">
    <div v-if="showClearConfirm" class="modal-overlay" @click.self="showClearConfirm = false">
      <div class="modal-body">
        <div class="modal-header">
          <span>{{ t('common.deleteAll') }}</span>
          <button class="modal-close" @click="showClearConfirm = false">&times;</button>
        </div>
        <p class="info-text">{{ t('audit.clearConfirm') }}</p>
        <div class="modal-actions">
          <button class="modal-btn" @click="showClearConfirm = false">{{ t('common.cancel') }}</button>
          <button class="modal-btn is-danger" @click="confirmClear"><Trash2 :size="14"/> {{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNotifications } from '@/composables/useNotifications';
import { apiFetch } from '@/utils/api';
import { ScrollText, RefreshCw, Trash2, X, Download } from 'lucide-vue-next';

const { t } = useI18n();
const { showSuccess, showError } = useNotifications();
const entries = ref([]);
const loading = ref(false);
const filter = ref('');
const showClearConfirm = ref(false);

const filtered = computed(() => {
  if (!filter.value) return entries.value;
  return entries.value.filter(e => e.e === filter.value || e.e.startsWith(filter.value));
});

async function refreshData() {
  loading.value = true;
  try {
    const res = await apiFetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 300 }),
    });
    if (res.ok) {
      const data = await res.json();
      entries.value = (data.entries || []).reverse();
      showSuccess(t('audit.refreshed'));
    } else {
      showError(t('audit.loadFailed'));
    }
  } catch {
    showError(t('audit.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function clearLog() {
  showClearConfirm.value = true;
}

async function confirmClear() {
  showClearConfirm.value = false;
  await apiFetch('/api/audit/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  entries.value = [];
  showSuccess(t('audit.cleared'));
}

function downloadLog() {
  const data = entries.value.map(e => ({
    time: new Date(e.t).toISOString(),
    event: e.e,
    host: e.host || '',
    port: e.port || '',
    username: e.username || '',
    command: e.command || '',
    success: e.success,
    error: e.error || '',
  }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showSuccess(t('audit.downloaded'));
}

function eventLabel(e) {
  const map = {
    ssh_connected: t('audit.sshConnected'),
    ssh_disconnected: t('audit.sshDisconnected'),
    ssh_error: t('audit.sshError'),
    ssh_test: t('audit.test'),
    ai_request: t('audit.aiRequest'),
    ai_ssh_exec: t('audit.aiSshExec'),
  };
  return map[e] || e;
}

function eventClass(e) {
  if (e === 'ssh_error') return 'is-error';
  if (e === 'ssh_connected' || e === 'ssh_test') return 'is-success';
  if (e.startsWith('ai')) return 'is-ai';
  return '';
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

onMounted(refreshData);
</script>

<style lang="scss" scoped>
.audit-panel { display: flex; flex-direction: column; height: 100%; width: 100%; overflow: hidden; }

.audit-stats { display: flex; align-items: center; gap: 0.3rem; padding: 0.45rem 0.9rem; font-size: 0.72em; color: var(--bulma-text-light); border-bottom: 1px solid var(--bulma-border-light); flex-shrink: 0; flex-wrap: wrap; }
.stat-item { margin-right: auto; }
.stat-filter {
  background: none; border: 1px solid var(--bulma-border-light);
  padding: 0.2rem 0.55rem; border-radius: 999px; cursor: pointer;
  font-size: 0.9em; color: var(--bulma-text-light); transition: all 0.12s;
}
.stat-filter.is-active, .stat-filter:hover { background: var(--bulma-primary); color: white; border-color: var(--bulma-primary); }

.audit-list { flex: 1; overflow-y: auto; padding: 0.25rem 0; }
.audit-item { padding: 0.5rem 0.9rem; font-size: 0.75em; }
.audit-item.is-error { border-left: 3px solid var(--bulma-danger); background: var(--bulma-danger-bis); }
.audit-item.is-success { border-left: 3px solid var(--bulma-success); }
.audit-item.is-ai { border-left: 3px solid #a855f7; }
.audit-top { display: flex; justify-content: space-between; margin-bottom: 0.15rem; gap: 0.5rem; }
.audit-event { font-weight: 600; color: var(--bulma-text); }
.audit-time { color: var(--bulma-text-light); font-size: 0.9em; white-space: nowrap; }
.audit-detail { color: var(--bulma-text-light); display: flex; flex-wrap: wrap; gap: 0.15rem 0.5rem; }
.audit-key { color: var(--bulma-text-light); font-weight: 500; }
.audit-detail code { font-family: var(--bulma-family-monospace); font-size: 0.9em; background: var(--bulma-scheme-main-ter); padding: 0.1rem 0.3rem; border-radius: 4px; }
.audit-success { color: var(--bulma-success); font-weight: 500; }
.audit-error { color: var(--bulma-danger); font-weight: 500; }
</style>
