<template>
  <transition-group name="notif" tag="div" class="notifications-bar">
    <div v-for="notification in uiStore.notifications" :key="notification.id"
         class="notif-item" :class="`is-${notification.type || 'info'}`"
         @mouseenter="clearAuto(notification)"
         @mouseleave="startAuto(notification)"
         @click="uiStore.removeNotification(notification.id)">
      <component :is="iconFor(notification.type)" :size="13" class="notif-icon"/>
      <span class="notif-message">{{ notification.message }}</span>
      <X :size="11" class="notif-close"/>
    </div>
  </transition-group>
</template>

<script setup>
import { onBeforeUnmount } from 'vue';
import { useUiStore } from '@/stores/uiStore';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-vue-next';

const uiStore = useUiStore();

const iconMap = { success: CheckCircle, danger: XCircle, info: Info, warning: AlertTriangle };
function iconFor(type) { return iconMap[type] || Info; }

const autoTimers = {};
function clearAuto(n) {
  if (autoTimers[n.id]) { clearTimeout(autoTimers[n.id]); delete autoTimers[n.id]; }
}
function startAuto(n) {
  if (n.duration > 0 && !autoTimers[n.id]) {
    autoTimers[n.id] = setTimeout(() => uiStore.removeNotification(n.id), n.duration);
  }
}

onBeforeUnmount(() => {
  for (const id of Object.keys(autoTimers)) {
    clearTimeout(autoTimers[id]);
    delete autoTimers[id];
  }
});
</script>

<style lang="scss" scoped>
.notifications-bar {
  display: flex; align-items: center; gap: 0.35rem; height: 100%; overflow-x: auto;
  &::-webkit-scrollbar { height: 0; }
}
.notif-item {
  display: flex; align-items: center; gap: 0.25rem;
  padding: 0 0.35rem; border-radius: 3px;
  font-size: 0.85em; white-space: nowrap;
  cursor: default; transition: background 0.12s;
  &:hover { background: var(--bulma-border-light); }
  &.is-success { color: var(--bulma-success); }
  &.is-danger  { color: var(--bulma-danger); }
  &.is-info    { color: var(--bulma-info); }
  &.is-warning { color: var(--bulma-warning); }
}
.notif-icon { flex-shrink: 0; }
.notif-message { line-height: 1; color: var(--bulma-text); }
.notif-close {
  flex-shrink: 0; opacity: 0; margin-left: 0.15rem;
  color: var(--bulma-text-light); cursor: pointer;
  .notif-item:hover & { opacity: 0.6; }
  &:hover { opacity: 1 !important; color: var(--bulma-text); }
}

.notif-enter-active { transition: all 0.2s ease-out; }
.notif-leave-active { transition: all 0.15s ease-in; }
.notif-enter-from { opacity: 0; transform: translateY(-4px); }
.notif-leave-to { opacity: 0; transform: translateY(4px); }
</style>
