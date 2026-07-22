<template>
  <div class="sftp-view app-page">
    <div class="sftp-header">
      <h1 class="sftp-title"><FolderOpen :size="24"/> {{ t('sftp.title') || 'File Manager' }}</h1>
      <div class="sftp-conn-select" v-if="connectionStore.savedConnections.length > 0">
        <select v-model="selectedConnId" class="conn-select" @change="onConnChange">
          <option value="" disabled>{{ t('sftp.selectConnection') }}</option>
          <option v-for="c in connectionStore.savedConnections" :key="c.id" :value="c.id">{{ c.name }} ({{ c.username }}@{{ c.host }})</option>
        </select>
      </div>
    </div>

    <div v-if="!selectedConn" class="sftp-empty">
      <FolderSearch :size="48" class="empty-icon"/>
      <h3>{{ t('sftp.noConnection') }}</h3>
      <p>{{ t('sftp.selectHint') }}</p>
      <router-link to="/" class="btn-primary">
        <Server :size="16"/> {{ t('terminal.goToServers') }}
      </router-link>
    </div>

    <div v-else class="sftp-browser-wrap">
      <div class="sftp-toolbar">
        <span class="sftp-conn-label">
          <ProtocolBadge :protocol="selectedConn.protocol || 'ssh'"/>
          {{ selectedConn.name || selectedConn.host }}
        </span>
        <button class="sftp-switch-btn" @click="selectedConnId = ''">{{ t('sftp.switchConnection') }}</button>
      </div>
      <SftpBrowser v-if="selectedConnId" :key="selectedConnId" :node-config="selectedConn" @close="selectedConnId = ''"/>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConnectionStore } from '@/stores/connectionStore';
import ProtocolBadge from '@/components/global/ProtocolBadge.vue';
import SftpBrowser from '@/components/sftp/SftpBrowser.vue';
import { FolderOpen, FolderSearch, Server } from 'lucide-vue-next';

const { t } = useI18n();
const connectionStore = useConnectionStore();

const selectedConnId = ref('');

const selectedConn = computed(() => {
  return connectionStore.savedConnections.find(c => c.id === selectedConnId.value) || null;
});

function onConnChange() {}
</script>

<style scoped>
.sftp-view { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; height: calc(100vh - 3.25rem); height: calc(100dvh - 3.25rem); }
.sftp-header { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 0; margin-bottom: 0.75rem; flex-shrink: 0; }
.sftp-title { font-size: 1.2em; font-weight: 600; display: flex; align-items: center; gap: 0.4rem; margin: 0; }
.sftp-conn-select { margin-left: auto; }
.conn-select {
  padding: 0.35rem 0.5rem; border: 1px solid var(--bulma-border); border-radius: 6px;
  font-size: 0.8em; background: var(--bulma-input-background-color); color: var(--bulma-text); outline: none;
}
.sftp-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; gap: 0.5rem;
  .empty-icon { opacity: 0.2; margin-bottom: 0.5rem; }
  h3 { font-size: 1.1em; font-weight: 600; margin: 0; }
  p { font-size: 0.85em; color: var(--bulma-text-light); }
}
.btn-primary {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85em; font-weight: 500;
  background: linear-gradient(135deg, hsl(235,40%,45%), hsl(235,50%,58%));
  color: white; text-decoration: none; transition: all 0.15s;
  &:hover { box-shadow: 0 4px 16px rgba(99,102,241,0.3); transform: translateY(-1px); color: white; }
}
.sftp-browser-wrap { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.sftp-toolbar {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0; margin-bottom: 0.4rem; flex-shrink: 0;
}
.sftp-conn-label { font-size: 0.8em; display: flex; align-items: center; gap: 0.35rem; }
.sftp-switch-btn {
  background: none; border: 1px solid var(--bulma-border-light); border-radius: 4px; padding: 0.2rem 0.4rem;
  font-size: 0.7em; cursor: pointer; color: var(--bulma-text-light); margin-left: auto;
  &:hover { color: var(--bulma-text); background: var(--bulma-scheme-main-ter); }
}
</style>
