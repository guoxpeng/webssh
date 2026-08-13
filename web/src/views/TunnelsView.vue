<template>
  <div class="page-view">
    <header class="page-head">
      <h1 class="page-title"><GitBranchIcon :size="20"/> {{ t('nav.tunnels') }}</h1>
      <p class="page-desc">{{ t('tunnelsPage.desc') }}</p>
    </header>
    <div class="tunnel-wrap">
      <TunnelManager/>
    </div>
  </div>
</template>

<script setup>
import TunnelManager from '@/components/tunnel/TunnelManager.vue';
import { GitBranch as GitBranchIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>

<style scoped>
.page-view { max-width: 900px; margin: 0 auto; padding: 32px 24px 80px; }
.page-head { margin-bottom: 22px; }
.page-title { display: flex; align-items: center; gap: 9px; font-size: 19px; font-weight: 600; color: var(--app-text); letter-spacing: .2px; }
.page-desc { margin-top: 6px; font-size: 13px; color: var(--app-text-dim); }
.tunnel-wrap { background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 12px; padding: 18px; }
</style>
