<template>
  <div class="notifications-container">
    <transition-group name="notif" tag="div">
      <div v-for="notification in uiStore.notifications" :key="notification.id"
           class="notification" :class="`is-${notification.type || 'info'}`"
           @mouseenter="clearAuto(notification)"
           @mouseleave="startAuto(notification)">
        <div class="notif-inner">
          <div class="notif-icon-col">
            <component :is="getIconForType(notification.type)" :size="18" stroke-width="1.5"/>
          </div>
          <span class="notif-message">{{ notification.message }}</span>
          <button class="notif-close" @click="uiStore.removeNotification(notification.id)">&times;</button>
        </div>
        <div v-if="notification.duration > 0" class="notif-progress" :style="{ animationDuration: notification.duration + 'ms' }"></div>
      </div>
    </transition-group>
  </div>
</template>

<script setup>
import { useUiStore } from '@/stores/uiStore';
import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-vue-next';

const uiStore = useUiStore();

const getIconForType = (type) => {
  switch (type) {
    case 'success': return CheckCircle;
    case 'danger': return AlertTriangle;
    case 'warning': return AlertCircle;
    case 'info':
    default: return Info;
  }
};

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
.notifications-container {
  position: fixed;
  top: calc(3.25rem + 1.5rem + 1rem);
  right: 1.5rem;
  width: 360px;
  max-width: 90vw;
  z-index: 1050;
  display: flex; flex-direction: column; gap: 0.5rem;
}

.notification {
  border-radius: 10px; overflow: hidden;
  box-shadow: 0 6px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.05);
  &.is-success { .notif-inner { background: hsl(155, 20%, 97%); } .notif-progress { background: var(--bulma-success); } }
  &.is-danger  { .notif-inner { background: hsl(350, 20%, 97%); } .notif-progress { background: var(--bulma-danger); } }
  &.is-warning { .notif-inner { background: hsl(38, 20%, 97%); } .notif-progress { background: var(--bulma-warning); } }
  &.is-info    { .notif-inner { background: hsl(225, 20%, 97%); } .notif-progress { background: var(--bulma-info); } }
}

.notif-inner {
  display: flex; align-items: flex-start; gap: 0.5rem;
  padding: 0.6rem 0.75rem;
}

.notif-icon-col { display: flex; align-items: center; flex-shrink: 0; margin-top: 1px; }
.notif-message {
  flex: 1; font-size: 0.8em; line-height: 1.4; color: var(--bulma-text);
}
.notif-close {
  background: none; border: none; font-size: 1.2em; line-height: 1;
  color: var(--bulma-text-light); cursor: pointer; padding: 0; opacity: 0.5;
  &:hover { opacity: 1; }
}

.notif-progress {
  height: 2px; width: 100%;
  animation: notifShrink linear forwards;
  transform-origin: left;
}
@keyframes notifShrink {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}

.notif-enter-active {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.notif-leave-active {
  transition: all 0.2s ease-in;
}
.notif-enter-from {
  opacity: 0; transform: translateX(40px) scale(0.95);
}
.notif-leave-to {
  opacity: 0; transform: translateX(80px) scale(0.9);
}
.notif-move {
  transition: transform 0.25s ease;
}
</style>

