<template>
  <div class="backup-panel">
    <div class="panel-header">
      <h3 class="panel-title"><Database :size="16"/> {{ t('backup.title') }}</h3>
      <div class="panel-actions">
        <button class="panel-action-btn" @click="createNew" :disabled="store.creating" :title="t('backup.create')">
          <Plus :size="14"/> {{ t('backup.new') }}
        </button>
        <button class="panel-action-btn" @click="triggerImport" :title="t('snippets.import')">
          <Upload :size="14"/>
        </button>
        <button class="panel-action-btn" @click="$emit('close')" :title="t('common.close')">
          <X :size="14"/>
        </button>
        <input type="file" ref="importInput" accept=".json" style="display:none" @change="onImportFile"/>
      </div>
    </div>

    <div v-if="store.creating" class="panel-loading">
      <div class="loading-spinner"></div>
      <span>{{ t('backup.creating') }}</span>
    </div>

    <div class="panel-section">
      <div class="section-header" @click="showCreateForm = !showCreateForm">
        <ChevronRight :size="12" class="section-chevron" :class="{ 'is-open': showCreateForm }"/>
        <span>{{ t('backup.create') }}</span>
      </div>
      <div v-if="showCreateForm" class="section-body">
        <input type="text" v-model="backupLabel" :placeholder="t('backup.label')" class="form-input"
               @keydown.enter="createNew"/>

        <div class="inventory-panel" v-if="inv.connectionCount || inv.snippetCount || inv.credentialCount">
          <div class="inv-item">
            <Server :size="12"/> <span>{{ t('backup.connections', { count: inv.connectionCount }) }}</span>
          </div>
          <div class="inv-item">
            <Code :size="12"/> <span>{{ t('backup.snippets', { count: inv.snippetCount }) }}</span>
          </div>
          <div class="inv-item" :class="{ 'has-cred': inv.credentialCount > 0 }">
            <KeyRound :size="12"/>
            <span>{{ inv.credentialCount > 0 ? t('backup.credentialsSaved', { count: inv.credentialCount }) : t('backup.noCredentials') }}</span>
            <Lock v-if="inv.encrypted" :size="10" class="inv-lock"/>
          </div>
        </div>

        <label class="toggle-label credential-toggle" v-if="inv.credentialCount > 0">
          <input type="checkbox" v-model="includeCreds"/>
          <span>{{ t('backup.includeCredentials') }}</span>
          <Lock :size="10" v-if="inv.encrypted" class="inv-lock"/>
        </label>
        <p v-if="includeCreds && !inv.encrypted" class="warn-text">
          <AlertTriangle :size="11"/>           {{ t('backup.setMasterPasswordHint') }}
        </p>

        <button class="create-btn" @click="createNew" :disabled="store.creating">
          <Database :size="14"/> {{ store.creating ? t('backup.creating') : t('backup.createNow') }}
        </button>
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
            <input type="number" v-model.number="scheduleMax" min="3" max="50" class="form-input input-sm"
                   @change="updateSched"/>
            <span class="field-hint">{{ t('backup.backups') }}</span>
          </div>
          <label class="toggle-label">
            <input type="checkbox" v-model="autoIncludeCreds" @change="updateSched"/>
            <span>{{ t('backup.includeCredentials') }}</span>
          </label>
          <p class="info-text" v-if="store.scheduler.lastBackupAt">
            {{ t('backup.lastBackup', { time: formatTime(store.scheduler.lastBackupAt) }) }}
          </p>
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
        <label class="toggle-label">
          <input type="checkbox" v-model="cloudEnabled" @change="updateCloudCfg"/>
          <span>{{ t('backup.enableCloud') }}</span>
        </label>
        <div v-if="cloudEnabled" class="cloud-fields">
          <input type="url" v-model="cloudUrl" :placeholder="t('backup.url')" class="form-input"
                 @change="updateCloudCfg"/>
          <input type="password" v-model="cloudToken" :placeholder="t('backup.authToken')" class="form-input"
                 @change="updateCloudCfg"/>
          <div class="cloud-actions">
            <button class="cloud-btn" @click="syncToCloud" :disabled="syncUploading">
              <Upload :size="12"/> {{ syncUploading ? t('backup.creating').replace('...','') + '...' : t('backup.uploadLatest') }}
            </button>
            <button class="cloud-btn" @click="syncFromCloud" :disabled="syncDownloading">
              <Download :size="12"/> {{ syncDownloading ? t('backup.creating').replace('...','') + '...' : t('backup.downloadFromCloud') }}
            </button>
          </div>
          <p class="info-text" v-if="store.cloud.lastSyncAt">
            {{ t('backup.lastSync', { time: formatTime(store.cloud.lastSyncAt) }) }}
          </p>
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

      <div v-if="store.sortedBackups.length === 0" class="empty-state">
        <p>{{ t('backup.noBackups') }}</p>
      </div>

      <div v-else class="backup-list">
        <div v-for="bak in store.sortedBackups" :key="bak.id" class="backup-item">
          <div class="backup-top">
            <div class="backup-info">
              <span class="backup-label">
                {{ bak.label }}
                <Lock v-if="bak.encrypted" :size="10" class="inv-lock" :title="t('common.encrypted')"/>
                <ShieldCheck v-if="bak.checksum" :size="10" class="inv-check" :title="t('common.integrityVerified')"/>
              </span>
              <span class="backup-meta">
                {{ formatTime(bak.createdAt) }}
                &middot; {{ t('backup.connections', { count: bak.connections.length }) }}
                <template v-if="bak.inventory?.credentialCount"> &middot; {{ t('backup.credentials', { count: bak.inventory.credentialCount }) }}</template>
                &middot; {{ formatSize(bak.size) }}
              </span>
            </div>
            <div class="backup-actions">
              <button class="bak-btn is-restore" @click="doRestore(bak)" :title="t('backup.restore')"
                      :disabled="store.restoring"><RotateCcw :size="13"/></button>
              <button class="bak-btn" @click="doExport(bak)" :title="t('backup.download')"><Download :size="13"/></button>
              <button class="bak-btn is-cloud" @click="doUpload(bak)" :title="t('backup.uploadToCloud')"
                      :disabled="!store.cloud.enabled"><Upload :size="13"/></button>
              <button class="bak-btn is-danger" @click="store.deleteBackup(bak.id)" :title="t('common.delete')"><Trash2 :size="13"/></button>
            </div>
          </div>
          <div v-if="store.restoring && restoringId === bak.id" class="restore-progress">
            <div class="loading-spinner"></div> {{ t('backup.creating').replace('...','') }}...
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useBackupStore } from '@/stores/backupStore';
import { useNotifications } from '@/composables/useNotifications';
import { useI18n } from 'vue-i18n';
import { Database, Plus, Upload, Download, X, ChevronRight, Archive, RotateCcw, Trash2, Lock, ShieldCheck, Server, Code, KeyRound, AlertTriangle } from 'lucide-vue-next';

