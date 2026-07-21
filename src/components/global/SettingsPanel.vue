<template>
  <Teleport to="body">
    <div v-if="visible" class="settings-overlay" @click.self="close">
      <div class="settings-panel" ref="panelRef">
        <div class="settings-header">
          <h3 class="title is-5 mb-0">{{ t('settings.title') }}</h3>
          <button class="delete" @click="close" :aria-label="t('common.close')"></button>
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
                <button class="button is-static">{{ fontSize }}px</button>
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

const currentThemeId = ref(uiStore.currentTheme === 'dark' ? 'dark' : 'light');
const fontSize = ref(parseInt(localStorage.getItem('appFontSize') || '14'));
const animationsEnabled = ref(localStorage.getItem('appAnimations') !== 'false');
const cursorStyle = ref(localStorage.getItem('termCursorStyle') || 'block');
const scrollback = ref(parseInt(localStorage.getItem('termScrollback') || '5000'));
const currentLocale = ref(localStorage.getItem('appLocale') || 'en-US');

const themes = [
  {
    id: 'light', label: 'Light',
    colors: { primary: '#6366f1', sidebar: '#f0f2f8', text: '#cdd0db' },
    previewStyle: { background: '#f8f9fc' },
  },
  {
    id: 'dark', label: 'Dark',
    colors: { primary: '#818cf8', sidebar: '#1a1a2e', text: '#64647a' },
    previewStyle: { background: '#0f0f1a' },
  },
  {
    id: 'dracula', label: t('settings.themeDracula'),
    colors: { primary: '#bd93f9', sidebar: '#21222c', text: '#555566' },
    previewStyle: { background: '#282a36' },
  },
  {
    id: 'nord', label: t('settings.themeNord'),
    colors: { primary: '#88c0d0', sidebar: '#2e3440', text: '#5e6a7a' },
    previewStyle: { background: '#3b4252' },
  },
];

watch(() => props.visible, (val) => {
  if (val) {
    currentThemeId.value = uiStore.currentTheme === 'dark' ? 'dark' : 'light';
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
  background: rgba(0,0,0,0.3);
  backdrop-filter: blur(2px);
  display: flex;
  justify-content: flex-end;
}

.settings-panel {
  width: 380px;
  height: 100vh;
  background: var(--bulma-scheme-main);
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0,0,0,0.12);
  outline: none;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--bulma-border-light);
  flex-shrink: 0;
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
}

.settings-section {
  margin-bottom: 1.5rem;
  &:last-child { margin-bottom: 0; }
}

.settings-section-title {
  font-size: 0.7em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--bulma-text-light);
  margin-bottom: 0.75rem;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
  font-size: 0.85em;
}

.theme-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem;
  border-radius: 8px;
  border: 2px solid transparent;
  background: none;
  cursor: pointer;
  transition: border-color 0.12s;
  &:hover { border-color: var(--bulma-border); }
  &.is-active { border-color: var(--bulma-primary); }
}

.theme-preview {
  width: 100%;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  display: grid;
  grid-template-columns: 20px 1fr;
  grid-template-rows: 8px 1fr;
  gap: 2px;
  padding: 3px;
}

.theme-preview-bar { grid-column: 1 / -1; border-radius: 2px; }
.theme-preview-sidebar { border-radius: 2px; }
.theme-preview-content { display: flex; flex-direction: column; gap: 2px; padding: 2px; }
.theme-preview-line {
  height: 3px; border-radius: 2px; width: 80%;
  &.short { width: 50%; }
}

.theme-name {
  font-size: 0.7em;
  font-weight: 500;
  color: var(--bulma-text);
}

.switch {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--bulma-border);
  border: none;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s;
  &.is-active { background: var(--bulma-primary); }
}

.switch-slider {
  position: absolute;
  top: 2px; left: 2px;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: white;
  transition: transform 0.15s;
  .is-active & { transform: translateX(16px); }
}
</style>
