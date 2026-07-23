<template>
  <div class="proto-info">
    <div class="proto-info-header">
      <component :is="iconComponent" :size="40" class="proto-icon"/>
      <h3>{{ protocolLabel }}</h3>
    </div>

    <div class="proto-details">
      <div class="detail-row">
        <span class="detail-label">{{ t('form.host') }}</span>
        <span class="detail-value">
          <code>{{ config?.host }}:{{ config?.port }}</code>
          <button class="copy-btn" @click="copyAddress" :title="t('common.copy')">
            <Copy :size="13"/>
          </button>
        </span>
      </div>
      <div class="detail-row" v-if="config?.username && protocol !== 'vnc'">
        <span class="detail-label">{{ t('form.username') }}</span>
        <span class="detail-value">{{ config.username }}</span>
      </div>
      <div class="detail-row" v-if="protocol === 'vnc'">
        <span class="detail-label">VNC Display</span>
        <span class="detail-value">{{ vncDisplay }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">{{ t('form.protocol') }}</span>
        <span class="detail-value proto-badge" :class="'proto-' + protocol">{{ protocol.toUpperCase() }}</span>
      </div>
    </div>

    <div class="proto-actions">
      <template v-if="protocol === 'rdp'">
        <p class="proto-hint">{{ t('protocol.rdpHint') }}</p>
        <button class="btn btn-primary" @click="downloadRdp">
          <Download :size="15"/> {{ t('protocol.downloadRdp') }}
        </button>
        <div class="rdp-launch-info">
          <code>mstsc {{ config?.host || 'server' }}.rdp</code>
          <span class="launch-hint">Windows: double-click the .rdp file</span>
        </div>
      </template>

      <template v-else-if="protocol === 'vnc'">
        <p class="proto-hint">{{ t('protocol.vncHint') }}</p>
        <div class="conn-string-row">
          <code class="conn-string">{{ vncConnectionString }}</code>
          <button class="copy-btn" @click="copyVncString" :title="t('common.copy')">
            <Copy :size="14"/>
          </button>
        </div>
        <div class="vnc-alt-formats">
          <span class="alt-label">Direct: <code>{{ directVncAddress }}</code></span>
        </div>
      </template>

      <template v-else-if="protocol === 'ssh'">
        <p class="proto-hint">Use any SSH client to connect:</p>
        <div class="conn-string-row">
          <code class="conn-string">ssh {{ config?.username }}@{{ config?.host }} -p {{ config?.port || 22 }}</code>
          <button class="copy-btn" @click="copySshString" :title="t('common.copy')">
            <Copy :size="14"/>
          </button>
        </div>
      </template>

      <template v-else-if="protocol === 'telnet'">
        <p class="proto-hint">Use any Telnet client to connect:</p>
        <div class="conn-string-row">
          <code class="conn-string">telnet {{ config?.host }} {{ config?.port || 23 }}</code>
          <button class="copy-btn" @click="copyTelnetString" :title="t('common.copy')">
            <Copy :size="14"/>
          </button>
        </div>
      </template>

      <template v-else-if="protocol === 'serial'">
        <p class="proto-hint">{{ t('protocol.serialHint') }}</p>
        <div class="serial-details">
          <div class="serial-detail-row">
            <span class="serial-detail-label">{{ t('protocol.serialPort') }}</span>
            <span class="serial-detail-value">{{ config?.serial_port || '—' }}</span>
          </div>
          <div class="serial-detail-row">
            <span class="serial-detail-label">{{ t('protocol.serialBaud') }}</span>
            <span class="serial-detail-value">{{ config?.serial_baud || 115200 }}</span>
          </div>
          <div class="serial-detail-row">
            <span class="serial-detail-label">{{ t('protocol.serialDataBits') }}</span>
            <span class="serial-detail-value">{{ config?.serial_dataBits || 8 }}</span>
          </div>
          <div class="serial-detail-row">
            <span class="serial-detail-label">{{ t('protocol.serialStopBits') }}</span>
            <span class="serial-detail-value">{{ config?.serial_stopBits || 1 }}</span>
          </div>
          <div class="serial-detail-row">
            <span class="serial-detail-label">{{ t('protocol.serialParity') }}</span>
            <span class="serial-detail-value">{{ config?.serial_parity || 'none' }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Monitor, Video, Terminal, Wifi, Cable, Download, Copy } from 'lucide-vue-next';

const { t } = useI18n();

const props = defineProps({
  protocol: { type: String, required: true },
  config: { type: Object, default: null },
});

const emit = defineEmits(['close']);

const protocolLabel = computed(() => t(`protocol.${props.protocol}`));
const iconComponent = computed(() => {
  switch (props.protocol) {
    case 'rdp': return Monitor;
    case 'vnc': return Video;
    case 'telnet': return Wifi;
    case 'serial': return Cable;
    default: return Terminal;
  }
});

const vncDisplay = computed(() => {
  const port = (props.config?.port || 5900);
  return `:${port - 5900}`;
});

const vncConnectionString = computed(() => {
  const c = props.config;
  if (!c) return '';
  return `${c.host || 'localhost'}::${(c.port || 5900) - 5900}`;
});

const directVncAddress = computed(() => {
  const c = props.config;
  if (!c) return '';
  return `${c.host}:${c.port || 5900}`;
});

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {}
}

