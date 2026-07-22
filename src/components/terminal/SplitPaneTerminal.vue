<template>
  <div class="split-pane-terminal">
    <div class="pane-toolbar">
      <div class="pane-tabs">
        <button v-for="(pane, idx) in panes" :key="pane.id"
                class="pane-tab"
                :class="{ 'is-active': idx === activePane, 'is-dragging': dragPaneIndex === idx, 'is-dragover': dragOverPaneIndex === idx }"
                :style="pane.tabColor ? { '--tab-color': pane.tabColor, borderTop: `2px solid ${pane.tabColor}` } : {}"
                @click="activePane = idx"
                @contextmenu.prevent.stop="showTabMenu($event, idx)"
                draggable="true"
                @dragstart="onTabDragStart($event, idx)"
                @dragover.prevent="onTabDragOver($event, idx)"
                @dragleave="onTabDragLeave"
                @drop.prevent="onTabDrop(idx)"
                @dragend="onTabDragEnd">
          <GripVertical :size="10" class="pane-tab-grip"/>
          <span v-if="pane.tabColor" class="pane-tab-dot" :style="{ background: pane.tabColor }"></span>
          <ProtocolBadge :protocol="pane.protocol" class="mr-1"/>
          <span v-if="renamingIdx !== idx" class="pane-tab-label" @dblclick.stop="startRename(idx)">{{ pane.name }}</span>
          <input v-else ref="renameInput" type="text" :value="pane.name"
                 class="pane-tab-rename-input"
                 @blur="finishRename(idx, $event)" @keydown.enter="finishRename(idx, $event)"
                 @keydown.escape="renamingIdx = null"/>
          <span class="pane-tab-status" :class="`is-${pane.status}`"></span>
          <button class="pane-tab-close" @click.stop="closePane(idx)" v-if="panes.length > 1">&times;</button>
        </button>
        <span v-if="dragOverPaneIndex !== null" class="pane-tab-drop-indicator" :style="{ left: `${dragOverLeft}px` }"/>
      </div>
      <div class="pane-toolbar-actions">
        <button class="pane-hint-btn" :title="t('terminal.tabShortcut')" @click="showTabHint = !showTabHint">
          <GripHorizontal :size="13"/>
        </button>
      </div>
    </div>
    <div v-if="tabMenuVisible" class="tab-color-menu" :style="tabMenuStyle" @click.stop>
      <div class="tab-color-title">{{ t('terminal.tabColor') }}</div>
      <div class="tab-color-grid">
        <button v-for="c in tabColors" :key="c" class="tab-color-swatch"
                :style="{ background: c }" :title="c"
                @click="setTabColor(activeMenuIdx, c)"/>
        <button class="tab-color-swatch is-none" @click="setTabColor(activeMenuIdx, '')">
          <X :size="10"/>
        </button>
      </div>
      <div class="tab-color-actions">
        <button class="tab-rename-btn" @click="startRename(activeMenuIdx)">{{ t('terminal.renameTab') }}</button>
        <button v-if="panes.length > 1" class="tab-close-btn" @click="closePane(activeMenuIdx)">{{ t('common.close') }}</button>
      </div>
    </div>
    <div class="pane-body">
      <template v-for="(pane, idx) in panes" :key="pane.id">
        <div v-show="idx === activePane" class="pane-content">
          <TerminalDisplay :node-config="pane.config" :term-settings="pane.termSettings" v-if="pane.type === 'terminal' && pane.status !== 'error'"
                           @status-change="(s) => onPaneStatus(idx, s)"
                           @error-message="(m) => onPaneError(idx, m)"
                           @shell-exit="onShellExit(idx)"/>
          <ConnectionErrorPanel v-else-if="pane.type === 'terminal' && pane.status === 'error'"
                                :config="pane.config" :message="pane.lastError"
                                @retry="retryPane(idx)"
                                @edit="editPane(idx)"
                                @close="closePane(idx)"/>
          <SftpBrowser v-else-if="pane.type === 'sftp'" :node-config="pane.config" @close="closePane(idx)"/>
          <DockerPanel v-else-if="pane.type === 'docker'" :session-id="pane.id" @close="closePane(idx)"/>
          <ProtocolInfoPanel v-else-if="pane.type === 'info'" :protocol="pane.protocol" :config="pane.config"/>
          <div v-else class="pane-empty">
            <component :is="protocolIcon(pane.protocol)" :size="32" class="pane-empty-icon"/>
            <p>{{ t('terminal.paneSession', { protocol: pane.protocol.toUpperCase(), name: pane.name }) }}</p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useNotifications } from '@/composables/useNotifications';
