<template>
  <div class="batch-overlay">
    <div class="batch-dialog">
      <div class="batch-header">
        <h3><Play :size="16"/> {{ t('macro.batchTitle') }}</h3>
        <button class="close-btn" @click="$emit('close')"><X :size="16"/></button>
      </div>

      <div class="batch-body">
        <div class="section">
          <label class="section-label">{{ t('macro.selectMacro') }}</label>
          <select v-model="selectedMacroId" class="batch-select">
            <option value="" disabled>{{ t('macro.selectMacro') }}</option>
            <option v-for="m in store.macros" :key="m.id" :value="m.id">{{ m.name }} ({{ m.steps.length }} {{ t('macro.steps') }})</option>
          </select>
        </div>

        <div class="section">
          <label class="section-label">{{ t('macro.selectConnections') }}</label>
          <div class="conn-list">
            <label class="conn-item select-all-item" @click.stop>
              <input type="checkbox" :checked="allSelected" @change="toggleAll" class="conn-check"/>
              <span class="conn-name">{{ allSelected ? t('macro.deselectAll') : t('macro.selectAll') }}</span>
            </label>
            <label v-for="conn in connections" :key="conn.id || conn.name" class="conn-item">
              <input type="checkbox" :value="conn" v-model="selectedConnections" class="conn-check"/>
              <span class="conn-name">{{ conn.name || conn.host }}</span>
              <span class="conn-meta">{{ conn.protocol || 'SSH' }} · {{ conn.host }}</span>
            </label>
            <div v-if="connections.length === 0" class="conn-empty">{{ t('macro.noConnections') }}</div>
          </div>
          <button v-if="!confirmed && results.length === 0" class="btn-confirm-inline" :disabled="!canRun" @click="confirmed = true">
            <Check :size="14"/> {{ t('macro.confirmSelection') }} ({{ selectedConnections.length }})
          </button>
          <div v-if="confirmed && results.length === 0" class="confirm-banner">
            ✅ {{ t('macro.confirmedCount', { count: selectedConnections.length }) }}
            <button class="unconfirm-btn" @click="confirmed = false">{{ t('macro.unconfirm') }}</button>
          </div>
        </div>

        <div class="section">
          <label class="section-label">{{ t('macro.execOptions') }}</label>
          <div class="option-row">
            <span class="option-label">{{ t('macro.runDelayMs') }}</span>
            <input type="number" v-model.number="runDelay" class="option-input" min="200" max="10000"/>
          </div>
          <div class="option-row">
            <label class="option-check">
              <input type="checkbox" v-model="stopOnError"/> {{ t('macro.stopOnError') }}
            </label>
          </div>
        </div>
      </div>

      <div v-if="results.length > 0" class="batch-results">
        <div class="results-header">
          <span>{{ t('macro.results') }} ({{ results.filter(r => r.status === 'done').length }}/{{ results.length }})</span>
          <button v-if="running" class="cancel-run-btn" @click="cancelRun">{{ t('macro.cancel') }}</button>
        </div>
        <div v-for="r in results" :key="r.connId" class="result-item" :class="r.status">
          <span class="result-conn">{{ r.connName }}</span>
          <span class="result-status">
            <template v-if="r.status === 'pending'">⏳ {{ t('macro.pending') }}</template>
            <template v-else-if="r.status === 'running'">🔄 {{ t('macro.running') }}</template>
            <template v-else-if="r.status === 'done'">✅ {{ t('macro.completed') }}</template>
            <template v-else-if="r.status === 'error'">❌ {{ r.error }}</template>
          </span>
        </div>
      </div>

      <div class="batch-footer">
        <button class="btn-cancel" @click="$emit('close')" v-if="!running">{{ t('common.cancel') }}</button>
        <button v-if="results.length > 0 && !running" class="btn-reset" @click="results = []">
          <RotateCcw :size="14"/> {{ t('macro.runAgain') }}
        </button>
        <button v-if="confirmed && results.length === 0" class="btn-run" :disabled="!canRun || running" @click="startBatch">
          <Loader2 v-if="running" :size="14" class="spin"/>
          {{ running ? t('macro.running') : t('macro.batchRun') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useMacroStore } from '@/stores/macroStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useNotifications } from '@/composables/useNotifications';
import { useI18n } from 'vue-i18n';
import { Play, X, Loader2, RotateCcw, Check } from 'lucide-vue-next';
import SshWebSocketService from '@/services/sshWebSocketService';

const { t } = useI18n();
const emit = defineEmits(['close']);
const store = useMacroStore();
const connStore = useConnectionStore();
const { showSuccess, showError } = useNotifications();

const selectedMacroId = ref('');
const selectedConnections = ref([]);
const runDelay = ref(500);
const stopOnError = ref(true);
const running = ref(false);
const cancelled = ref(false);
const confirmed = ref(false);
const results = ref([]);

const connections = computed(() => {
  return connStore.savedConnections || [];
});

const selectedMacro = computed(() => {
  return store.macros.find(m => m.id === selectedMacroId.value);
});

const canRun = computed(() => {
  return selectedMacroId.value && selectedConnections.value.length > 0;
});

const allSelected = computed(() => {
  if (connections.value.length === 0) return false;
  return selectedConnections.value.length === connections.value.length;
});

function toggleAll() {
  if (allSelected.value) {
    selectedConnections.value = [];
  } else {
    selectedConnections.value = [...connections.value];
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startBatch() {
  const macro = selectedMacro.value;
  if (!macro || selectedConnections.value.length === 0) return;

  running.value = true;
  cancelled.value = false;
  results.value = selectedConnections.value.map(c => ({
    connId: c.id || c.name,
    connName: c.name || c.host,
    status: 'pending',
    error: '',
  }));

  for (let i = 0; i < results.value.length; i++) {
    if (cancelled.value) break;
    const r = results.value[i];
    const conn = selectedConnections.value[i];
    r.status = 'running';

    try {
      const service = new SshWebSocketService();
      const nodeInfo = {
        name: conn.name || conn.host,
        host: conn.host,
        port: conn.port || 22,
        username: conn.username,
        auth_type: conn.auth_type || 'password',
        auth_value: conn.auth_value || '',
        protocol: conn.protocol || 'ssh',
      };
      if (conn.serial_port) nodeInfo.serial_port = conn.serial_port;
      if (conn.baud) nodeInfo.baud = conn.baud;
      if (conn.dataBits) nodeInfo.dataBits = conn.dataBits;
      if (conn.stopBits) nodeInfo.stopBits = conn.stopBits;
      if (conn.parity) nodeInfo.parity = conn.parity;

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 15000);
        service.connect(nodeInfo, {
          onOpen: () => { clearTimeout(timeout); resolve(); },
          onError: (err) => { clearTimeout(timeout); reject(err); },
          onClose: (_event, manual) => { clearTimeout(timeout); if (!manual) reject(new Error('Connection closed')); },
        });
      });

      for (const step of macro.steps) {
        if (cancelled.value) break;
        if (step.delay > 0) await sleep(step.delay);
        service.sendMessage(step.command + '\n');
      }

      await sleep(1000);
      service.disconnect();
      r.status = 'done';
      store.incrementRunCount(macro.id);
    } catch (err) {
      r.status = 'error';
      r.error = (err && err.message) || t('macro.connFailed');
      if (stopOnError.value) break;
    }
  }

  running.value = false;
  const ok = results.value.filter(r => r.status === 'done').length;
  showSuccess(t('macro.batchDone', { ok, total: results.value.length }));
}

