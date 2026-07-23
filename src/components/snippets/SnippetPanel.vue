<template>
  <div class="snippet-panel">
    <div class="panel-header">
      <h3 class="panel-title"><TerminalSquare :size="16"/> {{ t('snippets.title') }}</h3>
      <div class="panel-actions">
        <button v-if="selectedIds.length > 0" class="panel-action-btn batch-run-btn" @click="batchRunSelected" :title="t('snippets.batchRun')">
          <Layers :size="14"/> {{ selectedIds.length }}
        </button>
        <button class="panel-action-btn" @click="showAddForm = !showAddForm" :title="t('snippets.addSnippet')">
          <Plus :size="14"/>
        </button>
        <button class="panel-action-btn" @click="exportSnips" :title="t('snippets.export')">
          <Download :size="14"/>
        </button>
        <button class="panel-action-btn" @click="triggerImport" :title="t('snippets.import')">
          <Upload :size="14"/>
        </button>
        <button class="panel-action-btn" @click="$emit('close')" :title="t('common.close')">
          <X :size="14"/>
        </button>
        <input type="file" ref="importInput" accept=".json" style="display:none" @change="onImportFile"/>
      </div>
    </div>

    <div v-if="showAddForm" class="add-form">
      <input type="text" v-model="newTitle" :placeholder="t('snippets.titleField')" class="form-input" ref="titleInput"/>
      <textarea v-model="newCommand" :placeholder="t('snippets.commandField')" class="form-textarea" rows="2"></textarea>
      <input type="text" v-model="newTags" :placeholder="t('snippets.tagsField')" class="form-input"/>
      <div class="add-form-actions">
        <button class="add-btn" @click="addNew">{{ t('snippets.add') }}</button>
        <button class="cancel-btn" @click="showAddForm = false">{{ t('snippets.cancel') }}</button>
      </div>
    </div>

    <div class="panel-list" v-if="store.snippets.length > 0">
      <div v-for="(s, idx) in store.snippets" :key="s.id" class="snippet-item">
        <div class="snippet-top">
          <input type="checkbox" :value="s.id" v-model="selectedIds" class="snippet-check" @click.stop/>
          <span class="snippet-num">{{ idx + 1 }}</span>
          <div class="snippet-info" @click="s.expanded = !s.expanded">
            <span class="snippet-title">{{ s.title }}</span>
            <span class="snippet-cmd-preview">{{ s.command.substring(0, 40) }}{{ s.command.length > 40 ? '...' : '' }}</span>
          </div>
          <div class="snippet-actions">
            <button class="snip-btn is-fav" :class="{ 'is-active': s.favorite }" @click="store.toggleFavorite(s.id)" :title="t('snippets.favorite')">
              <Star :size="13" :fill="s.favorite ? 'currentColor' : 'none'"/>
            </button>
            <button class="snip-btn" @click="runSnippet(s)" :title="t('snippets.sendToTerminal')"><Play :size="13"/></button>
            <button class="snip-btn" @click="startEdit(s)" :title="t('common.edit')"><Edit3 :size="12"/></button>
            <button class="snip-btn" @click="sendToMacro(s)" :title="t('snippets.sendToMacro')"><ArrowRightCircle :size="12"/></button>
            <button class="snip-btn is-danger" @click="store.removeSnippet(s.id)" :title="t('common.delete')"><Trash2 :size="13"/></button>
          </div>
        </div>
        <div v-if="editingId === s.id" class="edit-form" @click.stop>
          <input type="text" v-model="editTitle" :placeholder="t('snippets.titleField')" class="form-input"/>
          <textarea v-model="editCommand" :placeholder="t('snippets.commandField')" class="form-textarea" rows="2"></textarea>
          <div class="edit-form-actions">
            <button class="save-edit-btn" @click="saveEdit(s.id)">{{ t('common.save') }}</button>
            <button class="cancel-edit-btn" @click="editingId = null">{{ t('common.cancel') }}</button>
          </div>
        </div>
        <div v-else-if="s.expanded" class="snippet-detail">
          <pre class="snippet-command"><code>{{ s.command }}</code></pre>
          <div class="snippet-tags" v-if="s.tags.length">
            <span v-for="t in s.tags" :key="t" class="snippet-tag">{{ t }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="panel-empty">
      <p>{{ t('snippets.noSnippets') }}</p>
    </div>

    <BatchExecutionDialog v-if="showBatch" @close="showBatch = false" :presetSteps="batchSteps"/>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useSnippetStore } from '@/stores/snippetStore';
import { useMacroStore } from '@/stores/macroStore';
import { useNotifications } from '@/composables/useNotifications';
import { useI18n } from 'vue-i18n';
import {
  TerminalSquare, Plus, Download, Upload, X, Star, Play, Trash2, Edit3,
  Layers, ArrowRightCircle,
} from 'lucide-vue-next';
import BatchExecutionDialog from '@/components/macro/BatchExecutionDialog.vue';

const { t } = useI18n();
const emit = defineEmits(['close', 'run']);
const store = useSnippetStore();
const macroStore = useMacroStore();
const { showSuccess, showError } = useNotifications();

const showAddForm = ref(false);
const newTitle = ref('');
const newCommand = ref('');
const newTags = ref('');
const titleInput = ref(null);
const importInput = ref(null);
const editingId = ref(null);
const editTitle = ref('');
const editCommand = ref('');
const selectedIds = ref([]);
const showBatch = ref(false);
const batchSteps = ref([]);

const selectedSnippets = computed(() => {
  return store.snippets.filter(s => selectedIds.value.includes(s.id));
});

