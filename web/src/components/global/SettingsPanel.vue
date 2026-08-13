<template>
  <Teleport to="body">
    <div v-if="visible" class="settings-overlay" @click.self="close" @keydown.escape="close">
      <div class="settings-panel" ref="panelRef" role="dialog" aria-modal="true" :aria-label="t('settings.title')">
        <div class="settings-header">
          <h3 class="settings-title"><SettingsIcon :size="17"/> {{ t('settings.title') }}</h3>
          <button class="settings-close" @click="close" :title="t('common.close')">&times;</button>
        </div>

        <div class="settings-body">
          <div class="settings-section">
            <h4 class="settings-section-title">{{ t('settings.backendTitle') }}</h4>
            <p class="model-api-hint">{{ t('settings.backendHint') }}</p>
            <input type="text" v-model="backendUrl" class="pw-input backend-input"
                   :placeholder="t('settings.backendUrlPlaceholder')"
                   autocomplete="off" spellcheck="false" @keydown.enter="saveBackend"/>
            <input type="password" v-model="backendToken" class="pw-input backend-input"
                   :placeholder="t('settings.backendToken')"
                   autocomplete="off" @keydown.enter="saveBackend"/>
            <div class="backend-actions">
              <button class="settings-minor-btn" v-if="backendUrlSaved" @click="clearBackend">
                <Trash2Icon :size="13"/> {{ t('common.clear') }}
              </button>
              <button class="pw-btn" @click="saveBackend">
                <ServerIcon :size="13"/> {{ t('common.save') }}
              </button>
            </div>
            <div class="lan-hint" v-if="lanAddresses.length">
              <span class="lan-label">{{ t('settings.lanAddress') }}</span>
              <button v-for="ip in lanAddresses" :key="ip" class="lan-chip" @click="copyLan(ip)"
                      :title="t('settings.lanCopyHint')">
                http://{{ ip }}:{{ lanPort }}
              </button>
              <p class="lan-tip">{{ t('settings.lanTip') }}</p>
            </div>
          </div>

          <div class="settings-section">
            <h4 class="settings-section-title">{{ t('settings.themePresets') }}</h4>
            <div class="theme-grid">
              <button v-for="theme in themes" :key="theme.id"
                      class="theme-card"
                      :class="{ 'is-active': currentThemeId === theme.id }"
                      @click="applyTheme(theme.id)">
                <div class="theme-preview" :style="theme.previewStyle">
                  <div class="theme-preview-bar" :style="{ background: theme.colors.primary }"></div>
                  <div class="theme-preview-sidebar" :style="{ background: theme.colors.sidebar }"></div>
                  <div class="theme-preview-content">
                    <div class="theme-preview-line" :style="{ background: theme.colors.text }"></div>
                    <div class="theme-preview-line short" :style="{ background: theme.colors.text }"></div>
                  </div>
                </div>
                <span class="theme-name">{{ theme.label }}</span>
              </button>
            </div>
          </div>

          <div class="settings-section">
            <h4 class="settings-section-title">{{ t('settings.appearance') }}</h4>
            <div class="settings-row">
              <span class="row-label">{{ t('settings.fontSize') }}</span>
              <div class="font-size-ctrl">
                <button class="fs-btn" @click="adjustFontSize(-1)" :disabled="fontSize <= 12">−</button>
                <span class="fs-value">{{ fontSize }}px</span>
                <button class="fs-btn" @click="adjustFontSize(1)" :disabled="fontSize >= 20">+</button>
              </div>
            </div>
            <div class="settings-row">
              <span class="row-label">{{ t('settings.animations') }}</span>
              <button class="switch" :class="{ 'is-active': animationsEnabled }"
                      @click="animationsEnabled = !animationsEnabled"
                      :aria-label="`Animations ${animationsEnabled ? 'on' : 'off'}`">
                <span class="switch-slider"></span>
              </button>
            </div>
            <div class="settings-row">
              <span class="row-label">{{ t('settings.language') }}</span>
              <select v-model="currentLocale" @change="onLocaleChange" class="settings-select">
                <option value="zh-CN">中文</option>
                <option value="en-US">English</option>
              </select>
            </div>
          </div>

          <div class="settings-section">
            <h4 class="settings-section-title">{{ t('settings.terminal') }}</h4>
            <div class="settings-row">
              <span class="row-label">{{ t('settings.cursorStyle') }}</span>
              <select v-model="cursorStyle" class="settings-select">
                <option value="block">{{ t('settings.cursorBlock') }}</option>
                <option value="underline">{{ t('settings.cursorUnderline') }}</option>
                <option value="bar">{{ t('settings.cursorBar') }}</option>
              </select>
            </div>
            <div class="settings-row">
              <span class="row-label">{{ t('settings.scrollback') }}</span>
              <select v-model="scrollback" class="settings-select">
                <option :value="1000">1,000</option>
                <option :value="5000">5,000</option>
                <option :value="10000">10,000</option>
                <option :value="50000">50,000</option>
              </select>
            </div>
            <div class="settings-row">
              <span class="row-label">{{ t('settings.bgColor') }}</span>
              <div class="settings-bg-ctrl">
                <input type="color" v-model="termBgColor" class="color-picker"
                       @input="onTermBgInput" :title="t('settings.bgColor')"/>
                <button v-if="termBgColor" class="btn-reset-bg" @click="resetTermBg"
                        :title="t('common.reset')">↺</button>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <h4 class="settings-section-title">{{ t('settings.dataSecurity') }}</h4>
            <div class="pw-change-form">
              <p class="subsection-label">{{ t('settings.changePassword') }}</p>
              <input :type="pwShow ? 'text' : 'password'" v-model="pwCurrent"
                     :placeholder="t('settings.currentPassword')" class="pw-input"
                     autocomplete="off" @keydown.enter="changePassword"/>
              <input :type="pwShow ? 'text' : 'password'" v-model="pwNew"
                     :placeholder="t('settings.newPassword')" class="pw-input"
                     autocomplete="off" @keydown.enter="changePassword"/>
              <input :type="pwShow ? 'text' : 'password'" v-model="pwConfirm"
                     :placeholder="t('settings.confirmNewPassword')" class="pw-input"
                     autocomplete="off" @keydown.enter="changePassword"/>
              <div class="pw-actions">
                <label class="pw-show-label">
                  <input type="checkbox" v-model="pwShow"/> {{ t('unlock.show') }}
                </label>
                <button class="pw-btn" :disabled="!pwCanSubmit" @click="changePassword">
                  {{ t('settings.changePasswordBtn') }}
                </button>
              </div>
            </div>
            <div class="settings-row danger-row">
              <span class="row-label">{{ t('settings.clearCredentials') }}</span>
              <button class="danger-btn" @click="showClearCredConfirm = true">{{ t('common.clear') }}</button>
            </div>
            <div class="settings-row" v-if="hasMasterSession">
              <span class="row-label">{{ t('settings.lockNow') }}</span>
              <button class="settings-minor-btn" @click="lockNow"><Lock :size="13"/> {{ t('settings.lockNowBtn') }}</button>
            </div>
          </div>

          <div class="settings-section">
            <h4 class="settings-section-title">{{ t('settings.modelApi') }}</h4>
            <div class="settings-row">
              <span class="row-label">{{ t('settings.modelApiEnable') }}</span>
              <button class="switch" :class="{ 'is-active': modelSyncEnabled }"
                      @click="toggleModelSync" :disabled="modelSyncBusy"
                      :aria-label="t('settings.modelApiEnable')">
                <span class="switch-slider"></span>
              </button>
            </div>
            <p class="model-api-hint">{{ t('settings.modelApiHint') }}</p>
          </div>

          <div class="settings-section">
            <h4 class="settings-section-title">{{ t('settings.mcpTitle') }}</h4>
            <p class="model-api-hint">{{ t('settings.mcpHint') }}</p>
            <div class="mcp-config-box">
              <pre class="mcp-config">{{ mcpConfigSnippet }}</pre>
              <button class="settings-minor-btn" @click="copyMcpConfig">
                <CopyIcon :size="13"/> {{ t('common.copy') }}
              </button>
            </div>
          </div>

          <div class="settings-section">
            <h4 class="settings-section-title">{{ t('settings.shortcuts') }}</h4>
            <div class="shortcut-row"><kbd>Ctrl</kbd><span class="kbd-plus">+</span><kbd>P</kbd><span class="shortcut-desc">{{ t('settings.shortcutMacro') }}</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd><span class="kbd-plus">+</span><kbd>F</kbd><span class="shortcut-desc">{{ t('settings.shortcutSearch') }}</span></div>
          </div>
        </div>

        <div class="settings-footer">
          <span class="settings-version">{{ t('settings.version') }} v{{ APP_VERSION }}</span>
        </div>
      </div>
    </div>

    <!-- Clear credentials confirm modal -->
    <div v-if="showClearCredConfirm" class="modal-overlay" @click.self="showClearCredConfirm = false">
      <div class="modal-body">
        <div class="modal-header">
          <span>{{ t('settings.clearCredentials') }}</span>
          <button class="modal-close" @click="showClearCredConfirm = false">&times;</button>
        </div>
        <p class="info-text">{{ t('settings.clearCredentialsConfirm') }}</p>
        <div class="modal-actions">
          <button class="modal-btn" @click="showClearCredConfirm = false">{{ t('common.cancel') }}</button>
          <button class="modal-btn is-danger" @click="clearCredentials"><Trash2Icon :size="14"/> {{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUiStore } from '@/stores/uiStore';
import { setLocale } from '@/i18n';
import { useNotifications } from '@/composables/useNotifications';
import { verifyMasterPassword, setupMasterPassword } from '@/utils/crypto';
import { useConnectionStore } from '@/stores/connectionStore';
import { Settings as SettingsIcon, Lock, Trash2 as Trash2Icon, Copy as CopyIcon, Server as ServerIcon } from 'lucide-vue-next';
import { getRuntimeBackendBase, setRuntimeBackendBase, getApiBaseUrl } from '@/utils/constants';
import { getBackendToken, setBackendToken, apiFetch } from '@/utils/api';
const { t, locale } = useI18n();
  const { showSuccess, showError, showInfo } = useNotifications();

const props = defineProps({
  visible: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const uiStore = useUiStore();
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

const panelRef = ref(null);
const hasMasterSession = computed(() => {
  try { return !!sessionStorage.getItem('webssh_master'); } catch { return false; }
});

const currentThemeId = ref(uiStore.currentPreset);
const fontSize = ref(parseInt(localStorage.getItem('appFontSize') || '14'));
const animationsEnabled = ref(localStorage.getItem('appAnimations') !== 'false');
const cursorStyle = ref(localStorage.getItem('termCursorStyle') || 'block');
const scrollback = ref(parseInt(localStorage.getItem('termScrollback') || '5000'));
const currentLocale = ref(localStorage.getItem('appLocale') || 'en-US');
const termBgColor = ref(localStorage.getItem('termBgColor') || '');

const themes = [
  {
    id: 'light', label: t('settings.light'),
    colors: { primary: '#6366f1', sidebar: '#f0f2f8', text: '#cdd0db' },
    previewStyle: { background: '#f8f9fc' },
  },
  {
    id: 'dark', label: t('settings.dark'),
    colors: { primary: '#818cf8', sidebar: '#1a1a2e', text: '#4a4a5e' },
    previewStyle: { background: '#0f0f1a' },
  },
  {
    id: 'dracula', label: t('settings.themeDracula'),
    colors: { primary: '#bd93f9', sidebar: '#21222c', text: '#6272a4' },
    previewStyle: { background: '#282a36' },
  },
  {
    id: 'nord', label: t('settings.themeNord'),
    colors: { primary: '#88c0d0', sidebar: '#3b4252', text: '#81a1c1' },
    previewStyle: { background: '#2e3440' },
  },
];

watch(() => props.visible, (val) => {
  if (val) {
    currentThemeId.value = uiStore.currentPreset;
    currentLocale.value = localStorage.getItem('appLocale') || 'en-US';
    nextTick(() => panelRef.value?.focus());
    document.addEventListener('keydown', onDocKeydown);
    fetchServerInfo();
  } else {
    document.removeEventListener('keydown', onDocKeydown);
  }
});

function onDocKeydown(e) {
  if (e.key === 'Escape') close();
}

function applyTheme(id) {
  currentThemeId.value = id;
  uiStore.setThemePreset(id);
  const themeColors = themes.find(t => t.id === id)?.colors;
  if (themeColors) {
    document.documentElement.style.setProperty('--theme-primary', themeColors.primary);
  }
  const label = themes.find(t => t.id === id)?.label || id;
  showSuccess(t('settings.themeChanged', { theme: label }));
  const panel = panelRef.value;
  if (panel) {
    panel.style.transition = 'background 0s';
    panel.style.background = 'color-mix(in srgb, var(--bulma-primary) 8%, var(--bulma-scheme-main))';
    setTimeout(() => { panel.style.background = ''; }, 150);
  }
}

function adjustFontSize(delta) {
  const newSize = Math.min(20, Math.max(12, fontSize.value + delta));
  fontSize.value = newSize;
  localStorage.setItem('appFontSize', String(newSize));
  document.documentElement.style.setProperty('--app-font-size', `${newSize}px`);
  window.dispatchEvent(new CustomEvent('term-settings-change', { detail: { fontSize: newSize } }));
  showSuccess(t('settings.fontSizeChanged', { size: newSize }));
}

function onLocaleChange() {
  locale.value = currentLocale.value;
  setLocale(currentLocale.value);
  showSuccess(t('settings.languageChanged'));
}

watch(animationsEnabled, (val) => {
  localStorage.setItem('appAnimations', String(val));
  document.documentElement.classList.toggle('animations-disabled', !val);
  showSuccess(val ? t('settings.animationsEnabled') : t('settings.animationsDisabled'));
});

watch(cursorStyle, (val) => {
  localStorage.setItem('termCursorStyle', val);
  window.dispatchEvent(new CustomEvent('term-settings-change', { detail: { cursorStyle: val } }));
  showSuccess(t('settings.cursorStyleChanged'));
});
watch(scrollback, (val) => {
  localStorage.setItem('termScrollback', String(val));
  window.dispatchEvent(new CustomEvent('term-settings-change', { detail: { scrollback: val } }));
  showSuccess(t('settings.scrollbackChanged', { count: val }));
});

let termBgTimer = null;
function onTermBgInput() {
  if (termBgTimer) clearTimeout(termBgTimer);
  termBgTimer = setTimeout(() => {
    if (termBgColor.value) {
      localStorage.setItem('termBgColor', termBgColor.value);
      window.dispatchEvent(new CustomEvent('term-settings-change', { detail: { bgColor: termBgColor.value } }));
      showSuccess(t('settings.bgColorChanged'));
    }
  }, 200);
}
function resetTermBg() {
  termBgColor.value = '';
  localStorage.removeItem('termBgColor');
  window.dispatchEvent(new CustomEvent('term-settings-change', { detail: { bgColor: '' } }));
  showSuccess(t('settings.bgColorReset'));
}

// ── Change Password ──
const pwCurrent = ref('');
const pwNew = ref('');
const pwConfirm = ref('');
const pwShow = ref(false);
const pwLoading = ref(false);

const pwCanSubmit = computed(() =>
  pwCurrent.value.length > 0 && pwNew.value.length >= 4 && pwNew.value === pwConfirm.value && !pwLoading.value
);

async function changePassword() {
  if (!pwCanSubmit.value) return;
  pwLoading.value = true;
  try {
    const ok = await verifyMasterPassword(pwCurrent.value);
    if (!ok) {
      showError(t('settings.incorrectCurrentPassword'));
      pwLoading.value = false;
      return;
    }
    // Re-encrypt remembered credentials with the NEW key before swapping the
    // live master password — otherwise they'd stay locked to the old one.
    try { await connectionStore.reencryptSessionCredentials(pwCurrent.value, pwNew.value); } catch {}
    await setupMasterPassword(pwNew.value);
    sessionStorage.setItem('webssh_master', pwNew.value);
    const isElectron = typeof window !== 'undefined' && window.navigator.userAgent.includes('Electron');
    if (isElectron) localStorage.setItem('webssh_exe_master', pwNew.value);
    pwCurrent.value = '';
    pwNew.value = '';
    pwConfirm.value = '';
    showSuccess(t('settings.passwordChanged'));
  } catch (e) {
    showError(t('settings.passwordChangeFailed') + ' ' + (e.message || ''));
  } finally {
    pwLoading.value = false;
  }
}

function close() { emit('close'); }

// ── Data & security extras ──
const showClearCredConfirm = ref(false);

function clearCredentials() {
  showClearCredConfirm.value = false;
  const n = connectionStore.clearAllLocalCredentials();
  connectionStore.clearAllSessionCredentials();
  showSuccess(t('settings.credentialsCleared', { n }));
}

function lockNow() {
  try { sessionStorage.removeItem('webssh_master'); } catch {}
  try { localStorage.removeItem('webssh_exe_master'); } catch {}
  // Also drop device-level auto-unlock, otherwise the app re-unlocks instantly.
  try { localStorage.removeItem('webssh_saved_master'); } catch {}
  window.location.reload();
}

// ── Model API sync toggle ──
const connectionStore = useConnectionStore();
const modelSyncEnabled = ref(connectionStore.isModelSyncEnabled());
const modelSyncBusy = ref(false);

async function toggleModelSync() {
  if (modelSyncBusy.value) return;
  modelSyncBusy.value = true;
  try {
    if (!modelSyncEnabled.value) {
      connectionStore.setModelSyncEnabled(true);
      const r = await connectionStore.syncSavedServersToBackend();
      if (r.success) {
        modelSyncEnabled.value = true;
        showSuccess(t('settings.modelApiSynced', { n: r.synced ?? 0 }));
      } else {
        connectionStore.setModelSyncEnabled(false);
        showError(r.error === 'model sync disabled'
          ? t('settings.modelApiNeedToken')
          : `${t('settings.modelApiFail')}: ${r.error}`);
      }
    } else {
      connectionStore.setModelSyncEnabled(false);
      const r = await connectionStore.clearBackendModelServers();
      modelSyncEnabled.value = false;
      if (r.success) showInfo(t('settings.modelApiOff'));
      else showError(`${t('settings.modelApiFail')}: ${r.error}`);
    }
  } finally {
    modelSyncBusy.value = false;
  }
}

// ── Runtime backend (gateway) address ──
const backendUrl = ref(getRuntimeBackendBase());
const backendToken = ref(getBackendToken());
const backendUrlSaved = computed(() => !!getRuntimeBackendBase());

function saveBackend() {
  const url = backendUrl.value.trim();
  if (url && !setRuntimeBackendBase(url)) {
    showError(t('settings.backendInvalid'));
    return;
  }
  if (!url) setRuntimeBackendBase('');
  setBackendToken(backendToken.value.trim());
  showSuccess(t('settings.backendSaved'));
}

function clearBackend() {
  backendUrl.value = '';
  backendToken.value = '';
  setRuntimeBackendBase('');
  setBackendToken('');
  showInfo(t('settings.backendCleared'));
}

// ── LAN address discovery ──
// Ask the (current or embedded) server for its own LAN IPv4 addresses so a
// phone on the same network can be pointed at it without guessing.
const lanAddresses = ref([]);
const lanPort = ref('');
async function fetchServerInfo() {
  lanAddresses.value = [];
  lanPort.value = '';
  try {
    const res = await apiFetch(`${getApiBaseUrl()}/server-info`);
    if (!res.ok) return;
    const data = await res.json();
    lanAddresses.value = Array.isArray(data.addresses) ? data.addresses : [];
    lanPort.value = data.port || '';
  } catch { /* no backend reachable — nothing to suggest */ }
}
function copyLan(ip) {
  const url = `http://${ip}:${lanPort.value}`;
  try {
    navigator.clipboard.writeText(url).then(
      () => showSuccess(t('settings.lanCopied', { url })),
      () => showError(t('common.copyFailed'))
    );
  } catch { showError(t('common.copyFailed')); }
}

// ── MCP agent connection helper ──
const mcpConfigSnippet = computed(() => {
  const origin = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : 'http://127.0.0.1:9627';
  return JSON.stringify({
    mcpServers: {
      webssh: {
        command: 'node',
        args: ['webssh/core/mcp/server.mjs'],
        env: { WEBSSH_URL: origin, WEBSSH_TOKEN: '<AUTH_TOKEN>' },
      },
    },
  }, null, 2);
});

function copyMcpConfig() {
  const text = mcpConfigSnippet.value;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showSuccess(t('settings.mcpCopied')))
      .catch(() => showError(t('common.error')));
  } else {
    showError(t('common.error'));
  }
}
</script>

<style lang="scss" scoped>
/* ── Overlay & panel shell (centered modal card, unified with panel system) ── */
.settings-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(15, 15, 25, 0.45); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  animation: panelFadeIn 0.15s ease-out;
}
@keyframes panelFadeIn { from { opacity: 0; } to { opacity: 1; } }

