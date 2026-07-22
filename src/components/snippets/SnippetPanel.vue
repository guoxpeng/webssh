<template>
  <div class="snippet-panel">
    <div class="panel-header">
      <h3 class="panel-title"><TerminalSquare :size="16"/> {{ t('snippets.title') }}</h3>
      <div class="panel-actions">
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

    <div class="panel-search">
      <Search :size="13" class="search-icon"/>
      <input type="text" v-model="store.searchQuery" :placeholder="t('snippets.searchPlaceholder')" class="search-input"/>
      <button v-if="store.searchQuery" class="search-clear" @click="store.searchQuery = ''">&times;</button>
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

    <div class="panel-list" v-if="store.filteredSnippets.length > 0">
      <div v-for="s in store.filteredSnippets" :key="s.id" class="snippet-item">
        <div class="snippet-top">
          <div class="snippet-info" @click="s.expanded = !s.expanded">
            <span class="snippet-title">{{ s.title }}</span>
            <span class="snippet-cmd-preview">{{ s.command.substring(0, 40) }}{{ s.command.length > 40 ? '...' : '' }}</span>
          </div>
          <div class="snippet-actions">
            <button class="snip-btn is-fav" :class="{ 'is-active': s.favorite }" @click="store.toggleFavorite(s.id)" :title="t('snippets.favorite')">
              <Star :size="13" :fill="s.favorite ? 'currentColor' : 'none'"/>
            </button>
            <button class="snip-btn" @click="runSnippet(s)" :title="t('snippets.sendToTerminal')"><Play :size="13"/></button>
            <button class="snip-btn is-danger" @click="store.removeSnippet(s.id)" :title="t('common.delete')"><Trash2 :size="13"/></button>
          </div>
        </div>
        <div v-if="s.expanded" class="snippet-detail">
          <pre class="snippet-command"><code>{{ s.command }}</code></pre>
          <div class="snippet-tags" v-if="s.tags.length">
            <span v-for="t in s.tags" :key="t" class="snippet-tag">{{ t }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="panel-empty">
      <p v-if="store.searchQuery">{{ t('snippets.noMatch') }}</p>
      <p v-else>{{ t('snippets.noSnippets') }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useSnippetStore } from '@/stores/snippetStore';
import { useNotifications } from '@/composables/useNotifications';
import { useI18n } from 'vue-i18n';
import { TerminalSquare, Plus, Download, Upload, X, Search, Star, Play, Trash2 } from 'lucide-vue-next';

const { t } = useI18n();

const emit = defineEmits(['close', 'run']);

const store = useSnippetStore();
const { showSuccess, showError } = useNotifications();

const showAddForm = ref(false);
const newTitle = ref('');
const newCommand = ref('');
const newTags = ref('');
const titleInput = ref(null);
const importInput = ref(null);

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
}

function exportSnips() {
  const data = store.exportSnippets();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `haossh-snippets-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
  border-radius: 12px; overflow: hidden; width: 320px;
}

.panel-header {
  display: flex; align-items: center; padding: 0.5rem 0.65rem;
  border-bottom: 1px solid var(--bulma-border-light);
}
.panel-title { font-size: 0.8em; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 0.35rem; flex: 1; }
.panel-actions { display: flex; gap: 2px; }
.panel-action-btn {
  background: none; border: none; padding: 0.2rem; border-radius: 4px; cursor: pointer;
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
.form-input, .form-textarea {
  border: 1px solid var(--bulma-border); border-radius: 6px; padding: 0.3rem 0.5rem;
  font-size: 0.75em; background: var(--bulma-input-background-color); color: var(--bulma-text); outline: none;
  &:focus { border-color: var(--bulma-primary); }
}
.form-textarea { resize: vertical; font-family: var(--bulma-family-monospace); }
.add-form-actions { display: flex; gap: 0.35rem; }
.add-btn, .cancel-btn {
  flex: 1; border: none; border-radius: 6px; padding: 0.3rem; font-size: 0.75em; cursor: pointer; font-weight: 500;
}
.add-btn { background: var(--bulma-primary); color: white; }
.cancel-btn { background: var(--bulma-border-light); color: var(--bulma-text); }

.panel-list { max-height: 320px; overflow-y: auto; }

.snippet-item {
  padding: 0.35rem 0.6rem;
  & + & { border-top: 1px solid var(--bulma-border-light); }
}

.snippet-top { display: flex; align-items: center; gap: 0.35rem; }
.snippet-info { flex: 1; cursor: pointer; min-width: 0; }
.snippet-title { display: block; font-size: 0.75em; font-weight: 500; }
.snippet-cmd-preview { display: block; font-size: 0.6em; color: var(--bulma-text-light); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.snippet-actions { display: flex; gap: 2px; flex-shrink: 0; opacity: 0; transition: opacity 0.1s; .snippet-item:hover & { opacity: 1; } }
.snip-btn {
  background: none; border: none; padding: 0.2rem; border-radius: 4px; cursor: pointer;
  color: var(--bulma-text-light); display: flex;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
  &.is-fav.is-active { color: #f59e0b; }
  &.is-danger:hover { color: var(--bulma-danger); }
}

.snippet-detail { margin-top: 0.25rem; }
.snippet-command {
  background: var(--bulma-scheme-main-ter); border-radius: 4px; padding: 0.3rem 0.5rem;
  font-size: 0.65em; overflow-x: auto; margin: 0; code { color: var(--bulma-text); }
}
.snippet-tags { display: flex; flex-wrap: wrap; gap: 0.2rem; margin-top: 0.2rem; }
.snippet-tag {
  font-size: 0.55em; padding: 1px 5px; border-radius: 4px;
  background: var(--bulma-primary); color: white; opacity: 0.8;
}

.panel-empty { padding: 1rem; text-align: center; font-size: 0.75em; color: var(--bulma-text-light); }
</style>
