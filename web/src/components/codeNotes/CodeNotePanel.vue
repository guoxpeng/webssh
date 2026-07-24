<template>
  <div class="codenote-panel">
    <div class="panel-header">
      <h3 class="panel-title"><TerminalSquare :size="16"/> {{ t('codeNotes.title') }}</h3>
      <div class="panel-actions">
        <button class="panel-action-btn is-danger" @click="onClearAll" :title="t('common.deleteAll')">
          <Trash2 :size="14"/>
        </button>
        <button class="panel-action-btn" @click="$emit('close')" :title="t('common.close')">
          <X :size="14"/>
        </button>
      </div>
    </div>

    <div class="panel-search">
      <Search :size="13"/>
      <input type="text" v-model="store.searchQuery" :placeholder="t('common.search')" class="search-input"/>
    </div>

    <div class="panel-list" v-if="store.filteredNotes.length > 0">
      <div v-for="note in store.filteredNotes" :key="note.id" class="note-item">
        <div class="note-top">
          <div class="note-info" @click="toggleExpand(note.id)">
            <span class="note-name">{{ note.name }}</span>
            <span class="note-meta">{{ note.command.substring(0, 50) }}{{ note.command.length > 50 ? '...' : '' }}</span>
          </div>
          <div class="note-actions">
            <button class="note-btn" :class="{ 'is-saved': isSaved(note) }" @click="saveToSnippet(note)" :title="t('snippets.addToSnippets')">
              <Star :size="13" :fill="isSaved(note) ? 'currentColor' : 'none'"/>
            </button>
            <button class="note-btn" @click="runNote(note)" :title="t('snippets.sendToTerminal')"><Play :size="13"/></button>
            <button class="note-btn" @click="copyNote(note)" :title="t('common.copy')"><ClipboardCopy :size="12"/></button>
            <button class="note-btn" @click="startEdit(note)" :title="t('common.edit')"><Edit3 :size="12"/></button>
            <button class="note-btn is-danger" @click="store.removeNote(note.id)" :title="t('common.delete')"><Trash2 :size="13"/></button>
          </div>
        </div>

        <div v-if="editingId === note.id" class="note-edit-form" @click.stop>
          <input type="text" v-model="editName" :placeholder="t('codeNotes.nameField')" class="form-input"/>
          <textarea v-model="editCommand" class="form-textarea" rows="3"></textarea>
          <div class="edit-actions">
            <button class="save-btn" @click="saveEdit(note.id)">{{ t('common.save') }}</button>
            <button class="cancel-btn" @click="editingId = null">{{ t('common.cancel') }}</button>
          </div>
        </div>
        <div v-else-if="expandedId === note.id" class="note-detail">
          <pre class="note-command"><code>{{ note.command }}</code></pre>
          <div class="note-footer">
            <span class="note-source">{{ sourceLabel(note.source) }}</span>
            <span class="note-count">{{ t('codeNotes.used', { n: note.useCount }) }}</span>
            <span class="note-time">{{ timeAgo(note.updatedAt) }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="panel-empty">
      <TerminalSquare :size="32" class="empty-icon"/>
      <p>{{ t('codeNotes.empty') }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCodeNoteStore } from '@/stores/codeNoteStore';
import { useTerminalStore } from '@/stores/terminalStore';
import { useSnippetStore } from '@/stores/snippetStore';
import { TerminalSquare, Search, Play, ClipboardCopy, Edit3, Trash2, X, Star } from 'lucide-vue-next';

const { t } = useI18n();
const store = useCodeNoteStore();
const terminalStore = useTerminalStore();
const snippetStore = useSnippetStore();

const editingId = ref(null);
const editName = ref('');
const editCommand = ref('');
const expandedId = ref(null);

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id;
}

function runNote(note) {
  if (terminalStore.activeSendFunction) {
    terminalStore.activeSendFunction(note.command + '\n');
    store.addNote(note.command, 'terminal');
  }
}

function copyNote(note) {
  navigator.clipboard.writeText(note.command).catch(() => {});
}

function startEdit(note) {
  editingId.value = note.id;
  editName.value = note.name;
  editCommand.value = note.command;
}

function saveEdit(id) {
  if (editName.value.trim()) store.updateName(id, editName.value.trim());
  if (editCommand.value.trim()) store.updateCommand(id, editCommand.value.trim());
  editingId.value = null;
}

