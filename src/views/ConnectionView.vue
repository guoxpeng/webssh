<template>
  <div class="conn-view">
    <div class="conn-header">
      <div>
        <h1 class="conn-title"><Server :size="26"/> {{ t('server.title') }}</h1>
        <p class="conn-subtitle">{{ connectionStore.savedConnections.length }} {{ t('server.total') }}</p>
      </div>
      <div class="conn-count">
        <span class="count-num">{{ connectionStore.savedConnections.length }}</span>
        <span class="count-label">{{ t('server.total') }}</span>
      </div>
    </div>

    <div class="conn-layout">
      <div class="conn-main">
        <ServerConnectForm
          :initial-data="formInitialData"
          @connect="handleFormConnect"
          @test-connection="handleFormTest"
          @form-cleared="formInitialData = null"
        />

        <div v-if="connectionStore.sshTestLoading" class="test-progress">
          <div class="test-bar"></div>
        </div>

        <div v-if="connectionStore.sshTestResult" class="test-result" :class="resultClass">
          <div class="test-result-header">
            <span>{{ resultIcon }}</span>
            <span class="test-result-title">{{ connectionStore.sshTestResult.node.name }}</span>
            <span class="test-result-status">{{ connectionStore.sshTestResult.success ? t('status.testSuccess') : t('status.testFailed') }}</span>
            <span class="test-result-time">{{ connectionStore.sshTestResult.time_elapsed?.toFixed(2) }}s</span>
            <button class="test-result-close" @click="connectionStore.sshTestResult = null">&times;</button>
          </div>
          <div class="test-result-body" v-if="testOutput">
            <pre><code>{{ testOutput }}</code></pre>
          </div>
        </div>
      </div>

      <aside class="conn-sidebar">
        <div class="sidebar-card">
          <div class="sidebar-card-header">
            <History :size="16"/> {{ t('server.savedServers') }}
            <div class="sidebar-header-actions" v-if="connectionStore.savedConnections.length > 0">
              <button class="header-action-btn" @click="exportConnections" :title="t('server.export')"><Download :size="14"/></button>
              <button class="header-action-btn" @click="triggerImport" :title="t('server.import')"><Upload :size="14"/></button>
            </div>
            <span class="sidebar-badge">{{ filteredConnections.length }}</span>
            <input type="file" ref="importInputRef" accept=".json" style="display:none" @change="onImportFile"/>
          </div>
          <div class="sidebar-search" v-if="connectionStore.savedConnections.length > 0">
            <Search :size="14" class="sidebar-search-icon"/>
            <input type="text" v-model="searchQuery" :placeholder="t('server.searchPlaceholder')"
                   class="sidebar-search-input" spellcheck="false"/>
            <button v-if="searchQuery" class="sidebar-search-clear" @click="searchQuery = ''">&times;</button>
          </div>
          <div v-if="connectionStore.savedConnections.length === 0" class="sidebar-empty">
            <FolderSearch :size="36" class="empty-icon"/>
            <p>{{ t('server.noSavedServers') }}</p>
            <p class="is-size-7">{{ t('server.noSavedHint') }}</p>
          </div>
          <div v-else-if="filteredConnections.length === 0" class="sidebar-empty">
            <p>{{ t('server.noMatch') }}</p>
          </div>
          <div v-else class="sidebar-list" ref="sidebarListRef" tabindex="-1" @keydown="onSidebarKeydown">
            <template v-for="(grp, gi) in visibleGroups" :key="grp">
              <div class="group-header" @click="toggleGroup(grp)" role="button" tabindex="0"
                   @keydown.enter="toggleGroup(grp)">
                <ChevronRight :size="12" class="group-chevron" :class="{ 'is-open': openGroups.has(grp) }"/>
                <span class="group-name">{{ groupLabel(grp) }}</span>
                <span class="group-count">{{ groupCounts[grp] }}</span>
              </div>
              <template v-if="openGroups.has(grp)">
                <div v-for="(conn, idx) in groupConnections(grp)" :key="conn.id"
                     :ref="el => setItemRef(el, idx)"
                     class="saved-item" :class="{ 'is-focused': focusedIndex === idx }"
                      @dblclick="quickConnect(conn)"
                      @click="loadForEditing(conn.id)"
                     @keydown.enter="quickConnect(conn)"
                     tabindex="0" role="button" :aria-label="t('server.connectTo', { name: conn.name })">
                  <div class="saved-item-left">
                    <ProtocolBadge :protocol="conn.protocol || 'ssh'"/>
                    <div class="saved-item-info">
                      <span class="saved-item-name">{{ conn.name }}</span>
                      <span class="saved-item-desc">{{ conn.username }}@{{ conn.host }}:{{ conn.port }}</span>
                    </div>
                  </div>
                  <div class="saved-item-actions">
                    <button class="icon-btn" @click.stop="loadForEditing(conn.id)" :title="t('server.edit')"><Edit3 :size="14"/></button>
                    <button class="icon-btn is-primary" @click.stop="quickConnect(conn)" :title="t('form.connect')"><Play :size="14"/></button>
                    <button class="icon-btn is-danger" @click.stop="confirmRemoveConnection(conn)" :title="t('server.delete')"><Trash2 :size="14"/></button>
                  </div>
                </div>
              </template>
            </template>
          </div>
        </div>

        <TunnelManager/>
      </aside>
    </div>

    <ConfirmDialog
      :visible="!!connectionToRemove"
      :title="t('common.remove')"
      :message="removeDialogMessage"
      :confirm-text="t('common.remove')"
      :cancel-text="t('common.cancel')"
      @confirm="onRemoveConfirmed"
      @cancel="connectionToRemove = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ServerConnectForm from '@/components/connection/ServerConnectForm.vue';
