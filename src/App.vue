<template>
  <UnlockScreen @unlocked="onUnlocked" v-if="!unlocked"/>
  <WorkbenchLayout v-else />
  <div v-if="showInstall" class="pwa-install-banner">
    <span class="pwa-install-text">{{ t('pwa.installPrompt') }}</span>
    <button class="pwa-install-btn" @click="promptInstall">{{ t('pwa.install') }}</button>
    <button class="pwa-dismiss-btn" @click="dismissInstall">&times;</button>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import WorkbenchLayout from '@/layouts/WorkbenchLayout.vue';
import UnlockScreen from '@/components/global/UnlockScreen.vue';
import { useUiStore } from '@/stores/uiStore';
import { onMounted } from 'vue';
import { usePwaInstall } from '@/composables/usePwaInstall';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const { showInstall, promptInstall, dismissInstall } = usePwaInstall();

const uiStore = useUiStore();
const unlocked = ref(false);

function onUnlocked(masterPassword) {
  sessionStorage.setItem('haossh_master', masterPassword);
  unlocked.value = true;
}

onMounted(() => {
  const stored = sessionStorage.getItem('haossh_master');
  if (stored) {
    unlocked.value = true;
  }
  uiStore.initializeTheme();
});
</script>

<style lang="scss">
/* Global utility styles */
.app-page {
  animation: pageIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes pageIn {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* Button ripple */
.btn-ripple {
  position: relative; overflow: hidden;
  &::after {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(circle at var(--rx, 50%) var(--ry, 50%), rgba(255,255,255,0.3) 0%, transparent 60%);
    opacity: 0; transition: opacity 0.3s; pointer-events: none;
  }
  &:active::after { opacity: 1; }
}

/* Global scrollbar styling */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bulma-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bulma-text-light); }

/* Selection */
::selection { background: rgba(99, 102, 241, 0.2); }

/* PWA install banner */
.pwa-install-banner {
  position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%); z-index: 9999;
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.75rem; border-radius: 10px;
  background: var(--bulma-scheme-main);
  border: 1px solid var(--bulma-border-light);
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pwa-install-text { font-size: 0.8em; color: var(--bulma-text); }
.pwa-install-btn {
  background: var(--bulma-primary); color: white; border: none;
  border-radius: 6px; padding: 0.3rem 0.6rem; font-size: 0.75em; cursor: pointer; font-weight: 500;
}
.pwa-dismiss-btn {
  background: none; border: none; font-size: 1.1em; color: var(--bulma-text-light);
  cursor: pointer; padding: 0 0.2rem;
}
@keyframes slideUp {
  from { opacity: 0; transform: translateX(-50%) translateY(20px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