function onClearAll() {
  if (confirm(t('codeNotes.confirmClear'))) store.clearAll();
}

function isSaved(note) {
  return snippetStore.snippets.some(s => s.command === note.command);
}

function saveToSnippet(note) {
  if (isSaved(note)) return;
  snippetStore.addSnippet({ title: note.name, command: note.command, tags: [], favorite: false });
}

function sourceLabel(src) {
  return src === 'terminal' ? t('codeNotes.fromTerminal') : src === 'macro' ? t('macro.title') : t('common.manual');
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('common.justNow');
  if (min < 60) return t('common.minutesAgo', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('common.hoursAgo', { n: h });
  return t('common.daysAgo', { n: Math.floor(h / 24) });
}
</script>

<style lang="scss" scoped>
.codenote-panel {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
}
.panel-header {
  display: flex; align-items: center; padding: 0.7rem 0.85rem; gap: 0.5rem;
  border-bottom: 1px solid var(--bulma-border-light); flex-shrink: 0;
  .panel-title { flex: 1; font-size: 0.82em; font-weight: 600; display: flex; align-items: center; gap: 0.4rem; color: var(--bulma-text); }
}
.panel-actions { display: flex; gap: 0.25rem; }
.panel-action-btn {
  background: none; border: none; cursor: pointer; padding: 0.3rem; border-radius: 4px;
  color: var(--bulma-text-light); display: flex; align-items: center;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
  &.is-danger:hover { color: var(--bulma-danger); }
}
.panel-search {
  display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.85rem;
  border-bottom: 1px solid var(--bulma-border-light); color: var(--bulma-text-light);
  .search-input {
    flex: 1; border: none; background: none; outline: none; font-size: 0.78em; color: var(--bulma-text);
    &::placeholder { color: var(--bulma-text-light); }
  }
}
.panel-list {
  flex: 1; overflow-y: auto; padding: 0.25rem 0;
}
.note-item {
  border-bottom: 1px solid var(--bulma-border-light);
  &:last-child { border-bottom: none; }
}
.note-top {
  display: flex; align-items: center; padding: 0.45rem 0.85rem; gap: 0.4rem;
}
.note-info {
  flex: 1; min-width: 0; cursor: pointer;
  display: flex; flex-direction: column; gap: 0.1rem;
}
.note-name { font-size: 0.78em; font-weight: 500; color: var(--bulma-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.note-meta { font-size: 0.7em; color: var(--bulma-text-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.note-actions { display: flex; gap: 0.15rem; flex-shrink: 0; }
.note-btn {
  background: none; border: none; cursor: pointer; padding: 0.25rem; border-radius: 3px;
  color: var(--bulma-text-light); display: flex; align-items: center;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-primary); }
  &.is-saved { color: var(--bulma-warning); }
  &.is-danger:hover { color: var(--bulma-danger); }
}
.note-edit-form {
  padding: 0.5rem 0.85rem; display: flex; flex-direction: column; gap: 0.4rem;
  border-top: 1px solid var(--bulma-border-light); background: var(--bulma-scheme-main-ter);
}
.form-input, .form-textarea {
  width: 100%; padding: 0.35rem 0.5rem; border: 1px solid var(--bulma-border);
  border-radius: 4px; font-size: 0.78em; background: var(--bulma-scheme-main);
  color: var(--bulma-text); outline: none;
  &:focus { border-color: var(--bulma-primary); }
}
.form-textarea { resize: vertical; font-family: monospace; }
.edit-actions { display: flex; gap: 0.4rem; }
.save-btn, .cancel-btn {
  padding: 0.3rem 0.8rem; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75em;
}
.save-btn { background: var(--bulma-primary); color: white; }
.cancel-btn { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
.note-detail {
  padding: 0.25rem 0.85rem 0.5rem; border-top: 1px solid var(--bulma-border-light);
}
.note-command {
  background: var(--bulma-scheme-main-ter); padding: 0.5rem; border-radius: 4px;
  font-size: 0.72em; font-family: monospace; white-space: pre-wrap; word-break: break-all;
  color: var(--bulma-text); margin: 0;
}
.note-footer {
  display: flex; gap: 0.6rem; margin-top: 0.3rem; font-size: 0.65em; color: var(--bulma-text-light);
}
.panel-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 0.5rem; color: var(--bulma-text-light); padding: 2rem;
  .empty-icon { opacity: 0.3; }
  p { font-size: 0.8em; }
}
</style>
