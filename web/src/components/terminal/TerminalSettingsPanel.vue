<template>
  <div class="term-settings-panel" @click.stop>
    <div class="ts-header">{{ t('terminal.terminalSettings') }}</div>

    <div class="ts-row">
      <span class="ts-label">{{ t('settings.fontSize') }}</span>
      <div class="ts-stepper">
        <button class="ts-step-btn" @click="adjust(-1)" :disabled="localSize <= 9">−</button>
        <span class="ts-value">{{ localSize }}</span>
        <button class="ts-step-btn" @click="adjust(1)" :disabled="localSize >= 32">+</button>
      </div>
    </div>

    <div class="ts-row">
      <span class="ts-label">{{ t('settings.cursorStyle') }}</span>
      <select v-model="localCursor" class="ts-select" @change="emitChange">
        <option value="block">▉ Block</option>
        <option value="underline">_ Underline</option>
        <option value="bar">| Bar</option>
      </select>
    </div>

    <div class="ts-row">
      <label class="ts-toggle-label">
        <input type="checkbox" v-model="localBlink" @change="emitChange"/>
        <span>{{ t('terminal.cursorBlink') }}</span>
      </label>
    </div>

    <div class="ts-section-title">{{ t('settings.terminalTheme') }}</div>
    <div class="ts-theme-grid">
      <button v-for="th in themes" :key="th.id" class="ts-theme-swatch"
              :class="{ 'is-active': localTheme === th.id }"
              :style="{ background: th.bg, color: th.fg }"
              :title="th.label"
              @click="localTheme = th.id; emitChange()">
        <span class="swatch-dot" :style="{ background: th.fg }"></span>
        {{ th.label.split(' ')[0] }}
      </button>
      <button class="ts-theme-swatch is-custom" :class="{ 'is-active': localTheme === 'custom' }" @click="localTheme = 'custom'; emitChange()">
        <Palette :size="14"/> Custom
      </button>
    </div>

    <template v-if="localTheme === 'custom'">
      <div class="ts-row">
        <span class="ts-label">{{ t('settings.bgColor') }}</span>
        <input type="color" v-model="localBgColor" @change="emitChange"/>
      </div>
      <div class="ts-row">
        <span class="ts-label">{{ t('settings.fgColor') }}</span>
        <input type="color" v-model="localFgColor" @change="emitChange"/>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Palette } from 'lucide-vue-next';

const { t } = useI18n();

const props = defineProps({
  fontSize: { type: Number, default: 13 },
  cursorStyle: { type: String, default: 'block' },
  cursorBlink: { type: Boolean, default: true },
  themeId: { type: String, default: 'default' },
  bgColor: { type: String, default: '#000000' },
  fgColor: { type: String, default: '#FFFFFF' },
});

const emit = defineEmits(['update']);

const themes = [
  { id: 'default', label: 'Default', bg: '#000000', fg: '#FFFFFF' },
  { id: 'dracula', label: 'Dracula', bg: '#282a36', fg: '#f8f8f2' },
  { id: 'monokai', label: 'Monokai', bg: '#272822', fg: '#f8f8f2' },
  { id: 'nord', label: 'Nord', bg: '#2e3440', fg: '#d8dee9' },
  { id: 'one-dark', label: 'One Dark', bg: '#282c34', fg: '#abb2bf' },
  { id: 'solarized-dark', label: 'Solarized', bg: '#002b36', fg: '#839496' },
  { id: 'solarized-light', label: 'Light', bg: '#fdf6e3', fg: '#657b83' },
];

const localSize = ref(props.fontSize);
const localCursor = ref(props.cursorStyle);
const localBlink = ref(props.cursorBlink);
const localTheme = ref(props.themeId);
const localBgColor = ref(props.bgColor);
const localFgColor = ref(props.fgColor);

watch(() => props.fontSize, v => localSize.value = v);
watch(() => props.themeId, v => localTheme.value = v);
watch(() => props.bgColor, v => localBgColor.value = v);
watch(() => props.fgColor, v => localFgColor.value = v);

function adjust(delta) {
  localSize.value = Math.min(32, Math.max(9, localSize.value + delta));
  emitChange();
}

function emitChange() {
  emit('update', {
    fontSize: localSize.value,
    cursorStyle: localCursor.value,
    cursorBlink: localBlink.value,
    themeId: localTheme.value,
    bgColor: localBgColor.value,
    fgColor: localFgColor.value,
  });
}
</script>

<style scoped>
.term-settings-panel {
  position: absolute; right: 0; top: 100%; margin-top: 4px; z-index: 50;
  width: 260px; background: var(--bulma-scheme-main);
  border: 1px solid var(--bulma-border-light); border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.15); padding: 0.7rem;
  display: flex; flex-direction: column; gap: 0.45rem;
}
.ts-header { font-size: 0.78em; font-weight: 600; color: var(--bulma-text-strong); padding-bottom: 0.3rem; border-bottom: 1px solid var(--bulma-border-light); margin-bottom: 0.1rem; }
.ts-section-title { font-size: 0.7em; font-weight: 500; color: var(--bulma-text-light); margin-top: 0.1rem; }
.ts-row { display: flex; align-items: center; justify-content: space-between; font-size: 0.76em; gap: 0.5rem; }
.ts-label { color: var(--bulma-text-light); flex-shrink: 0; }
.ts-stepper { display: flex; align-items: center; gap: 0.3rem; }
.ts-step-btn {
  width: 24px; height: 24px; border: 1px solid var(--bulma-border); border-radius: 6px;
  background: var(--bulma-scheme-main); cursor: pointer; font-size: 1em; display: flex;
  align-items: center; justify-content: center; color: var(--bulma-text); font-weight: 600;
  &:hover { border-color: var(--bulma-primary); }
  &:disabled { opacity: 0.3; cursor: default; }
}
.ts-value { font-weight: 600; min-width: 22px; text-align: center; font-family: monospace; }
.ts-select {
  border: 1px solid var(--bulma-border); border-radius: 5px; padding: 0.2rem 0.3rem;
  font-size: 0.85em; background: var(--bulma-input-background-color); color: var(--bulma-text); outline: none;
}
.ts-toggle-label { display: flex; align-items: center; gap: 0.35rem; cursor: pointer; color: var(--bulma-text); input { accent-color: var(--bulma-primary); } }

.ts-theme-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.ts-theme-swatch {
  display: flex; align-items: center; gap: 4px; padding: 0.3rem 0.5rem;
  border: 2px solid var(--bulma-border-light); border-radius: 8px;
  font-size: 0.68em; cursor: pointer; font-weight: 500;
  &:hover { border-color: var(--bulma-text-light); }
  &.is-active { border-color: var(--bulma-primary); box-shadow: 0 0 0 1px var(--bulma-primary); }
  &.is-custom { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); display: flex; align-items: center; gap: 4px; }
}
.swatch-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
input[type="color"] { width: 28px; height: 24px; border: 1px solid var(--bulma-border); border-radius: 4px; cursor: pointer; padding: 0; background: none; }
</style>
