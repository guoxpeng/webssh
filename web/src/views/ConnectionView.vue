<template>
  <div class="conn-view app-page">
    <div class="conn-header">
      <h1 class="conn-title"><Server :size="26"/> {{ t('server.title') }}</h1>
      <div class="conn-count" v-if="connectionStore.savedConnections.length > 0">
        <span class="count-num">{{ connectionStore.savedConnections.length }}</span>
        <span class="count-label">{{ t('server.savedLabel') }}</span>
      </div>
    </div>

    <div class="conn-layout">
      <div class="conn-main">
        <ServerConnectForm
          :initial-data="formInitialData"
          @connect="handleFormConnect"
          @save-connection="handleFormSave"
          @form-cleared="formInitialData = null"
        />


      </div>

      <aside class="conn-sidebar">
        <div class="sidebar-card">
          <div class="sidebar-card-header">
            <History :size="16"/> {{ t('server.savedServers') }}
            <div class="sidebar-header-actions">
              <button class="header-action-btn" @click="sshConfigInputRef?.click()" :title="t('server.importSshConfig')"><FileUp :size="14"/></button>
              <button class="header-action-btn" @click="showNewGroupInput = true" :title="t('server.newGroup')"><FolderPlus :size="14"/></button>
              <input type="file" ref="sshConfigInputRef" accept=".conf,.cfg,.txt,.config" style="display:none" @change="onSshConfigFile"/>
            </div>
            <span class="sidebar-badge">{{ connectionStore.savedConnections.length }}</span>
          </div>

          <!-- New group input -->
          <div v-if="showNewGroupInput" class="new-group-row">
            <input ref="newGroupInputRef" type="text" v-model="newGroupName" :placeholder="t('server.groupNamePlaceholder')"
                   class="new-group-input" @keydown.enter="confirmCreateGroup" @keydown.escape="cancelCreateGroup"/>
          </div>

          <!-- Pinned connections -->
          <div v-if="connectionStore.pinnedConnections.length > 0 && !searchQuery" class="pinned-section">
            <div class="pinned-header">
              <Star :size="11" fill="currentColor"/> {{ t('server.pinned') }} <span class="pinned-count">{{ connectionStore.pinnedConnections.length }}</span>
            </div>
            <div v-for="conn in connectionStore.pinnedConnections" :key="conn.id"
                 class="saved-item pinned-item"
                 @click="onSavedItemClick(conn, $event)"
                 :draggable="conn.group !== FAILED_GROUP" @dragstart="onDragStart($event, conn)"
                 @dragover.prevent @dragenter.prevent @dragend="onDragEnd">
              <div class="saved-item-left">
                <ProtocolBadge :protocol="conn.protocol || 'ssh'"/>
                <div class="saved-item-info">
                  <span class="saved-item-name">{{ conn.name }}</span>
                  <span class="saved-item-desc">{{ conn.username }}@{{ conn.host }}:{{ conn.port }}</span>
                </div>
              </div>
              <div class="saved-item-actions">
                <button class="icon-btn is-pinned" @click.stop="onTogglePin(conn.id)" :title="t('server.unpin')"><Star :size="13" fill="currentColor"/></button>
                <button class="icon-btn is-primary" @click.stop="quickConnect(conn)" :title="t('form.connect')"><Play :size="14"/></button>
              </div>
            </div>
          </div>

          <div v-if="connectionStore.savedConnections.length === 0" class="sidebar-empty">
            <FolderSearch :size="36" class="empty-icon"/>
            <p>{{ t('server.noSavedServers') }}</p>
            <p class="is-size-7">{{ t('server.noSavedHint') }}</p>
          </div>
          <div v-else class="sidebar-list" ref="sidebarListRef" tabindex="-1" @keydown="onSidebarKeydown">
            <template v-for="(grp, gi) in visibleGroups" :key="grp">
              <div class="group-header" :class="{ 'is-dragover': isDragOverGroup === grp }" @click="connectionStore.toggleGroupCollapsed(grp)" role="button" tabindex="0"
                   @keydown.enter="connectionStore.toggleGroupCollapsed(grp)"
                   @contextmenu.prevent="showGroupContextMenu($event, grp)"
                   @dragover.prevent="onDragOverGroup(grp)" @dragleave="onDragLeave" @drop.prevent.stop="onDropToGroup(grp)">
                <ChevronRight :size="12" class="group-chevron" :class="{ 'is-open': !connectionStore.isGroupCollapsed(grp) }"/>
                <span class="group-name">{{ groupLabel(grp) }}</span>
                <span class="group-count">{{ groupCounts[grp] }}</span>
                <button class="group-menu-btn" @click.stop="showGroupContextMenu($event, grp)"><MoreHorizontal :size="11"/></button>
              </div>
              <template v-if="!connectionStore.isGroupCollapsed(grp)">
                <div v-for="(conn, idx) in groupConnections(grp)" :key="conn.id"
                     :ref="el => setItemRef(el, conn.id)"
                     class="saved-item" :class="{ 'is-focused': focusedConnId === conn.id, 'is-dragging': dragConnId === conn.id }"
                     @click="onSavedItemClick(conn, $event)"
                     @keydown.enter="quickConnect(conn)"
                     :draggable="conn.group !== FAILED_GROUP" @dragstart="onDragStart($event, conn)"
                      @dragover.prevent="onDragOver($event, conn, grp)"
                      @dragleave="onDragLeave"
                      @drop.prevent.stop="onDrop($event, conn, grp)"
                      @dragend="onDragEnd"
                     tabindex="0" role="button" :aria-label="t('server.connectTo', { name: conn.name })">
                  <div class="saved-item-left">
                    <ProtocolBadge :protocol="conn.protocol || 'ssh'"/>
                    <div class="saved-item-info">
                      <span class="saved-item-name">{{ conn.name }}</span>
                      <span class="saved-item-desc">{{ conn.username }}@{{ conn.host }}:{{ conn.port }}</span>
                    </div>
                  </div>
                  <div class="saved-item-actions">
                    <button class="icon-btn" :class="{ 'is-pinned': conn.pinned }" @click.stop="onTogglePin(conn.id)"
                            :title="conn.pinned ? t('server.unpin') : t('server.pin')">
                      <Star :size="12" :fill="conn.pinned ? 'currentColor' : 'none'"/>
                    </button>
                    <button class="icon-btn" @click.stop="loadForEditing(conn.id)" :title="t('server.edit')"><Edit3 :size="14"/></button>
                    <button class="icon-btn is-primary" @click.stop="quickConnect(conn)" :title="t('form.connect')"><Play :size="14"/></button>
                    <button class="icon-btn is-danger" @click.stop="confirmRemoveConnection(conn)" :title="t('server.delete')"><Trash2 :size="14"/></button>
                  </div>
                </div>
                <div v-if="isDragOverGroup === grp && dragConnId && dragConnId !== groupConnections(grp)?.[0]?.id" class="drop-zone"></div>
              </template>
            </template>
          </div>
        </div>

      </aside>
    </div>

    <!-- Group context menu -->
    <div v-if="groupMenuVisible" class="context-menu" :style="groupMenuStyle" @click.stop>
      <div class="context-item" @click="renameGroupAction" v-if="groupMenuTarget !== 'Ungrouped' && groupMenuTarget !== FAILED_GROUP">{{ t('server.renameGroup') }}</div>
      <div class="context-item" @click="connectAllInGroup" v-if="groupMenuTarget !== FAILED_GROUP">{{ t('server.connectAll') }}</div>
      <div class="context-item is-danger" @click="deleteGroupAction" v-if="groupMenuTarget !== 'Ungrouped'">{{ t('server.deleteGroup') }}</div>
    </div>

    <!-- Rename dialog -->
    <div v-if="renamingGroup" class="rename-overlay" @click.self="renamingGroup = null">
      <div class="rename-dialog">
        <h4>{{ t('server.renameGroup') }}</h4>
        <input ref="renameInputRef" type="text" v-model="renameValue" class="rename-input"
               @keydown.enter="confirmRename" @keydown.escape="renamingGroup = null"/>
        <div class="rename-actions">
          <button class="rename-btn" @click="confirmRename">{{ t('common.save') }}</button>
          <button class="rename-btn cancel" @click="renamingGroup = null">{{ t('common.cancel') }}</button>
        </div>
      </div>
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
import { ref, computed, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import ServerConnectForm from '@/components/connection/ServerConnectForm.vue';
import ProtocolBadge from '@/components/global/ProtocolBadge.vue';
import ConfirmDialog from '@/components/global/ConfirmDialog.vue';
import { useConnectionStore, FAILED_GROUP } from '@/stores/connectionStore';
import { ConnectionStatus } from '@/utils/constants';
import { useRouter } from 'vue-router';
import { useNotifications } from '@/composables/useNotifications';
import {
  Server, History, Edit3, Trash2, Play, FolderSearch,
  ChevronRight, FolderPlus, Star, MoreHorizontal, FileUp,
} from 'lucide-vue-next';
import { parseSshConfig } from '@/utils/sshConfig';

const connectionStore = useConnectionStore();
const router = useRouter();
const { t } = useI18n();
const { showSuccess, showError, showWarning } = useNotifications();

const groupLabel = (g) => g === 'Ungrouped' ? t('server.ungrouped')
  : g === FAILED_GROUP ? t('server.failedGroup')
  : g;

const formInitialData = ref(null);

onMounted(() => {
  if (connectionStore.currentNodeDetails) {
    formInitialData.value = { ...connectionStore.currentNodeDetails };
  }
  // Reset stuck connecting state (e.g. when navigation guard redirected back here)
  if (connectionStore.connectionStatus === ConnectionStatus.CONNECTING) {
    connectionStore.setConnectionStatus(ConnectionStatus.DISCONNECTED);
  }
});
const connectionToRemove = ref(null);

const sidebarListRef = ref(null);
// Keyed by connection id: per-group indexes would collide across groups and
// leave stale refs behind, breaking arrow-key focus.
const itemRefs = ref({});
const focusedIndex = ref(-1);
const focusedConnId = computed(() => connectionStore.savedConnections[focusedIndex.value]?.id ?? null);
const showNewGroupInput = ref(false);
const newGroupName = ref('');
const newGroupInputRef = ref(null);

const visibleGroups = computed(() => connectionStore.groups);

const groupCounts = computed(() => {
  const counts = {};
  for (const grp of connectionStore.groups) {
    counts[grp] = connectionStore.connectionsByGroup(grp).length;
  }
  return counts;
});

function groupConnections(grp) {
  return connectionStore.connectionsByGroup(grp);
}

function setItemRef(el, id) {
  if (id == null) return;
  if (el) itemRefs.value[id] = el;
  else delete itemRefs.value[id];
}

function onSidebarKeydown(e) {
  const all = connectionStore.savedConnections;
  if (all.length === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    focusedIndex.value = focusedIndex.value < all.length - 1 ? focusedIndex.value + 1 : 0;
    itemRefs.value[all[focusedIndex.value]?.id]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    focusedIndex.value = focusedIndex.value > 0 ? focusedIndex.value - 1 : all.length - 1;
    itemRefs.value[all[focusedIndex.value]?.id]?.focus();
  }
}

 

const removeDialogMessage = computed(() =>
  connectionToRemove.value ? t('server.removeConfirm', { name: connectionToRemove.value.name }) : ''
);

async function handleFormSave(nodeConfig) {
  const saved = connectionStore.addConnection(nodeConfig);
  if (nodeConfig.auth_value) {
    await connectionStore.saveCredentialToSessionStorage(saved.id, nodeConfig.auth_type || 'password', nodeConfig.auth_value);
    await connectionStore.saveCredentialToLocalStorage(saved.id, nodeConfig.auth_type || 'password', nodeConfig.auth_value);
  }
  showSuccess(t('form.saved', { name: saved.name }));
}

function handleFormConnect(nodeConfig) {
  connectionStore.setConnectionStatus(ConnectionStatus.CONNECTING);
  formInitialData.value = null;
  connectionStore.pendingConnections.splice(0);
  connectionStore.pendingConnections.push({ ...nodeConfig });
  if (router.currentRoute.value.name !== 'Terminal') router.push({ name: 'Terminal' });
}

async function loadForEditing(id) {
  await connectionStore.loadConnectionForEditing(id);
  if (connectionStore.currentNodeDetails) {
    formInitialData.value = { ...connectionStore.currentNodeDetails };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function onSavedItemClick(conn, event) {
  const target = event.target;
  if (target.closest('.icon-btn, .saved-item-actions')) return;
  quickConnect(conn);
}
async function quickConnect(conn) {
  try {
    let remembered = await connectionStore.getCredentialFromSessionStorage(conn.id);
    if (!remembered?.auth_value) {
      remembered = await connectionStore.getCredentialFromLocalStorage(conn.id);
      if (remembered?.auth_value) {
        connectionStore.saveCredentialToSessionStorage(conn.id, remembered.auth_type, remembered.auth_value);
      }
    }
    if (remembered?.auth_value) {
      doConnect(conn, remembered.auth_type, remembered.auth_value);
    } else {
      await connectionStore.loadConnectionForEditing(conn.id);
      if (connectionStore.currentNodeDetails) {
        formInitialData.value = { ...connectionStore.currentNodeDetails };
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  } catch {
    showError(t('server.quickConnectError'));
  }
}

function doConnect(conn, authType, authValue) {
  connectionStore.setConnectionStatus(ConnectionStatus.CONNECTING);
  connectionStore.pendingConnections.splice(0);
  connectionStore.pendingConnections.push({ ...conn, auth_type: authType, auth_value: authValue, rememberForSession: true, id: conn.id });
  if (router.currentRoute.value.name !== 'Terminal') router.push({ name: 'Terminal' });
}
function confirmRemoveConnection(conn) { connectionToRemove.value = conn; }
function onTogglePin(id) {
  const conn = connectionStore.savedConnections.find(c => c.id === id);
  const wasPinned = conn?.pinned;
  connectionStore.togglePinConnection(id);
  showSuccess(wasPinned ? t('server.unpinned') : t('server.pinned'));
}
function onRemoveConfirmed() {
  if (connectionToRemove.value) {
    connectionStore.removeConnection(connectionToRemove.value.id);
    showSuccess(t('form.removed', { name: connectionToRemove.value.name }));
    connectionToRemove.value = null;
  }
}

// --- New Group ---
function confirmCreateGroup() {
  const name = newGroupName.value.trim();
  if (name && connectionStore.createGroup(name)) {
    showSuccess(t('server.groupCreated', { name }));
  } else if (name) {
    showWarning(t('server.groupExists', { name }));
  }
  showNewGroupInput.value = false;
  newGroupName.value = '';
}
function cancelCreateGroup() { showNewGroupInput.value = false; newGroupName.value = ''; }

// --- SSH config import (~/.ssh/config) ---
const sshConfigInputRef = ref(null);
async function onSshConfigFile(e) {
  const file = e.target?.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const hosts = parseSshConfig(text);
    if (!hosts.length) { showWarning(t('server.sshConfigEmpty')); return; }
    let added = 0, skipped = 0;
    for (const h of hosts) {
      const dup = connectionStore.savedConnections.find(
        c => c.host === h.host && c.port === h.port && c.username === h.username
      );
      if (dup) { skipped++; continue; }
      connectionStore.addConnection({
        name: h.name, host: h.host, port: h.port, username: h.username,
        protocol: 'ssh', auth_type: h.hasKey ? 'key' : 'password',
      });
      added++;
    }
    if (added) showSuccess(t('server.sshConfigImported', { added, skipped }));
    else showWarning(t('server.sshConfigAllDup', { skipped }));
  } catch {
    showError(t('server.sshConfigFailed'));
  }
}

// --- Group Context Menu ---
const groupMenuVisible = ref(false);
const groupMenuStyle = ref({});
const groupMenuTarget = ref('');


function showGroupContextMenu(e, grp) {
  groupMenuTarget.value = grp;
  const menuWidth = 180;
  const menuHeight = 110;
  let left = e.clientX;
  let top = e.clientY;
  if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 8;
  if (top + menuHeight > window.innerHeight) top = window.innerHeight - menuHeight - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  groupMenuStyle.value = { top: top + 'px', left: left + 'px' };
  groupMenuVisible.value = true;
  setTimeout(() => {
    document.addEventListener('click', closeGroupMenu, { once: true });
  }, 0);
}
function closeGroupMenu() { groupMenuVisible.value = false; }

const renamingGroup = ref(null);
const renameValue = ref('');
const renameInputRef = ref(null);

function renameGroupAction() {
  groupMenuVisible.value = false;
  renameValue.value = groupMenuTarget.value;
  renamingGroup.value = groupMenuTarget.value;
  nextTick(() => renameInputRef.value?.focus());
}
function confirmRename() {
  if (renameValue.value.trim() && renameValue.value.trim() !== renamingGroup.value) {
    connectionStore.renameGroup(renamingGroup.value, renameValue.value.trim());
    showSuccess(t('server.groupRenamed'));
  }
  renamingGroup.value = null;
}
function deleteGroupAction() {
  groupMenuVisible.value = false;
  const grp = groupMenuTarget.value;
  if (connectionStore.deleteGroup(grp)) showSuccess(t('server.groupDeleted', { name: grp }));
}
async function connectAllInGroup() {
  if (connectionStore.connectionStatus === ConnectionStatus.CONNECTING) return;
  groupMenuVisible.value = false;
  const conns = connectionStore.connectionsByGroup(groupMenuTarget.value);
  // Check BEFORE flipping status — an empty group must not wedge the store in
  // CONNECTING forever.
  if (conns.length === 0) return;
  connectionStore.setConnectionStatus(ConnectionStatus.CONNECTING);
  connectionStore.pendingConnections.splice(0);
  for (const conn of conns) {
    const cred = await connectionStore.getCredentialFromSessionStorage(conn.id);
    const full = cred?.auth_value
      ? { ...conn, auth_type: cred.auth_type, auth_value: cred.auth_value }
      : { ...conn };
    connectionStore.pendingConnections.push(full);
  }
  showSuccess(t('server.connectingAll', { count: conns.length }));
  if (router.currentRoute.value.name !== 'Terminal') router.push({ name: 'Terminal' });
}

// --- Drag & Drop ---
const dragConnId = ref(null);
const dragSourceGroup = ref('');
const isDragOverGroup = ref(null);

function onDragStart(e, conn) {
  dragConnId.value = conn.id;
  dragSourceGroup.value = conn.group || 'Ungrouped';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', conn.id);
}

function onDragEnd() {
  dragConnId.value = null;
  isDragOverGroup.value = null;
}

function onDragOver(e, conn, grp) {
  isDragOverGroup.value = grp;
  e.dataTransfer.dropEffect = 'move';
}

function onDragLeave() { isDragOverGroup.value = null; }

function onDragOverGroup(grp) { isDragOverGroup.value = grp; }

function onDropToGroup(grp) {
  isDragOverGroup.value = null;
  if (dragConnId.value) {
    connectionStore.moveConnectionToGroup(dragConnId.value, grp);
    dragConnId.value = null;
  }
}

function onDrop(e, conn, targetGroup) {
  e.preventDefault();
  isDragOverGroup.value = null;
  if (dragConnId.value) {
    connectionStore.moveConnectionToGroup(dragConnId.value, targetGroup);
    dragConnId.value = null;
  }
}
</script>

<style lang="scss" scoped>
.conn-view { max-width: 1200px; margin: 0 auto; overflow-y: auto; height: 100%; padding: 1.25rem 1.5rem 2rem; }
.conn-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
.conn-title { font-size: 1.4em; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; margin: 0; letter-spacing: -0.01em; }
.conn-subtitle { font-size: 0.8em; color: var(--bulma-text-light); margin: 0; }
.conn-count { display: flex; flex-direction: column; align-items: center; background: linear-gradient(135deg, var(--bulma-primary), var(--bulma-link, var(--bulma-primary))); color: white; padding: 0.4rem 0.9rem; border-radius: 10px; line-height: 1.2; box-shadow: 0 4px 12px rgba(99,102,241,0.25); }
.count-num { font-size: 1.4em; font-weight: 700; }
.count-label { font-size: 0.6em; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8; }
.conn-layout { display: grid; grid-template-columns: 1fr minmax(260px, 360px); gap: 1.5rem; align-items: start; }
.conn-main { min-width: 0; }
.test-progress { margin-top: 0.75rem; height: 3px; border-radius: 2px; overflow: hidden; background: var(--bulma-border-light); }
.test-bar { height: 100%; width: 30%; background: var(--bulma-primary); border-radius: 2px; animation: testSlide 1.2s ease-in-out infinite; }
@keyframes testSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
.test-result { margin-top: 0.75rem; border-radius: 10px; overflow: hidden; border: 1px solid; }
.test-result.is-success { border-color: var(--bulma-success); }
.test-result.is-danger { border-color: var(--bulma-danger); }
.test-result.is-warning { border-color: var(--bulma-warning); }
.test-result-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.75rem; font-size: 0.8em; }
.test-result.is-success .test-result-header { background: hsl(155,30%,95%); }
.test-result.is-danger .test-result-header { background: hsl(350,30%,95%); }
.test-result.is-warning .test-result-header { background: hsl(38,30%,95%); }
:root.is-dark-mode .test-result.is-success .test-result-header { background: hsla(155,30%,20%,0.4); }
:root.is-dark-mode .test-result.is-danger .test-result-header { background: hsla(350,30%,20%,0.4); }
:root.is-dark-mode .test-result.is-warning .test-result-header { background: hsla(38,30%,20%,0.4); }
.test-result-title { font-weight: 600; flex: 1; }
.test-result-status { font-weight: 500; }
.test-result-time { color: var(--bulma-text-light); font-family: var(--bulma-family-monospace); font-size: 0.9em; }
.test-result-close { background: none; border: none; font-size: 1.2em; cursor: pointer; color: var(--bulma-text-light); padding: 0; line-height: 1; }
.test-result-body { padding: 0.5rem 0.75rem; max-height: 150px; overflow-y: auto; pre { margin: 0; font-size: 0.75em; background: none; padding: 0; } code { color: var(--bulma-text); } }
.conn-sidebar { display: flex; flex-direction: column; gap: 0.75rem; }
.sidebar-card { background: var(--bulma-box-background-color); backdrop-filter: blur(12px); border: 1px solid var(--bulma-border-light); border-radius: 12px; overflow: hidden; }
:root.is-dark-mode .sidebar-card { background: var(--app-surface); border-color: var(--app-border); }
.sidebar-card-header { display: flex; align-items: center; gap: 0.4rem; padding: 0.6rem 0.75rem; font-size: 0.8em; font-weight: 600; border-bottom: 1px solid var(--bulma-border-light); }
:root.is-dark-mode .sidebar-card-header { border-bottom-color: var(--app-border); }
.sidebar-header-actions { display: flex; gap: 2px; margin-left: auto; margin-right: 0.25rem; }
.header-action-btn { background: none; border: none; padding: 0.2rem; border-radius: 4px; cursor: pointer; color: var(--bulma-text-light); display: flex; &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); } }
:root.is-dark-mode .header-action-btn { &:hover { background: var(--app-surface-hover); } }
.sidebar-badge { font-size: 0.8em; padding: 1px 6px; border-radius: 6px; background: var(--bulma-border-light); color: var(--bulma-text-light); }

.new-group-row { padding: 0.35rem 0.65rem; border-bottom: 1px solid var(--bulma-border-light); }
:root.is-dark-mode .new-group-row { border-bottom-color: var(--app-border); }
.new-group-input { width: 100%; padding: 0.3rem 0.5rem; border: 1px solid var(--bulma-primary); border-radius: 6px; font-size: 0.75em; background: var(--bulma-input-background-color); color: var(--bulma-text); outline: none; }

.sidebar-search { display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.65rem; border-bottom: 1px solid var(--bulma-border-light); }
.sidebar-search-icon { flex-shrink: 0; color: var(--bulma-text-light); }
.sidebar-search-input { flex: 1; border: none; background: none; outline: none; font-size: 0.8em; color: var(--bulma-text); min-width: 0; &::placeholder { color: var(--bulma-text-light); } }
.sidebar-search-clear { background: none; border: none; cursor: pointer; font-size: 1em; line-height: 1; color: var(--bulma-text-light); padding: 0 2px; &:hover { color: var(--bulma-text); } }
.sidebar-empty { padding: 1.5rem; text-align: center; color: var(--bulma-text-light); .empty-icon { opacity: 0.3; margin-bottom: 0.5rem; } }
.sidebar-list { max-height: 400px; overflow-y: auto; }

.pinned-section { border-bottom: 1px solid var(--bulma-border-light); }
:root.is-dark-mode .pinned-section { border-bottom-color: var(--app-border); }
.pinned-header { display: flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.65rem; font-size: 0.65em; font-weight: 500; color: var(--bulma-text-light); }
.pinned-count { opacity: 0.5; }
.pinned-item { background: rgba(var(--bulma-primary-rgb, 99,102,241), 0.03); }

.group-header { display: flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.65rem; font-size: 0.7em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--bulma-text-light); cursor: pointer; user-select: none; &:hover { color: var(--bulma-text); } & + & { border-top: 1px solid var(--bulma-border-light); margin-top: 0.25rem; padding-top: 0.5rem; } &.is-dragover { background: rgba(99,102,241,0.1); outline: 2px dashed var(--bulma-primary); outline-offset: -2px; border-radius: 6px; } }
:root.is-dark-mode .group-header + .group-header { border-top-color: var(--app-border); }
.group-chevron { transition: transform 0.15s; flex-shrink: 0; &.is-open { transform: rotate(90deg); } }
.group-name { flex: 1; }
.group-count { font-size: 0.85em; opacity: 0.6; }
.group-menu-btn { background: none; border: none; padding: 2px; border-radius: 4px; cursor: pointer; color: var(--bulma-text-light); opacity: 0; display: flex; .group-header:hover & { opacity: 1; } &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); } }