function cancelRun() {
  cancelled.value = true;
}
</script>

<style scoped>
.batch-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; backdrop-filter: blur(2px);
}
.batch-dialog {
  background: var(--bulma-box-background-color);
  border: 1px solid var(--bulma-border-light);
  border-radius: 14px; width: 520px; max-height: 85vh;
  display: flex; flex-direction: column;
}
.batch-header {
  display: flex; align-items: center; padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--bulma-border-light);
}
.batch-header h3 { margin: 0; font-size: 0.95em; display: flex; align-items: center; gap: 0.4rem; flex: 1; }
.close-btn { background: none; border: none; cursor: pointer; color: var(--bulma-text-light); padding: 0.3rem; border-radius: 6px; &:hover { background: var(--bulma-scheme-main-ter); } }
.batch-body { padding: 0.75rem 1rem; overflow-y: auto; flex: 1; }
.section { margin-bottom: 0.75rem; }
.section-label { display: block; font-size: 0.75em; font-weight: 500; margin-bottom: 0.3rem; color: var(--bulma-text-light); }
.batch-select {
  width: 100%; padding: 0.4rem 0.5rem; border: 1px solid var(--bulma-border);
  border-radius: 6px; font-size: 0.8em; background: var(--bulma-input-background-color); color: var(--bulma-text);
}
.conn-search { display: flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.4rem; border: 1px solid var(--bulma-border); border-radius: 6px; margin-bottom: 0.35rem; }
.conn-search-input { flex: 1; border: none; background: none; outline: none; font-size: 0.75em; color: var(--bulma-text); }
.search-icon { color: var(--bulma-text-light); flex-shrink: 0; }
.conn-list { max-height: 160px; overflow-y: auto; border: 1px solid var(--bulma-border-light); border-radius: 6px; }
.conn-item {
  display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.5rem; cursor: pointer;
  font-size: 0.8em; & + & { border-top: 1px solid var(--bulma-border-light); }
  &:hover { background: var(--bulma-scheme-main-ter); }
}
.conn-check { accent-color: var(--bulma-primary); }
.conn-name { font-weight: 500; }
.conn-meta { font-size: 0.85em; color: var(--bulma-text-light); margin-left: auto; }
.conn-empty { padding: 1rem; text-align: center; color: var(--bulma-text-light); font-size: 0.8em; }
.select-all-item { background: var(--bulma-scheme-main-ter); font-weight: 500; font-size: 0.75em; color: var(--bulma-primary); }
.option-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; }
.option-label { font-size: 0.75em; color: var(--bulma-text-light); }
.option-input {
  width: 70px; padding: 0.25rem 0.4rem; border: 1px solid var(--bulma-border);
  border-radius: 4px; font-size: 0.75em; background: var(--bulma-input-background-color); color: var(--bulma-text); text-align: center;
}
.option-check { font-size: 0.75em; display: flex; align-items: center; gap: 0.35rem; cursor: pointer; }
.batch-results { padding: 0.5rem 1rem; border-top: 1px solid var(--bulma-border-light); max-height: 180px; overflow-y: auto; }
.results-header { display: flex; justify-content: space-between; align-items: center; font-size: 0.75em; font-weight: 500; margin-bottom: 0.3rem; }
.cancel-run-btn { background: none; border: none; color: var(--bulma-danger); cursor: pointer; font-size: 0.9em; }
.result-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.2rem 0; font-size: 0.75em; }
.result-conn { font-weight: 500; }
.result-status { margin-left: auto; font-size: 0.9em; }
.result-item.error .result-status { color: var(--bulma-danger); }
.result-item.done .result-status { color: var(--bulma-success); }
.batch-footer {
  display: flex; gap: 0.5rem; padding: 0.75rem 1rem;
  border-top: 1px solid var(--bulma-border-light);
}
.btn-cancel, .btn-run {
  flex: 1; border: none; border-radius: 8px; padding: 0.45rem; font-size: 0.8em; cursor: pointer; font-weight: 500;
  display: flex; align-items: center; justify-content: center; gap: 0.35rem;
}
.btn-cancel { background: var(--bulma-border-light); color: var(--bulma-text); }
.btn-reset {
  flex: 1; border: none; border-radius: 8px; padding: 0.45rem; font-size: 0.8em; cursor: pointer; font-weight: 500;
  display: flex; align-items: center; justify-content: center; gap: 0.35rem;
  background: var(--bulma-scheme-main-ter); color: var(--bulma-text);
  &:hover { background: var(--bulma-border-light); }
}
.btn-run { background: var(--bulma-primary); color: white; &:disabled { opacity: 0.5; cursor: not-allowed; } }
.btn-confirm {
  flex: 1; border: none; border-radius: 8px; padding: 0.45rem; font-size: 0.8em; cursor: pointer; font-weight: 500;
  display: flex; align-items: center; justify-content: center; gap: 0.35rem;
  background: var(--bulma-scheme-main-ter); color: var(--bulma-text);
  border: 1px solid var(--bulma-border);
  &:hover:not(:disabled) { background: var(--bulma-border-light); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.btn-confirm-inline {
  width: 100%; border: 1px solid var(--bulma-primary); color: var(--bulma-primary);
  border-radius: 6px; padding: 0.35rem; font-size: 0.75em; cursor: pointer; font-weight: 500;
  display: flex; align-items: center; justify-content: center; gap: 0.3rem; margin-top: 0.35rem;
  background: transparent;
  &:hover:not(:disabled) { background: rgba(var(--bulma-primary-rgb, 99,102,241), 0.08); }
  &:disabled { opacity: 0.35; cursor: not-allowed; border-color: var(--bulma-border-light); color: var(--bulma-text-light); }
}
.confirm-banner {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem;
  font-size: 0.8em; margin: 0 1rem; border-radius: 8px;
  background: hsl(155,30%,95%); color: hsl(155,60%,30%);
}
.unconfirm-btn {
  background: none; border: none; margin-left: auto; font-size: 0.85em; cursor: pointer;
  color: var(--bulma-primary); text-decoration: underline;
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
