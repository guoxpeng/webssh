<template>
  <transition-group name="notif" tag="div" class="notifications-bar">
    <div v-for="notification in visibleNotifications" :key="notification.id"
         class="notif-item" :class="`is-${notification.type || 'info'}`"
         @mouseenter="uiStore.pauseNotification(notification.id)"
         @mouseleave="uiStore.resumeNotification(notification.id)"
         @click="uiStore.removeNotification(notification.id)">
      <component :is="iconFor(notification.type)" :size="13" class="notif-icon"/>
      <span class="notif-message" :title="notification.message">{{ notification.message }}</span>
      <X :size="11" class="notif-close"/>
    </div>
  </transition-group>
</template>

<script setup>
import { computed } from 'vue';
import { useUiStore } from '@/stores/uiStore';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-vue-next';

const uiStore = useUiStore();

// The status bar is narrow — show only the most recent notifications.
const MAX_VISIBLE = 3;
const visibleNotifications = computed(() => uiStore.notifications.slice(-MAX_VISIBLE));

const iconMap = { success: CheckCircle, danger: XCircle, info: Info, warning: AlertTriangle };
function iconFor(type) { return iconMap[type] || Info; }
</script>

<style lang="scss" scoped>
.notifications-bar {
  display: flex; align-items: center; gap: 0.35rem; height: 100%;
  overflow: hidden; min-width: 0;
}
.notif-item {
  display: flex; align-items: center; gap: 0.3rem;
  padding: 1px 0.45rem; border-radius: 4px;
  font-size: 0.9em; white-space: nowrap; min-width: 0;
  cursor: default; transition: background 0.12s;
  &:hover { background: var(--bulma-border-light); }
  &.is-success .notif-icon { color: var(--bulma-success); }
  &.is-danger  .notif-icon { color: var(--bulma-danger); }
  &.is-info    .notif-icon { color: var(--bulma-info); }
  &.is-warning .notif-icon { color: var(--bulma-warning); }
}
.notif-icon { flex-shrink: 0; }
.notif-message {
  line-height: 1.2; color: var(--bulma-text);
  overflow: hidden; text-overflow: ellipsis; max-width: 32ch;
}
.notif-close {
  flex-shrink: 0; opacity: 0; margin-left: 0.05rem;
  color: var(--bulma-text-light); cursor: pointer;
  .notif-item:hover & { opacity: 0.6; }
  &:hover { opacity: 1 !important; color: var(--bulma-text); }
}

.notif-enter-active { transition: all 0.2s ease-out; }
.notif-leave-active { transition: all 0.15s ease-in; position: absolute; }
.notif-enter-from { opacity: 0; transform: translateY(-4px); }
.notif-leave-to { opacity: 0; transform: translateY(4px); }

/* Touch devices: no hover, so the close affordance stays visible */
@media (hover: none) and (pointer: coarse) {
  .notif-close { opacity: 0.55; }
  .notif-message { max-width: 22ch; }
}
</style>