.saved-item { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; cursor: pointer; transition: background 0.1s; &.is-dragging { opacity: 0.4; } &:hover, &.is-focused { background: var(--bulma-scheme-main-ter); } &.is-focused { outline: 2px solid var(--bulma-primary); outline-offset: -2px; } & + & { border-top: 1px solid var(--bulma-border-light); } }
:root.is-dark-mode .saved-item + .saved-item { border-top-color: var(--app-border); }
:root.is-dark-mode .sidebar-search { border-bottom-color: var(--app-border); }
.saved-item-left { display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 0; }
.saved-item-info { min-width: 0; }
.saved-item-name { display: block; font-size: 0.8em; font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
.saved-item-desc { display: block; font-size: 0.65em; color: var(--bulma-text-light); overflow: hidden; text-overflow: ellipsis; }
.saved-item-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.12s; flex-shrink: 0; .saved-item:hover & { opacity: 1; } .pinned-item & { opacity: 1; } @media (hover: none) { opacity: 1; } }

.icon-btn { background: none; border: none; padding: 0.25rem; border-radius: 6px; cursor: pointer; color: var(--bulma-text-light); display: flex; transition: all 0.1s; &:hover { background: var(--bulma-scheme-main-bis); color: var(--bulma-text); } &.is-primary:hover { color: var(--bulma-primary); } &.is-danger:hover { color: var(--bulma-danger); } &.is-pinned { color: var(--bulma-warning); } &.is-pinned:hover { color: var(--bulma-text-light); } }

