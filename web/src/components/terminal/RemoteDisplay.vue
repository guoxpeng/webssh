<template>
  <div class="remote-display-wrap" ref="wrapRef" tabindex="0" @click="focusWrap">
    <div class="remote-display-canvas" ref="canvasRef"></div>
    <div class="remote-display-status" v-if="statusText">
      <span class="rd-spinner" v-if="connecting"></span>
      <span class="rd-text">{{ statusText }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import Guacamole from 'guacamole-common-js';
import { createGuacTunnel } from '@/services/guacTunnel';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  nodeConfig: { type: Object, required: true },
});
const emit = defineEmits(['status-change', 'error-message', 'shell-exit']);

const { t } = useI18n();
const wrapRef = ref(null);
const canvasRef = ref(null);
const statusText = ref('');
const connecting = ref(false);

let tunnel = null;
let client = null;
let keyboard = null;
let mouse = null;
let touchscreen = null;
let resizeObserver = null;
let destroyed = false;

const proto = String(props.nodeConfig?.protocol || '').toUpperCase();

function handleError(message) {
  if (destroyed) return;
  connecting.value = false;
  statusText.value = message || t('terminal.remoteError');
  emit('status-change', 'error');
  emit('error-message', message || t('terminal.remoteError'));
}

function connect() {
  const cfg = props.nodeConfig || {};
  const wrap = wrapRef.value;
  statusText.value = `${t('terminal.connecting')} ${proto}…`;
  connecting.value = true;

  tunnel = createGuacTunnel({
    protocol: cfg.protocol,
    host: cfg.host,
    port: cfg.port,
    username: cfg.username,
    auth_value: cfg.auth_value,
    width: Math.max(320, wrap?.clientWidth || 1280),
    height: Math.max(240, wrap?.clientHeight || 800),
  });

  client = new Guacamole.Client(tunnel);
  const displayEl = client.getDisplay().getElement();
  displayEl.classList.add('remote-display-el');
  canvasRef.value?.appendChild(displayEl);

  client.onstatechange = (state) => {
    if (destroyed) return;
    if (state === Guacamole.Client.State.CONNECTED) {
      connecting.value = false;
      statusText.value = '';
      emit('status-change', 'connected');
    } else if (state === Guacamole.Client.State.DISCONNECTED) {
      if (statusText.value === '') emit('shell-exit');
    }
  };
  client.onerror = (status) => handleError(status?.message);
  tunnel.onerror = (status) => handleError(status?.message);

  // Keyboard is scoped to this pane (tabindex + click focus), mirroring
  // xterm's click-to-type behaviour in split layouts.
  keyboard = new Guacamole.Keyboard(wrap);
  keyboard.onkeydown = (keysym) => { try { client.sendKeyEvent(true, keysym); } catch {} return true; };
  keyboard.onkeyup = (keysym) => { try { client.sendKeyEvent(false, keysym); } catch {} };

  mouse = new Guacamole.Mouse(displayEl);
  mouse.onEach(['mousedown', 'mousemove', 'mouseup'], (state) => {
    try { client.sendMouseState(state, true); } catch {}
  });
  touchscreen = new Guacamole.Mouse.Touchscreen(displayEl);
  touchscreen.onEach(['mousedown', 'mousemove', 'mouseup'], (state) => {
    try { client.sendMouseState(state, true); } catch {}
  });

  // Keep the remote resolution in sync with the pane size.
  if (typeof ResizeObserver !== 'undefined' && wrap) {
    resizeObserver = new ResizeObserver(() => {
      try { client.sendSize(Math.max(320, wrap.clientWidth), Math.max(240, wrap.clientHeight)); } catch {}
    });
    resizeObserver.observe(wrap);
  }

  try {
    client.connect('');
  } catch (e) {
    handleError(e?.message || String(e));
  }
}

function focusWrap() {
  try { wrapRef.value?.focus(); } catch {}
}

function disconnect() {
  destroyed = true;
  try { resizeObserver?.disconnect(); } catch {}
  resizeObserver = null;
  try { keyboard?.blur?.(); } catch {}
  try { tunnel?.disconnect(); } catch {}
  try { client?.disconnect(); } catch {}
  client = null; tunnel = null; keyboard = null; mouse = null; touchscreen = null;
}

defineExpose({ disconnect });

onMounted(() => { connect(); });
onBeforeUnmount(() => { disconnect(); });
</script>

<style scoped>
.remote-display-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
  outline: none;
}
.remote-display-canvas {
  width: 100%;
  height: 100%;
}
.remote-display-canvas :deep(canvas),
.remote-display-canvas :deep(div) {
  margin: 0 auto;
}
.remote-display-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  background: rgba(0, 0, 0, 0.55);
  color: #eee;
  font-size: 0.95rem;
  pointer-events: none;
}
.rd-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: rd-spin 0.8s linear infinite;
}
@keyframes rd-spin {
  to { transform: rotate(360deg); }
}
</style>
