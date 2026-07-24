<template>
  <span class="protocol-badge" :class="`is-${protocol}`" :title="protocolLabel">
    <component :is="icon" :size="14" v-if="icon"/>
    <span>{{ protocolLabel }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Terminal, Monitor, Video, Wifi, Cable } from 'lucide-vue-next';

const { t } = useI18n();

const props = defineProps({
  protocol: { type: String, default: 'ssh' },
});

const iconMap = { ssh: Terminal, rdp: Monitor, vnc: Video, telnet: Wifi, serial: Cable };

const icon = computed(() => iconMap[props.protocol]);
const protocolLabel = computed(() => t('protocol.' + props.protocol, props.protocol.toUpperCase()));
</script>

<style lang="scss" scoped>
.protocol-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.5rem;
  border-radius: 6px;
  font-size: 0.7em;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;

  &.is-ssh { background: color-mix(in srgb, var(--bulma-success) 18%, transparent); color: var(--bulma-success); }
  &.is-rdp { background: color-mix(in srgb, var(--bulma-info) 18%, transparent); color: var(--bulma-info); }
  &.is-vnc { background: color-mix(in srgb, var(--bulma-primary) 18%, transparent); color: var(--bulma-primary); }
  &.is-telnet { background: color-mix(in srgb, var(--bulma-warning) 18%, transparent); color: var(--bulma-warning); }
  &.is-serial { background: color-mix(in srgb, var(--bulma-info) 18%, transparent); color: var(--bulma-info); }
}
</style>