import ProtocolBadge from '@/components/global/ProtocolBadge.vue';
import TunnelManager from '@/components/tunnel/TunnelManager.vue';
import ConfirmDialog from '@/components/global/ConfirmDialog.vue';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRouter } from 'vue-router';
import { useNotifications } from '@/composables/useNotifications';
import { Server, History, Edit3, Trash2, Play, FolderSearch, Search, Download, Upload, ChevronRight } from 'lucide-vue-next';

const connectionStore = useConnectionStore();
const router = useRouter();
const { t } = useI18n();
const { showSuccess, showError, showInfo, showWarning } = useNotifications();

const groupLabel = (g) => g === 'Ungrouped' ? t('server.ungrouped') : g;

const formInitialData = ref(null);
const connectionToRemove = ref(null);
const searchQuery = ref('');
const importInputRef = ref(null);
const sidebarListRef = ref(null);
const itemRefs = ref([]);
const focusedIndex = ref(-1);
const openGroups = ref(new Set(connectionStore.groups));

const visibleGroups = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (q) return connectionStore.groups;
  return connectionStore.groups;
});

const groupCounts = computed(() => {
  const counts = {};
  for (const grp of connectionStore.groups) {
    counts[grp] = connectionStore.connectionsByGroup(grp).length;
  }
  return counts;
});

function groupConnections(grp) {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return connectionStore.connectionsByGroup(grp);
  return connectionStore.connectionsByGroup(grp).filter(c =>
    (c.name && c.name.toLowerCase().includes(q)) ||
    (c.host && c.host.toLowerCase().includes(q)) ||
    (c.username && c.username.toLowerCase().includes(q))
  );
}

function toggleGroup(grp) {
  if (openGroups.value.has(grp)) openGroups.value.delete(grp);
  else openGroups.value.add(grp);
  openGroups.value = new Set(openGroups.value);
}

// When searching, open all groups
watch(searchQuery, () => {
  if (searchQuery.value.trim()) {
    openGroups.value = new Set(connectionStore.groups);
  }
});

function setItemRef(el, idx) {
  if (el) itemRefs.value[idx] = el;
}