const { t } = useI18n();

const emit = defineEmits(['close']);

const store = useBackupStore();
const { showSuccess, showError } = useNotifications();

const showCreateForm = ref(false);
const showScheduleForm = ref(false);
const showCloudForm = ref(false);
const backupLabel = ref('');
const importInput = ref(null);
const restoringId = ref(null);
const syncUploading = ref(false);
const syncDownloading = ref(false);
const includeCreds = ref(false);
const autoIncludeCreds = ref(false);

const scheduleEnabled = ref(store.scheduler.enabled);
const scheduleInterval = ref(store.scheduler.interval);
const scheduleMax = ref(store.scheduler.maxBackups);

const cloudEnabled = ref(store.cloud.enabled);
const cloudUrl = ref(store.cloud.url);
const cloudToken = ref(store.cloud.token);

const inv = computed(() => store.inventory);

function formatTime(ts) {
  return new Date(ts).toLocaleString();
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' ' + t('common.bytes');
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

async function createNew() {
  try {
    const bak = await store.createBackup(backupLabel.value || '', includeCreds.value);
    showSuccess(t('backup.created', { label: bak.label }));
    store.cleanupOldBackups();
    backupLabel.value = '';
  } catch (e) {
    showError(t('backup.createFailed', { error: e.message }));
  }
}

async function doRestore(bak) {
  const credInfo = bak.inventory?.credentialCount ? t('backup.restoreCredInfo', { count: bak.inventory.credentialCount }) : '';
  if (!confirm(t('backup.restoreConfirm', { label: bak.label, connCount: bak.connections.length }))) return;
  restoringId.value = bak.id;
  try {
    const count = await store.restoreBackup(bak.id, true);
    showSuccess(t('backup.restored', { count }));
  } catch (e) {
    showError(t('backup.restoreFailed', { error: e.message }));
  } finally {
    restoringId.value = null;
  }
}

function doExport(bak) {
  const json = store.exportBackup(bak.id);
  if (!json) return;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `haossh-backup-${bak.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showSuccess(t('backup.exported'));
}

function triggerImport() { importInput.value?.click(); }

function onImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    if (store.importBackup(ev.target?.result || '')) {
      showSuccess(t('backup.imported'));
    } else {
      showError(t('backup.importFailed'));
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function updateSched() {
  store.updateScheduler({
    enabled: scheduleEnabled.value,
    interval: scheduleInterval.value,
    maxBackups: scheduleMax.value,
    includeCredentials: autoIncludeCreds.value,
  });
}

async function doUpload(bak) {
  const ok = await store.uploadToCloud(bak.id);
  if (ok) showSuccess(t('backup.uploaded'));
  else showError(t('backup.uploadFailed'));
}

async function syncToCloud() {
  syncUploading.value = true;
  try {
    const latest = store.sortedBackups[0];
    if (!latest) { showError(t('backup.noBackupsToUpload')); return; }
    await store.uploadToCloud(latest.id);
    showSuccess(t('backup.uploaded'));
  } catch {
    showError(t('backup.uploadFailed'));
  } finally {
    syncUploading.value = false;
  }
}

async function syncFromCloud() {
  syncDownloading.value = true;
  try {
    await store.downloadFromCloud();
    showSuccess(t('backup.downloaded'));
  } catch {
    showError(t('backup.downloadFailed'));
  } finally {
    syncDownloading.value = false;
  }
}

function updateCloudCfg() {
  store.updateCloud({
    enabled: cloudEnabled.value,
    url: cloudUrl.value,
    token: cloudToken.value,
  });
}
</script>

<style lang="scss" scoped>
.backup-panel {
  background: var(--bulma-box-background-color);
  backdrop-filter: blur(12px); border: 1px solid var(--bulma-border-light);
  border-radius: 12px; overflow: hidden; width: 380px;
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

.panel-loading {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem;
  font-size: 0.75em; color: var(--bulma-text-light);
}

.panel-section {
  border-bottom: 1px solid var(--bulma-border-light);
}

.section-header {
  display: flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.65rem;
  font-size: 0.72em; font-weight: 500; cursor: pointer; user-select: none;
  color: var(--bulma-text);
  &:hover { background: var(--bulma-scheme-main-ter); }
}
.section-chevron { transition: transform 0.15s; flex-shrink: 0; color: var(--bulma-text-light); &.is-open { transform: rotate(90deg); } }
.section-badge {
  margin-left: auto; font-size: 0.85em; padding: 0 6px; border-radius: 4px;
  background: var(--bulma-border-light); color: var(--bulma-text-light);
  &.is-disabled { opacity: 0.5; }
  &.is-size { font-size: 0.75em; font-family: monospace; }
}

.section-body { padding: 0.4rem 0.65rem 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
.form-input {
  border: 1px solid var(--bulma-border); border-radius: 6px; padding: 0.3rem 0.5rem;
  font-size: 0.75em; background: var(--bulma-input-background-color); color: var(--bulma-text); outline: none;
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
.inv-item {
  display: flex; align-items: center; gap: 0.3rem; color: var(--bulma-text-light);
  &.has-cred { color: var(--bulma-text); }
}
.inv-lock { color: var(--bulma-success); flex-shrink: 0; }
.inv-check { color: var(--bulma-info); flex-shrink: 0; margin-left: 0.2rem; }

.credential-toggle { margin-top: 0.15rem; }

.warn-text {
  display: flex; align-items: center; gap: 0.25rem; font-size: 0.6em; color: var(--bulma-warning); margin: 0;
}

.create-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.35rem 0.65rem; border: none; border-radius: 6px; font-size: 0.75em; font-weight: 500;
  background: linear-gradient(135deg, hsl(235,40%,45%), hsl(235,50%,58%));
  color: white; cursor: pointer; transition: all 0.12s;
  &:hover { box-shadow: 0 2px 8px rgba(99,102,241,0.3); }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
}

.toggle-label {
  display: flex; align-items: center; gap: 0.35rem; font-size: 0.75em; cursor: pointer;
  input { accent-color: var(--bulma-primary); }
}

.schedule-fields, .cloud-fields { display: flex; flex-direction: column; gap: 0.3rem; }
.field-row { display: flex; align-items: center; gap: 0.3rem; font-size: 0.7em; }
.field-label { color: var(--bulma-text-light); }
.field-hint { color: var(--bulma-text-light); }

.cloud-actions { display: flex; gap: 0.3rem; }
.cloud-btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem;
  padding: 0.25rem; border: 1px solid var(--bulma-border); border-radius: 6px; font-size: 0.65em;
  background: var(--bulma-input-background-color); color: var(--bulma-text); cursor: pointer;
  &:hover { border-color: var(--bulma-primary); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.info-text { font-size: 0.6em; color: var(--bulma-text-light); margin: 0; }

.backups-section { border-bottom: none; }

.empty-state { padding: 1rem; text-align: center; font-size: 0.7em; color: var(--bulma-text-light); }

.backup-list { max-height: 240px; overflow-y: auto; }

.backup-item {
  padding: 0.35rem 0.6rem;
  & + & { border-top: 1px solid var(--bulma-border-light); }
}

.backup-top { display: flex; align-items: center; gap: 0.35rem; }
.backup-info { flex: 1; min-width: 0; }
.backup-label { display: block; font-size: 0.72em; font-weight: 500; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 0.2rem; }
.backup-meta { display: block; font-size: 0.6em; color: var(--bulma-text-light); }

.backup-actions { display: flex; gap: 2px; flex-shrink: 0; opacity: 0; transition: opacity 0.1s; .backup-item:hover & { opacity: 1; } }
.bak-btn {
  background: none; border: none; padding: 0.2rem; border-radius: 4px; cursor: pointer;
  color: var(--bulma-text-light); display: flex;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
  &.is-restore:hover { color: var(--bulma-primary); }
  &.is-cloud:hover { color: var(--bulma-info); }
  &.is-danger:hover { color: var(--bulma-danger); }
  &:disabled { opacity: 0.3; cursor: not-allowed; }
}

.restore-progress {
  display: flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0 0;
  font-size: 0.65em; color: var(--bulma-primary);
}

.loading-spinner {
  width: 14px; height: 14px; border: 2px solid var(--bulma-border-light);
  border-top-color: var(--bulma-primary); border-radius: 50%;
  animation: spin 0.6s linear infinite; flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
