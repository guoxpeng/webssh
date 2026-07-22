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
          <button class="toolbar-btn dropdown-trigger" @click="showToolMenu = !showToolMenu">
            <FolderOpen :size="14"/>
            <span>{{ t('sftp.fileManager') }}</span>
            <ChevronDown :size="10"/>
          </button>
          <div v-if="showToolMenu" class="dropdown-menu" @click="showToolMenu = false">
            <div class="dropdown-item" @click="openSftp">
              <FolderOpen :size="14"/> {{ t('sftp.fileManager') }}
            </div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-item is-danger" @click="showDisconnectDialog = true">
              <Power :size="14"/> {{ t('terminal.disconnect') }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="terminal-body">
      <SplitPaneTerminal ref="splitPaneRef" :style="{ display: paneCount > 0 ? '' : 'none' }"/>
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
import { ref, computed, onActivated, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import SplitPaneTerminal from '@/components/terminal/SplitPaneTerminal.vue';
import TerminalSettingsPanel from '@/components/terminal/TerminalSettingsPanel.vue';
import ConfirmDialog from '@/components/global/ConfirmDialog.vue';
import { useConnectionStore } from '@/stores/connectionStore';
import { useTerminalStore } from '@/stores/terminalStore';
import { useMacroStore } from '@/stores/macroStore';
import { Power, Terminal, Server, FolderOpen, ChevronDown, Circle, Square, Settings2 } from 'lucide-vue-next';

const { t } = useI18n();
const connectionStore = useConnectionStore();
const terminalStore = useTerminalStore();
const macroStore = useMacroStore();
const router = useRouter();

const splitPaneRef = ref(null);
const showDisconnectDialog = ref(false);
const showToolMenu = ref(false);
const showTermSettings = ref(false);
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
    splitPaneRef.value?.addTerminalPane(cfg);
  }
  startProgress();
  setTimeout(() => {
    if (connecting.value) completeProgress();
  }, 2500);
}

function openSftp() {
  splitPaneRef.value?.openSftpForActivePane();
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

function onDocClick() { showToolMenu.value = false; showTermSettings.value = false; }

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
  processPendingConnections();
});

onBeforeUnmount(() => {
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

.dropdown-wrap { position: relative; }
.settings-wrap { position: relative; }
.dropdown-trigger { gap: 0.3rem; }
.dropdown-menu {
  position: absolute; right: 0; top: 100%; margin-top: 4px; z-index: 50;
  min-width: 160px; background: var(--bulma-scheme-main);
  border: 1px solid var(--bulma-border-light); border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12); overflow: hidden;
}
.dropdown-item {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.65rem; font-size: 0.8em; cursor: pointer;
  color: var(--bulma-text); transition: background 0.1s;
  &:hover { background: var(--bulma-scheme-main-bis); }
  &.is-danger { color: var(--bulma-danger); }
}
.dropdown-divider { height: 1px; background: var(--bulma-border-light); margin: 2px 0; }

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
