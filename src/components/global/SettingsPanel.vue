<template>
  <Teleport to="body">
    <div v-if="visible" class="settings-overlay" @click.self="close">
      <div class="settings-panel" ref="panelRef">
        <div class="settings-header">
          <h3 class="title is-5 mb-0">{{ t('settings.title') }}</h3>
        </div>

        <div class="settings-body">
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
              <span>{{ t('settings.fontSize') }}</span>
              <div class="buttons are-small has-addons">
                <button class="button" @click="adjustFontSize(-1)" :disabled="fontSize <= 12">{{ t('settings.fontSizeDecrease') }}</button>
                <button class="button is-static">{{ fontSize }}<span class="is-sr-only">{{ t('common.pixels') }}</span>px</button>
                <button class="button" @click="adjustFontSize(1)" :disabled="fontSize >= 20">{{ t('settings.fontSizeIncrease') }}</button>
              </div>
            </div>
            <div class="settings-row">
              <span>{{ t('settings.animations') }}</span>
              <button class="switch is-small is-primary" :class="{ 'is-active': animationsEnabled }"
                      @click="animationsEnabled = !animationsEnabled"
                      :aria-label="`Animations ${animationsEnabled ? 'on' : 'off'}`">
                <span class="switch-slider"></span>
              </button>
            </div>
            <div class="settings-row">
              <span>{{ t('settings.language') }}</span>
              <div class="select is-small">
                <select v-model="currentLocale" @change="onLocaleChange">
                  <option value="zh-CN">中文</option>
                  <option value="en-US">English</option>
                </select>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <h4 class="settings-section-title">{{ t('settings.terminal') }}</h4>
            <div class="settings-row">
              <span>{{ t('settings.cursorStyle') }}</span>
              <div class="select is-small">
                <select v-model="cursorStyle">
                  <option value="block">{{ t('settings.cursorBlock') }}</option>
                  <option value="underline">{{ t('settings.cursorUnderline') }}</option>
                  <option value="bar">{{ t('settings.cursorBar') }}</option>
                </select>
              </div>
            </div>
            <div class="settings-row">
              <span>{{ t('settings.scrollback') }}</span>
              <div class="select is-small">
                <select v-model="scrollback">
                  <option :value="1000">1,000</option>
                  <option :value="5000">5,000</option>
                  <option :value="10000">10,000</option>
                  <option :value="50000">50,000</option>
                </select>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <h4 class="settings-section-title">{{ t('settings.session') }}</h4>
            <div class="settings-row">
              <span>{{ t('settings.rememberCredentials') }}</span>
              <button class="button is-small is-danger is-light" @click="clearCredentials">{{ t('settings.clearCredentials') }}</button>
            </div>
          </div>
        </div>

        <div class="settings-footer">
          <button class="btn-confirm" @click="close">{{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUiStore } from '@/stores/uiStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { setLocale } from '@/i18n';

const { t, locale } = useI18n();

const props = defineProps({
  visible: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const uiStore = useUiStore();
const connectionStore = useConnectionStore();

const panelRef = ref(null);

const currentThemeId = ref(uiStore.currentPreset);
const fontSize = ref(parseInt(localStorage.getItem('appFontSize') || '14'));
const animationsEnabled = ref(localStorage.getItem('appAnimations') !== 'false');
const cursorStyle = ref(localStorage.getItem('termCursorStyle') || 'block');
const scrollback = ref(parseInt(localStorage.getItem('termScrollback') || '5000'));
const currentLocale = ref(localStorage.getItem('appLocale') || 'en-US');

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
  }
});

function applyTheme(id) {
  currentThemeId.value = id;
  uiStore.setThemePreset(id);
  const themeColors = themes.find(t => t.id === id)?.colors;
  if (themeColors) {
    document.documentElement.style.setProperty('--theme-primary', themeColors.primary);
  }
  // Visual feedback: brief flash
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
}

function clearCredentials() {
  connectionStore.clearAllSessionCredentials();
}

function onLocaleChange() {
  locale.value = currentLocale.value;
  setLocale(currentLocale.value);
}

watch(animationsEnabled, (val) => {
  localStorage.setItem('appAnimations', String(val));
  document.documentElement.classList.toggle('animations-disabled', !val);
});

watch(cursorStyle, (val) => localStorage.setItem('termCursorStyle', val));
watch(scrollback, (val) => localStorage.setItem('termScrollback', String(val)));

function close() { emit('close'); }
</script>

<style lang="scss" scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: var(--app-overlay);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: flex-start;
  animation: overlayIn 0.2s ease;
}

