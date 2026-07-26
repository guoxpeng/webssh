import { useUiStore } from '@/stores/uiStore';

export function useNotifications() {
  const uiStore = useUiStore();

  const showSuccess = (message?: string, duration?: number) => {
    if (message) uiStore.addNotification({ message, type: 'success', duration: duration ?? 2000 });
  };
  const showError = (message?: string, duration?: number) => {
    if (message) uiStore.addNotification({ message, type: 'danger', duration: duration ?? 5000 });
  };
  const showInfo = (message?: string, duration?: number) => {
    if (message) uiStore.addNotification({ message, type: 'info', duration: duration ?? 2000 });
  };
  const showWarning = (message?: string, duration?: number) => {
    if (message) uiStore.addNotification({ message, type: 'warning', duration: duration ?? 2000 });
  };

  return { showSuccess, showError, showInfo, showWarning };
}
