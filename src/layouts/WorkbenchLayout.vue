<template>
  <div class="workbench-layout" @keydown="onGlobalKeydown">
    <SkipToContent />
    <AppNavbar />
    <AppNotification />
    <div id="main-content" class="workbench-body" role="main" aria-label="Main content">
      <aside class="workbench-sidebar" :class="{ 'is-collapsed': sidebarCollapsed }"
             role="navigation" aria-label="Sidebar navigation">
        <nav class="sidebar-nav">
<router-link to="/" class="sidebar-item" :class="{ 'is-active': $route.name === 'ConnectionHome' }"
                        @click="sidebarCollapsed = false" :title="t('nav.servers')" aria-current="page">
            <Server :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">{{ t('nav.servers') }}</span>
          </router-link>
          <router-link to="/terminal" class="sidebar-item" :class="{ 'is-active': $route.name === 'Terminal' }"
                        @click="sidebarCollapsed = false" :title="t('nav.terminal')">
            <Terminal :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">{{ t('nav.terminal') }}</span>
          </router-link>
          <div class="sidebar-spacer"></div>
          <a class="sidebar-item" @click="showSnippets = !showSnippets" :title="t('nav.snippets')" role="button" tabindex="0">
            <TerminalSquare :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">{{ t('nav.snippets') }}</span>
          </a>
          <a class="sidebar-item" @click="showPalette = true" title="Quick search (Ctrl+P)" role="button" tabindex="0">
            <Search :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">{{ t('nav.search') }}</span>
          </a>
          <a class="sidebar-item" @click="showBackup = true" :title="t('nav.backup')" role="button" tabindex="0">
            <Database :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">{{ t('nav.backup') }}</span>
          </a>
          <a class="sidebar-item" @click="showSettings = true" :title="t('nav.settings')" role="button" tabindex="0">
            <Settings :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">{{ t('nav.settings') }}</span>
          </a>
          <a class="sidebar-item" @click="toggleTheme" title="Toggle theme" role="button" tabindex="0">
            <Sun v-if="uiStore.currentTheme === 'light'" :size="22" stroke-width="1.5"/>
            <Moon v-else :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">
              {{ uiStore.currentTheme === 'light' ? t('settings.light') : t('settings.dark') }}
            </span>
          </a>
          <a class="sidebar-item" @click="sidebarCollapsed = !sidebarCollapsed" :title="t('common.close')"
             role="button" tabindex="0" :aria-expanded="!sidebarCollapsed">
            <ChevronsLeft :size="22" stroke-width="1.5" class="collapse-icon"
               :class="{ 'is-rotated': sidebarCollapsed }"/>
          </a>
        </nav>
      </aside>
      <main class="workbench-content" role="main" aria-label="Page content">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
    <footer class="workbench-statusbar" role="contentinfo" aria-label="Status bar">
      <div class="statusbar-left">
        <span class="statusbar-item" aria-live="polite" aria-atomic="true">
          <component :is="connectionIcon" :size="12" class="mr-1"/>
          {{ statusText }}
        </span>
      </div>
      <div class="statusbar-right">
        <span class="statusbar-item">{{ terminalStore.sessionCount }} session{{ terminalStore.sessionCount !== 1 ? 's' : '' }}</span>
        <span class="statusbar-item">{{ uiStore.currentTheme === 'dark' ? t('settings.dark') : t('settings.light') }}</span>
        <span class="statusbar-item">
          <kbd class="statusbar-kbd">Ctrl+P</kbd>
        </span>
      </div>
    </footer>

    <div v-if="showSnippets" class="snippet-overlay">
      <div class="snippet-overlay-backdrop" @click="showSnippets = false"></div>
      <div class="snippet-overlay-panel">
        <SnippetPanel @close="showSnippets = false" @run="onRunSnippet"/>
      </div>
    </div>
    <div v-if="showBackup" class="snippet-overlay">
      <div class="snippet-overlay-backdrop" @click="showBackup = false"></div>
      <div class="snippet-overlay-panel">
        <BackupPanel @close="showBackup = false"/>
      </div>
    </div>
    <CommandPalette :visible="showPalette" @close="showPalette = false" />
    <SettingsPanel :visible="showSettings" @close="showSettings = false" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import AppNavbar from '@/components/global/AppNavbar.vue';
import AppNotification from '@/components/global/AppNotification.vue';
import CommandPalette from '@/components/global/CommandPalette.vue';
import SettingsPanel from '@/components/global/SettingsPanel.vue';
import SkipToContent from '@/components/global/SkipToContent.vue';
import { useUiStore } from '@/stores/uiStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useTerminalStore } from '@/stores/terminalStore';
import { useBackupStore } from '@/stores/backupStore';
import SnippetPanel from '@/components/snippets/SnippetPanel.vue';
import BackupPanel from '@/components/backup/BackupPanel.vue';
import { ConnectionStatus } from '@/utils/constants';
import { Search, Settings, Server, Terminal, Sun, Moon, ChevronsLeft, CheckCircle2, AlertTriangle, WifiOff, LoaderCircle, TerminalSquare, Database } from 'lucide-vue-next';

