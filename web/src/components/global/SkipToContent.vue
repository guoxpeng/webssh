<template>
  <a href="#main-content" class="skip-to-content" @click.prevent="skip">
    {{ t('common.skipToContent') }}
  </a>
</template>

<script setup>
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

function skip() {
  const el = document.getElementById('main-content');
  if (el) { el.setAttribute('tabindex', '-1'); el.focus(); }
}
</script>

<style lang="scss" scoped>
.skip-to-content {
  position: fixed; top: -100px; left: 0; z-index: 99999;
  padding: 0.5rem 1rem; background: var(--bulma-primary); color: white;
  font-size: 0.85em; text-decoration: none; border-radius: 0 0 8px 0;
  transition: top 0.2s;
  &:focus { top: 0; outline: 2px solid white; outline-offset: 2px; }
}
</style>
