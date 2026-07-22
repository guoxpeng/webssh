<template>
  <div class="workbench-layout" @keydown="onGlobalKeydown">
    <SkipToContent />
    <AppNavbar />
    <AppNotification />
    <div id="main-content" class="workbench-body" role="main" aria-label="Main content">
      <aside class="workbench-sidebar" :class="{ 'is-collapsed': sidebarCollapsed, 'is-mobile-open': mobileMenuOpen }"
             role="navigation" aria-label="Sidebar navigation">
        <div class="sidebar-header">
          <span class="sidebar-title" v-show="!sidebarCollapsed">{{ t('nav.menu') }}</span>
          <button class="sidebar-close" @click="mobileMenuOpen = false" aria-label="Close menu">&times;</button>
        </div>
        <nav class="sidebar-nav" @click="onSidebarNavClick">
<router-link to="/" class="sidebar-item" :class="{ 'is-active': $route.name === 'ConnectionHome' }"
                        @click="closeMobileMenu" :title="t('nav.servers')" aria-current="page">
            <Server :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">{{ t('nav.servers') }}</span>
          </router-link>
          <router-link to="/terminal" class="sidebar-item" :class="{ 'is-active': $route.name === 'Terminal' }"
                        @click="closeMobileMenu" :title="t('nav.terminal')">
            <Terminal :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">{{ t('nav.terminal') }}</span>
          </router-link>
          <router-link to="/sftp" class="sidebar-item" :class="{ 'is-active': $route.name === 'Sftp' }"
                        @click="closeMobileMenu" :title="t('sftp.title')">
            <FolderOpen :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">{{ t('nav.sftp') }}</span>
          </router-link>
          <div class="sidebar-spacer"></div>
          <a class="sidebar-item" @click="showSnippets = !showSnippets; closeMobileMenu()" :title="t('nav.snippets')" role="button" tabindex="0">
            <TerminalSquare :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">{{ t('nav.snippets') }}</span>
          </a>
          <a class="sidebar-item" @click="showMacro = true; closeMobileMenu()" :title="t('macro.title')" role="button" tabindex="0">
            <PlayCircle :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">{{ t('macro.title') }}</span>
          </a>
          <a class="sidebar-item" @click="showBackup = true; closeMobileMenu()" :title="t('nav.backup')" role="button" tabindex="0">
            <Database :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">{{ t('nav.backup') }}</span>
          </a>
          <a class="sidebar-item" @click="showSettings = true; closeMobileMenu()" :title="t('nav.settings')" role="button" tabindex="0">
            <Settings :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">{{ t('nav.settings') }}</span>
          </a>
          <a class="sidebar-item" @click="toggleTheme(); closeMobileMenu()" :title="t('nav.toggleTheme')" role="button" tabindex="0">
            <Sun v-if="uiStore.currentTheme === 'light'" :size="22" stroke-width="1.5"/>
            <Moon v-else :size="22" stroke-width="1.5"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">
              {{ uiStore.currentTheme === 'light' ? t('settings.light') : t('settings.dark') }}
            </span>
          </a>
          <a class="sidebar-item is-collapse-toggle" @click="sidebarCollapsed = !sidebarCollapsed" :title="t('common.close')"
             role="button" tabindex="0" :aria-expanded="!sidebarCollapsed">
            <ChevronsLeft :size="22" stroke-width="1.5" class="collapse-icon"
               :class="{ 'is-rotated': sidebarCollapsed }"/>
            <span class="sidebar-label" v-show="!sidebarCollapsed">{{ t('common.collapse') }}</span>
          </a>
        </nav>
      </aside>
      <main class="workbench-content" :class="{ 'is-sidebar-collapsed': sidebarCollapsed }" role="main" aria-label="Page content">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <keep-alive>
              <component :is="Component" />
            </keep-alive>
          </transition>
        </router-view>
      </main>
    </div>
    <!-- Mobile bottom nav bar -->
    <nav class="mobile-bottom-nav" aria-label="Mobile navigation">
      <router-link to="/" class="mobile-nav-item" :class="{ 'is-active': $route.name === 'ConnectionHome' }" @click="closeMobileMenu">
        <Server :size="20" stroke-width="1.5"/>
        <span class="mobile-nav-label">{{ t('nav.servers') }}</span>
      </router-link>
      <router-link to="/terminal" class="mobile-nav-item" :class="{ 'is-active': $route.name === 'Terminal' }" @click="closeMobileMenu">
        <Terminal :size="20" stroke-width="1.5"/>
        <span class="mobile-nav-label">{{ t('nav.terminal') }}</span>
      </router-link>
      <router-link to="/sftp" class="mobile-nav-item" :class="{ 'is-active': $route.name === 'Sftp' }" @click="closeMobileMenu">
        <FolderOpen :size="20" stroke-width="1.5"/>
        <span class="mobile-nav-label">{{ t('nav.sftp') }}</span>
      </router-link>
      <button class="mobile-nav-item mobile-nav-menu-btn" @click="mobileMenuOpen = !mobileMenuOpen" aria-label="Menu">
        <Search :size="20" stroke-width="1.5"/>
        <span class="mobile-nav-label">{{ t('nav.menu') }}</span>
      </button>
    </nav>
    <footer class="workbench-statusbar" role="contentinfo" aria-label="Status bar">
      <div class="statusbar-left">
        <span class="statusbar-item" aria-live="polite" aria-atomic="true">
          <component :is="connectionIcon" :size="12" class="mr-1"/>
          {{ statusText }}
        </span>
      </div>
      <div class="statusbar-right">
        <span class="statusbar-item">{{ t('terminal.sessions', { count: terminalStore.sessionCount }) }}</span>
        <span class="statusbar-item">{{ uiStore.currentTheme === 'dark' ? t('settings.dark') : t('settings.light') }}</span>
        <span class="statusbar-item" style="opacity:0.5">v{{ APP_VERSION }}</span>
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
    <SettingsPanel :visible="showSettings" @close="showSettings = false" />
    <div v-if="showMacro" class="snippet-overlay">
      <div class="snippet-overlay-backdrop" @click="showMacro = false"></div>
      <div class="snippet-overlay-panel">
        <MacroPanel @close="showMacro = false" @run="onRunMacro"/>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import AppNavbar from '@/components/global/AppNavbar.vue';
