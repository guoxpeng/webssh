<template>
  <div class="terminal-view">
    <div class="terminal-toolbar">
      <div class="toolbar-left">
        <span class="toolbar-title">{{ t('terminal.title') }}</span>
        <span class="toolbar-session" v-if="terminalStore.sessions.length > 0">
          {{ t('terminal.sessions', { count: terminalStore.sessionCount }) }}
        </span>
      </div>
      <div class="toolbar-right" v-if="terminalStore.activeSession">
        <ProtocolBadge :protocol="connectionStore.currentNodeDetails?.protocol || 'ssh'" />
        <span class="toolbar-status" :class="`is-${connectionStore.connectionStatus}`">
          <span class="status-dot"></span>{{ connectionStore.connectionStatus }}
        </span>
        <div class="quick-cmds" v-if="terminalStore.recentCommands.length > 0">
          <button class="toolbar-btn" @click="showQuickCmds = !showQuickCmds" :title="t('terminal.recentCommands')">
            <Clock :size="14"/>
            <span class="quick-cmds-badge">{{ terminalStore.recentCommands.length }}</span>
          </button>
          <div v-if="showQuickCmds" class="quick-cmds-dropdown">
            <div class="quick-cmds-header">{{ t('terminal.recentCommands') }}</div>
            <div v-for="(cmd, i) in terminalStore.recentCommands.slice(0, 10)" :key="i"
                 class="quick-cmd-item" @click="sendCommand(cmd)" title="Click to send">
              <span class="quick-cmd-text">{{ cmd }}</span>
            </div>
            <div class="quick-cmds-footer">
              <button @click="terminalStore.clearRecentCommands(); showQuickCmds = false">{{ t('terminal.clear') }}</button>
            </div>
          </div>
        </div>
        <button class="toolbar-btn" @click="handleResize" :title="t('terminal.fit')"><Maximize2 :size="14"/></button>
        <button class="toolbar-btn" @click="showTunnels = !showTunnels" :title="t('terminal.tunnels')">
          <GitBranch :size="14"/>
        </button>
        <button class="toolbar-btn is-danger" @click="showDisconnectDialog = true" :disabled="!canDisconnect" :title="t('terminal.disconnect')">
          <Power :size="14"/>
        </button>
      </div>
    </div>

    <div class="terminal-body">
      <template v-if="terminalStore.activeSession">
        <SplitPaneTerminal ref="splitPaneRef"/>
      </template>
      <div v-else class="terminal-empty">
        <Terminal :size="48" class="empty-icon"/>
        <h3>{{ t('terminal.noSessions') }}</h3>
        <p>{{ t('terminal.noSessionsHint') }}</p>
        <router-link to="/" class="btn btn-primary">
          <Server :size="16"/> {{ t('terminal.goToServers') }}
        </router-link>
      </div>
    </div>

    <TunnelManager v-if="showTunnels && terminalStore.activeSession" class="terminal-tunnel-panel"/>

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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import SplitPaneTerminal from '@/components/terminal/SplitPaneTerminal.vue';
import ProtocolBadge from '@/components/global/ProtocolBadge.vue';
import TunnelManager from '@/components/tunnel/TunnelManager.vue';
import ConfirmDialog from '@/components/global/ConfirmDialog.vue';
import { useConnectionStore } from '@/stores/connectionStore';
import { useTerminalStore } from '@/stores/terminalStore';
import { ConnectionStatus } from '@/utils/constants';
import { Power, Terminal, Server, Maximize2, GitBranch, Clock } from 'lucide-vue-next';

const connectionStore = useConnectionStore();
const terminalStore = useTerminalStore();
const router = useRouter();

const splitPaneRef = ref(null);
const showDisconnectDialog = ref(false);
const showTunnels = ref(false);
const showQuickCmds = ref(false);

const canDisconnect = computed(() =>
  connectionStore.connectionStatus === ConnectionStatus.CONNECTED ||
  connectionStore.connectionStatus === ConnectionStatus.CONNECTING
);