function copyAddress() {
  const c = props.config;
  if (!c) return;
  copy(`${c.host}:${c.port}`);
}

function copySshString() {
  const c = props.config;
  if (!c) return;
  copy(`ssh ${c.username}@${c.host} -p ${c.port || 22}`);
}

function copyTelnetString() {
  const c = props.config;
  if (!c) return;
  copy(`telnet ${c.host} ${c.port || 23}`);
}

function copyVncString() {
  copy(vncConnectionString.value);
}

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
</script>

<style scoped>
.proto-info {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; gap: 1.5rem; padding: 2rem; overflow-y: auto;
}
.proto-info-header { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
.proto-icon { opacity: 0.5; }
.proto-info-header h3 { font-size: 1.2em; font-weight: 600; margin: 0; }
.proto-details { width: 100%; max-width: 420px; }
.detail-row {
  display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0;
  border-bottom: 1px solid var(--bulma-border-light); font-size: 0.85em;
}
.detail-label { color: var(--bulma-text-light); flex-shrink: 0; }
.detail-value {
  font-weight: 500; display: flex; align-items: center; gap: 0.4rem;
  code { font-family: var(--bulma-family-monospace); font-size: 0.95em; }
}
.proto-badge {
  padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.8em; font-weight: 600;
  &.proto-rdp { background: color-mix(in srgb, var(--bulma-info) 18%, transparent); color: var(--bulma-info); }
  &.proto-vnc { background: color-mix(in srgb, var(--bulma-primary) 18%, transparent); color: var(--bulma-primary); }
  &.proto-ssh { background: color-mix(in srgb, var(--bulma-success) 18%, transparent); color: var(--bulma-success); }
  &.proto-telnet { background: color-mix(in srgb, var(--bulma-warning) 18%, transparent); color: var(--bulma-warning); }
}
.copy-btn {
  background: none; border: none; cursor: pointer; padding: 0.2rem;
  color: var(--bulma-text-light); display: inline-flex;
  &:hover { color: var(--bulma-text); }
}
.proto-actions { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; width: 100%; max-width: 420px; }
.proto-hint { font-size: 0.8em; color: var(--bulma-text-light); text-align: center; margin: 0; }
.conn-string-row {
  display: flex; align-items: center; gap: 0.4rem;
  background: var(--bulma-scheme-main-ter); padding: 0.5rem 0.75rem;
  border-radius: 8px; font-size: 0.85em; width: 100%;
  box-sizing: border-box;
}
.conn-string {
  flex: 1; font-family: var(--bulma-family-monospace); word-break: break-all;
}
.rdp-launch-info {
  text-align: center; margin-top: 0.25rem;
  code { font-size: 0.8em; font-family: var(--bulma-family-monospace); opacity: 0.7; }
}
.launch-hint { display: block; font-size: 0.7em; color: var(--bulma-text-light); margin-top: 0.2rem; }
.vnc-alt-formats { text-align: center; }
.alt-label {
  font-size: 0.75em; color: var(--bulma-text-light);
  code { font-family: var(--bulma-family-monospace); }
}
.serial-details {
  width: 100%; display: flex; flex-direction: column; gap: 0.4rem;
}
.serial-detail-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.35rem 0.5rem; font-size: 0.85em;
  background: var(--bulma-scheme-main-ter); border-radius: 6px;
}
.serial-detail-label { color: var(--bulma-text-light); font-size: 0.9em; }
.serial-detail-value { font-weight: 600; font-family: var(--bulma-family-monospace); }

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
