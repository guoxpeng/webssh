<template>
  <span class="protocol-badge" :class="`is-${protocol}`" :title="protocolLabel">
    <component :is="icon" :size="14" v-if="icon"/>
    <span>{{ protocolLabel }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import { Terminal, Monitor, Video, Wifi } from 'lucide-vue-next';

const props = defineProps({
  protocol: { type: String, default: 'ssh' },
});

const iconMap = { ssh: Terminal, rdp: Monitor, vnc: Video, telnet: Wifi };
const labelMap = { ssh: 'SSH', rdp: 'RDP', vnc: 'VNC', telnet: 'Telnet' };

const icon = computed(() => iconMap[props.protocol]);
const protocolLabel = computed(() => labelMap[props.protocol] || props.protocol.toUpperCase());
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

  &.is-ssh { background: hsl(155, 30%, 92%); color: hsl(155, 55%, 30%); }
  &.is-rdp { background: hsl(210, 30%, 92%); color: hsl(210, 55%, 30%); }
  &.is-vnc { background: hsl(270, 30%, 92%); color: hsl(270, 55%, 40%); }
  &.is-telnet { background: hsl(40, 30%, 92%); color: hsl(40, 55%, 30%); }
}
</style>