.drop-zone { height: 3px; margin: 0 0.75rem; border-radius: 2px; background: var(--bulma-primary); }

.context-menu { position: fixed; z-index: 2000; min-width: 160px; background: var(--bulma-scheme-main); border: 1px solid var(--bulma-border-light); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); overflow: hidden; }
:root.is-dark-mode .context-menu { background: var(--app-surface); border-color: var(--app-border); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
.context-item { display: flex; align-items: center; padding: 0.45rem 0.65rem; font-size: 0.75em; cursor: pointer; &:hover { background: var(--bulma-scheme-main-bis); } &.is-danger { color: var(--bulma-danger); } }
:root.is-dark-mode .context-item { &:hover { background: var(--app-surface-hover); } }
.context-divider { height: 1px; background: var(--bulma-border-light); margin: 2px 0; }
:root.is-dark-mode .context-divider { background: var(--app-border); }

.rename-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 2001; }
.rename-dialog { background: var(--bulma-scheme-main); border-radius: 12px; padding: 1rem; width: 320px; }
:root.is-dark-mode .rename-dialog { background: var(--app-surface); }
.rename-dialog h4 { margin: 0 0 0.5rem; font-size: 0.9em; }
.rename-input { width: 100%; padding: 0.4rem 0.5rem; border: 1px solid var(--bulma-border); border-radius: 6px; font-size: 0.85em; background: var(--bulma-input-background-color); color: var(--bulma-text); outline: none; &:focus { border-color: var(--bulma-primary); } }
.rename-actions { display: flex; gap: 0.35rem; margin-top: 0.5rem; }
.rename-btn { flex: 1; border: none; border-radius: 6px; padding: 0.35rem; font-size: 0.8em; cursor: pointer; font-weight: 500; background: var(--bulma-primary); color: white; &.cancel { background: var(--bulma-border-light); color: var(--bulma-text); } }