function addNew() {
  if (!newTitle.value.trim() || !newCommand.value.trim()) {
    showError(t('snippets.titleAndCmdRequired'));
    return;
  }
  const tags = newTags.value.split(',').map(t => t.trim()).filter(Boolean);
  store.addSnippet({ title: newTitle.value.trim(), command: newCommand.value.trim(), tags, favorite: false });
  newTitle.value = ''; newCommand.value = ''; newTags.value = '';
  showAddForm.value = false;
  showSuccess(t('snippets.added'));
}

function runSnippet(s) { emit('run', s); }

function startEdit(s) {
  editingId.value = s.id;
  editTitle.value = s.title;
  editCommand.value = s.command;
}

function saveEdit(id) {
  store.updateSnippet(id, { title: editTitle.value.trim(), command: editCommand.value.trim() });
  editingId.value = null;
  showSuccess(t('common.saved'));
}

function sendToMacro(s) {
  const steps = [{ command: s.command, delay: 300 }];
  macroStore.addMacro({
    name: s.title,
    description: '',
    steps,
    tags: [...s.tags],
    favorite: false,
  });
  showSuccess(t('snippets.sentToMacro', { name: s.title }));
  selectedIds.value = [];
}

function batchRunSelected() {
  const snips = selectedSnippets.value;
  if (snips.length === 0) return;
  batchSteps.value = snips.map(s => ({ command: s.command, delay: 300 }));
  showBatch.value = true;
}

function exportSnips() {
  const data = store.exportSnippets();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `webssh-codehandbook-${Date.now()}.json`;
  a.click(); URL.revokeObjectURL(url);
  showSuccess(t('snippets.exported'));
}

function triggerImport() { importInput.value?.click(); }

function onImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const count = store.importSnippets(ev.target?.result || '');
    if (count > 0) showSuccess(t('snippets.imported', { count }));
    else showError(t('snippets.importFailed'));
  };
  reader.readAsText(file);
  e.target.value = '';
}
</script>

<style lang="scss" scoped>
.snippet-panel {
  background: var(--bulma-box-background-color);
  backdrop-filter: blur(12px); border: 1px solid var(--bulma-border-light);
  border-radius: 12px; overflow: hidden; width: 460px; max-width: 95vw;
}
.panel-header { display: flex; align-items: center; padding: 0.65rem 0.75rem; border-bottom: 1px solid var(--bulma-border-light); }
.panel-title { font-size: 0.85em; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 0.35rem; flex: 1; }
.panel-actions { display: flex; gap: 2px; }
.panel-action-btn {
  background: none; border: none; padding: 0.3rem 0.4rem; border-radius: 6px; cursor: pointer;
  color: var(--bulma-text-light); display: flex;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
}
.batch-run-btn { color: var(--bulma-primary); font-weight: 600; font-size: 0.75em; gap: 2px; }
.add-form { padding: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; border-bottom: 1px solid var(--bulma-border-light); }
.form-input, .form-textarea {
  border: 1px solid var(--bulma-border); border-radius: 6px; padding: 0.3rem 0.5rem;
  font-size: 0.75em; background: var(--bulma-input-background-color); color: var(--bulma-text); outline: none;
  &:focus { border-color: var(--bulma-primary); }
}
.form-textarea { resize: vertical; font-family: var(--bulma-family-monospace); }
.add-form-actions, .edit-form-actions { display: flex; gap: 0.35rem; }
.add-btn, .save-edit-btn { flex: 1; border: none; border-radius: 6px; padding: 0.3rem; font-size: 0.75em; cursor: pointer; font-weight: 500; background: var(--bulma-primary); color: white; }
.cancel-btn, .cancel-edit-btn { flex: 1; border: none; border-radius: 6px; padding: 0.3rem; font-size: 0.75em; cursor: pointer; font-weight: 500; background: var(--bulma-border-light); color: var(--bulma-text); }
.edit-form { padding: 0.4rem 0; display: flex; flex-direction: column; gap: 0.3rem; }

.panel-list { max-height: 420px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: transparent transparent; }
.snippet-item { padding: 0.5rem 0.75rem; & + & { border-top: 1px solid var(--bulma-border-light); } }
.snippet-top { display: flex; align-items: center; gap: 0.4rem; }
.snippet-check { accent-color: var(--bulma-primary); flex-shrink: 0; }
.snippet-num { font-size: 0.65em; color: var(--bulma-text-light); font-weight: 600; min-width: 18px; text-align: center; flex-shrink: 0; font-family: monospace; }
.snippet-info { flex: 1; cursor: pointer; min-width: 0; }
.snippet-title { display: block; font-size: 0.85em; font-weight: 500; }
.snippet-cmd-preview { display: block; font-size: 0.7em; color: var(--bulma-text-light); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
.snippet-actions { display: flex; gap: 4px; flex-shrink: 0; opacity: 0; transition: opacity 0.1s; .snippet-item:hover & { opacity: 1; } }
.snip-btn { background: none; border: none; padding: 0.3rem; border-radius: 6px; cursor: pointer; color: var(--bulma-text-light); display: flex; &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); } &.is-fav.is-active { color: var(--bulma-warning); } &.is-danger:hover { color: var(--bulma-danger); } }
.snippet-detail { margin-top: 0.35rem; }
.snippet-command { background: var(--bulma-scheme-main-ter); border-radius: 6px; padding: 0.5rem 0.65rem; font-size: 0.75em; overflow-x: auto; margin: 0; code { color: var(--bulma-text); } }
.snippet-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.3rem; }
.snippet-tag { font-size: 0.65em; padding: 2px 7px; border-radius: 4px; background: var(--bulma-primary); color: white; opacity: 0.85; }
.panel-empty { padding: 1.5rem; text-align: center; font-size: 0.85em; color: var(--bulma-text-light); }
</style>
