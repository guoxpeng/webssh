<template>
  <nav class="app-navbar" role="navigation" aria-label="main navigation">
    <div class="navbar-brand">
      <router-link to="/" class="navbar-logo">
        <img src="https://testingcf.jsdelivr.net/gh/macklee6/hahah/c399002482ef17d9a8c5a90fb876776e.gif" alt="" width="26" height="26" style="border-radius:4px"/>
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
  position: fixed; top: 0; left: 0; right: 0; height: 3.25rem; z-index: 500;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 1rem;
  background: var(--bulma-scheme-main-bis);
  border-bottom: 1px solid var(--bulma-border-light);
}
.navbar-brand { display: flex; align-items: center; }
.navbar-logo {
  display: flex; align-items: center; gap: 0.5rem; text-decoration: none;
  color: var(--bulma-text-strong);
}
.navbar-title { font-size: 1.1em; font-weight: 700; }
.navbar-badge {
  padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.7em; font-weight: 500;
  background: hsl(155,30%,90%); color: hsl(155,50%,30%); border: none; cursor: default;
}
</style>
