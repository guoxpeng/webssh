<template>
  <UnlockScreen @unlocked="onUnlocked" v-if="!unlocked"/>
  <WorkbenchLayout v-else />
</template>

<script setup>
import { ref } from 'vue';
import WorkbenchLayout from '@/layouts/WorkbenchLayout.vue';
import UnlockScreen from '@/components/global/UnlockScreen.vue';
import { useUiStore } from '@/stores/uiStore';
import { onMounted } from 'vue';

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
</style>