function onSidebarKeydown(e) {
  const len = filteredConnections.value.length;
  if (len === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    focusedIndex.value = focusedIndex.value < len - 1 ? focusedIndex.value + 1 : 0;
    itemRefs.value[focusedIndex.value]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    focusedIndex.value = focusedIndex.value > 0 ? focusedIndex.value - 1 : len - 1;
    itemRefs.value[focusedIndex.value]?.focus();
  }
}

const filteredConnections = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return connectionStore.savedConnections;
  return connectionStore.savedConnections.filter(c =>
    (c.name && c.name.toLowerCase().includes(q)) ||
    (c.host && c.host.toLowerCase().includes(q)) ||
    (c.username && c.username.toLowerCase().includes(q))
  );
});

const removeDialogMessage = computed(() =>
  connectionToRemove.value ? t('server.removeConfirm', { name: connectionToRemove.value.name }) : ''
);

const testOutput = computed(() => {
  const r = connectionStore.sshTestResult;
  if (!r) return '';
  const lines = [];
  if (r.output?.length) lines.push(...r.output);
  if (r.error?.length) lines.push(t('common.error'), ...r.error);
  return lines.join('\n');
});

const resultClass = computed(() => {
  const r = connectionStore.sshTestResult;
  if (!r) return '';
  if (r.success) return 'is-success';
  if (r.error?.length && r.output?.length) return 'is-warning';
  return 'is-danger';
});

const resultIcon = computed(() => {
  const r = connectionStore.sshTestResult;
  if (!r) return '';
  return r.success ? '\u2705' : '\u274C';
});

