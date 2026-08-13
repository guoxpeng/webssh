<template>
  <div class="terminal-view app-page">
    <div class="terminal-toolbar">
      <div class="toolbar-left">
        <span class="toolbar-title">{{ t('terminal.title') }}</span>
        <span class="toolbar-session" v-if="paneCount > 0">
          {{ t('terminal.sessions', { count: paneCount }) }}
        </span>
      </div>
      <div class="toolbar-right">
        <button v-if="isRecording && paneCount > 0" class="toolbar-btn recording-indicator" @click="toggleRecording">
          <Circle :size="14" class="record-dot"/>
          <span>{{ formatElapsed(recordingElapsed) }}</span>
          <Square :size="12"/>
        </button>
        <button v-else-if="paneCount > 0" class="toolbar-btn" @click="toggleRecording" :title="t('macro.record')">
          <Circle :size="14"/>
        </button>
        <div class="dropdown-wrap" @click.stop>
          <button class="toolbar-btn" :class="{ 'is-active': showSftpPanel }" @click="toggleSftpPanel" :title="t('sftp.fileManager')">
            <FolderOpen :size="14"/>
            <span>{{ t('sftp.fileManager') }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="terminal-body">
      <div class="terminal-main-area" :class="{ 'has-sftp': showSftpPanel }">
        <div class="terminal-pane" :style="showSftpPanel ? { width: `calc(100% - ${sftpWidth}px)` } : {}">
          <SplitPaneTerminal ref="splitPaneRef" :style="{ display: paneCount > 0 ? '' : 'none' }" @add-tab="showConnPicker = true"/>
        </div>
        <div v-if="showSftpPanel" class="sftp-divider" @mousedown="startDrag">
          <GripVertical :size="12"/>
        </div>
        <div v-if="showSftpPanel" class="sftp-panel" :style="{ width: sftpWidth + 'px' }">
          <div class="sftp-panel-header">
            <FolderOpen :size="14"/>
            <span>{{ sftpPanelConfig ? sftpPanelConfig.host : t('sftp.noConnection') }}</span>
            <button class="sftp-panel-close" @click="showSftpPanel = false">&times;</button>
          </div>
          <SftpBrowser v-if="sftpPanelConfig" :node-config="sftpPanelConfig" @close="showSftpPanel = false"/>
          <div v-else class="sftp-panel-empty">
            <div class="empty-header">
              <FolderOpen :size="32" class="empty-icon"/>
              <h3>{{ t('sftp.noConnection') }}</h3>
              <p>{{ t('sftp.selectHint') }}</p>
            </div>
            <div v-if="savedConns.length > 0" class="history-list">
              <div class="history-title"><History :size="14"/><span>{{ t('terminal.recentConnections') }}</span></div>
              <div v-for="conn in savedConns" :key="conn.id" class="history-item" @click="quickConnect(conn)">
                <div class="history-icon" :class="`proto-${conn.protocol || 'ssh'}`">
                  <Terminal :size="14"/>
                </div>
                <div class="history-info">
                  <span class="history-name">{{ conn.name || conn.host }}</span>
                  <span class="history-meta">{{ conn.username }}@{{ conn.host }}:{{ conn.port }}</span>
                </div>
                <button class="history-go" :title="t('terminal.connect')">
                  <ChevronDown :size="14" class="go-arrow"/>
                </button>
              </div>
            </div>
            <router-link to="/" class="btn btn-primary" v-if="savedConns.length === 0">
              <Server :size="16"/> {{ t('sftp.selectConnection') }}
            </router-link>
          </div>
        </div>
      </div>
      <div v-if="paneCount === 0" class="terminal-empty">
        <div class="empty-header">
          <Terminal :size="32" class="empty-icon"/>
          <h3>{{ t('terminal.noSessions') }}</h3>
          <p>{{ t('terminal.noSessionsHint') }}</p>
        </div>
        <div v-if="savedConns.length > 0" class="history-list">
          <div class="history-title"><History :size="14"/><span>{{ t('terminal.recentConnections') }}</span></div>
          <div v-for="conn in savedConns" :key="conn.id" class="history-item" @click="quickConnect(conn)">
            <div class="history-icon" :class="`proto-${conn.protocol || 'ssh'}`">
              <Terminal :size="14"/>
            </div>
            <div class="history-info">
              <span class="history-name">{{ conn.name || conn.host }}</span>
              <span class="history-meta">{{ conn.username }}@{{ conn.host }}:{{ conn.port }}</span>
            </div>
            <button class="history-go" :title="t('terminal.connect')">
              <ChevronDown :size="14" class="go-arrow"/>
            </button>
          </div>
        </div>
        <router-link to="/" class="btn btn-primary" v-if="savedConns.length === 0">
          <Server :size="16"/> {{ t('sftp.selectConnection') }}
        </router-link>
      </div>
    </div>

    <div v-if="showConnPicker" class="conn-picker-overlay" @click.self="showConnPicker = false">
      <div class="conn-picker-panel">
        <div class="conn-picker-header">
          <span>{{ t('terminal.selectConnection') }}</span>
          <button class="conn-picker-close" @click="showConnPicker = false">&times;</button>
        </div>
        <div v-if="savedConns.length > 0" class="history-list">
          <div v-for="conn in savedConns" :key="conn.id" class="history-item" @click="quickConnect(conn); showConnPicker = false">
            <div class="history-icon" :class="`proto-${conn.protocol || 'ssh'}`">
              <Terminal :size="14"/>
            </div>
            <div class="history-info">
              <span class="history-name">{{ conn.name || conn.host }}</span>
              <span class="history-meta">{{ conn.username }}@{{ conn.host }}:{{ conn.port }}</span>
            </div>
          </div>
        </div>
        <div v-else class="conn-picker-empty">
          <router-link to="/" class="btn-primary" @click="showConnPicker = false">
            <Server :size="16"/> {{ t('sftp.selectConnection') }}
          </router-link>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :visible="showDisconnectDialog"
      :title="t('terminal.disconnectTitle')"
      :message="t('terminal.disconnectConfirm')"
      :confirm-text="t('terminal.disconnect')"
      :cancel-text="t('common.cancel')"
      @confirm="onDisconnectConfirmed"
      @cancel="showDisconnectDialog = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onActivated, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import SplitPaneTerminal from '@/components/terminal/SplitPaneTerminal.vue';
import SftpBrowser from '@/components/sftp/SftpBrowser.vue';
import ConfirmDialog from '@/components/global/ConfirmDialog.vue';
import { useConnectionStore } from '@/stores/connectionStore';
import { ConnectionStatus } from '@/utils/constants';
import { useTerminalStore } from '@/stores/terminalStore';
import { useMacroStore } from '@/stores/macroStore';
import { useNotifications } from '@/composables/useNotifications';
import { Terminal, Server, FolderOpen, ChevronDown, Circle, Square, History, GripVertical } from 'lucide-vue-next';

const { t } = useI18n();
const { showSuccess, showInfo } = useNotifications();
const connectionStore = useConnectionStore();
const terminalStore = useTerminalStore();
const macroStore = useMacroStore();
const router = useRouter();

const splitPaneRef = ref(null);
const showDisconnectDialog = ref(false);
const showConnPicker = ref(false);
const showSftpPanel = ref(false);
const sftpWidth = ref(500);
const dragging = ref(false);
let sftpResizeObserver = null;

const isRecording = ref(false);
const recordingSteps = ref([]);
const recordingStartTime = ref(0);
const recordingElapsed = ref(0);
let recordingTimer = null;

const savedConns = computed(() => connectionStore.savedConnections.slice(0, 8));

async function quickConnect(conn) {
  const remembered = await connectionStore.getCredentialFromSessionStorage(conn.id);
  if (remembered?.auth_value) {
    const full = { ...conn, auth_type: remembered.auth_type, auth_value: remembered.auth_value, rememberForSession: true };
    const saved = connectionStore.addConnection(full);
    connectionStore.setCurrentNodeDetails({ ...full, id: saved.id });
    connectionStore.pendingConnections.push({ ...full, id: saved.id });
    if (connectionStore.pendingConnections.length > 0) processPendingConnections();
  } else {
    router.push({ name: 'ConnectionHome', query: { edit: conn.id } });
  }
}

function toggleRecording() {
  if (isRecording.value) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  recordingSteps.value = [];
  recordingStartTime.value = Date.now();
  recordingElapsed.value = 0;
  isRecording.value = true;
  connectionStore.setOnCommandSentCallback(onCommandSent);
  recordingTimer = setInterval(() => {
    recordingElapsed.value = Date.now() - recordingStartTime.value;
  }, 200);
  showInfo(t('macro.recordingStarted'));
}

function stopRecording() {
  isRecording.value = false;
  connectionStore.setOnCommandSentCallback(null);
  if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
  if (recordingSteps.value.length === 0) return;
  const name = prompt(t('macro.recordName') || 'Name your macro', 'Macro ' + (macroStore.macros.length + 1));
  if (!name) return;
  macroStore.addMacro({
    name,
    description: '',
    steps: recordingSteps.value.map(s => ({ command: s.text, delay: s.delay })),
    tags: [],
    favorite: false,
  });
  recordingSteps.value = [];
  showSuccess(t('macro.recordingStopped'));
}

function onCommandSent(text) {
  if (!isRecording.value) return;
  const now = Date.now();
  const delay = recordingSteps.value.length === 0 ? 0 : now - recordingStartTime.value;
  recordingSteps.value.push({ text, delay });
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m${sec}s` : `${sec}s`;
}

const paneCount = computed(() => splitPaneRef.value?.panes?.length || 0);

const sftpPanelConfig = computed(() => {
  const panes = splitPaneRef.value?.panes;
  if (!panes?.length) return null;
  const idx = splitPaneRef.value?.activePane ?? 0;
  const pane = panes[idx];
  if (pane?.type !== 'terminal') return null;
  return pane?.config || null;
});

function toggleSftpPanel() {
  if (!sftpPanelConfig.value) return;
  showSftpPanel.value = !showSftpPanel.value;
  if (showSftpPanel.value) {
    nextTick(() => {
      const container = document.querySelector('.terminal-main-area');
      if (container) sftpWidth.value = Math.min(500, Math.max(180, Math.round(container.offsetWidth / 3)));
    });
  }
}

function processPendingConnections() {
  if (connectionStore.pendingConnections.length === 0) return;
  const configs = connectionStore.pendingConnections.splice(0);
  const panes = [];
  for (const cfg of configs) {
    if (cfg.id && cfg.auth_value) {
      connectionStore.saveCredentialToSessionStorage(cfg.id, cfg.auth_type || 'password', cfg.auth_value).catch(() => {});
    }
    splitPaneRef.value?.addTerminalPane(cfg);
    panes.push({ type: 'terminal', protocol: cfg.protocol || 'ssh', config: { ...cfg }, name: cfg.name || cfg.host });
  }
  if (panes.length > 0) terminalStore.setPaneConfigs(panes);
}

function onDisconnectConfirmed() {
  showDisconnectDialog.value = false;
  terminalStore.clearAll();
  terminalStore.clearPaneConfigs();
  router.push({ name: 'ConnectionHome' });
}

function startDrag(e) {
  dragging.value = true;
  const startX = e.clientX;
  const startW = sftpWidth.value;
  function onMove(ev) {
    const diff = startX - ev.clientX;
    sftpWidth.value = Math.max(180, Math.min(500, startW + diff));
  }
  function onUp() {
    dragging.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

onMounted(() => {
  connectionStore.setConnectionStatus(ConnectionStatus.CONNECTING);
  processPendingConnections();
  // Reset connecting status if no sessions were created (e.g. credentials missing)
  if (connectionStore.pendingConnections.length === 0 && (splitPaneRef.value?.panes?.length || 0) === 0) {
    const saved = terminalStore.paneConfigs;
    if (saved.length === 0) connectionStore.setConnectionStatus(ConnectionStatus.DISCONNECTED);
  }
  // Restore saved pane configs if no pending connections were processed
  const saved = terminalStore.paneConfigs;
  if (saved.length > 0 && (splitPaneRef.value?.panes?.length || 0) === 0) {
    for (const pane of saved) {
      splitPaneRef.value?.addTerminalPane(pane.config);
    }
  }
  const area = document.querySelector('.terminal-main-area');
  if (area) {
    sftpResizeObserver = new ResizeObserver(() => {
      const avail = area.offsetWidth;
      const oneThird = Math.round(avail / 3);
      const thresholdShow = oneThird >= 200;
      const thresholdHide = oneThird < 180;
      const hasConnected = splitPaneRef.value?.panes?.some(p => p.status === 'connected');
      if (thresholdHide && showSftpPanel.value) {
        showSftpPanel.value = false;
      } else if (thresholdShow && !showSftpPanel.value && hasConnected) {
        showSftpPanel.value = true;
        sftpWidth.value = Math.min(500, Math.max(180, oneThird));
      } else if (showSftpPanel.value) {
        sftpWidth.value = Math.min(500, Math.max(180, oneThird));
      }
    });
    sftpResizeObserver.observe(area);
  }
});
onActivated(() => {
  if (connectionStore.pendingConnections.length > 0) processPendingConnections();
});

watch(() => splitPaneRef.value?.panes, (panes) => {
  if (!panes) return;
  const connected = panes.some(p => p.status === 'connected');
  const container = document.querySelector('.terminal-main-area');
  const oneThird = container ? Math.round(container.offsetWidth / 3) : 0;
  if (connected && !showSftpPanel.value && oneThird >= 200) {
    showSftpPanel.value = true;
    nextTick(() => {
      if (container) sftpWidth.value = Math.min(500, Math.max(180, oneThird));
    });
  }
}, { deep: true, immediate: false });

onBeforeUnmount(() => {
  if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
  if (sftpResizeObserver) { sftpResizeObserver.disconnect(); sftpResizeObserver = null; }
  // Save active pane configs for restoration on return
  const panes = splitPaneRef.value?.panes;
  if (panes?.length > 0) {
    terminalStore.setPaneConfigs(panes.map(p => ({
      type: p.type,
      protocol: p.protocol,
      config: p.config,
      name: p.name,
      tabColor: p.tabColor || '',
    })));
  } else {
    terminalStore.clearPaneConfigs();
  }
});
</script>

<style lang="scss" scoped>
.terminal-view {
  display: flex; flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.terminal-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.35rem 0.75rem; flex-shrink: 0;
  border-bottom: 1px solid var(--bulma-border-light);
  background: var(--bulma-scheme-main-ter);
}
.toolbar-left { display: flex; align-items: center; gap: 0.75rem; }
.toolbar-title { font-size: 0.85em; font-weight: 600; }
.toolbar-session { font-size: 0.7em; color: var(--bulma-text-light); }
.toolbar-right { display: flex; align-items: center; gap: 0.5rem; }
.toolbar-btn {
  background: none; border: 1px solid var(--bulma-border-light); border-radius: 6px;
  padding: 0.3rem 0.5rem; cursor: pointer; color: var(--bulma-text-light); display: flex;
  align-items: center; gap: 0.3rem; transition: all 0.12s;
  &:hover { background: var(--bulma-scheme-main-bis); color: var(--bulma-text); }
  &.is-danger:hover { color: var(--bulma-danger); border-color: var(--bulma-danger); }
}
.recording-indicator {
  gap: 0.3rem; color: var(--bulma-danger); border-color: var(--bulma-danger);
  animation: recPulse 1.5s ease-in-out infinite;
  &:hover { background: hsl(350, 30%, 95%); }
}
.record-dot { animation: recBlink 1s step-end infinite; }
@keyframes recBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
@keyframes recPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255, 56, 96, 0.3); } 50% { box-shadow: 0 0 0 4px rgba(255, 56, 96, 0); } }

.terminal-body { flex: 1; min-height: 0; overflow: hidden; position: relative; }

.terminal-main-area {
  display: flex; height: 100%; min-height: 0;
}
.terminal-main-area.has-sftp .terminal-pane { flex: none; }
.terminal-pane { flex: 1; min-width: 0; min-height: 0; overflow: hidden; }

.sftp-panel {
  display: flex; flex-direction: column; background: var(--bulma-scheme-main);
  border-left: 1px solid var(--bulma-border);
  flex-shrink: 0; overflow: hidden;
}
.sftp-panel-header {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.65rem;
  font-size: 0.78em; font-weight: 500; border-bottom: 1px solid var(--bulma-border-light);
  background: var(--bulma-scheme-main-ter); flex-shrink: 0; color: var(--bulma-text);
}
.sftp-panel-close {
  margin-left: auto; background: none; border: none; font-size: 1.3em;
  cursor: pointer; color: var(--bulma-text-light); padding: 0; line-height: 1;
  &:hover { color: var(--bulma-danger); }
}
.sftp-divider {
  width: 4px; cursor: col-resize; flex-shrink: 0; background: transparent;
  display: flex; align-items: center; justify-content: center;
  color: var(--bulma-text-light); z-index: 1;
  &:hover { background: var(--bulma-border); color: var(--bulma-text); }
}
.conn-picker-overlay {
  position: fixed; inset: 0; z-index: 2000;
  display: flex; align-items: center; justify-content: center;
  background: transparent; pointer-events: none;
}
.conn-picker-panel { pointer-events: auto; }
.conn-picker-panel {
  background: var(--bulma-scheme-main); border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15); overflow: hidden;
  width: 400px; max-width: 90vw; max-height: 60vh; display: flex; flex-direction: column;
}
.conn-picker-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.7rem 0.85rem; border-bottom: 1px solid var(--bulma-border-light);
  font-size: 0.85em; font-weight: 600;
}
.conn-picker-close {
  background: none; border: none; font-size: 1.3em; cursor: pointer;
  color: var(--bulma-text-light); padding: 0; line-height: 1;
  &:hover { color: var(--bulma-danger); }
}
.conn-picker-empty {
  padding: 2rem; display: flex; justify-content: center;
}
.sftp-panel :deep(.sftp-browser) { flex: 1; overflow: hidden; border-radius: 0; border: none; }
.sftp-panel-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 1rem; padding: 2rem; overflow-y: auto;
  & .history-list { width: 100%; max-width: 320px; }
}

.terminal-empty {
  display: flex; flex-direction: column; align-items: center;
  height: 100%; padding: 2rem; gap: 1.5rem; overflow-y: auto;
}
.empty-header {
  display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
  .empty-icon { opacity: 0.15; }
  h3 { font-size: 1.1em; font-weight: 600; margin: 0; color: var(--bulma-text); }
  p { font-size: 0.85em; color: var(--bulma-text-light); margin: 0; }
}
.history-list {
  width: 100%; max-width: 420px;
}
.history-title {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.75em; font-weight: 600; color: var(--bulma-text-light);
  text-transform: uppercase; letter-spacing: 0.05em;
  margin-bottom: 0.6rem; padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--bulma-border-light);
}
.history-item {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.55rem 0.65rem; border-radius: 8px;
  cursor: pointer; transition: all 0.12s;
  &:hover { background: var(--bulma-scheme-main-bis); }
  &:active { transform: scale(0.98); }
  & + .history-item { margin-top: 2px; }
}
.history-icon {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  background: color-mix(in srgb, var(--bulma-success) 18%, transparent);
  color: var(--bulma-success);
  &.proto-rdp { background: color-mix(in srgb, var(--bulma-info) 18%, transparent); color: var(--bulma-info); }
  &.proto-vnc { background: color-mix(in srgb, var(--bulma-primary) 18%, transparent); color: var(--bulma-primary); }
  &.proto-telnet { background: color-mix(in srgb, var(--bulma-warning) 18%, transparent); color: var(--bulma-warning); }
}
.history-info {
  flex: 1; min-width: 0;
  .history-name { display: block; font-size: 0.85em; font-weight: 500; color: var(--bulma-text); }
  .history-meta { display: block; font-size: 0.7em; color: var(--bulma-text-light); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.history-go {
  background: none; border: none; padding: 0.25rem; border-radius: 6px;
  cursor: pointer; color: var(--bulma-text-light); display: flex;
  transition: all 0.12s; opacity: 0;
  .history-item:hover & { opacity: 1; }
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-primary); }
  .go-arrow { transform: rotate(-90deg); }
}
.btn-primary {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85em; font-weight: 500;
  background: linear-gradient(135deg, hsl(235,40%,45%), hsl(235,50%,58%));
  color: white; text-decoration: none; transition: all 0.15s;
  &:hover { box-shadow: 0 4px 16px rgba(99,102,241,0.3); transform: translateY(-1px); color: white; }
}

@media (max-width: 768px) {
  .terminal-view {
    height: 100%;
  }
  .terminal-toolbar { padding: 0.25rem 0.5rem; }
  .toolbar-title { font-size: 0.8em; }
  :deep(.split-pane-container) { flex-direction: column; }
  :deep(.pane-tab) { font-size: 0.75rem; }
}
</style>