function sendCommand(cmd) {
  if (connectionStore.isConnected) {
    connectionStore.sendShellData(cmd + '\n');
    terminalStore.addRecentCommand(cmd);
  }
  showQuickCmds.value = false;
}

function onClickOutside(e) {
  if (showQuickCmds.value && !e.target.closest('.quick-cmds')) {
    showQuickCmds.value = false;
  }
}

function onDisconnectConfirmed() {
  connectionStore.disconnectShell();
  showDisconnectDialog.value = false;
}

function handleResize() {
  // TerminalDisplay exposes fitTerminal, but SplitPaneTerminal manages its own children
}

onMounted(() => {
  if (connectionStore.currentNodeDetails && !terminalStore.activeSession) {
    const sid = terminalStore.createSession(connectionStore.currentNodeDetails);
    terminalStore.updateSessionStatus(sid, 'connecting');
  }
  document.addEventListener('click', onClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside);
  if (connectionStore.connectionStatus === ConnectionStatus.CONNECTED ||
      connectionStore.connectionStatus === ConnectionStatus.CONNECTING) {
    connectionStore.disconnectShell();
  }
});
</script>

<style lang="scss" scoped>
.terminal-view {
  display: flex; flex-direction: column;
  height: calc(100vh - 3.25rem); overflow: hidden;
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

.toolbar-status {
  display: flex; align-items: center; gap: 0.25rem;
  font-size: 0.7em; color: var(--bulma-text-light); text-transform: capitalize;
  .status-dot { width: 6px; height: 6px; border-radius: 50%; }
  &.is-connected .status-dot { background: var(--bulma-success); }
  &.is-connecting .status-dot { background: var(--bulma-info); animation: pulse 1s infinite; }
  &.is-error .status-dot { background: var(--bulma-danger); }
  &.is-disconnected .status-dot { background: var(--bulma-border); }
}

.toolbar-btn {
  background: none; border: 1px solid var(--bulma-border-light); border-radius: 6px;
  padding: 0.3rem; cursor: pointer; color: var(--bulma-text-light); display: flex;
  transition: all 0.12s;
  &:hover { background: var(--bulma-scheme-main-bis); color: var(--bulma-text); }
  &.is-danger:hover { color: var(--bulma-danger); border-color: var(--bulma-danger); }
}

.quick-cmds { position: relative; }
.quick-cmds-badge {
  position: absolute; top: -4px; right: -4px; font-size: 0.5em; padding: 1px 4px;
  border-radius: 4px; background: var(--bulma-primary); color: white; line-height: 1.2;
  min-width: 14px; text-align: center;
}
.quick-cmds-dropdown {
  position: absolute; top: 100%; right: 0; z-index: 100;
  width: 260px; margin-top: 4px;
  background: var(--bulma-box-background-color);
  backdrop-filter: blur(12px); border: 1px solid var(--bulma-border-light);
  border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  overflow: hidden;
}
.quick-cmds-header {
  padding: 0.35rem 0.6rem; font-size: 0.65em; font-weight: 600; text-transform: uppercase;
  color: var(--bulma-text-light); border-bottom: 1px solid var(--bulma-border-light);
}
.quick-cmd-item {
  padding: 0.3rem 0.6rem; font-size: 0.7em; cursor: pointer; font-family: monospace;
  border-bottom: 1px solid var(--bulma-border-light);
  &:hover { background: var(--bulma-scheme-main-ter); }
}
.quick-cmd-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
.quick-cmds-footer {
  padding: 0.25rem 0.5rem; text-align: center;
  button { background: none; border: none; font-size: 0.6em; color: var(--bulma-text-light); cursor: pointer;
    &:hover { color: var(--bulma-text); } }
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.terminal-body { flex: 1; overflow: hidden; }

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

.terminal-tunnel-panel {
  position: absolute; right: 0; top: 3.25rem; bottom: 24px; z-index: 10;
}
</style>
