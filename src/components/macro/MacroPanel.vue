<template>
  <div class="macro-panel">
    <div class="panel-header">
      <h3 class="panel-title"><PlayCircle :size="16"/> {{ t('macro.title') }}</h3>
      <div class="panel-actions">
        <button class="panel-action-btn" @click="showAddForm = !showAddForm" :title="t('macro.add')">
          <Plus :size="14"/>
        </button>
        <button class="panel-action-btn" @click="exportMacros" :title="t('macro.export')">
          <Download :size="14"/>
        </button>
        <button class="panel-action-btn" @click="triggerImport" :title="t('macro.import')">
          <Upload :size="14"/>
        </button>
        <button class="panel-action-btn" @click="$emit('close')" :title="t('common.close')">
          <X :size="14"/>
        </button>
        <input type="file" ref="importInput" accept=".json" style="display:none" @change="onImportFile"/>
      </div>
    </div>

    <div class="panel-search">
      <Search :size="13" class="search-icon"/>
      <input type="text" v-model="store.searchQuery" :placeholder="t('macro.searchPlaceholder')" class="search-input"/>
      <button v-if="store.searchQuery" class="search-clear" @click="store.searchQuery = ''">&times;</button>
    </div>

    <div v-if="showAddForm" class="add-form">
      <input type="text" v-model="newMacro.name" :placeholder="t('macro.namePlaceholder')" class="form-input" ref="nameInput"/>
      <input type="text" v-model="newMacro.description" :placeholder="t('macro.descPlaceholder')" class="form-input"/>
      <div class="steps-editor">
        <div class="steps-header">
          <span class="steps-title">{{ t('macro.steps') }}</span>
          <button class="add-step-btn" @click="addStep">+ {{ t('macro.addStep') }}</button>
        </div>
        <div v-for="(step, si) in newMacro.steps" :key="si" class="step-row">
          <span class="step-num">{{ si + 1 }}</span>
          <input type="text" v-model="step.command" :placeholder="t('macro.cmdPlaceholder')" class="step-input"/>
          <input type="number" v-model.number="step.delay" class="step-delay" min="0" max="5000" :title="t('macro.delayMs')"/>
          <button class="step-remove" @click="newMacro.steps.splice(si, 1)" :title="t('common.remove')">&times;</button>
        </div>
      </div>
      <input type="text" v-model="newMacro.tags" :placeholder="t('macro.tagsPlaceholder')" class="form-input"/>
      <div class="add-form-actions">
        <button class="add-btn" @click="addNew">{{ t('macro.save') }}</button>
        <button class="cancel-btn" @click="showAddForm = false">{{ t('common.cancel') }}</button>
      </div>
    </div>

    <div class="panel-list" v-if="store.filteredMacros.length > 0">
      <div v-for="m in store.filteredMacros" :key="m.id" class="macro-item">
        <div class="macro-top">
          <div class="macro-info" @click="m.expanded = !m.expanded">
            <span class="macro-name">{{ m.name }}</span>
            <span class="macro-meta">{{ m.steps.length }} {{ t('macro.steps') }}{{ m.runCount > 0 ? ` · ${t('macro.ran', { n: m.runCount })}` : '' }}</span>
          </div>
          <div class="macro-actions">
            <button class="mac-btn is-fav" :class="{ 'is-active': m.favorite }" @click="store.toggleFavorite(m.id)" :title="t('macro.favorite')">
              <Star :size="13" :fill="m.favorite ? 'currentColor' : 'none'"/>
            </button>
            <button class="mac-btn" @click="runMacro(m)" :title="t('macro.run')"><Play :size="13"/></button>
            <button class="mac-btn" @click="store.duplicateMacro(m.id)" :title="t('macro.duplicate')"><Copy :size="13"/></button>
            <button class="mac-btn is-danger" @click="store.removeMacro(m.id)" :title="t('common.delete')"><Trash2 :size="13"/></button>
          </div>
        </div>
        <div v-if="m.expanded" class="macro-detail">
          <p v-if="m.description" class="macro-desc">{{ m.description }}</p>
          <div class="macro-steps-list">
            <div v-for="(step, si) in m.steps" :key="si" class="macro-step-item">
              <span class="ms-num">{{ si + 1 }}</span>
              <code class="ms-cmd">{{ step.command }}</code>
              <span class="ms-delay" v-if="step.delay">{{ step.delay }}ms</span>
            </div>
          </div>
          <div class="macro-tags" v-if="m.tags.length">
            <span v-for="t in m.tags" :key="t" class="macro-tag">{{ t }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="panel-empty">
      <p v-if="store.searchQuery">{{ t('macro.noMatch') }}</p>
      <p v-else>{{ t('macro.noMacros') }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useMacroStore } from '@/stores/macroStore';
import { useNotifications } from '@/composables/useNotifications';
import { useI18n } from 'vue-i18n';
import { PlayCircle, Plus, Download, Upload, X, Search, Star, Play, Copy, Trash2 } from 'lucide-vue-next';

const { t } = useI18n();
const emit = defineEmits(['close', 'run']);
const store = useMacroStore();
const { showSuccess, showError } = useNotifications();

const showAddForm = ref(false);
const importInput = ref(null);
const nameInput = ref(null);
const newMacro = ref({
  name: '', description: '', steps: [{ command: '', delay: 300 }], tags: '',
});

function addStep() {
  newMacro.value.steps.push({ command: '', delay: 300 });
}

function addNew() {
  if (!newMacro.value.name.trim() || newMacro.value.steps.every(s => !s.command.trim())) {
    showError(t('macro.nameAndCmdRequired'));
    return;
  }
  const tags = newMacro.value.tags.split(',').map(t => t.trim()).filter(Boolean);
  const steps = newMacro.value.steps.filter(s => s.command.trim()).map(s => ({
    command: s.command.trim(),
    delay: Math.max(0, Math.min(5000, s.delay || 300)),
  }));
  store.addMacro({
    name: newMacro.value.name.trim(),
    description: newMacro.value.description.trim(),
    steps,
    tags,
    favorite: false,
  });
  newMacro.value = { name: '', description: '', steps: [{ command: '', delay: 300 }], tags: '' };
  showAddForm.value = false;
  showSuccess(t('macro.added'));
}

function runMacro(m) {
  emit('run', m);
}

function exportMacros() {
  const data = store.exportMacros();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `webssh-macros-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showSuccess(t('macro.exported'));
}

function triggerImport() { importInput.value?.click(); }

function onImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const count = store.importMacros(ev.target?.result || '');
    if (count > 0) showSuccess(t('macro.imported', { count }));
    else showError(t('macro.importFailed'));
  };
  reader.readAsText(file);
  e.target.value = '';
}
</script>

<style lang="scss" scoped>
.macro-panel {
  background: var(--bulma-box-background-color);
  backdrop-filter: blur(12px); border: 1px solid var(--bulma-border-light);
  border-radius: 12px; overflow: hidden; width: 500px;
}
.panel-header {
  display: flex; align-items: center; padding: 0.65rem 0.75rem;
  border-bottom: 1px solid var(--bulma-border-light);
}
.panel-title { font-size: 0.85em; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 0.35rem; flex: 1; }
.panel-actions { display: flex; gap: 2px; }
.panel-action-btn {
  background: none; border: none; padding: 0.3rem 0.4rem; border-radius: 6px; cursor: pointer;
  color: var(--bulma-text-light); display: flex;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
}
.panel-search {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0.3rem 0.6rem; border-bottom: 1px solid var(--bulma-border-light);
}
.search-icon { flex-shrink: 0; color: var(--bulma-text-light); }
.search-input {
  flex: 1; border: none; background: none; outline: none; font-size: 0.8em; color: var(--bulma-text);
  &::placeholder { color: var(--bulma-text-light); }
}
.search-clear { background: none; border: none; cursor: pointer; color: var(--bulma-text-light); font-size: 1em; padding: 0; }
.add-form { padding: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; border-bottom: 1px solid var(--bulma-border-light); }
.form-input {
  border: 1px solid var(--bulma-border); border-radius: 6px; padding: 0.3rem 0.5rem;
  font-size: 0.75em; background: var(--bulma-input-background-color); color: var(--bulma-text); outline: none;
  &:focus { border-color: var(--bulma-primary); }
}
.steps-editor { border: 1px solid var(--bulma-border); border-radius: 6px; padding: 0.3rem; }
.steps-header { display: flex; justify-content: space-between; align-items: center; padding: 0.2rem 0.3rem; }
.steps-title { font-size: 0.7em; font-weight: 500; color: var(--bulma-text-light); }
.add-step-btn { background: none; border: none; font-size: 0.7em; color: var(--bulma-primary); cursor: pointer; padding: 0; }
.step-row {
  display: flex; align-items: center; gap: 0.25rem; padding: 0.2rem 0;
  & + & { border-top: 1px solid var(--bulma-border-light); }
}
.step-num { width: 16px; font-size: 0.65em; color: var(--bulma-text-light); text-align: center; flex-shrink: 0; }
.step-input { flex: 1; border: none; background: none; outline: none; font-size: 0.75em; color: var(--bulma-text); font-family: monospace; }
.step-delay {
  width: 50px; border: 1px solid var(--bulma-border); border-radius: 4px; padding: 0.1rem 0.2rem;
  font-size: 0.65em; text-align: center; background: var(--bulma-input-background-color); color: var(--bulma-text);
}
.step-remove { background: none; border: none; cursor: pointer; color: var(--bulma-text-light); font-size: 1em; padding: 0 2px; &:hover { color: var(--bulma-danger); } }
.add-form-actions { display: flex; gap: 0.35rem; }
.add-btn, .cancel-btn {
  flex: 1; border: none; border-radius: 6px; padding: 0.3rem; font-size: 0.75em; cursor: pointer; font-weight: 500;
}
.add-btn { background: var(--bulma-primary); color: white; }
.cancel-btn { background: var(--bulma-border-light); color: var(--bulma-text); }

.panel-list { max-height: 420px; overflow-y: auto; }
.macro-item {
  padding: 0.5rem 0.75rem;
  & + & { border-top: 1px solid var(--bulma-border-light); }
}
.macro-top { display: flex; align-items: center; gap: 0.5rem; }
.macro-info { flex: 1; cursor: pointer; min-width: 0; }
.macro-name { display: block; font-size: 0.85em; font-weight: 500; }
.macro-meta { display: block; font-size: 0.65em; color: var(--bulma-text-light); margin-top: 1px; }
.macro-actions { display: flex; gap: 4px; flex-shrink: 0; opacity: 0; transition: opacity 0.1s; .macro-item:hover & { opacity: 1; } }
.mac-btn {
  background: none; border: none; padding: 0.3rem; border-radius: 6px; cursor: pointer;
  color: var(--bulma-text-light); display: flex;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
  &.is-fav.is-active { color: #f59e0b; }
  &.is-danger:hover { color: var(--bulma-danger); }
}
.macro-detail { margin-top: 0.35rem; }
.macro-desc { font-size: 0.75em; color: var(--bulma-text-light); margin: 0 0 0.35rem; }
.macro-steps-list { border: 1px solid var(--bulma-border-light); border-radius: 6px; overflow: hidden; }
.macro-step-item {
  display: flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.5rem;
  font-size: 0.7em;
  & + & { border-top: 1px solid var(--bulma-border-light); }
}
.ms-num { width: 16px; color: var(--bulma-text-light); text-align: center; flex-shrink: 0; }
.ms-cmd { flex: 1; font-family: monospace; color: var(--bulma-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms-delay { font-size: 0.9em; color: var(--bulma-text-light); flex-shrink: 0; }
.macro-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.3rem; }
.macro-tag {
  font-size: 0.65em; padding: 2px 7px; border-radius: 4px;
  background: var(--bulma-primary); color: white; opacity: 0.85;
}
.panel-empty { padding: 1.5rem; text-align: center; font-size: 0.85em; color: var(--bulma-text-light); }
</style>