.settings-panel {
  width: 560px; max-width: 94vw;
  max-height: 88vh;
  background: var(--bulma-scheme-main);
  border: 1px solid var(--bulma-border-light);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  display: flex; flex-direction: column;
  overflow: hidden; outline: none;
  animation: settingsIn 0.18s cubic-bezier(0.34, 1.4, 0.64, 1);
}
@keyframes settingsIn {
  from { opacity: 0; transform: scale(0.96) translateY(12px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.settings-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.85rem 1.1rem;
  border-bottom: 1px solid var(--bulma-border-light);
  background: var(--bulma-scheme-main-bis);
  flex-shrink: 0;
}
.settings-title {
  margin: 0; display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.95em; font-weight: 650; letter-spacing: -0.01em;
  color: var(--bulma-text-strong);
  .lucide { color: var(--bulma-primary); }
}
.settings-close {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border: none; border-radius: 8px;
  background: none; font-size: 1.35em; line-height: 1; cursor: pointer;
  color: var(--bulma-text-light); transition: all 0.12s;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
}

.settings-body {
  flex: 1; overflow-y: auto;
  padding: 0.9rem 1.1rem 1.1rem;
  display: flex; flex-direction: column; gap: 1.1rem;
}

.settings-section { min-width: 0; }
.settings-section-title {
  font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--bulma-text-light); font-weight: 700;
  margin: 0 0 0.6rem; padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--bulma-border-light);
}
.subsection-label {
  font-size: 0.78em; font-weight: 600; color: var(--bulma-text);
  margin: 0 0 0.35rem;
}

