<template>
  <div class="terminal-view app-page">
    <div class="terminal-toolbar">
      <div class="toolbar-left">
        <span class="toolbar-title">{{ t('terminal.title') }}</span>
        <span class="toolbar-session" v-if="paneCount > 0">
          {{ t('terminal.sessions', { count: paneCount }) }}
        </span>
      </div>
      <div class="toolbar-right" v-if="paneCount > 0">
        <button v-if="isRecording" class="toolbar-btn recording-indicator" @click="toggleRecording">
          <Circle :size="14" class="record-dot"/>
          <span>{{ formatElapsed(recordingElapsed) }}</span>
          <Square :size="12"/>
        </button>
        <button v-else class="toolbar-btn" @click="toggleRecording" :title="t('macro.record')">
          <Circle :size="14"/>
        </button>
        <div class="settings-wrap" @click.stop>
          <button class="toolbar-btn" @click="showTermSettings = !showTermSettings" :title="t('terminal.terminalSettings')">
            <Settings2 :size="14"/>
          </button>
          <TerminalSettingsPanel v-if="showTermSettings"
            :font-size="termFontSize" :cursor-style="termCursorStyle" :cursor-blink="termCursorBlink"
            :theme-id="termThemeId"
            @update="onTermSettingsUpdate"/>
        </div>
        <div class="dropdown-wrap" @click.stop>
          <button class="toolbar-btn" :class="{ 'is-active': showSftpPanel }" @click="showSftpPanel = !showSftpPanel" :title="t('sftp.fileManager')">
            <FolderOpen :size="14"/>
            <span>{{ t('sftp.fileManager') }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="terminal-body">
      <div class="terminal-main-area" :class="{ 'has-sftp': showSftpPanel }">
        <div class="terminal-pane" :style="showSftpPanel ? { width: `calc(100% - ${sftpWidth}px)` } : {}">
          <SplitPaneTerminal ref="splitPaneRef" :style="{ display: paneCount > 0 ? '' : 'none' }"/>
        </div>
        <div v-if="showSftpPanel" class="sftp-divider" @mousedown="startDrag">
          <GripVertical :size="12"/>
        </div>
        <div v-if="showSftpPanel && sftpPanelConfig" class="sftp-panel" :style="{ width: sftpWidth + 'px' }">
          <div class="sftp-panel-header">
            <FolderOpen :size="14"/>
            <span>{{ sftpPanelConfig.host }}</span>
            <button class="sftp-panel-close" @click="showSftpPanel = false">&times;</button>
          </div>
          <SftpBrowser :key="sftpPanelKey" :node-config="sftpPanelConfig" @close="showSftpPanel = false"/>
        </div>
      </div>
      <div v-if="connecting && paneCount === 0" class="connecting-overlay">
        <div class="connecting-anim">
          <div class="anim-track"></div>
          <div class="anim-fill" :style="{ width: progressPct + '%' }"></div>
          <div class="anim-dot" :style="{ left: progressPct + '%' }"></div>
        </div>
        <p class="connecting-text">{{ t('status.connecting') }}</p>
      </div>
      <div v-if="paneCount === 0 && !connecting" class="terminal-empty">
        <Terminal :size="48" class="empty-icon"/>
        <h3>{{ t('terminal.noSessions') }}</h3>
        <p>{{ t('terminal.noSessionsHint') }}</p>
        <router-link to="/" class="btn btn-primary">
          <Server :size="16"/> {{ t('terminal.goToServers') }}
        </router-link>
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
import { ref, computed, watch, onActivated, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import SplitPaneTerminal from '@/components/terminal/SplitPaneTerminal.vue';
import SftpBrowser from '@/components/sftp/SftpBrowser.vue';
import TerminalSettingsPanel from '@/components/terminal/TerminalSettingsPanel.vue';
import ConfirmDialog from '@/components/global/ConfirmDialog.vue';
import { useConnectionStore } from '@/stores/connectionStore';
import { useTerminalStore } from '@/stores/terminalStore';
import { useMacroStore } from '@/stores/macroStore';
import { Power, Terminal, Server, FolderOpen, ChevronDown, Circle, Square, Settings2, GripVertical } from 'lucide-vue-next';

const { t } = useI18n();
const connectionStore = useConnectionStore();
const terminalStore = useTerminalStore();
const macroStore = useMacroStore();
const router = useRouter();

const splitPaneRef = ref(null);
const showDisconnectDialog = ref(false);
const showTermSettings = ref(false);
const showSftpPanel = ref(false);
const sftpPanelKey = ref(0);
const sftpWidth = ref(360);
let dragging = false;
const connecting = ref(false);
const progressPct = ref(0);
let progressTimer = null;

const isRecording = ref(false);
const recordingSteps = ref([]);
const recordingStartTime = ref(0);
const recordingElapsed = ref(0);
let recordingTimer = null;

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
  return pane?.config || null;
});

watch(sftpPanelConfig, () => { if (showSftpPanel.value) sftpPanelKey.value++; });

function toggleSftpPanel() {
  if (sftpPanelConfig.value) {
    showSftpPanel.value = !showSftpPanel.value;
    if (showSftpPanel.value) sftpPanelKey.value++;
  }
}

function startProgress() {
  connecting.value = true;
  progressPct.value = 0;
  let p = 0;
  const step = () => {
    if (p >= 85) return;
    p += Math.random() * 3 + 0.5;
    if (p > 85) p = 85;
    progressPct.value = p;
    progressTimer = setTimeout(step, 200 + Math.random() * 300);
  };
  step();
}

function completeProgress() {
  if (progressTimer) { clearTimeout(progressTimer); progressTimer = null; }
  progressPct.value = 100;
  setTimeout(() => { connecting.value = false; }, 400);
}

