<template>
  <div class="page-view">
    <header class="page-head">
      <div class="head-row">
        <div>
          <h1 class="page-title"><CoinsIcon :size="20"/> {{ t('mcp.tokenTitle') }}</h1>
          <p class="page-desc">{{ t('mcp.tokenDesc') }}</p>
        </div>
        <div class="head-actions">
          <button class="pw-btn minor" @click="load"><RefreshCwIcon :size="13"/> {{ t('common.refresh') }}</button>
          <button class="pw-btn danger" v-if="hasData" @click="confirmClear = true">
            <Trash2Icon :size="13"/> {{ t('mcp.clear') }}
          </button>
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
      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-label">{{ t('mcp.totalTokens') }}</span>
          <span class="stat-value">{{ fmtNum(tokens.total?.total_tokens || 0) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">{{ t('mcp.promptTokens') }}</span>
          <span class="stat-value">{{ fmtNum(tokens.total?.prompt_tokens || 0) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">{{ t('mcp.completionTokens') }}</span>
          <span class="stat-value">{{ fmtNum(tokens.total?.completion_tokens || 0) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">{{ t('mcp.requests') }}</span>
          <span class="stat-value">{{ fmtNum(tokens.requests || 0) }}</span>
        </div>
      </div>

      <div class="mcp-card" v-if="!aiConfigured">
        <p class="mcp-hint warn"><AlertTriangleIcon :size="14"/> {{ t('mcp.aiDisabled') }}</p>
      </div>

      <section class="mcp-card">
        <h3 class="mcp-card-title"><HistoryIcon :size="15"/> {{ t('mcp.recent') }}</h3>
        <div class="call-list" v-if="(tokens.calls || []).length">
          <div class="call-item" v-for="(c, i) in tokens.calls" :key="i">
            <div class="call-main">
              <span class="call-model">{{ c.model || '—' }}</span>
              <span class="call-time">{{ fmtTime(c.t) }}</span>
            </div>
            <div class="call-nums">
              <span class="call-num" :title="t('mcp.promptTokens')">↑ {{ fmtNum(c.prompt_tokens) }}</span>
              <span class="call-num" :title="t('mcp.completionTokens')">↓ {{ fmtNum(c.completion_tokens) }}</span>
              <span class="call-num total" :title="t('mcp.totalTokens')">{{ fmtNum(c.total_tokens) }}</span>
            </div>
          </div>
        </div>
        <p class="mcp-hint" v-else>{{ t('mcp.empty') }}</p>
      </section>
    </template>

    <!-- Clear confirm -->
    <div class="modal-overlay" v-if="confirmClear" @click.self="confirmClear = false">
      <div class="modal-body">
        <div class="modal-header">
          <span>{{ t('mcp.clear') }}</span>
          <button class="modal-close" @click="confirmClear = false">&times;</button>
        </div>
        <p class="info-text">{{ t('mcp.clearConfirm') }}</p>
        <div class="modal-actions">
          <button class="modal-btn" @click="confirmClear = false">{{ t('common.cancel') }}</button>
          <button class="modal-btn is-danger" @click="doClear">{{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Coins as CoinsIcon, RefreshCw as RefreshCwIcon, Trash2 as Trash2Icon, History as HistoryIcon, AlertTriangle as AlertTriangleIcon, WifiOff as WifiOffIcon, Loader as LoaderIcon } from 'lucide-vue-next';
import { useMcpStore } from '@/stores/mcpStore';
import { useNotifications } from '@/composables/useNotifications';

const { t } = useI18n();
const { showSuccess, showError } = useNotifications();
const store = useMcpStore();

const tokens = ref({ total: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, requests: 0, calls: [] });
const loading = ref(true);
const error = ref('');
const confirmClear = ref(false);
const aiConfigured = ref(true);

const hasData = computed(() => (tokens.value.requests || 0) > 0 || (tokens.value.calls || []).length > 0);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const status = await store.fetchStatus().catch(() => null);
    aiConfigured.value = status ? !!(status.ai?.enabled && status.ai?.apiConfigured) : true;
    tokens.value = await store.fetchTokens();
  } catch {
    error.value = t('mcp.checkFailed');
  } finally {
    loading.value = false;
  }
}

async function doClear() {
  try {
    await store.clearTokens();
    tokens.value = { total: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, requests: 0, calls: [] };
    confirmClear.value = false;
    showSuccess(t('mcp.cleared'));
  } catch {
    showError(t('mcp.checkFailed'));
  }
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString();
}

function fmtTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = d.toTimeString().slice(0, 5);
  if (sameDay) return hm;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
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
.pw-btn.danger { color: #ef4444; }
.pw-btn.danger:hover { background: rgba(239, 68, 68, .08); }

.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 14px; }
.stat-card { background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 12px; padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
.stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--app-text-dim); font-weight: 700; }
.stat-value { font-size: 24px; font-weight: 650; color: var(--app-text); font-variant-numeric: tabular-nums; }

.mcp-card { background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 12px; padding: 18px 20px; margin-bottom: 14px; }
.mcp-card-title { display: flex; align-items: center; gap: 8px; font-size: 14.5px; font-weight: 600; color: var(--app-text); margin: 0 0 10px; }
.mcp-hint { font-size: 12.5px; color: var(--app-text-dim); line-height: 1.55; margin: 0; }
.mcp-hint.warn { display: flex; align-items: center; gap: 7px; color: #f59e0b; }

.call-list { display: flex; flex-direction: column; }
.call-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 2px; }
.call-item + .call-item { border-top: 1px solid var(--app-border); }
.call-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.call-model { font-size: 13px; font-weight: 500; color: var(--app-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.call-time { font-size: 11.5px; color: var(--app-text-dim); }
.call-nums { display: flex; gap: 10px; flex: none; font-size: 12px; color: var(--app-text-dim); font-variant-numeric: tabular-nums; }
.call-num.total { color: var(--app-text); font-weight: 600; }
</style>