.settings-row {
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  padding: 0.45rem 0; font-size: 0.85em;
  color: var(--bulma-text);
  & + & { }
}
.row-label { color: var(--bulma-text); }
.danger-row { border-top: 1px solid var(--bulma-border-light); margin-top: 0.5rem; padding-top: 0.7rem; }

/* ── Theme grid (2 columns) ── */
.theme-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.55rem;
}
.theme-card {
  display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
  padding: 0.6rem 0.55rem; border-radius: 10px;
  border: 2px solid transparent;
  background: var(--bulma-scheme-main-bis);
  cursor: pointer; transition: all 0.15s;
  &:hover { border-color: var(--bulma-border); background: var(--bulma-scheme-main-ter); transform: translateY(-1px); }
  &.is-active { border-color: var(--bulma-primary); background: color-mix(in srgb, var(--bulma-primary) 8%, var(--bulma-scheme-main)); }
}
.theme-preview {
  width: 100%; height: 48px; border-radius: 8px; overflow: hidden;
  display: grid; grid-template-columns: 22px 1fr; grid-template-rows: 10px 1fr;
  gap: 2px; padding: 4px;
}
.theme-preview-bar { grid-column: 1 / -1; border-radius: 3px; }
.theme-preview-sidebar { border-radius: 3px; }
.theme-preview-content { display: flex; flex-direction: column; gap: 3px; padding: 3px; }
.theme-preview-line { height: 4px; border-radius: 2px; width: 80%; &.short { width: 50%; } }
.theme-name { font-size: 0.75em; font-weight: 600; color: var(--bulma-text); }

