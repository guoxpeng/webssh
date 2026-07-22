<template>
  <Teleport to="body">
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
              <input type="checkbox" :value="conn.id" v-model="selectedConnIds" class="conn-check"/>
              <span class="conn-name">{{ conn.name || conn.host }}</span>
              <span class="conn-meta">{{ conn.protocol || 'SSH' }} · {{ conn.host }}</span>
            </label>
            <div v-if="connections.length === 0" class="conn-empty">{{ t('macro.noConnections') }}</div>
          </div>
        </div>

        <div class="section" v-if="snippetStore.snippets.length > 0">
          <label class="section-label">{{ t('macro.selectSnippets') }}</label>
          <div class="conn-list snippet-list">
            <label v-for="s in snippetStore.snippets" :key="s.id" class="conn-item">
              <input type="checkbox" :value="s.id" v-model="selectedSnippetIds" class="conn-check"/>
              <span class="conn-name">{{ s.title }}</span>
              <span class="conn-meta snippet-cmd">{{ s.command.substring(0, 30) }}{{ s.command.length > 30 ? '…' : '' }}</span>
            </label>
          </div>
        </div>
      </div>

      <div v-if="errorLog.length > 0" class="batch-errors">
        <div class="errors-header">
          <span>⚠ {{ t('macro.errors') }} ({{ errorLog.length }})</span>
          <button class="errors-clear" @click="errorLog = []">{{ t('common.close') }}</button>
        </div>
        <div v-for="(e, i) in errorLog" :key="i" class="error-line">{{ e }}</div>
      </div>

      <div v-if="confirmed && results.length === 0" class="confirm-banner">
        ✅ {{ t('macro.confirmedCount', { count: selectedConnIds.length }) }}
        <button class="unconfirm-btn" @click="confirmed = false">{{ t('macro.unconfirm') }}</button>
      </div>

      <div class="batch-footer">
        <button class="btn-cancel" @click="$emit('close')" v-if="!running">{{ t('common.cancel') }}</button>
        <button v-if="!confirmed && selectedConnIds.length > 0" class="btn-confirm-in" @click="confirmed = true">
          <Check :size="14"/> {{ t('macro.confirmSelection') }} ({{ selectedConnIds.length }})
        </button>
        <button v-if="confirmed" class="btn-run" :disabled="running" @click="startBatch">
          <Loader2 v-if="running" :size="14" class="spin"/>
          {{ running ? t('macro.running') : t('macro.batchRun') }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useMacroStore } from '@/stores/macroStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSnippetStore } from '@/stores/snippetStore';
import { useNotifications } from '@/composables/useNotifications';
import { useI18n } from 'vue-i18n';
import { Play, X, Loader2, Check } from 'lucide-vue-next';
import SshWebSocketService from '@/services/sshWebSocketService';

const { t } = useI18n();
const props = defineProps({ presetSteps: { type: Array, default: null } });
const emit = defineEmits(['close']);
const store = useMacroStore();
const connStore = useConnectionStore();
const snippetStore = useSnippetStore();
const { showSuccess } = useNotifications();

const selectedMacroId = ref('');
const selectedConnIds = ref([]);
const selectedSnippetIds = ref([]);
const running = ref(false);
const confirmed = ref(false);
const errorLog = ref([]);
const tempMacroId = ref(null);

const connections = computed(() => connStore.savedConnections || []);

const selectedConnections = computed(() =>
  connections.value.filter(c => selectedConnIds.value.includes(c.id))
);

const selectedMacro = computed(() => store.macros.find(m => m.id === selectedMacroId.value));

const allSelected = computed(() => {
  if (connections.value.length === 0) return false;
  return selectedConnIds.value.length === connections.value.length;
});

function toggleAll() {
  if (allSelected.value) { selectedConnIds.value = []; }
  else { selectedConnIds.value = connections.value.map(c => c.id); }
}

function buildSteps() {
  const steps = [];
  if (selectedMacro.value) {
    steps.push(...selectedMacro.value.steps);
  }
  for (const sid of selectedSnippetIds.value) {
    const s = snippetStore.snippets.find(x => x.id === sid);
    if (s) steps.push({ command: s.command, delay: 300 });
  }
  return steps;
}

async function startBatch() {
  const steps = buildSteps();
  const conns = selectedConnections.value;
  if (steps.length === 0 || conns.length === 0) return;

  running.value = true;
  errorLog.value = [];

  for (let i = 0; i < conns.length; i++) {
    const conn = conns[i];
    let authValue = conn.auth_value || '';
    let authType = conn.auth_type || 'password';
    if (!authValue && conn.id) {
      try {
        const cred = await connStore.getCredentialFromSessionStorage(conn.id);
        if (cred?.auth_value) { authValue = cred.auth_value; authType = cred.auth_type || 'password'; }
      } catch {}
    }
    if (!conn.host || !authValue) {
      errorLog.value.push(`${conn.name || conn.host}: ${t('macro.noCredentials')}`);
      continue;
    }
    try {
      const service = new SshWebSocketService();
      const nodeInfo = {
        name: conn.name || conn.host, host: conn.host, port: conn.port || 22,
        username: conn.username, auth_type: authType,
        auth_value: authValue, protocol: conn.protocol || 'ssh',
      };
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
        service.connect(nodeInfo, {
          onOpen: () => { clearTimeout(timeout); resolve(); },
          onError: (err) => { clearTimeout(timeout); reject(err); },
          onClose: (_e, m) => { clearTimeout(timeout); if (!m) reject(new Error('Closed')); },
        });
      });
      for (const step of steps) {
        if (step.delay > 0) await new Promise(r => setTimeout(r, step.delay));
        service.sendMessage(step.command + '\n');
      }
      await new Promise(r => setTimeout(r, 1000));
      service.disconnect();
      if (selectedMacro.value) store.incrementRunCount(selectedMacro.value.id);
    } catch (err) {
      errorLog.value.push(`${conn.name || conn.host}: ${err?.message || 'Failed'}`);
    }
  }
  running.value = false;
  showSuccess(t('macro.batchDone', { ok: conns.length - errorLog.value.length, total: conns.length }));
}

