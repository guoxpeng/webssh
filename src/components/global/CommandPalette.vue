<template>
  <Teleport to="body">
    <div v-if="visible" class="command-palette-overlay" @click.self="close">
      <div class="command-palette" ref="paletteRef">
        <div class="palette-input-wrapper">
          <Search class="palette-search-icon" :size="16" stroke-width="2"/>
          <input ref="inputRef" v-model="query" class="palette-input" type="text"
                 :placeholder="t('commandPalette.placeholder')"
                 @keydown="onKeydown"/>
          <kbd class="palette-hint">ESC</kbd>
        </div>
        <div class="palette-results" v-if="filteredItems.length > 0">
          <div v-for="(item, idx) in filteredItems" :key="item.id"
               class="palette-item"
               :class="{ 'is-selected': idx === selectedIndex }"
               @click="executeItem(item)"
               @mouseenter="selectedIndex = idx">
            <component :is="item.icon" :size="16" stroke-width="1.5" class="palette-item-icon"/>
            <div class="palette-item-info">
              <span class="palette-item-label">{{ item.label }}</span>
              <span class="palette-item-desc" v-if="item.desc">{{ item.desc }}</span>
            </div>
            <span class="palette-item-badge" v-if="item.badge">{{ item.badge }}</span>
          </div>
        </div>
        <div class="palette-empty" v-else-if="query">
          <p class="is-size-7 has-text-grey">{{ t('common.noResults') }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useConnectionStore } from '@/stores/connectionStore';
import { useUiStore } from '@/stores/uiStore';
import { Search, Server, Terminal, Sun, Moon, Plus, X } from 'lucide-vue-next';

const { t } = useI18n();

const props = defineProps({
  visible: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const router = useRouter();
const connectionStore = useConnectionStore();
const uiStore = useUiStore();

const query = ref('');
const selectedIndex = ref(0);
const inputRef = ref(null);
const paletteRef = ref(null);

function fuzzyMatch(text, pattern) {
  if (!pattern) return true;
  const lower = text.toLowerCase();
  const p = pattern.toLowerCase();
  let pi = 0;
  for (let i = 0; i < lower.length && pi < p.length; i++) {
    if (lower[i] === p[pi]) pi++;
  }
  return pi === p.length;
}

const actionItems = computed(() => [
  { id: 'action-new-conn', label: t('commandPalette.newConnection'), desc: t('commandPalette.newConnectionDesc'), icon: Plus, badge: t('common.search'), action: () => router.push('/') },
  { id: 'action-terminal', label: t('commandPalette.openTerminal'), desc: t('commandPalette.openTerminalDesc'), icon: Terminal, badge: t('nav.terminal'), action: () => router.push('/terminal') },
  { id: 'action-toggle-theme', label: t('commandPalette.toggleTheme', { theme: uiStore.currentTheme === 'light' ? 'Dark' : 'Light' }), desc: t('commandPalette.toggleThemeDesc'), icon: uiStore.currentTheme === 'light' ? Moon : Sun, badge: t('settings.title'), action: () => uiStore.toggleTheme() },
]);

const serverItems = computed(() =>
  connectionStore.savedConnections.map(c => ({
    id: `server-${c.id}`,
    label: c.name,
    desc: `${c.username}@${c.host}:${c.port}`,
    icon: Server,
    badge: t('server.title'),
    action: async () => {
      const remembered = await connectionStore.getCredentialFromSessionStorage(c.id);
      if (remembered?.auth_value) {
        connectionStore.pendingConnections.push({
          ...c, ...remembered, id: c.id, rememberForSession: true,
        });
        router.push('/terminal');
      }
    },
  }))
);

const allItems = computed(() => [...actionItems.value, ...serverItems.value]);

const filteredItems = computed(() => {
  const q = query.value.trim();
  return allItems.value.filter(item =>
    fuzzyMatch(item.label, q) || fuzzyMatch(item.desc || '', q)
  );
});

watch(() => props.visible, (val) => {
  if (val) {
    query.value = '';
    selectedIndex.value = 0;
    nextTick(() => inputRef.value?.focus());
  }
});

function onKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex.value = Math.min(selectedIndex.value + 1, filteredItems.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (filteredItems.value[selectedIndex.value]) {
      executeItem(filteredItems.value[selectedIndex.value]);
    }
  }
}

function executeItem(item) {
  close();
  item.action();
}

function close() {
  emit('close');
}

function globalKeydown(e) {
  if (!props.visible) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      emit('close'); // actually open — parent toggles
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      emit('close');
    }
  }
}

onMounted(() => window.addEventListener('keydown', globalKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', globalKeydown));
</script>

<style lang="scss" scoped>
.command-palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  padding-top: 12vh;
}

.command-palette {
  width: 540px;
  max-height: 420px;
  background: var(--bulma-scheme-main);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.palette-input-wrapper {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--bulma-border-light);
  position: relative;
}

.palette-search-icon {
  flex-shrink: 0;
  color: var(--bulma-text-light);
}

.palette-input {
  flex: 1;
  border: none;
  background: none;
  font-size: 1em;
  color: var(--bulma-text);
  outline: none;
  &::placeholder { color: var(--bulma-text-light); }
}

.palette-hint {
  font-size: 0.65em;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bulma-border-light);
  color: var(--bulma-text-light);
}

.palette-results {
  flex: 1;
  overflow-y: auto;
  padding: 0.35rem;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.08s ease;
  &.is-selected { background: var(--bulma-primary); color: white; }
}

.palette-item-icon { flex-shrink: 0; }
.palette-item-info { flex: 1; min-width: 0; }
.palette-item-label { display: block; font-size: 0.85em; font-weight: 500; line-height: 1.3; }
.palette-item-desc { display: block; font-size: 0.7em; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.palette-item-badge {
  font-size: 0.6em;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bulma-border-light);
  color: var(--bulma-text-light);
  flex-shrink: 0;
  .is-selected & { background: rgba(255,255,255,0.2); color: white; }
}

.palette-empty {
  padding: 1.5rem;
  text-align: center;
}
</style>
