<template>
  <div class="terminal-view">
    <div class="terminal-toolbar">
      <div class="toolbar-left">
        <span class="toolbar-title">{{ t('terminal.title') }}</span>
        <span class="toolbar-session" v-if="paneCount > 0">
          {{ t('terminal.sessions', { count: paneCount }) }}
        </span>
      </div>
      <div class="toolbar-right" v-if="paneCount > 0">
        <button class="toolbar-btn" @click="openSftp" :title="t('sftp.fileManager')">
          <FolderOpen :size="14"/>
        </button>
        <button class="toolbar-btn is-danger" @click="showDisconnectDialog = true" :title="t('terminal.disconnect')">
          <Power :size="14"/>
        </button>
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
import ConfirmDialog from '@/components/global/ConfirmDialog.vue';
import { useConnectionStore } from '@/stores/connectionStore';
import { useTerminalStore } from '@/stores/terminalStore';
import { Power, Terminal, Server, FolderOpen } from 'lucide-vue-next';

const { t } = useI18n();
const connectionStore = useConnectionStore();
const terminalStore = useTerminalStore();
const router = useRouter();

const splitPaneRef = ref(null);
const showDisconnectDialog = ref(false);
const connecting = ref(false);
const progressPct = ref(0);
let progressTimer = null;

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

onMounted(() => {
  processPendingConnections();
});
onActivated(() => {
  processPendingConnections();
});

onBeforeUnmount(() => {
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

.terminal-body { flex: 1; overflow: hidden; position: relative; }

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
