<template>
  <div class="tab-bar" v-if="sessions.length > 0">
    <div class="tab-list">
      <div v-for="session in sessions" :key="session.id"
           class="tab-item"
           :class="{ 'is-active': session.id === activeId,
                     'is-disconnected': session.status === 'disconnected' || session.status === 'error' }"
           @click="$emit('select', session.id)">
        <span class="tab-indicator" :class="`is-${session.status}`"></span>
        <span class="tab-label">{{ session.name }}</span>
        <button class="tab-close" @click.stop="$emit('close', session.id)"
                aria-label="Close session">&times;</button>
      </div>
    </div>
    <div class="tab-actions">
      <span class="tag is-light is-small">{{ sessions.length }} session{{ sessions.length > 1 ? 's' : '' }}</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  sessions: { type: Array, required: true },
  activeId: { type: String, default: null },
});

defineEmits(['select', 'close']);
</script>

<style lang="scss" scoped>
.tab-bar {
  display: flex;
  align-items: center;
  background: var(--bulma-scheme-main-ter);
  border-bottom: 1px solid var(--bulma-border-light);
  padding: 0 0.5rem;
  min-height: 36px;
  flex-shrink: 0;
}

.tab-list {
  display: flex;
  align-items: stretch;
  gap: 2px;
  flex: 1;
  overflow-x: auto;
  &::-webkit-scrollbar { height: 2px; }
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  font-size: 0.8em;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  color: var(--bulma-text-light);
  white-space: nowrap;
  transition: all 0.12s ease;
  position: relative;

  &:hover {
    color: var(--bulma-text);
    background: var(--bulma-scheme-main-bis);
    .tab-close { opacity: 1; }
  }

  &.is-active {
    color: var(--bulma-text-strong);
    background: var(--bulma-box-background-color);
    font-weight: 500;
    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0.5rem;
      right: 0.5rem;
      height: 2px;
      border-radius: 1px;
      background: var(--bulma-primary);
    }
  }
}

.tab-indicator {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;

  &.is-connected { background: var(--bulma-success); }
  &.is-connecting { background: var(--bulma-info); animation: pulse 1s infinite; }
  &.is-error { background: var(--bulma-danger); }
  &.is-disconnected { background: var(--bulma-border); }
}

.tab-label {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-close {
  opacity: 0;
  background: none;
  border: none;
  font-size: 1.1em;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  color: var(--bulma-text-light);
  transition: opacity 0.12s;
  &:hover { color: var(--bulma-danger); }
}

.tab-actions {
  padding-left: 0.5rem;
  flex-shrink: 0;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
