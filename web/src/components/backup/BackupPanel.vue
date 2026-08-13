<template>
  <div class="backup-panel">
    <div class="panel-header">
      <h3 class="panel-title"><Database :size="16"/> {{ t('backup.title') }}</h3>
      <div class="panel-actions">
        <button class="panel-action-btn" @click="openCreateModal" :disabled="store.creating" :title="t('backup.create')">
          <Plus :size="14"/> {{ t('backup.new') }}
        </button>
        <button class="panel-action-btn" @click="triggerImport" :title="t('snippets.import')">
          <Upload :size="14"/>
        </button>
        <button class="panel-action-btn" @click="$emit('close')" :title="t('common.close')">
          <X :size="14"/>
        </button>
        <input type="file" ref="importInput" accept=".json,.enc" style="display:none" @change="onImportFile"/>
      </div>
    </div>

    <!-- Create Modal -->
    <Teleport to="body">
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal-body">
        <div class="modal-header">
          <span>{{ t('backup.create') }}</span>
          <button class="modal-close" @click="showCreateModal = false">&times;</button>
        </div>
        <input type="text" v-model="backupLabel" :placeholder="t('backup.label')" class="form-input"/>
        <label class="masterpw-toggle">
          <input type="checkbox" v-model="useMasterPw"/>
          <span>{{ t('backup.useMasterPassword') }}</span>
        </label>
        <p v-if="useMasterPw" class="hint-text">{{ t('backup.useMasterPasswordHint') }}</p>
        <template v-else>
          <input type="password" v-model="backupPassword" :placeholder="t('backup.password')" class="form-input"
                 @keydown.enter="confirmCreate"/>
          <input type="password" v-model="backupPasswordConfirm" :placeholder="t('backup.confirmPassword')" class="form-input"
                 @keydown.enter="confirmCreate"/>
        </template>
        <p v-if="passwordError" class="warn-text">{{ passwordError }}</p>
        <div class="inventory-panel" v-if="inv.connectionCount || inv.snippetCount">
          <div class="inv-item"><Server :size="12"/> <span>{{ t('backup.connections', { count: inv.connectionCount }) }}</span></div>
          <div class="inv-item"><Code :size="12"/> <span>{{ t('backup.snippets', { count: inv.snippetCount }) }}</span></div>
        </div>
        <div v-if="store.creating" class="modal-creating"><div class="loading-spinner"></div> {{ t('backup.creating') }}</div>
        <div class="modal-actions">
          <button class="modal-btn" @click="showCreateModal = false">{{ t('common.cancel') }}</button>
          <button class="modal-btn is-primary" @click="confirmCreate" :disabled="store.creating">
            <Database :size="14"/> {{ t('common.confirm') }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- Restore Password Modal -->
    <Teleport to="body">
    <div v-if="showRestoreModal" class="modal-overlay" @click.self="showRestoreModal = false">
      <div class="modal-body">
        <div class="modal-header">
          <span>{{ t('backup.restore') }} — {{ restoreTarget?.label }}</span>
          <button class="modal-close" @click="showRestoreModal = false">&times;</button>
        </div>
        <p class="info-text">{{ t('backup.enterPassword') }}</p>
        <input type="password" v-model="restorePassword" :placeholder="t('backup.password')" class="form-input"
               @keydown.enter="confirmRestore"/>
        <button class="modal-btn fill-master-btn" @click="restorePassword = masterPw()" :disabled="!masterPw()">
          <Lock :size="13"/> {{ t('backup.fillMasterPassword') }}
        </button>
        <p v-if="restoreError" class="warn-text">{{ restoreError }}</p>
        <div v-if="store.restoring" class="modal-creating"><div class="loading-spinner"></div> {{ t('backup.restoring') }}...</div>
        <div class="modal-actions">
          <button class="modal-btn" @click="showRestoreModal = false">{{ t('common.cancel') }}</button>
          <button class="modal-btn is-primary" @click="confirmRestore" :disabled="store.restoring">
            <RotateCcw :size="14"/> {{ t('backup.restore') }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- Import Password Modal (encrypted backup file from any platform) -->
    <Teleport to="body">
    <div v-if="showImportModal" class="modal-overlay" @click.self="showImportModal = false">
      <div class="modal-body">
        <div class="modal-header">
          <span>{{ t('backup.importTitle') }}</span>
          <button class="modal-close" @click="showImportModal = false">&times;</button>
        </div>
        <p class="info-text">{{ t('backup.importPasswordHint') }}</p>
        <input type="password" v-model="importPassword" :placeholder="t('backup.password')" class="form-input"
               @keydown.enter="confirmImportRestore"/>
        <button class="modal-btn fill-master-btn" @click="importPassword = masterPw()" :disabled="!masterPw()">
          <Lock :size="13"/> {{ t('backup.fillMasterPassword') }}
        </button>
        <p v-if="importError" class="warn-text">{{ importError }}</p>
        <div v-if="store.restoring" class="modal-creating"><div class="loading-spinner"></div> {{ t('backup.restoring') }}...</div>
        <div class="modal-actions">
          <button class="modal-btn" @click="showImportModal = false">{{ t('common.cancel') }}</button>
          <button class="modal-btn" @click="confirmImportToList" :disabled="store.restoring">
            <Archive :size="14"/> {{ t('backup.importToList') }}
          </button>
          <button class="modal-btn is-primary" @click="confirmImportRestore" :disabled="store.restoring">
            <RotateCcw :size="14"/> {{ t('backup.restore') }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- AUTO-BACKUP -->
    <div class="panel-section">
      <div class="section-header" @click="showScheduleForm = !showScheduleForm">
        <ChevronRight :size="12" class="section-chevron" :class="{ 'is-open': showScheduleForm }"/>
        <span>{{ t('backup.autoBackup') }}</span>
        <span class="section-badge" v-if="store.scheduler.enabled">{{ store.scheduler.interval }}</span>
        <span class="section-badge is-disabled" v-else>{{ t('common.off') }}</span>
      </div>
      <div v-if="showScheduleForm" class="section-body">
        <label class="toggle-label">
          <input type="checkbox" v-model="scheduleEnabled" @change="updateSched"/>
          <span>{{ t('backup.enableAuto') }}</span>
        </label>
        <div v-if="scheduleEnabled" class="schedule-fields">
          <select v-model="scheduleInterval" @change="updateSched" class="form-select">
            <option value="daily">{{ t('backup.daily') }}</option>
            <option value="weekly">{{ t('backup.weekly') }}</option>
            <option value="manual">{{ t('backup.manual') }}</option>
          </select>
          <div class="field-row">
            <label class="field-label">{{ t('backup.keepLast') }}</label>
            <input type="number" v-model.number="scheduleMax" min="3" max="50" class="form-input input-sm" @change="updateSched"/>
            <span class="field-hint">{{ t('backup.backups') }}</span>
          </div>
          <p class="info-text" v-if="store.scheduler.lastBackupAt">{{ t('backup.lastBackup', { time: formatTime(store.scheduler.lastBackupAt) }) }}</p>
        </div>
      </div>
    </div>

    <!-- CLOUD -->
    <div class="panel-section">
      <div class="section-header" @click="showCloudForm = !showCloudForm">
        <ChevronRight :size="12" class="section-chevron" :class="{ 'is-open': showCloudForm }"/>
        <span>{{ t('backup.cloudBackup') }}</span>
        <span class="section-badge" v-if="store.cloud.enabled">{{ t('common.on') }}</span>
        <span class="section-badge is-disabled" v-else>{{ t('common.off') }}</span>
      </div>
      <div v-if="showCloudForm" class="section-body">
        <label class="toggle-label"><input type="checkbox" v-model="cloudEnabled" @change="updateCloudCfg"/><span>{{ t('backup.enableCloud') }}</span></label>
        <div v-if="cloudEnabled" class="cloud-fields">
          <label class="toggle-label"><input type="checkbox" v-model="cloudAutoSync" @change="updateCloudCfg"/><span>{{ t('backup.autoSync') }}</span></label>
          <div v-if="cloudAutoSync" class="field-row">
            <label class="field-label">{{ t('backup.syncEvery') }}</label>
            <select v-model.number="cloudSyncInterval" @change="updateCloudCfg" class="form-select">
              <option :value="15">15 min</option> <option :value="30">30 min</option> <option :value="60">1 hr</option>
              <option :value="180">3 hr</option> <option :value="360">6 hr</option> <option :value="720">12 hr</option>
            </select>
          </div>
          <div class="cloud-actions">
            <button class="cloud-btn" @click="refreshCloudList" :disabled="syncDownloading"><RotateCcw :size="12"/> {{ t('backup.refreshList') }}</button>
            <button class="cloud-btn" @click="syncToCloud" :disabled="syncUploading"><Upload :size="12"/> {{ syncUploading ? '...' : t('backup.uploadLatest') }}</button>
          </div>
          <p class="info-text" v-if="store.cloud.lastSyncAt" :class="store.cloud.lastSyncOk ? 'is-ok' : 'is-err'">
            <span class="sync-indicator" :class="store.cloud.lastSyncOk ? 'is-ok' : 'is-err'"></span>
            {{ store.cloud.lastSyncOk ? t('backup.lastSyncOk', { time: formatTime(store.cloud.lastSyncAt) }) : t('backup.lastSyncFail', { time: formatTime(store.cloud.lastSyncAt) }) }}
          </p>
        </div>
      </div>
      <div v-if="cloudEnabled && store.cloudBackups.length > 0" class="panel-section">
        <div class="section-header">
          <Archive :size="14"/> {{ t('backup.cloudBackupList') }}
          <span class="section-badge">{{ store.cloudBackups.length }}</span>
        </div>
        <div class="backup-list">
          <div v-for="bak in store.cloudBackups" :key="bak.id" class="backup-item">
            <div class="backup-top">
              <div class="backup-info">
                <span class="backup-label">{{ bak.label }}</span>
                <span class="backup-meta">{{ formatTime(bak.createdAt) }} &middot; {{ t('backup.connections', { count: bak.inventory?.connectionCount || 0 }) }}</span>
              </div>
              <div class="backup-actions">
                <button class="bak-btn is-restore" @click="downloadCloud(bak)" :title="t('backup.download')"><Download :size="13"/></button>
                <button class="bak-btn is-danger" @click="deleteCloud(bak)" :title="t('common.delete')"><Trash2 :size="13"/></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- BACKUP LIST -->
    <div class="panel-section backups-section">
      <div class="section-header">
        <Archive :size="14"/> {{ t('backup.backupList') }}
        <span class="section-badge">{{ store.backups.length }}</span>
        <span class="section-badge is-size">{{ formatSize(store.totalSize) }}</span>
      </div>
      <div v-if="store.sortedBackups.length === 0" class="empty-state"><p>{{ t('backup.noBackups') }}</p></div>
      <div v-else class="backup-list">
        <div v-for="bak in store.sortedBackups" :key="bak.id" class="backup-item">
          <div class="backup-top">
            <div class="backup-info">
              <span class="backup-label">
                {{ bak.label }}
                <Lock v-if="bak.inventory?.hasPassword" :size="10" class="inv-lock" :title="t('backup.passwordProtected')"/>
              </span>
              <span class="backup-meta">
                {{ formatTime(bak.createdAt) }}
                &middot; {{ t('backup.connections', { count: bak.inventory?.connectionCount || 0 }) }}
                &middot; {{ formatSize(bak.size) }}
              </span>
            </div>
            <div class="backup-actions">
              <button class="bak-btn is-restore" @click="openRestoreModal(bak)" :title="t('backup.restore')" :disabled="store.restoring"><RotateCcw :size="13"/></button>
              <button class="bak-btn" @click="doExport(bak)" :title="t('backup.download')"><Download :size="13"/></button>
              <button class="bak-btn is-cloud" @click="doUpload(bak)" :title="t('backup.uploadToCloud')" :disabled="!store.cloud.enabled"><Upload :size="13"/></button>
              <button class="bak-btn is-danger" @click="onDeleteBackup(bak)" :title="t('common.delete')"><Trash2 :size="13"/></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useBackupStore } from '@/stores/backupStore';
import { useNotifications } from '@/composables/useNotifications';
import { useI18n } from 'vue-i18n';
import { decryptBackupData } from '@/utils/crypto';
import { Database, Plus, Upload, Download, X, ChevronRight, Archive, RotateCcw, Trash2, Lock, Server, Code } from 'lucide-vue-next';

const { t } = useI18n();
defineEmits(['close']);
const store = useBackupStore();
const { showSuccess, showError } = useNotifications();

// Create modal
const showCreateModal = ref(false);
const backupLabel = ref('');
const backupPassword = ref('');
const backupPasswordConfirm = ref('');
const passwordError = ref('');
// Default: encrypt backups with the master password (the one used to unlock
// the app) so users only ever remember ONE password across all devices.
const useMasterPw = ref(true);
function masterPw() {
  try { return sessionStorage.getItem('webssh_master') || ''; } catch { return ''; }
}

// Restore modal
const showRestoreModal = ref(false);
const restoreTarget = ref(null);
const restorePassword = ref('');
const restoreError = ref('');

const showScheduleForm = ref(false);
const showCloudForm = ref(false);
const importInput = ref(null);
const showImportModal = ref(false);
const importPayload = ref(null);
const importPassword = ref('');
const importError = ref('');
const syncUploading = ref(false);
const syncDownloading = ref(false);

const scheduleEnabled = ref(store.scheduler.enabled);
const scheduleInterval = ref(store.scheduler.interval);
const scheduleMax = ref(store.scheduler.maxBackups);

const cloudEnabled = ref(store.cloud.enabled);
const cloudAutoSync = ref(store.cloud.autoSync);
const cloudSyncInterval = ref(store.cloud.syncInterval);

const inv = computed(() => store.inventory);
import { computed } from 'vue';

function openCreateModal() {
  backupLabel.value = defaultLabel();
  backupPassword.value = '';
  backupPasswordConfirm.value = '';
  passwordError.value = '';
  showCreateModal.value = true;
}

function defaultLabel() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `webssh-backup-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function confirmCreate() {
  passwordError.value = '';
  let pw;
  if (useMasterPw.value) {
    pw = masterPw();
    if (!pw) { passwordError.value = t('backup.passwordRequired'); return; }
  } else {
    if (!backupPassword.value) { passwordError.value = t('backup.passwordRequired'); return; }
    if (backupPassword.value !== backupPasswordConfirm.value) { passwordError.value = t('backup.passwordMismatch'); return; }
    pw = backupPassword.value;
  }
  try {
    const bak = await store.createBackup(backupLabel.value || '', pw);
    showSuccess(t('backup.created', { label: bak.label }));
    store.cleanupOldBackups();
    showCreateModal.value = false;
    // Auto-download
    const json = store.exportBackup(bak.id);
    if (json) {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${bak.label}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    showError(t('backup.createFailed', { error: e.message }));
  }
}

function openRestoreModal(bak) {
  restoreTarget.value = bak;
  restorePassword.value = '';
  restoreError.value = '';
  showRestoreModal.value = true;
}

async function confirmRestore() {
  restoreError.value = '';
  if (!restoreTarget.value) return;
  if (restoreTarget.value.inventory?.hasPassword && !restorePassword.value) {
    restoreError.value = t('backup.passwordRequired');
    return;
  }
  const result = await store.restoreBackup(restoreTarget.value.id, restorePassword.value || '');
  if (result.error) {
    // Known error codes map to i18n keys; anything else is shown as-is.
    const i18nKey = `backup.err.${result.error}`;
    restoreError.value = t(i18nKey) === i18nKey ? result.error : t(i18nKey);
    return;
  }
  showSuccess(t('backup.restored', { count: result.restored }));
  showRestoreModal.value = false;
}

function formatTime(ts) {
  return new Date(ts).toLocaleString();
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' ' + t('common.bytes');
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

async function doExport(bak) {
  const json = store.exportBackup(bak.id);
  if (!json) return;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `webssh-backup-${bak.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showSuccess(t('backup.exported'));
}

function triggerImport() { importInput.value?.click(); }

async function onImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  e.target.value = '';
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  if (parsed && !parsed.encryptedPayload) {
    // Plain JSON backup → straight into the list (works on every platform)
    if (store.importBackup(text)) showSuccess(t('backup.imported'));
    else showError(t('backup.importFailed'));
    return;
  }
  // Encrypted payload: legacy .enc ciphertext or exported .json with
  // encryptedPayload — ask for the password in-app (prompt() does not exist
  // in Android WebView).
  importPayload.value = { text, ciphertext: parsed?.encryptedPayload || text };
  importPassword.value = '';
  importError.value = '';
  showImportModal.value = true;
}

async function confirmImportRestore() {
  if (!importPayload.value) return;
  if (!importPassword.value) { importError.value = t('backup.passwordRequired'); return; }
  const r = await store.restoreFromCiphertext(importPayload.value.ciphertext, importPassword.value);
  if (r.error) {
    importError.value = r.error === 'wrongPassword' ? t('backup.err.wrongPassword') : r.error;
    return;
  }
  showImportModal.value = false;
  showSuccess(t('backup.restored', { count: r.restored }));
}

async function confirmImportToList() {
  if (!importPayload.value) return;
  if (!importPassword.value) { importError.value = t('backup.passwordRequired'); return; }
  const payload = importPayload.value;
  let ok = false;
  if (payload.text.trim().startsWith('{')) {
    // Exported .json — keep it encrypted in the list as-is
    ok = store.importBackup(payload.text);
  } else {
    // Legacy .enc — decrypt first, store as a plain entry
    const decrypted = await decryptBackupData(payload.ciphertext.trim(), importPassword.value);
    if (!decrypted?.data) { importError.value = t('backup.err.wrongPassword'); return; }
    ok = store.importBackup(JSON.stringify({ ...decrypted.data, label: defaultLabel() }));
  }
  if (!ok) { importError.value = t('backup.importFailed'); return; }
  showImportModal.value = false;
  showSuccess(t('backup.imported'));
}

function updateSched() {
  store.updateScheduler({ enabled: scheduleEnabled.value, interval: scheduleInterval.value, maxBackups: scheduleMax.value });
  showSuccess(t('backup.configSaved'));
}

function onDeleteBackup(bak) {
  store.deleteBackup(bak.id);
  showSuccess(t('backup.deleted'));
}

async function doUpload(bak) {
  const ok = await store.uploadToCloud(bak.id);
  if (ok) showSuccess(t('backup.uploaded')); else showError(t('backup.uploadFailed'));
}

async function refreshCloudList() {
  syncDownloading.value = true;
  try {
    const ok = await store.listCloudBackups();
    if (ok) showSuccess(t('backup.listRefreshed')); else showError(t('backup.listFailed'));
  } catch { showError(t('backup.listFailed')); } finally { syncDownloading.value = false; }
}

async function syncToCloud() {
  syncUploading.value = true;
  try {
    const latest = store.sortedBackups[0];
    if (!latest) { showError(t('backup.noBackupsToUpload')); return; }
    const ok = await store.uploadToCloud(latest.id);
    if (ok) showSuccess(t('backup.uploaded')); else showError(t('backup.uploadFailed'));
  } catch { showError(t('backup.uploadFailed')); } finally { syncUploading.value = false; }
}

async function downloadCloud(bak) {
  syncDownloading.value = true;
  try {
    const ok = await store.downloadFromCloud(bak.id);
    if (ok) showSuccess(t('backup.downloaded')); else showError(t('backup.downloadFailed'));
  } catch { showError(t('backup.downloadFailed')); } finally { syncDownloading.value = false; }
}

async function deleteCloud(bak) {
  const ok = await store.deleteFromCloud(bak.id);
  if (ok) showSuccess(t('backup.cloudDeleted')); else showError(t('backup.deleteFailed'));
}

function updateCloudCfg() {
  store.updateCloud({ enabled: cloudEnabled.value, autoSync: cloudAutoSync.value, syncInterval: cloudSyncInterval.value });
  showSuccess(t('backup.configSaved'));
}

onMounted(() => {
  if (store.cloud.enabled) store.listCloudBackups();
});
</script>

<style lang="scss" scoped>
.backup-panel { width: 640px; max-width: 96vw; max-height: 90vh; overflow-y: auto; }
.input-sm { width: 64px; display: inline-block; }
.inventory-panel {
  background: var(--bulma-scheme-main-ter); border-radius: 8px; padding: 0.4rem 0.55rem;
  display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.75em;
}
.inv-item { display: flex; align-items: center; gap: 0.35rem; color: var(--bulma-text-light); }
.inv-lock { color: var(--bulma-success); flex-shrink: 0; }
.sync-indicator { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; &.is-ok { background: var(--bulma-success); } &.is-err { background: var(--bulma-danger); } }
.schedule-fields, .cloud-fields { display: flex; flex-direction: column; gap: 0.35rem; }
.cloud-actions { display: flex; gap: 0.4rem; }
.cloud-btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem;
  padding: 0.35rem 0.5rem; border: 1px solid var(--bulma-border); border-radius: 8px; font-size: 0.72em;
  background: var(--bulma-input-background-color); color: var(--bulma-text); cursor: pointer;
  transition: border-color 0.12s;
  &:hover { border-color: var(--bulma-primary); } &:disabled { opacity: 0.5; cursor: not-allowed; }
}
.backups-section { border-bottom: none; }
.backup-list { max-height: 360px; overflow-y: auto; }
.backup-top { display: flex; align-items: center; gap: 0.4rem; }
.backup-info { flex: 1; min-width: 0; }
.backup-label { font-size: 0.78em; font-weight: 500; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 0.3rem; }
.backup-meta { display: block; font-size: 0.65em; color: var(--bulma-text-light); margin-top: 1px; }
.backup-actions { display: flex; gap: 2px; flex-shrink: 0; opacity: 0; transition: opacity 0.1s; .backup-item:hover & { opacity: 1; } }
.modal-creating { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78em; color: var(--bulma-text-light); }
.masterpw-toggle {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.8em; cursor: pointer; user-select: none;
  input { accent-color: var(--bulma-primary); width: 15px; height: 15px; }
}
.hint-text { font-size: 0.72em; color: var(--bulma-text-light); margin: -0.2rem 0 0; line-height: 1.5; }
.fill-master-btn { align-self: flex-start; font-size: 0.72em; padding: 0.3rem 0.7rem; }
</style>
