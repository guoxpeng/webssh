<template>
  <div class="app-layout">
    <AppNavbar />
    <AppNotification />
    <main class="section main-content is-flex-grow-1">
      <div class="container">
        <slot></slot> </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import AppNavbar from '@/components/global/AppNavbar.vue';
import AppFooter from '@/components/global/AppFooter.vue'; // (稍后创建)
import AppNotification from '@/components/global/AppNotification.vue';
</script>

<style lang="scss" scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.main-content {
  padding-top: calc(3.25rem + 1.5rem); // 3.25rem 是 Bulma navbar 默认高度, 1.5rem 是 section 的 padding
  padding-bottom: 1.5rem;
  flex-grow: 1; // 确保 main content 占据导航栏和页脚之间的剩余空间
}
</style>

