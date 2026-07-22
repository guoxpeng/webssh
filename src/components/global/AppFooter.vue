<template>
  <footer class="footer app-footer">
    <div class="content has-text-centered">
      <p>
        <strong>{{ t('app.name') }} | arksec.net</strong> &copy; {{ new Date().getFullYear() }}.
        <span class="is-size-7 has-text-grey-light">
          {{ t('app.tagline') }} <Heart :size="14" fill="red" color="red" class="icon-heart"/>
        </span>
      </p>
    </div>
  </footer>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import { Heart } from 'lucide-vue-next';

const { t } = useI18n();
</script>

<style lang="scss" scoped>
.app-footer {
  padding: 2rem 1.5rem; // 减少 padding
  // background-color: var(--bulma-scheme-main-ter); // 已在 main.scss 定义
}
.icon-heart {
  display: inline-block;
  vertical-align: middle;
  margin: 0 0.2em;
}
</style>

