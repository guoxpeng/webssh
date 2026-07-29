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
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal-body">
        <div class="modal-header">
          <span>{{ t('backup.create') }}</span>
          <button class="modal-close" @click="showCreateModal = false">&times;</button>
        </div>
        <input type="text" v-model="backupLabel" :placeholder="t('backup.label')" class="form-input"/>
        <input type="password" v-model="backupPassword" :placeholder="t('backup.password')" class="form-input"
               @keydown.enter="confirmCreate"/>
        <input type="password" v-model="backupPasswordConfirm" :placeholder="t('backup.confirmPassword')" class="form-input"
               @keydown.enter="confirmCreate"/>
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

    <!-- Restore Password Modal -->
    <div v-if="showRestoreModal" class="modal-overlay" @click.self="showRestoreModal = false">
      <div class="modal-body">
        <div class="modal-header">
          <span>{{ t('backup.restore') }} — {{ restoreTarget?.label }}</span>
          <button class="modal-close" @click="showRestoreModal = false">&times;</button>
        </div>
        <p class="info-text">{{ t('backup.enterPassword') }}</p>
        <input type="password" v-model="restorePassword" :placeholder="t('backup.password')" class="form-input"
               @keydown.enter="confirmRestore"/>
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
import { encryptBackupData, decryptBackupData } from '@/utils/crypto';
import { Database, Plus, Upload, Download, X, ChevronRight, Archive, RotateCcw, Trash2, Lock, ShieldCheck, Server, Code } from 'lucide-vue-next';

const { t } = useI18n();
const emit = defineEmits(['close']);
const store = useBackupStore();
const { showSuccess, showError } = useNotifications();

// Create modal
const showCreateModal = ref(false);
const backupLabel = ref('');
const backupPassword = ref('');
const backupPasswordConfirm = ref('');
const passwordError = ref('');

// Restore modal
const showRestoreModal = ref(false);
const restoreTarget = ref(null);
const restorePassword = ref('');
const restoreError = ref('');