import { useConnectionStore } from '@/stores/connectionStore';
import TerminalDisplay from './TerminalDisplay.vue';
import ConnectionErrorPanel from './ConnectionErrorPanel.vue';
import SftpBrowser from '@/components/sftp/SftpBrowser.vue';
import ProtocolInfoPanel from './ProtocolInfoPanel.vue';
import DockerPanel from '@/components/docker/DockerPanel.vue';
import ProtocolBadge from '@/components/global/ProtocolBadge.vue';
import { Terminal, Monitor, Video, Wifi, GripVertical, GripHorizontal } from 'lucide-vue-next';

const { t } = useI18n();
const router = useRouter();
const panes = ref([]);
const activePane = ref(0);
const showTabHint = ref(false);

const tabColors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];
const tabMenuVisible = ref(false);
const tabMenuStyle = ref({});
const activeMenuIdx = ref(0);
const renamingIdx = ref(null);

function showTabMenu(e, idx) {
  activeMenuIdx.value = idx;
  tabMenuStyle.value = { top: e.clientY + 'px', left: e.clientX + 'px' };
  tabMenuVisible.value = true;
  document.addEventListener('click', () => tabMenuVisible.value = false, { once: true });
}
function setTabColor(idx, color) {
  if (panes.value[idx]) { panes.value[idx].tabColor = color || ''; panes.value = [...panes.value]; }
  tabMenuVisible.value = false;
}
function startRename(idx) {
  tabMenuVisible.value = false;
  renamingIdx.value = idx;
  nextTick(() => {
    const inp = document.querySelector('.pane-tab-rename-input');
    if (inp) { inp.focus(); inp.select(); }
  });
}
function finishRename(idx, e) {
  if (e.type === 'blur' && e.currentTarget) {
    panes.value[idx].name = e.currentTarget.value.trim() || panes.value[idx].name;
  } else if (e.type === 'keydown' && e.key === 'Enter') {
    panes.value[idx].name = e.target.value.trim() || panes.value[idx].name;
    e.target.blur();
  }
  panes.value = [...panes.value];
  renamingIdx.value = null;
}

const dragPaneIndex = ref(null);
const dragOverPaneIndex = ref(null);
const dragOverLeft = ref(0);
let pinchBaseFontSize = 13;
let pinchInitialDistance = 0;

function protocolIcon(p) {
  const m = { ssh: Terminal, rdp: Monitor, vnc: Video, telnet: Wifi };
  return m[p] || Terminal;
}