function processPendingConnections() {
  if (connectionStore.pendingConnections.length === 0) return;
  const configs = connectionStore.pendingConnections.splice(0);
  for (const cfg of configs) {
    if (cfg.id && cfg.auth_value) {
      connectionStore.saveCredentialToSessionStorage(cfg.id, cfg.auth_type || 'password', cfg.auth_value).catch(() => {});
    }
    splitPaneRef.value?.addTerminalPane(cfg);
  }
  startProgress();
  setTimeout(() => {
    if (connecting.value) completeProgress();
  }, 2500);
}

function onDisconnectConfirmed() {
  showDisconnectDialog.value = false;
  terminalStore.clearAll();
  router.push({ name: 'ConnectionHome' });
}

const termFontSize = ref(13);
const termCursorStyle = ref('block');
const termCursorBlink = ref(true);
const termThemeId = ref('default');
function onTermSettingsUpdate(opts) {
  termFontSize.value = opts.fontSize;
  termCursorStyle.value = opts.cursorStyle;
  termCursorBlink.value = opts.cursorBlink;
  termThemeId.value = opts.themeId || 'default';
  splitPaneRef.value?.updateTerminalSettings?.(opts);
}

function onDocClick() { showTermSettings.value = false; }

function startDrag(e) {
  e.preventDefault();
  dragging = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  const onMove = (ev) => {
    if (!dragging) return;
    const bodyWidth = document.querySelector('.terminal-body')?.offsetWidth || 1200;
    const x = ev.clientX;
    const panelRight = bodyWidth;
      const newWidth = Math.max(200, Math.min(600, panelRight - x));
      sftpWidth.value = newWidth;
      window.dispatchEvent(new Event('resize'));
  };
  const onUp = () => {
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function restoreSavedLayout() {
  const saved = terminalStore.restoreLayout();
  if (saved.length === 0) return;
  for (const item of saved) {
    if (item.config) {
      splitPaneRef.value?.addTerminalPane(item.config);
    }
  }
  if (saved.length > 0) {
    startProgress();
    setTimeout(() => { if (connecting.value) completeProgress(); }, 2500);
  }
}

onMounted(() => {
  processPendingConnections();
  if (connectionStore.pendingConnections.length === 0) restoreSavedLayout();
  document.addEventListener('click', onDocClick);
});
onActivated(() => {
  if (connectionStore.pendingConnections.length > 0) processPendingConnections();
});

onBeforeUnmount(() => {
  if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
  if (splitPaneRef.value?.panes?.length > 0) {
    terminalStore.saveLayout(splitPaneRef.value.panes);
  }
  document.removeEventListener('click', onDocClick);
  if (progressTimer) clearTimeout(progressTimer);
  terminalStore.clearAll();
});
</script>

<style lang="scss" scoped>
.terminal-view {
  display: flex; flex-direction: column;
  height: calc(100vh - 3.25rem);
  height: calc(100dvh - 3.25rem);
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
  padding: 0.3rem; cursor: pointer; color: var(--bulma-text-light); display: flex;
  transition: all 0.12s;
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

.terminal-body { flex: 1; overflow: hidden; position: relative; }

.terminal-main-area {
  display: flex; height: 100%;
}
.terminal-pane { flex: 1; min-width: 0; overflow: hidden; }
.sftp-divider {
  width: 6px; flex-shrink: 0; cursor: col-resize;
  display: flex; align-items: center; justify-content: center;
  background: var(--bulma-scheme-main-ter); color: var(--bulma-text-light);
  &:hover, &:active { background: var(--bulma-primary); color: white; }
}
.sftp-panel {
  width: 360px; flex-shrink: 0; display: flex; flex-direction: column;
  border-left: 1px solid var(--bulma-border-light);
  background: var(--bulma-scheme-main); overflow: hidden;
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
.sftp-panel :deep(.sftp-browser) { flex: 1; overflow: hidden; border-radius: 0; border: none; }

.dropdown-wrap { display: flex; align-items: center; gap: 0.35rem; }
.settings-wrap { position: relative; }

.connecting-overlay {
  position: absolute; inset: 0; z-index: 20;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1.5rem; background: var(--bulma-scheme-main);
}
.connecting-anim { position: relative; width: 280px; height: 6px; }
.anim-track {
  position: absolute; inset: 0; border-radius: 4px;
  background: var(--bulma-border-light); opacity: 0.3;
}
.anim-fill {
  position: absolute; left: 0; top: 0; height: 100%; border-radius: 4px;
  background: var(--bulma-success); transition: width 0.15s ease-out;
}
.anim-dot {
  position: absolute; top: 50%; width: 14px; height: 14px; border-radius: 50%;
  background: var(--bulma-success); border: 2px solid var(--bulma-success);
  transform: translate(-50%, -50%); transition: left 0.15s ease-out;
  box-shadow: 0 0 8px rgba(72,199,142,0.4);
}
.connecting-text { font-size: 0.85em; color: var(--bulma-text-light); margin: 0; }

.terminal-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; gap: 0.5rem;
  .empty-icon { opacity: 0.2; margin-bottom: 0.5rem; }
  h3 { font-size: 1.1em; font-weight: 600; margin: 0; }
  p { font-size: 0.85em; color: var(--bulma-text-light); }
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
    height: calc(100dvh - 3.25rem - 2.5rem - var(--sab, 0px));
  }
  .terminal-toolbar { padding: 0.25rem 0.5rem; }
  .toolbar-title { font-size: 0.8em; }
  :deep(.split-pane-container) { flex-direction: column; }
  :deep(.pane-tab) { font-size: 0.75rem; }
}
</style>