/* ── Controls ── */
.font-size-ctrl {
  display: flex; align-items: center; gap: 0.4rem;
  border: 1px solid var(--bulma-border); border-radius: 8px;
  padding: 0.15rem 0.3rem; background: var(--bulma-input-background-color);
}
.fs-btn {
  width: 26px; height: 26px; border: none; border-radius: 6px;
  background: none; font-size: 1em; font-weight: 600; cursor: pointer;
  color: var(--bulma-text-light); display: flex; align-items: center; justify-content: center;
  &:hover:not(:disabled) { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
  &:disabled { opacity: 0.35; cursor: not-allowed; }
}
.fs-value { font-size: 0.82em; font-weight: 600; color: var(--bulma-text); min-width: 42px; text-align: center; font-family: var(--bulma-family-monospace); }

.settings-select {
  border: 1px solid var(--bulma-border); border-radius: 8px;
  padding: 0.35rem 0.55rem; font-size: 0.82em;
  background: var(--bulma-input-background-color); color: var(--bulma-text);
  outline: none; cursor: pointer; max-width: 180px;
  &:focus { border-color: var(--bulma-primary); }
  option { color: var(--bulma-text); background: var(--bulma-scheme-main); }
}

.switch {
  position: relative; width: 40px; height: 23px; flex-shrink: 0;
  border-radius: 12px; background: var(--bulma-border);
  border: none; cursor: pointer; padding: 0; transition: background 0.2s;
  &.is-active { background: var(--bulma-primary); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}
.switch-slider {
  position: absolute; top: 3px; left: 3px;
  width: 17px; height: 17px; border-radius: 50%;
  background: var(--bulma-scheme-main);
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  .is-active & { transform: translateX(17px); }
}

.settings-bg-ctrl { display: flex; align-items: center; gap: 0.35rem; }
.color-picker {
  width: 32px; height: 30px; padding: 0; border: 1.5px solid var(--bulma-border);
  border-radius: 8px; cursor: pointer; background: none;
  &::-webkit-color-swatch-wrapper { padding: 2px; }
  &::-webkit-color-swatch { border: none; border-radius: 4px; }
}
.btn-reset-bg {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--bulma-border); border-radius: 6px;
  background: var(--bulma-scheme-main-bis); color: var(--bulma-text-light);
  font-size: 0.85em; cursor: pointer; padding: 0;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
}

/* ── Password form ── */
.pw-change-form { display: flex; flex-direction: column; gap: 0.45rem; }
.pw-input {
  width: 100%; padding: 0.5rem 0.65rem; border: 1px solid var(--bulma-border);
  border-radius: 8px; font-size: 0.82em; outline: none; box-sizing: border-box;
  background: var(--bulma-input-background-color); color: var(--bulma-text);
  transition: border-color 0.15s, box-shadow 0.15s;
  &:focus { border-color: var(--bulma-primary); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12); }
}
.pw-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 0.15rem; }
.pw-show-label {
  display: flex; align-items: center; gap: 0.35rem; font-size: 0.75em;
  color: var(--bulma-text-light); cursor: pointer;
  input { accent-color: var(--bulma-primary); }
}
.pw-btn {
  padding: 0.45rem 0.9rem; border: none; border-radius: 8px;
  font-size: 0.78em; font-weight: 600; cursor: pointer;
  background: linear-gradient(135deg, var(--bulma-primary), var(--bulma-link, var(--bulma-primary)));
  color: white; transition: all 0.12s;
  &:hover:not(:disabled) { box-shadow: 0 3px 10px rgba(99,102,241,0.3); }
  &:disabled { opacity: 0.5; cursor: default; }
}

