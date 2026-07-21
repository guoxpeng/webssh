<template>
  <div class="skeleton-wrapper" :class="type">
    <div v-for="i in rows" :key="i" class="skeleton-line"
         :style="{ width: widths[(i - 1) % widths.length] }">
      <div class="skeleton-block"></div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  type: { type: String, default: 'text' },
  rows: { type: Number, default: 3 },
  widths: { type: Array, default: () => ['60%', '80%', '45%', '70%', '55%'] },
});
</script>

<style lang="scss" scoped>
.skeleton-wrapper {
  padding: 1rem 0;
}

.skeleton-line {
  margin-bottom: 0.75rem;
  &:last-child { margin-bottom: 0; }
}

.skeleton-block {
  height: 14px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    var(--bulma-border-light) 25%,
    var(--bulma-border) 50%,
    var(--bulma-border-light) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
