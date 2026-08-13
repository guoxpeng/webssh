<template>
  <div class="page-view">
    <header class="page-head">
      <h1 class="page-title"><ShieldCheckIcon :size="20"/> {{ t('knownHosts.title') }}</h1>
      <p class="page-desc">{{ t('knownHosts.desc') }}</p>
    </header>

    <div class="kh-list" v-if="hostList.length">
      <div class="kh-item" v-for="h in hostList" :key="h.key">
        <ServerIcon :size="16" class="kh-icon"/>
        <div class="kh-main">
          <div class="kh-host">{{ h.key }}</div>
          <div class="kh-fp">{{ h.fingerprint }}</div>
        </div>
      </div>
    </div>

    <div class="page-empty" v-else-if="!loading && !error">
      <ShieldCheckIcon :size="38" class="empty-icon"/>
      <p>{{ t('knownHosts.empty') }}</p>
    </div>

    <div class="page-empty" v-else-if="error">
      <ShieldAlertIcon :size="38" class="empty-icon"/>
      <p>{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ShieldCheck as ShieldCheckIcon, ShieldAlert as ShieldAlertIcon, Server as ServerIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '@/utils/api';
import { getApiBaseUrl } from '@/utils/constants';

const { t } = useI18n();
const hostList = ref([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    const res = await apiFetch(`${getApiBaseUrl()}/known-hosts`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    hostList.value = Object.entries(data.hosts || {}).map(([key, fingerprint]) => ({ key, fingerprint }));
  } catch {
    // No reachable backend (e.g. APK built-in mode): nothing to show.
    error.value = t('knownHosts.noBackend');
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.page-view { max-width: 900px; margin: 0 auto; padding: 32px 24px 80px; }
.page-head { margin-bottom: 22px; }
.page-title { display: flex; align-items: center; gap: 9px; font-size: 19px; font-weight: 600; color: var(--app-text); letter-spacing: .2px; }
.page-desc { margin-top: 6px; font-size: 13px; color: var(--app-text-dim); }
.kh-list { display: flex; flex-direction: column; gap: 8px; }
.kh-item { display: flex; align-items: center; gap: 12px; background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 10px; padding: 12px 14px; }
.kh-icon { color: var(--app-text-dim); flex: none; }
.kh-main { min-width: 0; flex: 1; }
.kh-host { font-size: 14px; font-weight: 500; color: var(--app-text); }
.kh-fp { font-size: 12px; color: var(--app-text-dim); font-family: monospace; word-break: break-all; margin-top: 2px; }
.page-empty { text-align: center; padding: 70px 0; color: var(--app-text-dim); font-size: 14px; }
.empty-icon { opacity: .35; margin-bottom: 12px; }
</style>