.danger-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.4rem 0.8rem; border-radius: 8px; border: none;
  font-size: 0.78em; font-weight: 500; cursor: pointer;
  background: color-mix(in srgb, var(--bulma-danger) 12%, transparent);
  color: var(--bulma-danger); transition: background 0.12s;
  &:hover { background: color-mix(in srgb, var(--bulma-danger) 22%, transparent); }
}
.settings-minor-btn {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.4rem 0.8rem; border-radius: 8px;
  border: 1px solid var(--bulma-border);
  font-size: 0.78em; font-weight: 500; cursor: pointer;
  background: var(--bulma-input-background-color); color: var(--bulma-text);
  transition: border-color 0.12s;
  &:hover { border-color: var(--bulma-text-light); }
}

.model-api-hint {
  font-size: 0.72em; color: var(--bulma-text-light); line-height: 1.5;
  margin: 0.3rem 0 0;
}

.mcp-config-box {
  margin-top: 0.5rem; border: 1px solid var(--bulma-border-light);
  border-radius: 10px; overflow: hidden; background: var(--bulma-scheme-main-bis);
}
.mcp-config {
  margin: 0; padding: 0.6rem 0.75rem; overflow-x: auto;
  font-family: var(--bulma-family-monospace); font-size: 0.68em; line-height: 1.5;
  color: var(--bulma-text);
}
.mcp-config-box .settings-minor-btn {
  margin: 0 0.6rem 0.6rem;
}

