<template>
  <div class="proto-info">
    <div class="proto-info-header">
      <component :is="iconComponent" :size="32" class="proto-icon"/>
      <h3>{{ protocolLabel }}</h3>
    </div>
    <div class="proto-details">
      <div class="detail-row">
        <span class="detail-label">{{ t('form.host') }}</span>
        <span class="detail-value">{{ config?.host }}:{{ config?.port }}</span>
      </div>
      <div class="detail-row" v-if="config?.username">
        <span class="detail-label">{{ t('form.username') }}</span>
        <span class="detail-value">{{ config.username }}</span>
      </div>
    </div>

    <div v-if="protocol === 'rdp'" class="proto-actions">
      <p class="proto-hint">{{ t('protocol.rdpHint') }}</p>
      <button class="btn btn-primary" @click="downloadRdp">
        <Download :size="15"/> {{ t('protocol.downloadRdp') }}
      </button>
    </div>

    <div v-else-if="protocol === 'vnc'" class="proto-actions">
      <p class="proto-hint">{{ t('protocol.vncHint') }}</p>
      <div class="vnc-string">
        <code>{{ vncConnectionString }}</code>
        <button class="copy-btn" @click="copyVncString" :title="t('common.copy')">
          <Copy :size="14"/>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Monitor, Video, Download, Copy } from 'lucide-vue-next';

const { t } = useI18n();

const props = defineProps({
  protocol: { type: String, required: true },
  config: { type: Object, default: null },
});

const emit = defineEmits(['close']);

const protocolLabel = computed(() => t(`protocol.${props.protocol}`));
const iconComponent = computed(() => props.protocol === 'rdp' ? Monitor : Video);

const vncConnectionString = computed(() => {
  const c = props.config;
  if (!c) return '';
  return `${c.host || 'localhost'}::${(c.port || 5900) - 5900}`;
});

function downloadRdp() {
  const c = props.config;
  if (!c) return;
  const content = [
    `full address:s:${c.host}:${c.port || 3389}`,
    `username:s:${c.username || ''}`,
    `screen mode id:i:2`,
    `use multimon:i:0`,
    `desktopwidth:i:1280`,
    `desktopheight:i:720`,
    `session bpp:i:32`,
    `prompt for credentials:i:1`,
    `authentication level:i:2`,
    `connection type:i:2`,
    `allow desktop composition:i:1`,
    `allow font smoothing:i:1`,
    `disable wallpaper:i:0`,
    `disable full window drag:i:0`,
    `disable menu anims:i:0`,
    `networkautodetect:i:1`,
    `bandwidthautodetect:i:1`,
  ].join('\r\n');
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${c.host || 'server'}.rdp`;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyVncString() {
  try {
    await navigator.clipboard.writeText(vncConnectionString.value);
  } catch {}
}
</script>

<style scoped>
.proto-info {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; gap: 1.5rem; padding: 2rem;
}
.proto-info-header { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
.proto-icon { opacity: 0.5; }
.proto-info-header h3 { font-size: 1.2em; font-weight: 600; margin: 0; }
.proto-details { width: 100%; max-width: 360px; }
.detail-row {
  display: flex; justify-content: space-between; padding: 0.5rem 0;
  border-bottom: 1px solid var(--bulma-border-light); font-size: 0.85em;
}
.detail-label { color: var(--bulma-text-light); }
.detail-value { font-weight: 500; font-family: var(--bulma-family-monospace); }
.proto-actions { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
.proto-hint { font-size: 0.8em; color: var(--bulma-text-light); text-align: center; max-width: 360px; }
.vnc-string {
  display: flex; align-items: center; gap: 0.4rem;
  background: var(--bulma-scheme-main-ter); padding: 0.5rem 0.75rem;
  border-radius: 8px; font-size: 0.85em;
}
.vnc-string code { font-family: var(--bulma-family-monospace); }
.copy-btn {
  background: none; border: none; cursor: pointer; padding: 0.2rem;
  color: var(--bulma-text-light); display: flex;
  &:hover { color: var(--bulma-text); }
}
.btn {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85em; font-weight: 500;
  border: none; cursor: pointer; transition: all 0.15s;
  &.btn-primary {
    background: linear-gradient(135deg, hsl(235,40%,45%), hsl(235,50%,58%));
    color: white;
    &:hover { box-shadow: 0 4px 16px rgba(99,102,241,0.3); transform: translateY(-1px); }
  }
}
</style>