function exportConnections() {
  const data = JSON.stringify(connectionStore.savedConnections, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `webssh-connections-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showSuccess(t('server.exported', { count: connectionStore.savedConnections.length }));
}

function triggerImport() { importInputRef.value?.click(); }

function onImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const imported = JSON.parse(ev.target?.result);
      if (!Array.isArray(imported)) throw new Error('Invalid format');
      let count = 0;
      for (const conn of imported) {
        if (conn.name && conn.host) {
          connectionStore.addConnection(conn);
          count++;
        }
      }
      showSuccess(t('server.exported', { count }));
    } catch {
      showError(t('server.importFailed'));
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

async function handleFormTest(nodeConfig) {
  formInitialData.value = null;
  const result = await connectionStore.testConnection(nodeConfig);
  if (result.success) {
    const saved = connectionStore.addConnection(nodeConfig);
      showSuccess(t('form.testSuccess', { name: saved.name }));
    } else {
      showError(t('form.testFailed', { name: nodeConfig.name, error: result.error?.join('; ') }));
  }
}

function handleFormConnect(nodeConfig) {
  formInitialData.value = null;
  const saved = connectionStore.addConnection(nodeConfig);
  connectionStore.setCurrentNodeDetails({ ...nodeConfig, id: saved.id });
  showInfo(t('form.connecting', { name: saved.name }));
  if (nodeConfig.rememberForSession && nodeConfig.auth_value && saved.id) {
    connectionStore.saveCredentialToSessionStorage(saved.id, nodeConfig.auth_type, nodeConfig.auth_value);
  }
  connectionStore.pendingConnections.push({ ...nodeConfig, id: saved.id });
  if (router.currentRoute.value.name !== 'Terminal') {
    router.push({ name: 'Terminal' });
  }
}

function loadForEditing(id) {
  connectionStore.loadConnectionForEditing(id);
  if (connectionStore.currentNodeDetails) {
    formInitialData.value = { ...connectionStore.currentNodeDetails };
    showInfo(t('form.loadedForEditing', { name: connectionStore.currentNodeDetails.name }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

async function quickConnect(conn) {
  const remembered = await connectionStore.getCredentialFromSessionStorage(conn.id);
  if (remembered?.auth_value) {
    const full = { ...conn, auth_type: remembered.auth_type, auth_value: remembered.auth_value, rememberForSession: true };
    showSuccess(t('form.connecting', { name: conn.name }));
    const saved = connectionStore.addConnection(full);
    connectionStore.setCurrentNodeDetails({ ...full, id: saved.id });
    connectionStore.pendingConnections.push({ ...full, id: saved.id });
    if (router.currentRoute.value.name !== 'Terminal') {
      router.push({ name: 'Terminal' });
    }
  } else {
    showWarning(t('form.noSavedCredentials', { name: conn.name }));
    loadForEditing(conn.id);
  }
}

function confirmRemoveConnection(conn) { connectionToRemove.value = conn; }
function onRemoveConfirmed() {
  if (connectionToRemove.value) {
    connectionStore.removeConnection(connectionToRemove.value.id);
    showSuccess(t('form.removed', { name: connectionToRemove.value.name }));
    connectionToRemove.value = null;
  }
}
</script>

<style lang="scss" scoped>
.conn-view { max-width: 1200px; margin: 0 auto; }

.conn-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 1.5rem;
}

.conn-title { font-size: 1.4em; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; margin: 0; }
.conn-subtitle { font-size: 0.8em; color: var(--bulma-text-light); margin: 0; }

.conn-count {
  display: flex; flex-direction: column; align-items: center;
  background: linear-gradient(135deg, hsl(235,40%,45%), hsl(235,50%,58%));
  color: white; padding: 0.4rem 0.8rem; border-radius: 10px; line-height: 1.2;
}
.count-num { font-size: 1.4em; font-weight: 700; }
.count-label { font-size: 0.6em; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8; }

.conn-layout {
  display: grid; grid-template-columns: 1fr 320px; gap: 1.5rem; align-items: start;
}

.conn-main { min-width: 0; }

.test-progress { margin-top: 0.75rem; height: 3px; border-radius: 2px; overflow: hidden; background: var(--bulma-border-light); }
.test-bar { height: 100%; width: 30%; background: var(--bulma-primary); border-radius: 2px; animation: testSlide 1.2s ease-in-out infinite; }
@keyframes testSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }

.test-result {
  margin-top: 0.75rem; border-radius: 10px; overflow: hidden; border: 1px solid;
  &.is-success { border-color: var(--bulma-success); }
  &.is-danger { border-color: var(--bulma-danger); }
  &.is-warning { border-color: var(--bulma-warning); }
}

.test-result-header {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.75rem; font-size: 0.8em;
  .is-success & { background: hsl(155,30%,95%); }
  .is-danger & { background: hsl(350,30%,95%); }
  .is-warning & { background: hsl(38,30%,95%); }
}
.test-result-title { font-weight: 600; flex: 1; }
.test-result-status { font-weight: 500; }
.test-result-time { color: var(--bulma-text-light); font-family: var(--bulma-family-monospace); font-size: 0.9em; }
.test-result-close { background: none; border: none; font-size: 1.2em; cursor: pointer; color: var(--bulma-text-light); padding: 0; line-height: 1; }

.test-result-body {
  padding: 0.5rem 0.75rem; max-height: 150px; overflow-y: auto;
  pre { margin: 0; font-size: 0.75em; background: none; padding: 0; }
  code { color: var(--bulma-text); }
}

.conn-sidebar { display: flex; flex-direction: column; gap: 0.75rem; }

.sidebar-card {
  background: var(--bulma-box-background-color);
  backdrop-filter: blur(12px); border: 1px solid var(--bulma-border-light);
  border-radius: 12px; overflow: hidden;
}

.sidebar-card-header {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.6rem 0.75rem; font-size: 0.8em; font-weight: 600;
  border-bottom: 1px solid var(--bulma-border-light);
}

.sidebar-header-actions { display: flex; gap: 2px; margin-left: auto; margin-right: 0.25rem; }
.header-action-btn {
  background: none; border: none; padding: 0.2rem; border-radius: 4px; cursor: pointer;
  color: var(--bulma-text-light); display: flex; transition: all 0.1s;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
}

.sidebar-badge {
  font-size: 0.8em; padding: 1px 6px; border-radius: 6px;
  background: var(--bulma-border-light); color: var(--bulma-text-light);
}

.sidebar-search {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.4rem 0.65rem; border-bottom: 1px solid var(--bulma-border-light);
}
.sidebar-search-icon { flex-shrink: 0; color: var(--bulma-text-light); }
.sidebar-search-input {
  flex: 1; border: none; background: none; outline: none; font-size: 0.8em;
  color: var(--bulma-text); min-width: 0;
  &::placeholder { color: var(--bulma-text-light); }
}
.sidebar-search-clear {
  background: none; border: none; cursor: pointer; font-size: 1em; line-height: 1;
  color: var(--bulma-text-light); padding: 0 2px;
  &:hover { color: var(--bulma-text); }
}

.sidebar-empty {
  padding: 1.5rem; text-align: center; color: var(--bulma-text-light);
  .empty-icon { opacity: 0.3; margin-bottom: 0.5rem; }
}

.sidebar-list { max-height: 400px; overflow-y: auto; }

.group-header {
  display: flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.65rem;
  font-size: 0.7em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
  color: var(--bulma-text-light); cursor: pointer; user-select: none;
  &:hover { color: var(--bulma-text); }
  & + & { border-top: 1px solid var(--bulma-border-light); margin-top: 0.25rem; padding-top: 0.5rem; }
}
.group-chevron { transition: transform 0.15s; flex-shrink: 0; &.is-open { transform: rotate(90deg); } }
.group-name { flex: 1; }
.group-count { font-size: 0.85em; opacity: 0.6; }

.saved-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.5rem 0.75rem; cursor: pointer; transition: background 0.1s;
  &:hover, &.is-focused { background: var(--bulma-scheme-main-ter); }
  &.is-focused { outline: 2px solid var(--bulma-primary); outline-offset: -2px; }
  & + & { border-top: 1px solid var(--bulma-border-light); }
}

.saved-item-left { display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 0; }
.saved-item-info { min-width: 0; }
.saved-item-name { display: block; font-size: 0.8em; font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
.saved-item-desc { display: block; font-size: 0.65em; color: var(--bulma-text-light); overflow: hidden; text-overflow: ellipsis; }

.saved-item-actions {
  display: flex; gap: 2px; opacity: 0; transition: opacity 0.12s; flex-shrink: 0;
  .saved-item:hover & { opacity: 1; }
}

.icon-btn {
  background: none; border: none; padding: 0.25rem; border-radius: 6px;
  cursor: pointer; color: var(--bulma-text-light); display: flex;
  transition: all 0.1s;
  &:hover { background: var(--bulma-scheme-main-bis); color: var(--bulma-text); }
  &.is-primary:hover { color: var(--bulma-primary); }
  &.is-danger:hover { color: var(--bulma-danger); }
}

@media (max-width: 768px) {
  .conn-layout { grid-template-columns: 1fr; }
  .saved-item-actions { opacity: 1; }
  .conn-header { flex-direction: column; align-items: flex-start; gap: 0.25rem; }
  .conn-header .title { font-size: 1.25rem; }
  .sidebar-card { border-left: none; padding-left: 0; margin-left: 0; }
  .sidebar-list { max-height: none; }
}

@media (max-width: 480px) {
  .conn-view { padding: 0.5rem; }
  .conn-header { margin-bottom: 0.75rem; }
  .conn-main .card { padding: 0.75rem; }
  .saved-item { padding: 0.5rem 0.6rem; }
  .saved-item-main { gap: 0.5rem; }
  .saved-item-icon { width: 28px; height: 28px; font-size: 0.75rem; }
  .saved-item-info { gap: 0; }
  .saved-item-name { font-size: 0.8rem; }
  .saved-item-desc { font-size: 0.65rem; }
}
</style>
