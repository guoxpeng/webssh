<template>
  <div class="notifications-container">
    <transition-group name="notification-fade" tag="div">
      <div v-for="notification in uiStore.notifications" :key="notification.id"
           class="notification" :class="`is-${notification.type || 'info'}`">
        <button class="delete" @click="uiStore.removeNotification(notification.id)"></button>
        <div class="icon-text">
          <span class="icon">
            <component :is="getIconForType(notification.type)" :size="20" stroke-width="1.5"/>
          </span>
          <span>{{ notification.message }}</span>
        </div>
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
</script>

<style lang="scss" scoped>
.notifications-container {
  position: fixed;
  top: calc(3.25rem + 1.5rem + 1rem); // Navbar height + section padding + extra margin
  right: 1.5rem;
  width: 350px;
  max-width: 90vw;
  z-index: 1050; // 高于 navbar (bulma navbar 默认 z-index 30)
}

.notification {
  margin-bottom: 1rem;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  // 确保文字和图标垂直居中
  .icon-text .icon {
     margin-top: -2px; // 微调
  }
}

.notification-fade-enter-active,
.notification-fade-leave-active {
  transition: all 0.4s ease;
}
.notification-fade-enter-from,
.notification-fade-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>