/* ── Backend (gateway) config ── */
.backend-input { margin-top: 0.45rem; font-family: var(--bulma-family-monospace); font-size: 0.78em; }
.backend-actions {
  display: flex; align-items: center; justify-content: flex-end; gap: 0.4rem;
  margin-top: 0.55rem;
}

/* ── LAN address hint ── */
.lan-hint {
  margin-top: 0.6rem; padding: 0.55rem 0.65rem;
  border: 1px dashed var(--bulma-border);
  border-radius: 8px; background: var(--bulma-scheme-main-bis);
}
.lan-label { display: block; font-size: 0.72em; font-weight: 600; color: var(--bulma-text-light); margin-bottom: 0.35rem; }
.lan-chip {
  display: inline-block; margin: 0 0.3rem 0.3rem 0; padding: 0.3rem 0.6rem;
  font-size: 0.75em; font-family: var(--bulma-family-monospace);
  border: 1px solid var(--bulma-border-light); border-radius: 6px;
  background: var(--bulma-scheme-main); color: var(--bulma-primary);
  cursor: pointer; transition: all 0.12s;
  &:hover { border-color: var(--bulma-primary); box-shadow: 0 1px 6px rgba(99, 102, 241, 0.25); }
}
.lan-tip { margin: 0.15rem 0 0; font-size: 0.68em; color: var(--bulma-text-light); line-height: 1.5; }