const showScheduleForm = ref(false);
const showCloudForm = ref(false);
const importInput = ref(null);
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
  if (!backupPassword.value) { passwordError.value = t('backup.passwordRequired'); return; }
  if (backupPassword.value !== backupPasswordConfirm.value) { passwordError.value = t('backup.passwordMismatch'); return; }
  try {
    const bak = await store.createBackup(backupLabel.value || '', backupPassword.value);
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
    restoreError.value = result.error;
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
  // Try direct JSON import (new .json format)
  if (store.importBackup(text)) { showSuccess(t('backup.imported')); return; }
  // Fallback: try decryption (old .enc format)
  const pwd = prompt(t('backup.importPasswordPrompt'));
  if (!pwd) { showError(t('backup.importFailed')); return; }
  const { decryptBackupData } = await import('@/utils/crypto');
  const decrypted = await decryptBackupData(text.trim(), pwd);
  if (decrypted?.data && store.importBackup(JSON.stringify(decrypted.data))) {
    showSuccess(t('backup.imported')); return;
  }
  showError(t('backup.importFailed'));
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
.backup-panel {
  background: var(--bulma-scheme-main);
  backdrop-filter: blur(12px); border: 1px solid var(--bulma-border-light);
  border-radius: 12px; overflow: hidden; width: 640px; max-width: 96vw;
  max-height: 90vh; overflow-y: auto;
}
.panel-header {
  display: flex; align-items: center; padding: 0.5rem 0.65rem;
  border-bottom: 1px solid var(--bulma-border-light);
}
.panel-title { font-size: 0.8em; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 0.35rem; flex: 1; }
.panel-actions { display: flex; gap: 2px; }
.panel-action-btn {
  background: none; border: none; padding: 0.2rem 0.35rem; border-radius: 4px; cursor: pointer;
  color: var(--bulma-text-light); display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.7em;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.panel-section { border-bottom: 1px solid var(--bulma-border-light); }
.section-header {
  display: flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.65rem;
  font-size: 0.72em; font-weight: 500; cursor: pointer; user-select: none; color: var(--bulma-text);
  &:hover { background: var(--bulma-scheme-main-ter); }
}
.section-chevron { transition: transform 0.15s; flex-shrink: 0; color: var(--bulma-text-light); &.is-open { transform: rotate(90deg); } }
.section-badge {
  margin-left: auto; font-size: 0.85em; padding: 0 6px; border-radius: 4px;
  background: var(--bulma-border-light); color: var(--bulma-text-light);
  &.is-disabled { opacity: 0.5; } &.is-size { font-size: 0.75em; font-family: monospace; }
}
.section-body { padding: 0.4rem 0.65rem 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
.form-input {
  border: 1px solid var(--bulma-border); border-radius: 6px; padding: 0.45rem 0.55rem;
  font-size: 0.8em; background: var(--bulma-input-background-color); color: var(--bulma-text); outline: none;
  width: 100%; box-sizing: border-box;
  &:focus { border-color: var(--bulma-primary); }
}
.form-select {
  border: 1px solid var(--bulma-border); border-radius: 6px; padding: 0.25rem 0.4rem;
  font-size: 0.75em; background: var(--bulma-input-background-color); color: var(--bulma-text); outline: none;
}
.input-sm { width: 60px; display: inline-block; }
.inventory-panel {
  background: var(--bulma-scheme-main-ter); border-radius: 6px; padding: 0.3rem 0.45rem;
  display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.7em;
}
.inv-item { display: flex; align-items: center; gap: 0.3rem; color: var(--bulma-text-light); }
.inv-lock { color: var(--bulma-success); flex-shrink: 0; }
.warn-text { display: flex; align-items: center; gap: 0.25rem; font-size: 0.65em; color: var(--bulma-danger); margin: 0; }
.info-text { font-size: 0.6em; color: var(--bulma-text-light); margin: 0; display: flex; align-items: center; gap: 0.3rem; &.is-ok { color: var(--bulma-success); } &.is-err { color: var(--bulma-danger); } }
.sync-indicator { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; &.is-ok { background: var(--bulma-success); } &.is-err { background: var(--bulma-danger); } }
.toggle-label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.75em; cursor: pointer; input { accent-color: var(--bulma-primary); } }
.schedule-fields, .cloud-fields { display: flex; flex-direction: column; gap: 0.3rem; }
.field-row { display: flex; align-items: center; gap: 0.3rem; font-size: 0.7em; }
.field-label { color: var(--bulma-text-light); }
.field-hint { color: var(--bulma-text-light); }
.cloud-actions { display: flex; gap: 0.3rem; }
.cloud-btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem;
  padding: 0.25rem; border: 1px solid var(--bulma-border); border-radius: 6px; font-size: 0.65em;
  background: var(--bulma-input-background-color); color: var(--bulma-text); cursor: pointer;
  &:hover { border-color: var(--bulma-primary); } &:disabled { opacity: 0.5; cursor: not-allowed; }
}
.backups-section { border-bottom: none; }
.empty-state { padding: 1rem; text-align: center; font-size: 0.7em; color: var(--bulma-text-light); }
.backup-list { max-height: 360px; overflow-y: auto; }
.backup-item { padding: 0.35rem 0.6rem; & + & { border-top: 1px solid var(--bulma-border-light); } }
.backup-top { display: flex; align-items: center; gap: 0.35rem; }
.backup-info { flex: 1; min-width: 0; }
.backup-label { display: block; font-size: 0.72em; font-weight: 500; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 0.2rem; }
.backup-meta { display: block; font-size: 0.6em; color: var(--bulma-text-light); }
.backup-actions { display: flex; gap: 2px; flex-shrink: 0; opacity: 0; transition: opacity 0.1s; .backup-item:hover & { opacity: 1; } }
.bak-btn {
  background: none; border: none; padding: 0.2rem; border-radius: 4px; cursor: pointer;
  color: var(--bulma-text-light); display: flex;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
  &.is-restore:hover { color: var(--bulma-primary); } &.is-cloud:hover { color: var(--bulma-info); } &.is-danger:hover { color: var(--bulma-danger); }
  &:disabled { opacity: 0.3; cursor: not-allowed; }
}
.loading-spinner { width: 14px; height: 14px; border: 2px solid var(--bulma-border-light); border-top-color: var(--bulma-primary); border-radius: 50%; animation: spin 0.6s linear infinite; flex-shrink: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
.modal-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0,0,0,0.4); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
}
.modal-body {
  background: var(--bulma-scheme-main); border-radius: 12px;
  padding: 1.8rem 2.2rem; width: 640px; max-width: 96vw;
  display: flex; flex-direction: column; gap: 0.75rem;
  box-shadow: 0 16px 48px rgba(0,0,0,0.2);
  max-height: 85vh; overflow-y: auto;
  .form-input { padding: 0.55rem 0.65rem; font-size: 0.85em; }
}
.modal-header { display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; font-weight: 600; }
.modal-close { background: none; border: none; font-size: 1.2em; cursor: pointer; color: var(--bulma-text-light); padding: 0 0.2rem; }
.modal-creating { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75em; color: var(--bulma-text-light); }
.modal-actions { display: flex; gap: 0.4rem; justify-content: flex-end; }
.modal-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.35rem 0.7rem; border: 1px solid var(--bulma-border);
  border-radius: 6px; font-size: 0.75em; cursor: pointer;
  background: var(--bulma-input-background-color); color: var(--bulma-text);
  &.is-primary { background: linear-gradient(135deg, hsl(235,40%,45%), hsl(235,50%,58%)); color: white; border: none; &:hover { box-shadow: 0 2px 8px rgba(99,102,241,0.3); } }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
}
</style>
