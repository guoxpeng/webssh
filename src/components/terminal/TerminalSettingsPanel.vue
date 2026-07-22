<template>
  <div class="term-settings-panel" @click.stop>
    <div class="ts-header">{{ t('terminal.terminalSettings') }}</div>

    <div class="ts-row">
      <span class="ts-label">{{ t('settings.fontSize') }}</span>
      <div class="ts-stepper">
        <button class="ts-step-btn" @click="adjust(-1)" :disabled="localSize <= 10">−</button>
        <span class="ts-value">{{ localSize }}</span>
        <button class="ts-step-btn" @click="adjust(1)" :disabled="localSize >= 28">+</button>
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
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  fontSize: { type: Number, default: 13 },
  cursorStyle: { type: String, default: 'block' },
  cursorBlink: { type: Boolean, default: true },
});

const emit = defineEmits(['update']);

const localSize = ref(props.fontSize);
const localCursor = ref(props.cursorStyle);
const localBlink = ref(props.cursorBlink);

watch(() => props.fontSize, (v) => localSize.value = v);
watch(() => props.cursorStyle, (v) => localCursor.value = v);
watch(() => props.cursorBlink, (v) => localBlink.value = v);

function adjust(delta) {
  localSize.value = Math.min(28, Math.max(10, localSize.value + delta));
  emitChange();
}

function emitChange() {
  emit('update', {
    fontSize: localSize.value,
    cursorStyle: localCursor.value,
    cursorBlink: localBlink.value,
  });
}
</script>

<style scoped>
.term-settings-panel {
  position: absolute; right: 0; top: 100%; margin-top: 4px; z-index: 50;
  width: 200px; background: var(--bulma-scheme-main);
  border: 1px solid var(--bulma-border-light); border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  padding: 0.6rem; display: flex; flex-direction: column; gap: 0.4rem;
}
.ts-header { font-size: 0.75em; font-weight: 600; color: var(--bulma-text-strong); padding-bottom: 0.25rem; border-bottom: 1px solid var(--bulma-border-light); margin-bottom: 0.1rem; }
.ts-row { display: flex; align-items: center; justify-content: space-between; font-size: 0.78em; gap: 0.5rem; }
.ts-label { color: var(--bulma-text-light); flex-shrink: 0; }
.ts-stepper { display: flex; align-items: center; gap: 0.3rem; }
.ts-step-btn {
  width: 22px; height: 22px; border: 1px solid var(--bulma-border); border-radius: 4px;
  background: var(--bulma-scheme-main); cursor: pointer; font-size: 1em; line-height: 1;
  display: flex; align-items: center; justify-content: center; color: var(--bulma-text);
  &:hover { border-color: var(--bulma-primary); }
  &:disabled { opacity: 0.3; cursor: default; }
}
.ts-value { font-weight: 600; min-width: 22px; text-align: center; font-family: monospace; }
.ts-select {
  border: 1px solid var(--bulma-border); border-radius: 5px; padding: 0.2rem 0.3rem;
  font-size: 0.85em; background: var(--bulma-input-background-color); color: var(--bulma-text); outline: none;
}
.ts-toggle-label { display: flex; align-items: center; gap: 0.35rem; cursor: pointer; color: var(--bulma-text); input { accent-color: var(--bulma-primary); } }
</style>