import AppNotification from '@/components/global/AppNotification.vue';
import SettingsPanel from '@/components/global/SettingsPanel.vue';
import SkipToContent from '@/components/global/SkipToContent.vue';
import { useUiStore } from '@/stores/uiStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useTerminalStore } from '@/stores/terminalStore';
import { useBackupStore } from '@/stores/backupStore';
import { useMacroStore } from '@/stores/macroStore';
import SnippetPanel from '@/components/snippets/SnippetPanel.vue';
import MacroPanel from '@/components/macro/MacroPanel.vue';
import BackupPanel from '@/components/backup/BackupPanel.vue';
import { ConnectionStatus } from '@/utils/constants';
import { Search, Settings, Server, Terminal, Sun, Moon, ChevronsLeft, CheckCircle2, AlertTriangle, WifiOff, LoaderCircle, TerminalSquare, Database, ArrowRightCircle, PlayCircle, FolderOpen } from 'lucide-vue-next';

const { t } = useI18n();
const APP_VERSION = '2.0.0';
const uiStore = useUiStore();
const connectionStore = useConnectionStore();
const terminalStore = useTerminalStore();
const sidebarCollapsed = ref(false);
const mobileMenuOpen = ref(false);
const showMacro = ref(false);
const showSettings = ref(false);
const showSnippets = ref(false);
const showBackup = ref(false);

function closeMobileMenu() { mobileMenuOpen.value = false; }
function onSidebarNavClick(e) {
  // Don't close on collapse toggle click
  if (e.target.closest('.is-collapse-toggle')) return;
}

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
  if (isCtrl && e.key === 'p') { e.preventDefault(); showMacro.value = !showMacro.value; }
}