/* ── Shortcuts ── */
.shortcut-row {
  display: flex; align-items: center; gap: 0.25rem;
  padding: 0.3rem 0; font-size: 0.8em;
  kbd {
    font-family: var(--bulma-family-monospace); font-size: 0.85em;
    padding: 0.15rem 0.45rem; border-radius: 5px;
    background: var(--bulma-scheme-main-ter); border: 1px solid var(--bulma-border-light);
    border-bottom-width: 2px; color: var(--bulma-text);
  }
  .kbd-plus { color: var(--bulma-text-light); }
  .shortcut-desc { margin-left: 0.6rem; color: var(--bulma-text-light); }
}

.settings-footer {
  flex-shrink: 0; padding: 0.6rem 1.1rem;
  border-top: 1px solid var(--bulma-border-light);
  display: flex; justify-content: center;
}
.settings-version { font-size: 0.7em; color: var(--bulma-text-light); font-family: var(--bulma-family-monospace); }

/* ── Mobile: full-screen sheet ── */
@media (max-width: 600px) {
  .settings-overlay { align-items: flex-end; }
  .settings-panel {
    width: 100vw; max-width: 100vw; max-height: 92vh;
    border-radius: 16px 16px 0 0; border-left: none; border-right: none; border-bottom: none;
  }
  .theme-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