@media (max-width: 768px) {
  .conn-layout { grid-template-columns: 1fr; gap: 1rem; }
  /* Termius-style: hosts list first, connection form below */
  .conn-sidebar { order: -1; }
  .conn-header { flex-direction: column; align-items: flex-start; gap: 0.25rem; }
  .sidebar-card { border-left: none; padding-left: 0; margin-left: 0; background: transparent; border: none; box-shadow: none; }
  .sidebar-card-header {
    background: transparent; border: none; padding: 0.4rem 0.25rem;
    font-size: 0.9em;
  }
  .sidebar-list { max-height: none; padding: 0.25rem; }
  .conn-view { overflow-y: auto; height: 100%; }

  /* Each host becomes a tappable rounded card */
  .saved-item {
    background: var(--bulma-box-background-color);
    border: 1px solid var(--bulma-border-light);
    border-radius: 14px;
    margin-bottom: 0.5rem;
    padding: 0.7rem 0.8rem;
    min-height: 58px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    & + .saved-item { border-top: 1px solid var(--bulma-border-light); }
    &:active { transform: scale(0.985); }
  }
  :root.is-dark-mode .saved-item { background: var(--app-surface); border-color: var(--app-border); }
  .pinned-section { padding: 0.25rem; }
  .pinned-item { margin-bottom: 0.5rem; }
  .saved-item-name { font-size: 0.95em; font-weight: 600; }
  .saved-item-desc { font-size: 0.75em; margin-top: 1px; }
  .saved-item-actions { opacity: 1; gap: 6px; }
  .icon-btn { padding: 0.5rem; border-radius: 10px; }
  .group-header { padding: 0.6rem 0.5rem 0.35rem; font-size: 0.72em; }
  .group-menu-btn { opacity: 1; padding: 8px; }
  .new-group-row { padding: 0.4rem 0.25rem; }
  .new-group-input { font-size: 16px; }
}
@media (max-width: 480px) {
  .conn-view { padding: 0.5rem; }
  .conn-header { margin-bottom: 0.75rem; }
}
</style>