function onRunSnippet(snippet) {
  showSnippets.value = false;
  if (terminalStore.activeSendFunction && snippet.command) {
    terminalStore.activeSendFunction(snippet.command + '\n');
    terminalStore.addRecentCommand(snippet.command);
  } else {
    const { showWarning } = useNotifications();
    showWarning(t('terminal.connectFirst'));
  }
}

function onRunMacro(macro) {
  showMacro.value = false;
  if (terminalStore.activeSendFunction && macro.steps.length) {
    const send = terminalStore.activeSendFunction;
    let totalDelay = 0;
    for (const step of macro.steps) {
      totalDelay += step.delay || 300;
      setTimeout(() => send(step.command + '\n'), totalDelay);
    }
    const macroStore = useMacroStore();
    macroStore.incrementRunCount(macro.id);
  } else {
    const { showWarning } = useNotifications();
    showWarning(t('terminal.connectFirst'));
  }
}

function toggleTheme() { uiStore.toggleTheme(); sidebarCollapsed.value = false; }

onMounted(() => {
  document.addEventListener('keydown', onGlobalKeydown);
  connectionStore.loadCredentialsFromSessionStorage?.()?.catch(() => {});
  // Auto-backup check
  const bakStore = useBackupStore();
  if (bakStore.shouldAutoBackup()) {
    bakStore.createBackup(t('backup.autoLabel'), bakStore.scheduler.includeCredentials).then(() => {
      bakStore.cleanupOldBackups();
    });
  }
});
onBeforeUnmount(() => document.removeEventListener('keydown', onGlobalKeydown));
</script>

<style lang="scss" scoped>
.workbench-layout { display: flex; flex-direction: column; height: 100vh; height: 100dvh; background: var(--bulma-body-background-color); overflow: hidden; }
.workbench-body { display: flex; flex: 1; margin-top: 3.25rem; min-height: 0; }
.workbench-sidebar {
  position: fixed; top: 3.25rem; left: 0; bottom: 24px; z-index: 100;
  width: 200px; background: var(--bulma-scheme-main-bis);
  border-right: 1px solid var(--bulma-border-light); padding: 1.5rem 0 0.75rem;
  display: flex; flex-direction: column; overflow-y: auto;
  &.is-collapsed { width: 56px; }
}
.sidebar-nav { display: flex; flex-direction: column; gap: 2px; padding: 0 0.5rem; flex: 1; }
.sidebar-item {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.75rem; border-radius: 8px;
  color: var(--bulma-text-light); text-decoration: none; cursor: pointer; white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
  &.is-active { background: var(--bulma-primary); color: white; }
  &.is-active .sidebar-label { font-weight: 500; }
}
.sidebar-label { font-size: 0.9em; line-height: 1; }
.sidebar-spacer { flex: 1; }
.collapse-icon { transition: transform 0.2s ease; &.is-rotated { transform: rotate(180deg); } }

.workbench-content { flex: 1; min-width: 0; overflow-y: auto; padding: 1.5rem 2rem; margin-left: 200px; }
.workbench-content.is-sidebar-collapsed { margin-left: 56px; }

.workbench-statusbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 0.75rem; height: 24px; font-size: 0.7em;
  background: var(--bulma-scheme-main-ter); border-top: 1px solid var(--bulma-border-light);
  color: var(--bulma-text-light); flex-shrink: 0;
}
.statusbar-left, .statusbar-right { display: flex; align-items: center; gap: 0.75rem; }
.statusbar-item { display: inline-flex; align-items: center; white-space: nowrap; }
.statusbar-kbd { font-size: 0.85em; padding: 1px 5px; border-radius: 3px; background: var(--bulma-border-light); color: var(--bulma-text-light); }