.settings-panel {
  width: 400px;
  max-width: 100vw;
  height: 100vh;
  background: var(--bulma-scheme-main);
  display: flex;
  flex-direction: column;
  box-shadow: 8px 0 40px rgba(0,0,0,0.15);
  outline: none;
  animation: slideIn 0.25s ease-out;
}

@keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--bulma-border-light);
  flex-shrink: 0;
  .title { color: var(--bulma-text-strong); font-weight: 600; letter-spacing: -0.01em; }
  .delete { background: var(--bulma-border-light); transition: all 0.15s; &:hover { background: var(--bulma-text-light); } }
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
  scrollbar-width: thin;
}

.settings-section {
  margin-bottom: 1.75rem;
  &:last-child { margin-bottom: 0; }
}

.settings-section-title {
  font-size: 0.68em;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--bulma-text);
  margin-bottom: 0.85rem;
  font-weight: 700;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--bulma-border-light);
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0;
  font-size: 0.88em;
  color: var(--bulma-text-strong);
  &:hover { color: var(--bulma-text-strong); }
}

.settings-header .title { color: var(--bulma-text-strong) !important; font-weight: 700; }

.theme-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.65rem 0.5rem;
  border-radius: 10px;
  border: 2px solid transparent;
  background: var(--bulma-scheme-main-bis);
  cursor: pointer;
  transition: all 0.15s;
  &:hover { border-color: var(--bulma-border); background: var(--bulma-scheme-main-ter); transform: translateY(-1px); }
  &.is-active { border-color: var(--bulma-primary); background: color-mix(in srgb, var(--bulma-primary) 8%, var(--bulma-scheme-main)); }
}

/* Fix select/option text colors for all themes */
:deep(.select select) { color: var(--bulma-text-strong) !important; background: var(--bulma-input-background-color, var(--bulma-scheme-main-ter)) !important; }
:deep(.select select option) { color: var(--bulma-text-strong) !important; }

.theme-preview {
  width: 100%;
  height: 52px;
  border-radius: 8px;
  overflow: hidden;
  display: grid;
  grid-template-columns: 22px 1fr;
  grid-template-rows: 10px 1fr;
  gap: 2px;
  padding: 4px;
}

.theme-preview-bar { grid-column: 1 / -1; border-radius: 3px; }
.theme-preview-sidebar { border-radius: 3px; }
.theme-preview-content { display: flex; flex-direction: column; gap: 3px; padding: 3px; }
.theme-preview-line {
  height: 4px; border-radius: 2px; width: 80%;
  &.short { width: 50%; }
}

.theme-name {
  font-size: 0.72em;
  font-weight: 600;
  color: var(--bulma-text);
}

.switch {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 11px;
  background: var(--bulma-border);
  border: none;
  cursor: pointer;
  padding: 0;
  transition: background 0.2s;
  &.is-active { background: var(--bulma-primary); }
}

.switch-slider {
  position: absolute;
  top: 3px; left: 3px;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: var(--bulma-scheme-main);
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  .is-active & { transform: translateX(16px); }
}

.settings-footer {
  flex-shrink: 0;
  padding: 0.85rem 1.5rem;
  border-top: 1px solid var(--bulma-border-light);
}

/* Fix font size +/- buttons theme contrast */
:deep(.buttons.are-small .button) {
  color: var(--bulma-text-strong) !important;
  background: var(--bulma-scheme-main-bis) !important;
  border: 1px solid var(--bulma-border-light) !important;
  &:hover:not(:disabled) { background: var(--bulma-scheme-main-ter) !important; border-color: var(--bulma-border) !important; }
  &:disabled { opacity: 0.4; }
  &.is-static { background: transparent !important; border-color: transparent !important; font-weight: 600; }
}

/* Danger button */
:deep(.is-danger.is-light) {
  color: var(--bulma-danger) !important;
  background: color-mix(in srgb, var(--bulma-danger) 15%, transparent) !important;
  &:hover { background: color-mix(in srgb, var(--bulma-danger) 25%, transparent) !important; }
}

.btn-confirm {
  display: block; width: 100%;
  padding: 0.65rem; border: none; border-radius: 10px;
  font-size: 0.9em; font-weight: 600;
  background: linear-gradient(135deg, hsl(235,40%,45%), hsl(235,50%,58%));
  color: white; cursor: pointer; transition: all 0.15s;
  &:hover { box-shadow: 0 4px 16px rgba(99,102,241,0.35); transform: translateY(-1px); }
  &:active { transform: scale(0.98); }
}

@media (max-width: 480px) {
  .settings-panel { width: 100vw; box-shadow: none; }
  .settings-header { padding: 1rem 1.25rem; }
  .settings-body { padding: 1rem 1.25rem; }
  .settings-footer { padding: 0.75rem 1.25rem; }
}
</style>
