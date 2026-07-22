<template>
  <nav class="navbar is-fixed-top has-shadow is-spaced" role="navigation" aria-label="main navigation">
    <div class="container">
      <div class="navbar-brand">
        <router-link class="navbar-item has-text-weight-bold is-size-4 is-family-sans-serif" to="/">
          <MonitorSmartphone class="mr-2" :size="28" stroke-width="1.5"/>
          {{ t('app.name') }}
        </router-link>

        <a role="button"
           class="navbar-burger"
           :class="{ 'is-active': menuActive }"
           @click="toggleMenu"
           :aria-label="t('common.menu')"
           :aria-expanded="menuActive ? 'true' : 'false'">
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </a>
      </div>

      <div class="navbar-menu" :class="{ 'is-active': menuActive }">
        <div class="navbar-start">
          <router-link class="navbar-item" to="/" @click="closeMenu">
            <Zap class="mr-1" :size="18" stroke-width="1.5"/> {{ t('nav.connect') }}
          </router-link>
          <router-link v-if="connectionStore.isConnected" class="navbar-item" to="/terminal" @click="closeMenu">
            <TerminalSquare class="mr-1" :size="18" stroke-width="1.5"/> {{ t('nav.terminal') }}
          </router-link>
          </div>

        <div class="navbar-end">
          <div class="navbar-item">
             <div class="field has-addons">
                 <p class="control" v-if="connectionStore.isConnected">
                     <span class="button is-static is-small has-text-success">
                         <CheckCircle2 class="mr-1" :size="16" stroke-width="1.5"/>
                         {{ connectionStore.currentNodeDetails?.name || t('nav.connected') }}
                     </span>
                  </p>
                  <p class="control" v-else-if="connectionStore.connectionStatus === ConnectionStatus.CONNECTING">
                      <span class="button is-static is-small is-loading">{{ t('nav.connecting') }}</span>
                  </p>
             </div>
          </div>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConnectionStore } from '@/stores/connectionStore';
import { ConnectionStatus } from '@/utils/constants';
import { MonitorSmartphone, Zap, TerminalSquare, CheckCircle2 } from 'lucide-vue-next';

const { t } = useI18n();

const connectionStore = useConnectionStore();
const menuActive = ref(false);

const toggleMenu = () => {
  menuActive.value = !menuActive.value;
};
const closeMenu = () => {
  menuActive.value = false;
};
</script>

<style lang="scss" scoped>
.navbar-item .lucide {
  vertical-align: middle;
  display: inline-block;
}
.navbar.is-spaced {
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
}
</style>