:deep(.page-enter-active), :deep(.page-leave-active) { transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
:deep(.page-enter-from) { opacity: 0; transform: translateY(12px) scale(0.98); }
:deep(.page-leave-to) { opacity: 0; transform: translateY(-12px) scale(0.98); }

.snippet-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  animation: overlayIn 0.15s ease-out;
}
@keyframes overlayIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.snippet-overlay-backdrop {
  position: absolute; inset: 0; background: rgba(0,0,0,0.3);
  animation: backdropIn 0.2s ease-out;
}
@keyframes backdropIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.snippet-overlay-panel {
  position: relative; z-index: 1; max-height: 80vh;
  animation: panelIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
@keyframes panelIn {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.snippet-overlay-backdrop {
  position: absolute; inset: 0; background: rgba(0,0,0,0.3);
}
.snippet-overlay-panel {
  position: relative; z-index: 1; max-height: 80vh;
}

/* Mobile bottom nav */
.mobile-bottom-nav {
  display: none;
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;
  padding: 0; padding-bottom: var(--sab, 0px);
  background: var(--bulma-scheme-main-bis);
  border-top: 1px solid var(--bulma-border-light);
  justify-content: space-around;
  backdrop-filter: blur(12px);
}
.mobile-nav-item {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px 0; flex: 1; cursor: pointer; user-select: none;
  color: var(--bulma-text-light); text-decoration: none; transition: color 0.15s;
  -webkit-tap-highlight-color: transparent;
  &.is-active, &:active { color: var(--bulma-primary); }
}
.mobile-nav-label { font-size: 0.6rem; line-height: 1; }
.mobile-nav-menu-btn { background: none; border: none; font-family: inherit; }

/* Mobile sidebar drawer */
.sidebar-header { display: none; }

@media screen and (max-width: 768px) {
  .workbench-body { flex-direction: column; }
  .workbench-sidebar {
    position: fixed; top: 3.25rem; left: 0; bottom: 0; z-index: 90;
    width: 240px !important; min-width: 240px; max-width: 240px;
    transform: translateX(-100%); transition: transform 0.2s ease;
    &.is-mobile-open { transform: translateX(0); }
    &.is-collapsed { transform: translateX(-100%); }
  }
  .workbench-content {
    margin-left: 0 !important; padding: 0.6rem; padding-bottom: calc(3.5rem + var(--sab, 0px));
    overflow-y: auto;
  }
  .sidebar-header { display: flex; }
  .sidebar-title { font-weight: 600; font-size: 0.9rem; }
  .sidebar-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--bulma-text-light); }
  .sidebar-nav { padding: 0.5rem; }
  .sidebar-label { display: inline !important; }
  .collapse-icon { display: none; }
  .mobile-bottom-nav { display: flex; }
  .workbench-statusbar { display: none; }
}

/* Quick Connect dialog */
.quick-connect-dialog {
  background: var(--bulma-scheme-main); border-radius: 12px;
  width: 400px; overflow: hidden; box-shadow: 0 16px 48px rgba(0,0,0,0.2);
}
.qc-title {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.75rem 1rem; margin: 0; font-size: 0.95em; font-weight: 600;
  border-bottom: 1px solid var(--bulma-border-light);
}
.qc-body { padding: 1rem; }
.qc-input {
  width: 100%; box-sizing: border-box; padding: 0.6rem 0.75rem;
  border: 1px solid var(--bulma-border); border-radius: 8px; font-size: 0.9em;
  background: var(--bulma-input-background-color); color: var(--bulma-text); outline: none;
  &:focus { border-color: var(--bulma-primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
}
.qc-hint { font-size: 0.75em; color: var(--bulma-text-light); margin: 0.5rem 0 0; }
.qc-actions {
  display: flex; gap: 0.5rem; padding: 0 1rem 1rem;
}
.qc-btn {
  flex: 1; padding: 0.5rem; border-radius: 8px; border: 1px solid var(--bulma-border-light);
  font-size: 0.85em; cursor: pointer; background: var(--bulma-scheme-main-ter); color: var(--bulma-text);
  &.is-primary { background: var(--bulma-primary); color: white; border-color: transparent; }
  &:hover { opacity: 0.9; }
}
</style>
