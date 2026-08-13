<template>
  <nav class="app-navbar" role="navigation" aria-label="main navigation">
    <div class="navbar-brand">
      <router-link to="/" class="navbar-logo">
        <img src="/logo.jpg" alt="" width="26" height="26" style="border-radius:4px; object-fit:cover"/>
        <span class="navbar-title">{{ t('app.name') }}</span>
      </router-link>
    </div>
    <div class="navbar-right">
      <button v-if="connectionStore.isConnected" class="navbar-badge is-connected" :title="connectionStore.currentNodeDetails?.name">
        {{ connectionStore.currentNodeDetails?.name || t('nav.connected') }}
      </button>
    </div>
  </nav>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import { useConnectionStore } from '@/stores/connectionStore';

const { t } = useI18n();
const connectionStore = useConnectionStore();
</script>

<style lang="scss" scoped>
.app-navbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 500;
  /* height incl. top safe area (notch / status bar on Android & iOS) */
  height: var(--navbar-h, 3.25rem);
  padding-top: var(--sat, 0px);
  box-sizing: border-box;
  display: flex; align-items: center; justify-content: space-between;
  padding-left: 1rem; padding-right: 1rem;
  background: var(--app-surface);
  border-bottom: 1px solid var(--app-border);
  backdrop-filter: blur(16px);
}
.navbar-brand { display: flex; align-items: center; }
.navbar-logo {
  display: flex; align-items: center; gap: 0.5rem; text-decoration: none;
  color: var(--bulma-text-strong);
}
.navbar-title { font-size: 1.1em; font-weight: 700; letter-spacing: -0.01em; }
.navbar-badge {
  padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.7em; font-weight: 500;
  border: none; cursor: default;
  background: var(--bulma-success);
  color: white;
  max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
