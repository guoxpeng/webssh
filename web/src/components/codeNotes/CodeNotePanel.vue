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

    <div class="panel-list" v-if="store.notes.length > 0">
      <div v-for="note in store.notes" :key="note.id" class="note-item">
        <div class="note-top">
          <div class="note-info" @click="toggleExpand(note.id)">
            <span class="note-name">{{ note.name }}</span>
            <span class="note-meta">{{ note.command.substring(0, 50) }}{{ note.command.length > 50 ? '...' : '' }}</span>
          </div>
          <button class="note-fav-btn" :class="{ 'is-saved': isSaved(note) }" @click="saveToSnippet(note)" :title="t('snippets.addToFavorites')">
            <ArrowUpRight :size="13"/>
          </button>
          <div class="note-actions">
            <button class="note-btn" @click="runNote(note)" :title="t('snippets.sendToTerminal')"><Play :size="13"/></button>
            <button class="note-btn" @click="copyNote(note)" :title="t('common.copy')"><ClipboardCopy :size="12"/></button>
            <button class="note-btn" @click="startEdit(note)" :title="t('common.edit')"><Edit3 :size="12"/></button>
            <button class="note-btn is-danger" @click="onRemoveNote(note)" :title="t('common.delete')"><Trash2 :size="13"/></button>
          </div>
        </div>

        <div v-if="editingId === note.id" class="note-edit-form" @click.stop>
          <input type="text" v-model="editName" :placeholder="t('codeNotes.nameField')" class="form-input"/>
          <textarea v-model="editCommand" class="form-textarea" rows="3"></textarea>
          <div class="edit-actions">
            <button class="add-btn" @click="saveEdit(note.id)">{{ t('common.save') }}</button>
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

    <!-- Clear-all confirm modal -->
    <Teleport to="body">
    <div v-if="showClearConfirm" class="modal-overlay" @click.self="showClearConfirm = false">
      <div class="modal-body">
        <div class="modal-header">
          <span>{{ t('common.deleteAll') }}</span>
          <button class="modal-close" @click="showClearConfirm = false">&times;</button>
        </div>
        <p class="info-text">{{ t('codeNotes.confirmClear') }}</p>
        <div class="modal-actions">
          <button class="modal-btn" @click="showClearConfirm = false">{{ t('common.cancel') }}</button>
          <button class="modal-btn is-danger" @click="confirmClearAll"><Trash2 :size="14"/> {{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCodeNoteStore } from '@/stores/codeNoteStore';
import { useTerminalStore } from '@/stores/terminalStore';
import { useSnippetStore } from '@/stores/snippetStore';
import { useUiStore } from '@/stores/uiStore';
import { useNotifications } from '@/composables/useNotifications';
import { TerminalSquare, Play, ClipboardCopy, Edit3, Trash2, X, ArrowUpRight } from 'lucide-vue-next';

const { t } = useI18n();
const { showSuccess, showInfo } = useNotifications();
const store = useCodeNoteStore();
const terminalStore = useTerminalStore();
const snippetStore = useSnippetStore();
const uiStore = useUiStore();

const editingId = ref(null);
const editName = ref('');
const editCommand = ref('');
const expandedId = ref(null);
const showClearConfirm = ref(false);

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id;
}

function runNote(note) {
  if (terminalStore.activeSendFunction) {
    terminalStore.activeSendFunction(note.command + '\n');
    store.addNote(note.command, 'terminal');
    showInfo(t('snippets.sentToTerminal'));
  } else {
    uiStore.addNotification({ message: t('terminal.connectFirst'), type: 'warning', duration: 3000 });
  }
}

function copyNote(note) {
  navigator.clipboard.writeText(note.command).catch(() => {});
  showSuccess(t('protocol.copied'));
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
  showSuccess(t('common.saved'));
}

function onClearAll() {
  showClearConfirm.value = true;
}

function confirmClearAll() {
  showClearConfirm.value = false;
  store.clearAll();
  showSuccess(t('codeNotes.cleared'));
}

function isSaved(note) {
  return snippetStore.snippets.some(s => s.command === note.command);
}

function saveToSnippet(note) {
  if (isSaved(note)) return;
  snippetStore.addSnippet({ title: note.name, command: note.command, tags: [], favorite: false });
  showSuccess(t('codeNotes.savedToSnippet'));
}

function onRemoveNote(note) {
  store.removeNote(note.id);
  showSuccess(t('codeNotes.removed'));
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
  width: 100%;
}
.panel-list { flex: 1; overflow-y: auto; padding: 0.25rem 0; }
.note-item { position: relative; }
.note-top { display: flex; align-items: center; gap: 0.4rem; }
.note-fav-btn {
  background: none; border: none; cursor: pointer;
  padding: 0.2rem; border-radius: 6px;
  color: var(--bulma-text-light); display: flex; align-items: center;
  opacity: 0.5; transition: all 0.12s; flex-shrink: 0;
  &:hover { opacity: 1; color: var(--bulma-primary); background: var(--bulma-scheme-main-ter); }
  &.is-saved { opacity: 1; color: var(--bulma-success); }
}
.note-info {
  flex: 1; min-width: 0; cursor: pointer;
  display: flex; flex-direction: column; gap: 0.1rem;
}
.note-name { font-size: 0.8em; font-weight: 500; color: var(--bulma-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.note-meta { font-size: 0.7em; color: var(--bulma-text-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--bulma-family-monospace); }
.note-actions { display: flex; gap: 2px; flex-shrink: 0; }
.note-edit-form { border-top: 1px solid var(--bulma-border-light); margin-top: 0.45rem; }
.note-detail { padding: 0.45rem 0.9rem 0.55rem; border-top: 1px solid var(--bulma-border-light); }
.note-command {
  background: var(--bulma-scheme-main-ter); padding: 0.5rem 0.6rem; border-radius: 8px;
  font-size: 0.72em; font-family: var(--bulma-family-monospace); white-space: pre-wrap; word-break: break-all;
  color: var(--bulma-text); margin: 0;
}
.note-footer { display: flex; gap: 0.6rem; margin-top: 0.35rem; font-size: 0.65em; color: var(--bulma-text-light); }
.panel-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 0.5rem;
  .empty-icon { opacity: 0.3; }
}
</style>
