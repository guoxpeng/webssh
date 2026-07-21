import { useUiStore } from '@/stores/uiStore';

export function useNotifications() {
  const uiStore = useUiStore();

  const showSuccess = (message: string, duration = 3000) => {
    uiStore.addNotification({ message, type: 'success' as const, duration });
  };

  const showError = (message: string, duration = 5000) => {
    uiStore.addNotification({ message, type: 'danger' as const, duration });
  };

  const showInfo = (message: string, duration = 3000) => {
    uiStore.addNotification({ message, type: 'info' as const, duration });
  };

  const showWarning = (message: string, duration = 4000) => {
    uiStore.addNotification({ message, type: 'warning' as const, duration });
  };

  return {
    showSuccess,
    showError,
    showInfo,
    showWarning,
  };
}