const { t } = useI18n();
const uiStore = useUiStore();
const connectionStore = useConnectionStore();
const terminalStore = useTerminalStore();
const sidebarCollapsed = ref(false);
const showPalette = ref(false);
const showSettings = ref(false);
const showSnippets = ref(false);
const showBackup = ref(false);

const connectionIcon = computed(() => {
  switch (connectionStore.connectionStatus) {
    case ConnectionStatus.CONNECTED: return CheckCircle2;
    case ConnectionStatus.CONNECTING: return LoaderCircle;
    case ConnectionStatus.ERROR: return AlertTriangle;
    default: return WifiOff;
  }
});

const statusText = computed(() => {
  switch (connectionStore.connectionStatus) {
    case ConnectionStatus.CONNECTED: return t('status.connected');
    case ConnectionStatus.CONNECTING: return t('status.connecting');
    case ConnectionStatus.ERROR: return t('status.error');
    default: return t('status.disconnected');
  }
});

function onGlobalKeydown(e) {
  const isCtrl = e.ctrlKey || e.metaKey;
  if (isCtrl && e.key === 'k') { e.preventDefault(); showPalette.value = !showPalette.value; }
  else if (isCtrl && e.key === 'p') { e.preventDefault(); showPalette.value = !showPalette.value; }
}

function onRunSnippet(snippet) {
  showSnippets.value = false;
  const ws = connectionStore;
  if (ws.isConnected && snippet.command) {
    ws.sendShellData(snippet.command + '\n');
    terminalStore.addRecentCommand(snippet.command);
  } else {
    const { showWarning } = useNotifications();
    showWarning(t('terminal.connectFirst'));
  }
}

function toggleTheme() { uiStore.toggleTheme(); sidebarCollapsed.value = false; }

onMounted(() => {
  document.addEventListener('keydown', onGlobalKeydown);
  // Auto-backup check
  const bakStore = useBackupStore();
  if (bakStore.shouldAutoBackup()) {
    bakStore.createBackup('Auto-backup', bakStore.scheduler.includeCredentials).then(() => {
      bakStore.cleanupOldBackups();
    });
  }
});
onBeforeUnmount(() => document.removeEventListener('keydown', onGlobalKeydown));
</script>

<style lang="scss" scoped>
.workbench-layout { display: flex; flex-direction: column; min-height: 100vh; background: var(--bulma-body-background-color); }
.workbench-body { display: flex; flex: 1; padding-top: 3.25rem; min-height: 0; }
.workbench-sidebar {
  width: 200px; flex-shrink: 0; background: var(--bulma-scheme-main-bis);
  border-right: 1px solid var(--bulma-border-light); padding: 0.75rem 0;
  display: flex; flex-direction: column; transition: width 0.2s ease;
  &.is-collapsed { width: 56px; }
}
.sidebar-nav { display: flex; flex-direction: column; gap: 2px; padding: 0 0.5rem; flex: 1; }
.sidebar-item {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.75rem; border-radius: 8px;
  color: var(--bulma-text-light); text-decoration: none; transition: all 0.12s ease; cursor: pointer; white-space: nowrap;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
  &.is-active { background: var(--bulma-primary); color: white; font-weight: 500; }
}
.sidebar-label { font-size: 0.9em; line-height: 1; }
.sidebar-spacer { flex: 1; }
.collapse-icon { transition: transform 0.2s ease; &.is-rotated { transform: rotate(180deg); } }

.workbench-content { flex: 1; min-width: 0; overflow-y: auto; padding: 1.5rem 2rem; }

.workbench-statusbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 0.75rem; height: 24px; font-size: 0.7em;
  background: var(--bulma-scheme-main-ter); border-top: 1px solid var(--bulma-border-light);
  color: var(--bulma-text-light); flex-shrink: 0;
}
.statusbar-left, .statusbar-right { display: flex; align-items: center; gap: 0.75rem; }
.statusbar-item { display: inline-flex; align-items: center; white-space: nowrap; }
.statusbar-kbd { font-size: 0.85em; padding: 1px 5px; border-radius: 3px; background: var(--bulma-border-light); color: var(--bulma-text-light); }

:deep(.page-enter-active), :deep(.page-leave-active) { transition: opacity 0.2s ease, transform 0.2s ease; }
:deep(.page-enter-from) { opacity: 0; transform: translateY(8px); }
:deep(.page-leave-to) { opacity: 0; transform: translateY(-8px); }

.snippet-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.snippet-overlay-backdrop {
  position: absolute; inset: 0; background: rgba(0,0,0,0.3);
}
.snippet-overlay-panel {
  position: relative; z-index: 1; max-height: 80vh;
}

@media screen and (max-width: 768px) {
  .workbench-sidebar { width: 56px; &.is-collapsed { width: 0; overflow: hidden; padding: 0; } }
  .workbench-content { padding: 1rem; }
}
</style>
