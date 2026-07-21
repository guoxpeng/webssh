<template>
  <section class="section has-text-centered is-flex-grow-1 is-flex is-flex-direction-column is-align-items-center is-justify-content-center">
    <div class="container">
      <Unplug class="has-text-warning mb-5" :size="128" stroke-width="1"/>
      <h1 class="title is-1">404</h1>
      <p class="subtitle is-3">{{ t('notFound.subtitle') }}</p>
      <p>{{ t('notFound.message') }}</p>
      <router-link to="/" class="button is-primary is-outlined mt-6">
        <Home class="mr-2" :size="18" stroke-width="1.5"/>
        {{ t('notFound.goHome') }}
      </router-link>
    </div>
  </section>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { Unplug, Home } from 'lucide-vue-next';
</script>

<style lang="scss" scoped>
.section {
  // min-height calculated in DefaultLayout or App.vue for main content area
}
.lucide {
    vertical-align: -0.15em;
}
</style>

