<template>
  <div class="sftp-view app-page">
    <div class="sftp-view-header">
      <div class="sftp-servers">
        <span class="sftp-servers-label"><FolderOpen :size="16"/> {{ t('sftp.title') || 'File Manager' }}</span>
        <button v-for="tab in sftpTabs" :key="tab.id" class="sftp-tab"
                :class="{ 'is-active': tab.id === activeTabId }"
                @click="activeTabId = tab.id">
          {{ tab.name }}
          <span class="sftp-tab-close" @click.stop="closeTab(tab.id)">&times;</span>
        </button>
        <button class="sftp-new-tab" @click="showConnPicker = true" :title="t('sftp.newConnection')">+</button>
      </div>
    </div>

    <div v-if="showConnPicker" class="sftp-picker-overlay" @click.self="showConnPicker = false">
      <div class="sftp-picker-card">
        <h4>{{ t('sftp.selectConnection') }}</h4>
        <div class="sftp-picker-list">
          <div v-for="c in connectionStore.savedConnections" :key="c.id" class="sftp-picker-item"
               @click="addTab(c)">
            <ProtocolBadge :protocol="c.protocol || 'ssh'"/>
            <div>
              <strong>{{ c.name || c.host }}</strong>
              <small>{{ c.username }}@{{ c.host }}:{{ c.port }}</small>
            </div>
          </div>
          <div v-if="connectionStore.savedConnections.length === 0" class="sftp-picker-empty">
            {{ t('sftp.noConnection') }}
          </div>
        </div>
        <button class="sftp-picker-close" @click="showConnPicker = false">{{ t('common.close') }}</button>
      </div>
    </div>

    <div class="sftp-view-body" v-if="activeTab">
      <SftpBrowser :key="activeTab.id" :node-config="activeTab.config" @close="closeTab(activeTab.id)"/>
    </div>
    <div v-else class="sftp-empty">
      <FolderSearch :size="48" class="empty-icon"/>
      <h3>{{ t('sftp.noConnection') }}</h3>
      <p>{{ t('sftp.selectHint') }}</p>
      <button class="sftp-add-first" @click="showConnPicker = true">
        <Plus :size="16"/> {{ t('sftp.selectConnection') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConnectionStore } from '@/stores/connectionStore';
import ProtocolBadge from '@/components/global/ProtocolBadge.vue';
import SftpBrowser from '@/components/sftp/SftpBrowser.vue';
import { FolderOpen, FolderSearch, Plus } from 'lucide-vue-next';

const { t } = useI18n();
const connectionStore = useConnectionStore();

const showConnPicker = ref(false);
const sftpTabs = ref([]);
const activeTabId = ref(null);

const activeTab = computed(() => sftpTabs.value.find(t => t.id === activeTabId.value) || null);

function addTab(conn) {
  showConnPicker.value = false;
  const id = `sftp_${Date.now()}`;
  sftpTabs.value.push({ id, name: conn.name || conn.host, config: { ...conn } });
  activeTabId.value = id;
}

function closeTab(id) {
  sftpTabs.value = sftpTabs.value.filter(t => t.id !== id);
  if (activeTabId.value === id) activeTabId.value = sftpTabs.value[0]?.id || null;
}
</script>

<style scoped>
.sftp-view { max-width: 100%; margin: 0 auto; display: flex; flex-direction: column; height: calc(100dvh - 3.25rem); overflow: hidden; }
@media (max-width: 768px) { .sftp-view { height: calc(100dvh - 3.25rem - 3.5rem); } }
.sftp-view-header { padding: 0.4rem 0.75rem; border-bottom: 1px solid var(--bulma-border-light); flex-shrink: 0; }
.sftp-servers { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
.sftp-servers-label { font-size: 0.85em; font-weight: 600; display: flex; align-items: center; gap: 0.35rem; margin-right: 0.5rem; }
.sftp-tab {
  background: var(--bulma-scheme-main-ter); border: 1px solid var(--bulma-border-light);
  border-radius: 6px; padding: 0.25rem 0.5rem; font-size: 0.75em; cursor: pointer;
  display: flex; align-items: center; gap: 0.3rem; white-space: nowrap;
  &:hover { background: var(--bulma-scheme-main-bis); }
  &.is-active { background: var(--bulma-primary); color: white; border-color: var(--bulma-primary); }
}
.sftp-tab-close { font-size: 1.1em; line-height: 1; cursor: pointer; opacity: 0.6; &:hover { opacity: 1; } }
.sftp-new-tab {
  background: none; border: 1px dashed var(--bulma-border); border-radius: 6px;
  padding: 0.25rem 0.6rem; font-size: 0.9em; cursor: pointer; color: var(--bulma-text-light);
  &:hover { border-color: var(--bulma-primary); color: var(--bulma-primary); }
}
.sftp-view-body { flex: 1; overflow: hidden; }
.sftp-view-body :deep(.sftp-browser) { border-radius: 0; border: none; height: 100%; }

.sftp-picker-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.sftp-picker-card { background: var(--bulma-scheme-main); border-radius: 12px; width: 400px; max-height: 70vh; display: flex; flex-direction: column; overflow: hidden; }
.sftp-picker-card h4 { margin: 0; padding: 0.75rem 1rem; font-size: 0.9em; border-bottom: 1px solid var(--bulma-border-light); }
.sftp-picker-list { flex: 1; overflow-y: auto; padding: 0.5rem; }
.sftp-picker-item {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; border-radius: 8px; cursor: pointer;
  &:hover { background: var(--bulma-scheme-main-ter); }
  strong { display: block; font-size: 0.85em; }
  small { font-size: 0.7em; color: var(--bulma-text-light); }
}
.sftp-picker-empty { text-align: center; padding: 1.5rem; color: var(--bulma-text-light); }
.sftp-picker-close { border: none; padding: 0.5rem; cursor: pointer; font-size: 0.8em; background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
.sftp-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 0.5rem; }
.sftp-add-first { display: flex; align-items: center; gap: 0.35rem; padding: 0.5rem 1rem; border: 1px solid var(--bulma-primary); border-radius: 8px; background: transparent; color: var(--bulma-primary); cursor: pointer; font-size: 0.85em; }
</style>
