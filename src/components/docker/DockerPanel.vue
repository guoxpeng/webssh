<template>
  <div class="docker-panel">
    <div class="docker-toolbar">
      <div class="level is-mobile">
        <div class="level-left">
          <div class="level-item">
            <span class="docker-title"><Container :size="16"/> {{ t('docker.title') }}</span>
          </div>
        </div>
        <div class="level-right">
          <div class="level-item buttons are-small">
            <button class="button" @click="refresh" :class="{ 'is-loading': loading }">
              <RefreshCw :size="12"/>
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="docker-body">
      <div class="docker-stats-bar" v-if="stats">
        <div class="stat"><span class="stat-label">{{ t('docker.active') }}</span><span class="stat-value">{{ stats.running }}</span></div>
        <div class="stat"><span class="stat-label">{{ t('docker.stopped') }}</span><span class="stat-value">{{ stats.stopped }}</span></div>
        <div class="stat"><span class="stat-label">{{ t('docker.images') }}</span><span class="stat-value">{{ stats.images }}</span></div>
      </div>
      <div class="docker-list" v-if="containers.length > 0">
        <div v-for="c in containers" :key="c.id" class="docker-item">
          <span class="docker-state" :class="`is-${c.state}`"></span>
          <div class="docker-info">
            <span class="docker-name">{{ c.name }}</span>
            <span class="docker-image">{{ c.image }}</span>
          </div>
          <div class="docker-ports" v-if="c.ports">{{ c.ports }}</div>
          <div class="docker-actions buttons are-small">
            <button v-if="c.state === 'running'" class="button" @click="execAction(c.id, 'stop')" :title="t('docker.stop')">
              <Square :size="10"/>
            </button>
            <button v-if="c.state === 'exited'" class="button" @click="execAction(c.id, 'start')" :title="t('docker.start')">
              <Play :size="10"/>
            </button>
            <button class="button" @click="execAction(c.id, 'logs')" :title="t('docker.logs')">
              <FileText :size="10"/>
            </button>
          </div>
        </div>
      </div>
      <div v-else class="docker-empty">
        <Container :size="32" class="docker-empty-icon"/>
        <p class="is-size-7">{{ t('common.noResults') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Container, RefreshCw, Square, Play, FileText } from 'lucide-vue-next';

const { t } = useI18n();

defineProps({ sessionId: { type: String, default: '' } });
defineEmits(['close']);

const containers = ref([]);
const stats = ref(null);
const loading = ref(false);

async function refresh() {
  loading.value = true;
  try {
    const resp = await fetch('/api/docker/ps', { method: 'POST' });
    if (resp.ok) {
      const data = await resp.json();
      containers.value = data.containers || [];
      stats.value = data.stats || null;
    }
  } catch { containers.value = []; } finally { loading.value = false; }
}

function execAction(id, action) {
  fetch('/api/docker/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ containerId: id, action }),
  }).then(() => setTimeout(refresh, 1000));
}
</script>

<style lang="scss" scoped>
.docker-panel {
  display: flex; flex-direction: column; height: 100%;
  background: var(--bulma-scheme-main-bis);
  border-left: 1px solid var(--bulma-border-light);
  min-width: 300px;
}

.docker-toolbar {
  padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--bulma-border-light); flex-shrink: 0;
}

.docker-title {
  font-size: 0.8em; font-weight: 600; display: flex; align-items: center; gap: 0.35rem;
}

.docker-stats-bar {
  display: flex; gap: 0.5rem; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--bulma-border-light);
  .stat { display: flex; flex-direction: column; align-items: center; flex: 1; }
  .stat-label { font-size: 0.6em; text-transform: uppercase; color: var(--bulma-text-light); }
  .stat-value { font-size: 1.1em; font-weight: 600; }
}

.docker-body { flex: 1; overflow-y: auto; }

.docker-item {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.35rem 0.6rem; font-size: 0.78em;
  &:hover { background: var(--bulma-scheme-main-ter); }
}

.docker-state {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  &.is-running { background: var(--bulma-success); }
  &.is-exited { background: var(--bulma-border); }
  &.is-paused { background: var(--bulma-warning); }
}

.docker-info { flex: 1; min-width: 0; }
.docker-name { display: block; font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
.docker-image { display: block; font-size: 0.9em; color: var(--bulma-text-light); overflow: hidden; text-overflow: ellipsis; }

.docker-ports { font-size: 0.85em; color: var(--bulma-text-light); font-family: var(--bulma-family-monospace); flex-shrink: 0; }

.docker-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 0.5rem;
  .docker-empty-icon { opacity: 0.2; }
}
</style>
