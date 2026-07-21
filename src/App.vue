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