watch(() => props.presetSteps, (steps) => {
  if (steps && steps.length > 0) {
    if (tempMacroId.value) store.removeMacro(tempMacroId.value);
    const m = store.addMacro({ name: 'Code Notes Batch', description: '', steps, tags: [], favorite: false });
    tempMacroId.value = m.id;
    selectedMacroId.value = m.id;
  }
}, { immediate: true });

onBeforeUnmount(() => {
  if (tempMacroId.value) { store.removeMacro(tempMacroId.value); tempMacroId.value = null; }
});
</script>

<style scoped>
.batch-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(2px); }
.batch-dialog { background: var(--bulma-box-background-color); border: 1px solid var(--bulma-border-light); border-radius: 14px; width: 520px; max-height: 88vh; display: flex; flex-direction: column; }
.batch-header { display: flex; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid var(--bulma-border-light); }
.batch-header h3 { margin: 0; font-size: 0.95em; display: flex; align-items: center; gap: 0.4rem; flex: 1; }
.close-btn { background: none; border: none; cursor: pointer; color: var(--bulma-text-light); padding: 0.3rem; border-radius: 6px; &:hover { background: var(--bulma-scheme-main-ter); } }
.batch-body { padding: 0.75rem 1rem; overflow-y: auto; flex: 1; }
.section { margin-bottom: 0.65rem; }
.section-label { display: block; font-size: 0.75em; font-weight: 500; margin-bottom: 0.3rem; color: var(--bulma-text-light); }
.batch-select { width: 100%; padding: 0.4rem 0.5rem; border: 1px solid var(--bulma-border); border-radius: 6px; font-size: 0.8em; background: var(--bulma-input-background-color); color: var(--bulma-text); }
.conn-list { max-height: 150px; overflow-y: auto; border: 1px solid var(--bulma-border-light); border-radius: 6px; }
.snippet-list { max-height: 120px; }
.conn-item { display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.5rem; cursor: pointer; font-size: 0.8em; & + & { border-top: 1px solid var(--bulma-border-light); } &:hover { background: var(--bulma-scheme-main-ter); } }
.select-all-item { background: var(--bulma-scheme-main-ter); font-weight: 500; font-size: 0.75em; color: var(--bulma-primary); }
.conn-check { accent-color: var(--bulma-primary); }
.conn-name { font-weight: 500; }
.conn-meta { font-size: 0.85em; color: var(--bulma-text-light); margin-left: auto; }
.snippet-cmd { font-family: monospace; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conn-empty { padding: 1rem; text-align: center; color: var(--bulma-text-light); font-size: 0.8em; }

.batch-errors { padding: 0.5rem 1rem; border-top: 1px solid var(--bulma-border-light); max-height: 100px; overflow-y: auto; background: hsl(0,30%,96%); }
.errors-header { display: flex; justify-content: space-between; align-items: center; font-size: 0.7em; font-weight: 500; color: hsl(0,60%,40%); margin-bottom: 0.2rem; }
.errors-clear { background: none; border: none; color: var(--bulma-text-light); cursor: pointer; font-size: 0.9em; }
.error-line { font-size: 0.7em; color: var(--bulma-danger); font-family: monospace; padding: 1px 0; }

.confirm-banner { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; font-size: 0.8em; margin: 0 1rem; border-radius: 8px; background: hsl(155,30%,95%); color: hsl(155,60%,30%); }
.unconfirm-btn { background: none; border: none; margin-left: auto; font-size: 0.85em; cursor: pointer; color: var(--bulma-primary); text-decoration: underline; }

.batch-footer { display: flex; gap: 0.5rem; padding: 0.75rem 1rem; border-top: 1px solid var(--bulma-border-light); }
.btn-cancel { flex: 1; border: none; border-radius: 8px; padding: 0.45rem; font-size: 0.8em; cursor: pointer; font-weight: 500; background: var(--bulma-border-light); color: var(--bulma-text); display: flex; align-items: center; justify-content: center; gap: 0.35rem; }
.btn-confirm-in { flex: 1; border: 1px solid var(--bulma-primary); border-radius: 8px; padding: 0.45rem; font-size: 0.8em; cursor: pointer; font-weight: 500; background: transparent; color: var(--bulma-primary); display: flex; align-items: center; justify-content: center; gap: 0.35rem; &:hover { background: rgba(99,102,241,0.08); } }
.btn-run { flex: 1; border: none; border-radius: 8px; padding: 0.45rem; font-size: 0.8em; cursor: pointer; font-weight: 500; background: var(--bulma-primary); color: white; display: flex; align-items: center; justify-content: center; gap: 0.35rem; &:disabled { opacity: 0.5; cursor: not-allowed; } }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
