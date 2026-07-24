<template>
  <div class="skeleton-loaders">
    <div v-for="i in count" :key="i" class="skeleton-row" :class="variant">
      <div class="skeleton-avatar" v-if="variant !== 'text'"></div>
      <div class="skeleton-lines">
        <div class="skeleton-line w-70"></div>
        <div class="skeleton-line w-40"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  count: { type: Number, default: 3 },
  variant: { type: String, default: 'list' },
});
</script>

<style scoped>
.skeleton-loaders {
  display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem;
}
.skeleton-row {
  display: flex; align-items: center; gap: 0.5rem;
  &.text { justify-content: center; }
}
.skeleton-avatar {
  width: 28px; height: 28px; border-radius: 6px;
  background: var(--bulma-border-light); flex-shrink: 0;
  animation: shimmer 1.5s ease-in-out infinite;
}
.skeleton-lines {
  flex: 1; display: flex; flex-direction: column; gap: 0.35rem;
}
.skeleton-line {
  height: 10px; border-radius: 4px;
  background: linear-gradient(90deg, var(--bulma-border-light) 25%, var(--bulma-scheme-main-ter) 50%, var(--bulma-border-light) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  &.w-70 { width: 70%; }
  &.w-40 { width: 40%; }
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
