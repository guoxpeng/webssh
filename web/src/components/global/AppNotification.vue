<template>
  <transition-group name="toast" tag="div" class="toast-stack" aria-live="polite">
    <div v-for="notification in visibleNotifications" :key="notification.id"
         class="toast" :class="`is-${notification.type || 'info'}`"
         role="status"
         @mouseenter="uiStore.pauseNotification(notification.id)"
         @mouseleave="uiStore.resumeNotification(notification.id)"
         @click="uiStore.removeNotification(notification.id)">
      <component :is="iconFor(notification.type)" :size="16" class="toast-icon"/>
      <span class="toast-message">{{ notification.message }}</span>
      <button class="toast-close" :aria-label="t('common.close')"
              @click.stop="uiStore.removeNotification(notification.id)">
        <X :size="12"/>
      </button>
    </div>
  </transition-group>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUiStore } from '@/stores/uiStore';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-vue-next';

const { t } = useI18n();
const uiStore = useUiStore();

// Keep the stack short; older notifications are auto-dismissed by their timers.
const MAX_VISIBLE = 4;
const visibleNotifications = computed(() => uiStore.notifications.slice(-MAX_VISIBLE));

const iconMap = { success: CheckCircle, danger: XCircle, info: Info, warning: AlertTriangle };
function iconFor(type) { return iconMap[type] || Info; }
</script>

<style lang="scss" scoped>
.toast-stack {
  position: fixed; left: 0.75rem; bottom: 2.75rem; z-index: 10000;
  display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem;
  max-width: min(92vw, 380px);
  pointer-events: none;
}
.toast {
  display: flex; align-items: flex-start; gap: 0.5rem;
  padding: 0.55rem 0.55rem 0.55rem 0.7rem; border-radius: 10px;
  font-size: 0.85em; line-height: 1.4;
  background: var(--bulma-scheme-main); color: var(--bulma-text);
  border: 1px solid var(--bulma-border-light);
  border-left: 3px solid var(--bulma-info);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  cursor: pointer; pointer-events: auto; max-width: 100%;
  &.is-success { border-left-color: var(--bulma-success, #22c55e); .toast-icon { color: var(--bulma-success, #22c55e); } }
  &.is-danger  { border-left-color: var(--bulma-danger, #ef4444);  .toast-icon { color: var(--bulma-danger, #ef4444); } }
  &.is-info    { border-left-color: var(--bulma-info, #3b82f6);    .toast-icon { color: var(--bulma-info, #3b82f6); } }
  &.is-warning { border-left-color: var(--bulma-warning, #f59e0b); .toast-icon { color: var(--bulma-warning, #f59e0b); } }
}
.toast-icon { flex-shrink: 0; margin-top: 1px; }
.toast-message {
  flex: 1; min-width: 0;
  overflow-wrap: anywhere; word-break: break-word;
}
.toast-close {
  flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border: none; border-radius: 50%;
  background: none; color: var(--bulma-text-light); cursor: pointer; padding: 0;
  opacity: 0.55;
  &:hover { opacity: 1; background: var(--bulma-border-light); color: var(--bulma-text); }
}

.toast-enter-active { transition: all 0.22s cubic-bezier(0.34, 1.4, 0.64, 1); }
.toast-leave-active { transition: all 0.18s ease-in; position: absolute; }
.toast-enter-from { opacity: 0; transform: translateX(-14px); }
.toast-leave-to { opacity: 0; transform: translateX(-14px); }

/* Mobile: clear the fixed status bar + bottom nav, full width. */
@media screen and (max-width: 768px) {
  .toast-stack {
    left: 0.5rem; right: 0.5rem; bottom: calc(3.5rem + 20px + 0.5rem + var(--sab, 0px));
    max-width: none;
  }
}
</style>
