<template>
  <div class="sftp-browser" @drop.prevent="onDropFiles" @dragover.prevent="dragOver = true" @dragleave.prevent="dragOver = false" :class="{ 'is-dragover': dragOver }">
    <div v-if="dragOver" class="sftp-drop-overlay">
      <div class="drop-circle">
        <Upload :size="36"/>
      </div>
      <span class="drop-label">{{ t('sftp.upload') }}</span>
      <span class="drop-hint">{{ t('sftp.dropHint') }}</span>
    </div>
    <div class="sftp-toolbar">
      <div class="sftp-toolbar-left">
        <button class="toolbar-btn" @click="goBack" :disabled="currentPath === '/' || loading" :title="t('sftp.back')">
          <ArrowLeft :size="14"/>
        </button>
        <button class="toolbar-btn" @click="refresh" :disabled="loading" :title="t('sftp.refresh')">
          <RefreshCw :size="14" :class="{ 'is-spinning': loading }"/>
        </button>
        <button class="toolbar-btn" @click="openNewFolder" :title="t('sftp.newFolder')">
          <FolderPlus :size="14"/>
        </button>
        <button class="toolbar-btn" @click="triggerUpload" :title="t('sftp.upload')">
          <Upload :size="14"/>
        </button>
        <input type="file" ref="uploadInputRef" multiple style="display:none" @change="onUploadFiles"/>
        <span class="sftp-path">{{ displayPath }}</span>
      </div>
      <div class="sftp-toolbar-right">
        <button class="toolbar-btn is-close" @click="$emit('close')" :title="t('common.close')">
          <X :size="14"/>
        </button>
      </div>
    </div>

    <div class="sftp-breadcrumb">
      <span class="crumb-item" @click="navigateTo('/')">/</span>
      <template v-for="(seg, i) in pathSegments" :key="i">
        <span class="crumb-sep">/</span>
        <span class="crumb-item" @click="navigateTo('/' + pathSegments.slice(0, i + 1).join('/'))">{{ seg }}</span>
      </template>
      <div v-if="selectedCount > 0" class="sftp-selection-info">
        {{ t('sftp.selected', { count: selectedCount }) }}
      </div>
    </div>

    <div class="sftp-status-bar">
      <span class="status-conn">
        <span class="status-dot" :class="connected ? 'is-connected' : 'is-disconnected'"></span>
        {{ connected ? t('nav.connected') : t('nav.disconnected') }}
      </span>
    </div>

    <div v-if="loading" class="sftp-loading">{{ t('sftp.loading') }}</div>
    <div v-else-if="error" class="sftp-error">{{ error }}</div>
    <div v-else-if="entries.length === 0" class="sftp-empty">{{ t('sftp.empty') }}</div>
    <div v-else class="sftp-list">
      <div v-for="entry in entries" :key="entry.name"
           class="sftp-item" :class="{ 'is-selected': selected.has(entry.name), 'is-dir': entry.type === 'dir' }"
           @click="toggleSelect(entry)" @dblclick="enterDir(entry)"
           @contextmenu.prevent="onContextMenu($event, entry)">
        <div class="item-icon">
          <Folder :size="18" v-if="entry.type === 'dir'" class="icon-folder"/>
          <FileText :size="18" v-else-if="isTextFile(entry.name)" class="icon-text"/>
          <FileCode :size="18" v-else-if="isCodeFile(entry.name)" class="icon-code"/>
          <FileImage :size="18" v-else-if="isImageFile(entry.name)" class="icon-image"/>
          <FileArchive :size="18" v-else-if="isArchiveFile(entry.name)" class="icon-archive"/>
          <File :size="18" v-else class="icon-file"/>
        </div>
        <div class="item-name">{{ entry.name }}</div>
        <div class="item-size">{{ entry.type === 'dir' ? '—' : formatSize(entry.size) }}</div>
        <div class="item-mtime">{{ entry.mtime ? formatTime(entry.mtime) : '—' }}</div>
        <div class="item-mode">{{ formatMode(entry.mode) }}</div>
        <div class="item-actions">
          <button class="item-action-btn" @click.stop="downloadFile(entry)" :title="t('sftp.download')" v-if="entry.type === 'file'">
            <Download :size="13"/>
          </button>
          <button class="item-action-btn" @click.stop="renameFile(entry)" :title="t('sftp.rename')">
            <Edit3 :size="13"/>
          </button>
          <button class="item-action-btn" @click.stop="chmodFile(entry)" :title="t('sftp.permissions')">
            <Shield :size="13"/>
          </button>
          <button class="item-action-btn is-danger" @click.stop="confirmDelete(entry)" :title="t('common.remove')">
            <Trash2 :size="13"/>
          </button>
        </div>
      </div>
    </div>

    <div v-if="contextEntry" class="sftp-context-menu" :style="contextStyle">
      <div class="ctx-item" @click="downloadFile(contextEntry); contextEntry = null" v-if="contextEntry.type === 'file'">
        <Download :size="13"/> {{ t('sftp.download') }}
      </div>
      <div class="ctx-item" @click="renameFile(contextEntry); contextEntry = null">
        <Edit3 :size="13"/> {{ t('sftp.rename') }}
      </div>
      <div class="ctx-item" @click="chmodFile(contextEntry); contextEntry = null">
        <Shield :size="13"/> {{ t('sftp.permissions') }}
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item is-danger" @click="confirmDelete(contextEntry); contextEntry = null">
        <Trash2 :size="13"/> {{ t('common.remove') }}
      </div>
    </div>

    <div v-if="showNewFolder" class="sftp-dialog-overlay" @click.self="showNewFolder = false">
      <div class="sftp-dialog">
        <h4>{{ t('sftp.newFolder') }}</h4>
        <input v-model="newFolderName" @keydown.enter="createFolder" placeholder="folder-name" class="dialog-input" ref="folderInputRef"/>
        <div class="dialog-actions">
          <button class="dialog-btn" @click="showNewFolder = false">{{ t('common.cancel') }}</button>
          <button class="dialog-btn is-primary" @click="createFolder" :disabled="!newFolderName.trim()">{{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>

    <div v-if="showRename" class="sftp-dialog-overlay" @click.self="showRename = false">
      <div class="sftp-dialog">
        <h4>{{ t('sftp.rename') }}</h4>
        <input v-model="renameValue" @keydown.enter="doRename" class="dialog-input" ref="renameInputRef"/>
        <div class="dialog-actions">
          <button class="dialog-btn" @click="showRename = false">{{ t('common.cancel') }}</button>
          <button class="dialog-btn is-primary" @click="doRename" :disabled="!renameValue.trim()">{{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>

    <div v-if="showChmod" class="sftp-dialog-overlay" @click.self="showChmod = false">
      <div class="sftp-dialog">
        <h4>{{ t('sftp.permissions') }} — {{ chmodTarget }}</h4>
        <div class="chmod-grid">
          <div class="chmod-col">
            <span class="chmod-label">{{ t('sftp.owner') }}</span>
            <div class="chmod-bits">
              <label><input type="checkbox" v-model="chmodBits.owner.r"/> r</label>
              <label><input type="checkbox" v-model="chmodBits.owner.w"/> w</label>
              <label><input type="checkbox" v-model="chmodBits.owner.x"/> x</label>
            </div>
          </div>
          <div class="chmod-col">
            <span class="chmod-label">{{ t('sftp.group') }}</span>
            <div class="chmod-bits">
              <label><input type="checkbox" v-model="chmodBits.group.r"/> r</label>
              <label><input type="checkbox" v-model="chmodBits.group.w"/> w</label>
              <label><input type="checkbox" v-model="chmodBits.group.x"/> x</label>
            </div>
          </div>
          <div class="chmod-col">
            <span class="chmod-label">{{ t('sftp.other') }}</span>
            <div class="chmod-bits">
              <label><input type="checkbox" v-model="chmodBits.other.r"/> r</label>
              <label><input type="checkbox" v-model="chmodBits.other.w"/> w</label>
              <label><input type="checkbox" v-model="chmodBits.other.x"/> x</label>
            </div>
          </div>
        </div>
        <div class="chmod-octal">{{ t('sftp.permissions') }}: <strong>{{ chmodOctal }}</strong></div>
        <div class="dialog-actions">
          <button class="dialog-btn" @click="showChmod = false">{{ t('common.cancel') }}</button>
          <button class="dialog-btn is-primary" @click="doChmod">{{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>

    <div v-if="deleteTarget" class="sftp-dialog-overlay" @click.self="deleteTarget = null">
      <div class="sftp-dialog">
        <h4>{{ t('common.remove') }}</h4>
        <p>{{ t('sftp.deleteConfirm', { name: deleteTarget.name }) }}</p>
        <div class="dialog-actions">
          <button class="dialog-btn" @click="deleteTarget = null">{{ t('common.cancel') }}</button>
          <button class="dialog-btn is-danger" @click="doDelete">{{ t('common.remove') }}</button>
        </div>
      </div>
    </div>

    <div v-if="uploadProgress !== null" class="sftp-upload-progress">
      <div class="upload-bar"><div class="upload-bar-fill" :style="{ width: uploadProgress + '%' }"></div></div>
      <span>{{ uploadFileName }} — {{ uploadProgress }}%</span>
    </div>

    <div v-if="message" class="sftp-toast" :class="messageType">{{ message }}</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Folder, FolderPlus, FileText, FileCode, FileImage,
  FileArchive, File, ArrowLeft, RefreshCw, Upload, Download,
  Edit3, Shield, Trash2, X,
} from 'lucide-vue-next';
import { useConnectionStore } from '@/stores/connectionStore';
import { getApiBaseUrl } from '@/utils/constants';

const { t } = useI18n();
const connStore = useConnectionStore();

const props = defineProps({
  nodeConfig: { type: Object, default: null },
});

const emit = defineEmits(['close']);

const loading = ref(false);
const error = ref('');
const entries = ref([]);
const currentPath = ref('/');
const connected = ref(false);
const selected = ref(new Set());
const message = ref('');
const messageType = ref('is-info');
const uploadInputRef = ref(null);
const uploadProgress = ref(null);
const uploadFileName = ref('');
const dragOver = ref(false);

const showNewFolder = ref(false);
const newFolderName = ref('');
const folderInputRef = ref(null);

const showRename = ref(false);
const renameValue = ref('');
const renameTarget = ref(null);
const renameInputRef = ref(null);

const showChmod = ref(false);
const chmodTarget = ref('');
const chmodBits = ref({ owner: { r: true, w: true, x: false }, group: { r: true, w: false, x: false }, other: { r: true, w: false, x: false } });

const deleteTarget = ref(null);

const contextEntry = ref(null);
const contextStyle = ref({});

const pathSegments = computed(() => currentPath.value.split('/').filter(Boolean));
const displayPath = computed(() => currentPath.value || '/');
const selectedCount = computed(() => selected.value.size);
const chmodOctal = computed(() => {
  const o = chmodBits.value.owner;
  const g = chmodBits.value.group;
  const u = chmodBits.value.other;
  const val = (o.r ? 4 : 0) + (o.w ? 2 : 0) + (o.x ? 1 : 0);
  const val2 = (g.r ? 4 : 0) + (g.w ? 2 : 0) + (g.x ? 1 : 0);
  const val3 = (u.r ? 4 : 0) + (u.w ? 2 : 0) + (u.x ? 1 : 0);
  return String(val) + String(val2) + String(val3);
});

watch(showNewFolder, (v) => { if (v) nextTick(() => folderInputRef.value?.focus()); });
watch(showRename, (v) => { if (v) nextTick(() => renameInputRef.value?.focus()); });

function showMessage(msg, type = 'is-info') {
  message.value = msg;
  messageType.value = type;
  setTimeout(() => { message.value = ''; }, 3000);
}

function getAuth() {
  const src = props.nodeConfig || connStore.currentNodeDetails;
  return {
    host: src?.host,
    port: src?.port || 22,
    username: src?.username,
    auth_type: src?.auth_type,
    auth_value: src?.auth_value,
  };
}

async function api(action, data = {}) {
  const auth = getAuth();
  if (!auth.host) { showMessage(t('sftp.notConnected'), 'is-error'); return null; }
  const resp = await fetch(`${getApiBaseUrl()}/sftp/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...auth, ...data }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return resp.json();
}

async function listDir(path) {
  loading.value = true;
  error.value = '';
  try {
    const data = await api('list', { path });
    entries.value = (data?.entries || []).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    connected.value = true;
  } catch (e) {
    error.value = e.message;
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

function refresh() { listDir(currentPath.value); }
function goBack() {
  const p = currentPath.value.replace(/\/$/, '');
  const parent = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) || '/' : '/';
  navigateTo(parent);
}
function navigateTo(path) {
  currentPath.value = path;
  listDir(path);
}

function enterDir(entry) {
  if (entry.type !== 'dir') return;
  const path = (currentPath.value.endsWith('/') ? currentPath.value : currentPath.value + '/') + entry.name;
  navigateTo(path);
}

function toggleSelect(entry) {
  const s = new Set(selected.value);
  if (s.has(entry.name)) s.delete(entry.name); else s.add(entry.name);
  selected.value = s;
}

function isTextFile(name) { return /\.(md|txt|log|yml|yaml|toml|ini|cfg|conf|env|gitignore)$/i.test(name); }
function isCodeFile(name) { return /\.(js|jsx|ts|tsx|vue|html|css|scss|json|xml|py|rb|go|rs|java|c|cpp|h|sh|bash|zsh|php|sql|mjs)$/i.test(name); }
function isImageFile(name) { return /\.(png|jpg|jpeg|gif|svg|bmp|ico|webp)$/i.test(name); }
function isArchiveFile(name) { return /\.(zip|tar|gz|bz2|xz|7z|rar|tgz)$/i.test(name); }

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return size.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return pad(d.getHours()) + ':' + pad(d.getMinutes());
  if (d.getFullYear() === now.getFullYear()) return pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function formatMode(mode) {
  if (!mode) return '—';
  const s = mode.toString(8);
  return s.slice(-3);
}

function onContextMenu(e, entry) {
  contextEntry.value = entry;
  const rect = document.querySelector('.sftp-browser')?.getBoundingClientRect();
  if (rect) {
    contextStyle.value = {
      top: (e.clientY - rect.top) + 'px',
      left: (e.clientX - rect.left) + 'px',
    };
  }
  document.addEventListener('click', () => { contextEntry.value = null; }, { once: true });
}

function triggerUpload() { uploadInputRef.value?.click(); }
async function onUploadFiles(e) {
  const files = e.target?.files;
  if (!files?.length) return;
  const auth = getAuth();
  for (const file of files) {
    uploadFileName.value = file.name;
    uploadProgress.value = 0;
    const reader = new FileReader();
    const content = await new Promise((resolve) => {
      reader.onload = (ev) => resolve(ev.target.result.split(',')[1] || '');
      reader.readAsDataURL(file);
    });
    try {
      await api('write', { path: (currentPath.value.endsWith('/') ? currentPath.value : currentPath.value + '/') + file.name, content, encoding: 'base64' });
      uploadProgress.value = 100;
      showMessage(t('sftp.uploaded', { name: file.name }), 'is-success');
    } catch (err) {
      showMessage(t('sftp.uploadFailed', { name: file.name, error: err.message }), 'is-error');
    }
  }
  uploadProgress.value = null;
  uploadFileName.value = '';
  e.target.value = '';
  refresh();
}

async function onDropFiles(e) {
  dragOver.value = false;
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  // Reuse the file upload logic
  const input = uploadInputRef.value;
  if (input) {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    input.files = dt.files;
    await onUploadFiles({ target: input });
  }
}

async function downloadFile(entry) {
  try {
    const data = await api('read', { path: fullPath(entry.name) });
    if (!data?.content) return;
    const bytes = Uint8Array.from(atob(data.content), c => c.charCodeAt(0));
    const blob = new Blob([bytes]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = entry.name; a.click();
    URL.revokeObjectURL(url);
    showMessage(t('sftp.downloaded', { name: entry.name }), 'is-success');
  } catch (err) {
    showMessage(err.message, 'is-error');
  }
}

function fullPath(name) {
  return (currentPath.value.endsWith('/') ? currentPath.value : currentPath.value + '/') + name;
}

function openNewFolder() { showNewFolder.value = true; newFolderName.value = ''; }
async function createFolder() {
  if (!newFolderName.value.trim()) return;
  try {
    await api('mkdir', { path: fullPath(newFolderName.value.trim()) });
    showNewFolder.value = false;
    showMessage(t('sftp.folderCreated'), 'is-success');
    refresh();
  } catch (err) {
    showMessage(err.message, 'is-error');
  }
}

function renameFile(entry) {
  renameTarget.value = entry;
  renameValue.value = entry.name;
  showRename.value = true;
}
async function doRename() {
  if (!renameValue.value.trim() || !renameTarget.value) return;
  const src = fullPath(renameTarget.value.name);
  const dst = fullPath(renameValue.value.trim());
  try {
    await api('rename', { srcPath: src, destPath: dst });
    showRename.value = false;
    renameTarget.value = null;
    showMessage(t('sftp.renamed'), 'is-success');
    refresh();
  } catch (err) {
    showMessage(err.message, 'is-error');
  }
}

function chmodFile(entry) {
  chmodTarget.value = entry.name;
  const mode = entry.mode || 0o644;
  const s = mode.toString(8).slice(-3).split('').map(c => parseInt(c, 10));
  const bits = (v) => ({ r: !!(v & 4), w: !!(v & 2), x: !!(v & 1) });
  const vals = s.length >= 3 ? s : [6, 4, 4];
  chmodBits.value = { owner: bits(vals[0]), group: bits(vals[1] || 4), other: bits(vals[2] || 4) };
  showChmod.value = true;
}
async function doChmod() {
  try {
    await api('chmod', { path: fullPath(chmodTarget.value), mode: chmodOctal.value });
    showChmod.value = false;
    showMessage(t('sftp.permissionsChanged'), 'is-success');
    refresh();
  } catch (err) {
    showMessage(err.message, 'is-error');
  }
}

function confirmDelete(entry) { deleteTarget.value = entry; }
async function doDelete() {
  if (!deleteTarget.value) return;
  try {
    const path = fullPath(deleteTarget.value.name);
    if (deleteTarget.value.type === 'dir') {
      await api('rmdir', { path });
    } else {
      await api('delete', { path });
    }
    deleteTarget.value = null;
    showMessage(t('sftp.deleted'), 'is-success');
    refresh();
  } catch (err) {
    showMessage(err.message, 'is-error');
  }
}

onMounted(() => { refresh(); });
</script>

<style lang="scss" scoped>
.sftp-browser {
  height: 100%; display: flex; flex-direction: column;
  font-size: 0.8em; background: var(--bulma-scheme-main); position: relative;
  &.is-dragover { outline: 3px dashed var(--bulma-primary); outline-offset: -3px; }
  position: relative; overflow: hidden;
}

.sftp-drop-overlay {
  position: absolute; inset: 0; z-index: 500;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6rem;
  background: rgba(99, 102, 241, 0.08); backdrop-filter: blur(6px);
  color: var(--bulma-primary); font-weight: 600; font-size: 1em;
  animation: dropFadeIn 0.2s ease-out;
}
@keyframes dropFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.drop-circle {
  width: 64px; height: 64px; border-radius: 50%;
  background: rgba(99, 102, 241, 0.12); display: flex;
  align-items: center; justify-content: center;
  animation: dropPulse 1.2s ease-in-out infinite;
}
@keyframes dropPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
.drop-label { font-size: 1em; font-weight: 600; }
.drop-hint { font-size: 0.75em; opacity: 0.7; font-weight: 400; }

.sftp-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--bulma-border-light);
  background: var(--bulma-scheme-main-bis);
  gap: 0.3rem;
}

.sftp-toolbar-left {
  display: flex; align-items: center; gap: 0.2rem; flex: 1; min-width: 0;
}

.sftp-toolbar-right {
  display: flex; align-items: center; gap: 0.2rem;
}

.toolbar-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: none; border-radius: 6px;
  background: transparent; color: var(--bulma-text-light); cursor: pointer;
  transition: all 0.12s;
  &:hover:not(:disabled) { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
  &:disabled { opacity: 0.4; cursor: default; }
  &.is-close:hover { background: hsl(0, 60%, 92%); color: hsl(0, 60%, 40%); }
}

.sftp-path {
  font-size: 0.75em; color: var(--bulma-text-light); margin-left: 0.4rem;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.sftp-breadcrumb {
  display: flex; align-items: center; gap: 0;
  padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--bulma-border-light);
  font-size: 0.75em; overflow-x: auto; white-space: nowrap;
}

.crumb-item {
  color: var(--bulma-primary); cursor: pointer; padding: 0 0.1rem;
  &:hover { text-decoration: underline; }
}

.crumb-sep { color: var(--bulma-text-light); margin: 0 0.05rem; }

.sftp-selection-info {
  margin-left: auto; font-size: 0.85em; color: var(--bulma-primary); font-weight: 500;
}

.sftp-status-bar {
  display: flex; align-items: center; padding: 0.2rem 0.5rem;
  border-bottom: 1px solid var(--bulma-border-light);
  font-size: 0.7em; color: var(--bulma-text-light);
}

.status-conn { display: flex; align-items: center; gap: 0.3rem; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; &.is-connected { background: var(--bulma-success); } &.is-disconnected { background: var(--bulma-text-light); } }

.sftp-loading, .sftp-empty, .sftp-error {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--bulma-text-light); font-size: 0.85em;
}

.sftp-error { color: var(--bulma-danger); }

.sftp-list {
  flex: 1; overflow-y: auto; padding: 0;
}

.sftp-item {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--bulma-border-light);
  cursor: default; transition: background 0.1s;
  &:hover { background: var(--bulma-scheme-main-ter); }
  &.is-selected { background: rgba(99, 102, 241, 0.08); }
  &.is-dir { cursor: pointer; }
}

.item-icon { flex-shrink: 0; display: flex; align-items: center; }
.icon-folder { color: hsl(210, 60%, 50%); }
.icon-text { color: hsl(155, 50%, 45%); }
.icon-code { color: hsl(270, 50%, 50%); }
.icon-image { color: hsl(330, 50%, 50%); }
.icon-archive { color: hsl(40, 60%, 45%); }
.icon-file { color: var(--bulma-text-light); }

.item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; font-size: 0.9em; }
.item-size { width: 60px; text-align: right; color: var(--bulma-text-light); font-size: 0.85em; }
.item-mtime { width: 70px; text-align: right; color: var(--bulma-text-light); font-size: 0.85em; }
.item-mode { width: 36px; text-align: center; color: var(--bulma-text-light); font-family: monospace; font-size: 0.85em; }

.item-actions {
  display: none; gap: 1px;
  .sftp-item:hover & { display: flex; }
}

.item-action-btn {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border: none; border-radius: 4px;
  background: transparent; color: var(--bulma-text-light); cursor: pointer;
  transition: all 0.1s;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
  &.is-danger:hover { background: hsl(0, 60%, 92%); color: hsl(0, 60%, 40%); }
}

.sftp-context-menu {
  position: absolute; background: var(--bulma-scheme-main);
  border: 1px solid var(--bulma-border); border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 0.3rem; z-index: 100;
  min-width: 140px;
}

.ctx-item {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.35rem 0.6rem; border-radius: 4px; cursor: pointer;
  font-size: 0.85em; color: var(--bulma-text);
  &:hover { background: var(--bulma-scheme-main-ter); }
  &.is-danger { color: var(--bulma-danger); &:hover { background: hsl(0, 60%, 92%); } }
}

.ctx-sep { height: 1px; background: var(--bulma-border-light); margin: 0.2rem 0; }

.sftp-dialog-overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,0.3);
  display: flex; align-items: center; justify-content: center; z-index: 200;
}

.sftp-dialog {
  background: var(--bulma-scheme-main); border-radius: 12px;
  padding: 1.2rem; min-width: 300px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  h4 { font-size: 0.95em; font-weight: 600; margin-bottom: 0.8rem; }
  p { font-size: 0.85em; color: var(--bulma-text-light); margin-bottom: 0.8rem; }
}

.dialog-input {
  width: 100%; padding: 0.5rem 0.6rem; border: 1.5px solid var(--bulma-border);
  border-radius: 8px; font-size: 0.85em; outline: none; box-sizing: border-box;
  &:focus { border-color: var(--bulma-primary); }
}

.dialog-actions {
  display: flex; justify-content: flex-end; gap: 0.4rem; margin-top: 0.8rem;
}

.dialog-btn {
  padding: 0.4rem 0.8rem; border: 1.5px solid var(--bulma-border);
  border-radius: 6px; background: var(--bulma-scheme-main); cursor: pointer;
  font-size: 0.8em; color: var(--bulma-text); transition: all 0.12s;
  &:hover { border-color: var(--bulma-primary); }
  &.is-primary { background: var(--bulma-primary); border-color: var(--bulma-primary); color: white; }
  &.is-danger { background: var(--bulma-danger); border-color: var(--bulma-danger); color: white; }
  &:disabled { opacity: 0.5; cursor: default; }
}

.chmod-grid {
  display: flex; gap: 0.8rem; margin-bottom: 0.5rem;
}

.chmod-col { flex: 1; }
.chmod-label { font-size: 0.75em; font-weight: 500; color: var(--bulma-text-light); display: block; margin-bottom: 0.3rem; text-transform: uppercase; }

.chmod-bits {
  display: flex; flex-direction: column; gap: 0.2rem;
  label { display: flex; align-items: center; gap: 0.3rem; font-size: 0.85em; font-family: monospace; cursor: pointer;
    input { accent-color: var(--bulma-primary); }
  }
}

.chmod-octal {
  font-size: 0.85em; color: var(--bulma-text-light); text-align: center; margin-top: 0.3rem;
  strong { font-family: monospace; font-size: 1.1em; color: var(--bulma-text); }
}

.sftp-upload-progress {
  position: absolute; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  z-index: 300; gap: 0.5rem; color: white; font-size: 0.85em;
}

.upload-bar {
  width: 200px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; overflow: hidden;
}

.upload-bar-fill { height: 100%; background: var(--bulma-primary); transition: width 0.2s; }

.sftp-toast {
  position: absolute; top: 2.5rem; right: 0.5rem; z-index: 400;
  padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.8em;
  animation: fadeIn 0.2s ease;
  &.is-success { background: hsl(155, 40%, 92%); color: hsl(155, 55%, 30%); }
  &.is-error { background: hsl(0, 40%, 92%); color: hsl(0, 55%, 40%); }
  &.is-info { background: hsl(210, 40%, 92%); color: hsl(210, 55%, 35%); }
}

@keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
@keyframes spin { to { transform: rotate(360deg); } }
.is-spinning { animation: spin 1s linear infinite; }
</style>