function addPane(type, protocol, config) {
  const id = `pane-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
  panes.value.push({
    id, name: config?.host ? `${config.username}@${config.host}` : `${protocol.toUpperCase()} ${panes.value.length + 1}`,
    protocol, type, config: config || null, status: 'disconnected', lastError: ''
  });
  activePane.value = panes.value.length - 1;
}

let sftpOpening = false;
async function openSftpForActivePane() {
  if (sftpOpening) return;
  const pane = panes.value[activePane.value];
  if (!pane || !pane.config) return;

  // If an SFTP pane already exists, update it to follow the active terminal
  const existingSftp = panes.value.find(p => p.type === 'sftp');
  if (existingSftp) {
    const idx = panes.value.indexOf(existingSftp);
    await syncSftpConfig(existingSftp, pane);
    if (idx !== activePane.value) {
      activePane.value = idx;
    }
    return;
  }

  sftpOpening = true;
  const connStore = useConnectionStore();
  const cfg = { ...pane.config };
  if (!cfg.auth_value && cfg.id) {
    try {
      const cred = await connStore.getCredentialFromSessionStorage(cfg.id);
      if (cred?.auth_value) { cfg.auth_value = cred.auth_value; cfg.auth_type = cred.auth_type || 'password'; }
    } catch {}
  }
  if (cfg.auth_value && cfg.id) {
    connStore.saveCredentialToSessionStorage(cfg.id, cfg.auth_type || 'password', cfg.auth_value).catch(() => {});
  }
  addPane('sftp', pane.protocol || 'ssh', cfg);
  sftpOpening = false;
}

async function syncSftpConfig(sftpPane, terminalPane) {
  const connStore = useConnectionStore();
  const newCfg = { ...terminalPane.config };
  if (!newCfg.auth_value && newCfg.id) {
    try {
      const cred = await connStore.getCredentialFromSessionStorage(newCfg.id);
      if (cred?.auth_value) { newCfg.auth_value = cred.auth_value; newCfg.auth_type = cred.auth_type || 'password'; }
    } catch {}
  }
  sftpPane.config = newCfg;
  panes.value = [...panes.value];
}

function closePane(idx) {
  if (panes.value.length <= 1) return;
  panes.value.splice(idx, 1);
  if (activePane.value >= panes.value.length) activePane.value = panes.value.length - 1;
  sftpOpening = false;
}

function onPaneStatus(idx, status) {
  if (panes.value[idx]) panes.value[idx].status = status;
}
function onPaneError(idx, message) {
  if (panes.value[idx]) panes.value[idx].lastError = message;
}
function retryPane(idx) {
  const pane = panes.value[idx];
  if (!pane) return;
  pane.status = 'disconnected';
  pane.lastError = '';
}
function editPane(idx) {
  const pane = panes.value[idx];
  if (!pane || !pane.config) return;
  const host = pane.config.host || '';
  const { showInfo } = useNotifications();
  showInfo(t('form.loadedForEditing', { name: pane.config.name || host }));
}

function onShellExit(idx) {
  setTimeout(() => closePane(idx), 1500);
}

function updateTerminalSettings(opts) {
  const pane = panes.value[activePane.value];
  if (!pane || pane.type !== 'terminal') return;
  pane.termSettings = { ...(pane.termSettings || {}), ...opts };
  panes.value = [...panes.value];
}

function onTabDragStart(e, idx) { dragPaneIndex.value = idx; e.dataTransfer.effectAllowed = 'move'; }
function onTabDragOver(e, idx) {
  e.preventDefault();
  if (dragPaneIndex.value === null || dragPaneIndex.value === idx) return;
  dragOverPaneIndex.value = idx;
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  dragOverLeft.value = e.clientX < rect.left + rect.width / 2 ? rect.left : rect.right;
}
function onTabDragLeave() { dragOverPaneIndex.value = null; }
function onTabDrop(idx) {
  if (dragPaneIndex.value === null || dragPaneIndex.value === idx) return;
  const [pane] = panes.value.splice(dragPaneIndex.value, 1);
  panes.value.splice(idx, 0, pane);
  if (activePane.value === dragPaneIndex.value) activePane.value = idx;
  else if (activePane.value > dragPaneIndex.value && activePane.value <= idx) activePane.value--;
  else if (activePane.value < dragPaneIndex.value && activePane.value >= idx) activePane.value++;
  dragPaneIndex.value = null;
  dragOverPaneIndex.value = null;
}
function onTabDragEnd() { dragPaneIndex.value = null; dragOverPaneIndex.value = null; }

function switchToNext() {
  if (panes.value.length < 2) return;
  activePane.value = (activePane.value + 1) % panes.value.length;
}
function switchToPrev() {
  if (panes.value.length < 2) return;
  activePane.value = activePane.value === 0 ? panes.value.length - 1 : activePane.value - 1;
}
function switchToDirection(delta) {
  if (panes.value.length < 2) return;
  activePane.value = ((activePane.value + delta) % panes.value.length + panes.value.length) % panes.value.length;
}

let keyHandler = null;
function onKeyDown(e) {
  if (!document.querySelector('.split-pane-terminal')?.contains(document.activeElement) &&
      !document.querySelector('.xterm')?.contains(document.activeElement)) return;
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    e.shiftKey ? switchToPrev() : switchToNext();
  }
  if (e.ctrlKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
    e.preventDefault();
    switchToDirection(e.key === 'PageDown' ? 1 : -1);
  }
}
function setupKeyboard() {
  document.addEventListener('keydown', onKeyDown);
  keyHandler = onKeyDown;
}

let touchHandler = null;
function setupPinchZoom() {
  touchHandler = (e) => {
    if (e.touches.length !== 2) return;
    const a = e.touches[0]; const b = e.touches[1];
    const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    if (!pinchInitialDistance) { pinchInitialDistance = dist; pinchBaseFontSize = 13; return; }
    const scale = dist / pinchInitialDistance;
    let newSize = Math.max(9, Math.min(22, Math.round(pinchBaseFontSize * scale)));
    const pane = panes.value[activePane.value];
    if (pane && pane.type === 'terminal') {
      pane.termSettings = { ...(pane.termSettings || {}), fontSize: newSize };
      panes.value = [...panes.value];
    }
  };
  document.addEventListener('touchmove', touchHandler, { passive: true });
  document.addEventListener('touchend', () => { pinchInitialDistance = 0; pinchBaseFontSize = 13; });
}
function cleanupTouch() {
  if (touchHandler) { document.removeEventListener('touchmove', touchHandler); touchHandler = null; }
}

onMounted(() => { setupKeyboard(); setupPinchZoom(); });

watch(activePane, (idx) => {
  const pane = panes.value[idx];
  if (!pane || pane.type !== 'terminal' || !pane.config) return;
  for (const p of panes.value) {
    if (p.type === 'sftp') {
      p.config = { ...pane.config };
      break;
    }
  }
  panes.value = [...panes.value];
});
onBeforeUnmount(() => { if (keyHandler) document.removeEventListener('keydown', keyHandler); cleanupTouch(); });

defineExpose({ panes, activePane, addPane,
  addTerminalPane: (config) => {
    const proto = (config?.protocol || 'ssh').toLowerCase();
    if (proto === 'rdp' || proto === 'vnc') {
      addPane('info', proto, config);
    } else {
      addPane('terminal', proto, config);
    }
  },
  getPaneTypes: () => panes.value.map(p => p.type),
  updateTerminalSettings,
  openSftpForActivePane,
  switchToNext, switchToPrev,
});
</script>

<style lang="scss" scoped>
.split-pane-terminal {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
}
.pane-toolbar {
  display: flex; align-items: center;
  background: var(--bulma-scheme-main-ter);
  border-bottom: 1px solid var(--bulma-border-light);
  min-height: 36px; flex-shrink: 0;
}
.pane-toolbar-actions { display: flex; align-items: center; padding-right: 0.25rem; }
.pane-hint-btn {
  background: none; border: none; padding: 0.3rem; border-radius: 4px; cursor: pointer;
  color: var(--bulma-text-light); display: flex; opacity: 0.3; transition: opacity 0.1s;
  &:hover { opacity: 0.7; background: var(--bulma-scheme-main-bis); }
}
.pane-tab-drop-indicator {
  position: absolute; bottom: 2px; width: 2px; height: calc(100% - 4px);
  background: var(--bulma-primary); z-index: 5; border-radius: 1px; pointer-events: none;
}
.pane-tabs {
  display: flex; align-items: stretch; flex: 1; overflow-x: auto;
  gap: 1px; padding: 0 0.25rem;
  &::-webkit-scrollbar { height: 2px; }
}
.pane-tab {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0.35rem 0.65rem; font-size: 0.75em;
  border: none; border-radius: 6px 6px 0 0;
  background: transparent; color: var(--bulma-text-light);
  cursor: pointer; white-space: nowrap;
  position: relative; margin: 2px 1px 0;
  transition: background 0.12s, color 0.12s, box-shadow 0.12s;
  &:hover { color: var(--bulma-text); background: var(--bulma-scheme-main-bis); }
  &.is-active {
    color: var(--bulma-text-strong); background: var(--bulma-scheme-main);
    font-weight: 500; box-shadow: 0 -1px 4px rgba(0,0,0,0.06), 0 1px 0 var(--bulma-scheme-main);
  }
  &.is-dragging { opacity: 0.35; }
  &.is-dragover { outline: 2px dashed var(--bulma-primary); outline-offset: -2px; }
}
.pane-tab-label { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
.pane-tab-grip {
  opacity: 0; color: var(--bulma-text-light); cursor: grab;
  .pane-tab:hover & { opacity: 0.5; }
}
.pane-tab-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
.pane-tab-status {
  width: 6px; height: 6px; border-radius: 50%;
  &.is-connected { background: var(--bulma-success); }
  &.is-connecting { background: var(--bulma-info); }
  &.is-error { background: var(--bulma-danger); }
  &.is-disconnected { background: var(--bulma-border); }
}
.pane-tab-close {
  background: none; border: none; font-size: 1.1em; line-height: 1; padding: 0 2px;
  color: var(--bulma-text-light); cursor: pointer; opacity: 0;
  .pane-tab:hover & { opacity: 1; }
  &:hover { color: var(--bulma-danger); }
}
.pane-body { flex: 1; overflow: hidden; position: relative; }
.pane-content { position: absolute; inset: 0; overflow: hidden; }
.pane-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; opacity: 0.4; gap: 0.5rem;
}
.pane-empty-icon { opacity: 0.3; }

.tab-color-menu {
  position: fixed; z-index: 2100; min-width: 180px;
  background: var(--bulma-scheme-main); border: 1px solid var(--bulma-border-light);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); overflow: hidden; padding: 0.4rem;
}
.tab-color-title { font-size: 0.7em; font-weight: 500; color: var(--bulma-text-light); padding: 0.2rem 0.35rem; }
.tab-color-grid { display: flex; flex-wrap: wrap; gap: 4px; padding: 0.3rem; }
.tab-color-swatch {
  width: 22px; height: 22px; border-radius: 4px; border: 1px solid var(--bulma-border-light);
  cursor: pointer; transition: transform 0.1s;
  &:hover { transform: scale(1.2); }
  &.is-none { background: var(--bulma-scheme-main-ter); display: flex; align-items: center; justify-content: center; color: var(--bulma-text-light); }
}
.tab-color-actions { display: flex; gap: 0.25rem; border-top: 1px solid var(--bulma-border-light); padding-top: 0.3rem; margin-top: 0.2rem; }
.tab-rename-btn, .tab-close-btn {
  flex: 1; border: none; border-radius: 4px; padding: 0.25rem; font-size: 0.7em; cursor: pointer;
  background: var(--bulma-scheme-main-ter); color: var(--bulma-text);
}
.tab-close-btn { color: var(--bulma-danger); }

.pane-tab-rename-input {
  max-width: 120px; border: 1px solid var(--bulma-primary); border-radius: 4px;
  padding: 0.1rem 0.3rem; font-size: 0.75em; background: var(--bulma-input-background-color);
  color: var(--bulma-text); outline: none; min-width: 60px;
}
</style>
