<template>
  <transition-group name="notif" tag="div" class="notifications-bar">
    <div v-for="notification in uiStore.notifications" :key="notification.id"
         class="notif-item" :class="`is-${notification.type || 'info'}`"
         @mouseenter="clearAuto(notification)"
         @mouseleave="startAuto(notification)">
      <span class="notif-message">{{ notification.message }}</span>
    </div>
  </transition-group>
</template>

<script setup>
import { useUiStore } from '@/stores/uiStore';

const uiStore = useUiStore();

const autoTimers = {};
function clearAuto(n) {
  if (autoTimers[n.id]) { clearTimeout(autoTimers[n.id]); delete autoTimers[n.id]; }
}
function startAuto(n) {
  if (n.duration > 0 && !autoTimers[n.id]) {
    autoTimers[n.id] = setTimeout(() => uiStore.removeNotification(n.id), n.duration);
  }
}
</script>

<style lang="scss" scoped>
.notifications-bar {
  display: flex; align-items: center; gap: 0.5rem; height: 100%;
}
.notif-item {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0 0.35rem; border-radius: 3px;
  font-size: 0.85em; white-space: nowrap;
  color: var(--bulma-text);
  &.is-success { color: var(--bulma-text); }
  &.is-danger  { color: var(--bulma-text); }
  &.is-info    { color: var(--bulma-text); }
  &.is-warning { color: var(--bulma-text); }
}
.notif-message { line-height: 1; }

.notif-enter-active {
  transition: all 0.2s ease-out;
}
.notif-leave-active {
  transition: all 0.15s ease-in;
}
.notif-enter-from {
  opacity: 0; transform: translateY(-4px);
}
.notif-leave-to {
  opacity: 0; transform: translateY(4px);
}
</style>
