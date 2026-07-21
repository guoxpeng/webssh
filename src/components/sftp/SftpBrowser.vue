<template>
  <div class="sftp-browser">
    <div class="sftp-toolbar">
      <div class="level is-mobile">
        <div class="level-left">
          <div class="level-item">
            <button class="button is-small" @click="goUp" :disabled="currentPath === '/'">
              <ArrowUp :size="14"/>
            </button>
            <button class="button is-small" @click="refresh">
              <RefreshCw :size="14"/>
            </button>
          </div>
          <div class="level-item">
            <span class="sftp-path">{{ currentPath }}</span>
          </div>
        </div>
        <div class="level-right">
          <div class="level-item">
            <button class="button is-small" @click="$emit('close')">
              <X :size="14"/>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="sftp-body">
      <div class="sftp-loading" v-if="loading">
        <LoaderCircle class="spin-icon" :size="20"/>
        <span class="is-size-7 has-text-grey">{{ t('sftp.loading') }}</span>
      </div>

      <div class="sftp-empty" v-else-if="entries.length === 0">
        <FolderOpen :size="32" class="empty-icon"/>
        <p class="is-size-7 has-text-grey">{{ t('sftp.empty') }}</p>
      </div>

      <div class="sftp-entries" v-else>
        <div v-for="entry in entries" :key="entry.name"
             class="sftp-entry"
             :class="{ 'is-dir': entry.isDirectory }"
             @dblclick="entry.isDirectory && navigate(entry.name)">
          <component :is="entry.isDirectory ? Folder : File" :size="16" class="entry-icon"
                     :class="entry.isDirectory ? 'has-text-info' : 'has-text-grey'"/>
          <span class="entry-name">{{ entry.name }}</span>
          <span class="entry-size" v-if="!entry.isDirectory">{{ formatSize(entry.size) }}</span>
          <span class="entry-date" v-if="entry.mtime">{{ formatDate(entry.mtime) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowUp, RefreshCw, Folder, File, FolderOpen, LoaderCircle, X } from 'lucide-vue-next';

const { t } = useI18n();

defineEmits(['close']);

const currentPath = ref('/');
const entries = ref([]);
const loading = ref(false);

function formatSize(bytes) {
  if (!bytes) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function goUp() {
  if (currentPath.value === '/') return;
  const parts = currentPath.value.replace(/\/$/, '').split('/');
  parts.pop();
  currentPath.value = parts.join('/') || '/';
  refresh();
}

async function refresh() {
  loading.value = true;
  try {
    const response = await fetch('/api/sftp/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentPath.value }),
    });
    if (response.ok) {
      const data = await response.json();
      entries.value = data.entries || [];
    }
  } catch {
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

function navigate(name) {
  currentPath.value = currentPath.value.replace(/\/$/, '') + '/' + name;
  refresh();
}

onMounted(refresh);
</script>

<style lang="scss" scoped>
.sftp-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-left: 1px solid var(--bulma-border-light);
  background: var(--bulma-scheme-main-bis);
  min-width: 280px;
}

.sftp-toolbar {
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--bulma-border-light);
  flex-shrink: 0;
}

.sftp-path {
  font-size: 0.75em;
  font-family: var(--bulma-family-monospace);
  color: var(--bulma-text-light);
  margin-left: 0.4rem;
}

.sftp-body {
  flex: 1;
  overflow-y: auto;
}

.sftp-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 0.5rem;
}

.spin-icon { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.sftp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 0.5rem;
  .empty-icon { opacity: 0.3; }
}

.sftp-entry {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.75rem;
  cursor: default;
  font-size: 0.8em;
  transition: background 0.08s;
  &:hover { background: var(--bulma-scheme-main-ter); }
  &.is-dir { cursor: pointer; }
}

.entry-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-size {
  flex-shrink: 0;
  color: var(--bulma-text-light);
  font-size: 0.9em;
  width: 60px;
  text-align: right;
}

.entry-date {
  flex-shrink: 0;
  color: var(--bulma-text-light);
  font-size: 0.9em;
  width: 120px;
  text-align: right;
}
</style>
