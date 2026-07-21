import { useUiStore } from '@/stores/uiStore';
import { computed } from 'vue';

export function useTheme() {
  const uiStore = useUiStore();

  return {
    currentTheme: computed(() => uiStore.currentTheme),
    toggleTheme: uiStore.toggleTheme,
  };
}
