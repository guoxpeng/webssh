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
      <input type="text" v-model="newTitle" :placeholder="t('snippets.titleField')" class="form-input" ref="titleInput"
             @keydown.enter.prevent="addNew"/>
      <textarea v-model="newCommand" :placeholder="t('snippets.commandField')" class="form-textarea" rows="2"
                @keydown.enter.ctrl="addNew" @keydown.enter.meta="addNew"></textarea>
      <input type="text" v-model="newTags" :placeholder="t('snippets.tagsField')" class="form-input"
             @keydown.enter.prevent="addNew"/>
      <div class="add-form-actions">
        <button class="add-btn" @click="addNew">{{ t('snippets.add') }}</button>
        <button class="cancel-btn" @click="showAddForm = false">{{ t('snippets.cancel') }}</button>
      </div>
    </div>

    <div class="panel-list" v-if="store.snippets.length > 0">
      <div v-for="(s, idx) in sortedSnippets" :key="s.id" class="snippet-item"
           :class="{ 'is-pinned': s.favorite, 'is-dragging': dragIdx === idx, 'is-dragover': dragOverIdx === idx }"
           draggable="true"
           @dragstart="onDragStart($event, idx)"
           @dragover.prevent="onDragOver($event, idx)"
           @dragleave="onDragLeave"
           @drop.prevent="onDrop(idx)"
           @dragend="onDragEnd">
        <div class="snippet-top">
          <input type="checkbox" :value="s.id" v-model="selectedIds" class="snippet-check" @click.stop/>
          <span class="snippet-num">{{ idx + 1 }}</span>
          <div class="snippet-info" @click="s.expanded = !s.expanded">
            <span class="snippet-title">{{ s.title }}</span>
            <span class="snippet-cmd-preview">{{ s.command.substring(0, 40) }}{{ s.command.length > 40 ? '...' : '' }}</span>
          </div>
          <div class="snippet-actions">
            <button class="snip-btn is-pinned" :class="{ 'is-active': s.favorite }" @click="onToggleFavorite(s)" :title="t('snippets.pinToTop')">
              <Pin :size="13" :fill="s.favorite ? 'currentColor' : 'none'"/>
            </button>
            <button class="snip-btn" @click="runSnippet(s)" :title="t('snippets.sendToTerminal')"><Play :size="13"/></button>
            <button class="snip-btn" @click="startEdit(s)" :title="t('common.edit')"><Edit3 :size="12"/></button>
            <button class="snip-btn" @click="sendToMacro(s)" :title="t('snippets.sendToMacro')"><ArrowRightCircle :size="12"/></button>
            <button class="snip-btn is-danger" @click="onRemoveSnippet(s)" :title="t('common.delete')"><Trash2 :size="13"/></button>
          </div>
        </div>
        <div v-if="editingId === s.id" class="edit-form" @click.stop>
          <input type="text" v-model="editTitle" :placeholder="t('snippets.titleField')" class="form-input"/>
          <textarea v-model="editCommand" :placeholder="t('snippets.commandField')" class="form-textarea" rows="2"></textarea>
          <div class="edit-actions">
            <button class="add-btn" @click="saveEdit(s.id)">{{ t('common.save') }}</button>
            <button class="cancel-btn" @click="editingId = null">{{ t('common.cancel') }}</button>
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
  TerminalSquare, Plus, Download, Upload, X, Pin, Play, Trash2, Edit3,
  Layers, ArrowRightCircle,
} from 'lucide-vue-next';
import BatchExecutionDialog from '@/components/macro/BatchExecutionDialog.vue';

const { t } = useI18n();
const emit = defineEmits(['close', 'run']);
const store = useSnippetStore();
const macroStore = useMacroStore();
const { showSuccess, showError, showInfo } = useNotifications();

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

const sortedSnippets = computed(() => {
  const pinned = store.snippets.filter(s => s.favorite);
  const others = store.snippets.filter(s => !s.favorite);
  return [...pinned, ...others];
});

const dragIdx = ref(null);
const dragOverIdx = ref(null);

function onDragStart(e, idx) { dragIdx.value = idx; e.dataTransfer.effectAllowed = 'move'; }
function onDragOver(e, idx) { e.preventDefault(); if (dragIdx.value !== idx) dragOverIdx.value = idx; }
function onDragLeave() { dragOverIdx.value = null; }
function onDrop(idx) {
  if (dragIdx.value === null || dragIdx.value === idx) return;
  const src = sortedSnippets.value[dragIdx.value];
  const dst = sortedSnippets.value[idx];
  store.reorderFavorites(src.id, dst.id);
  dragIdx.value = null;
  dragOverIdx.value = null;
}
function onDragEnd() { dragIdx.value = null; dragOverIdx.value = null; }

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

function runSnippet(s) {
  emit('run', s);
  showInfo(t('snippets.sentToTerminal'));
}

function onToggleFavorite(s) {
  store.toggleFavorite(s.id);
  showSuccess(s.favorite ? t('snippets.unfavorited') : t('snippets.favorited'));
}

function onRemoveSnippet(s) {
  store.removeSnippet(s.id);
  showSuccess(t('snippets.removed'));
}

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
.snippet-panel { width: 460px; max-width: 95vw; }
.batch-run-btn { color: var(--bulma-primary); font-weight: 600; }

.panel-list { max-height: 420px; overflow-y: auto; }
.snippet-item {
  cursor: grab;
  &.is-dragging { opacity: 0.4; }
  &.is-dragover { background: rgba(99,102,241,0.08); outline: 2px dashed var(--bulma-primary); outline-offset: -2px; border-radius: 8px; }
  &.is-pinned { background: rgba(234,179,8,0.05); }
}
.snippet-top { display: flex; align-items: center; gap: 0.45rem; }
.snippet-check { accent-color: var(--bulma-primary); flex-shrink: 0; }
.snippet-num { font-size: 0.65em; color: var(--bulma-text-light); font-weight: 600; min-width: 18px; text-align: center; flex-shrink: 0; font-family: var(--bulma-family-monospace); }
.snippet-info { flex: 1; cursor: pointer; min-width: 0; }
.snippet-title { display: block; font-size: 0.82em; font-weight: 500; }
.snippet-cmd-preview { display: block; font-size: 0.7em; color: var(--bulma-text-light); font-family: var(--bulma-family-monospace); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
.snippet-actions { display: flex; gap: 2px; flex-shrink: 0; opacity: 0; transition: opacity 0.1s; .snippet-item:hover & { opacity: 1; } }
.snip-btn.is-pinned.is-active { color: var(--bulma-warning); }
.snippet-detail { margin-top: 0.45rem; }
.snippet-command { background: var(--bulma-scheme-main-ter); border-radius: 8px; padding: 0.5rem 0.65rem; font-size: 0.75em; overflow-x: auto; margin: 0; code { color: var(--bulma-text); } }
.snippet-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.4rem; }
.snippet-tag { font-size: 0.65em; padding: 2px 8px; border-radius: 999px; background: var(--bulma-primary); color: white; opacity: 0.85; }
</style>
