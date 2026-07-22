<template>
  <div class="terminal-wrapper">
    <div ref="xtermContainerRef" class="xterm-container-parent"></div>
    <div class="mobile-keys-toolbar is-hidden-tablet buttons are-small">
      <button class="button" @mousedown.prevent="sendKey('ESC')" title="Escape (ESC)">ESC</button>
      <button class="button" @mousedown.prevent="sendKey('TAB')" title="Tab">TAB</button>
      <button class="button" @mousedown.prevent="sendKey('CTRL_C')" title="Ctrl+C">Ctrl+C</button>
      <button class="button" @mousedown.prevent="sendKey('CTRL_D')" title="Ctrl+D (EOF)">Ctrl+D</button>
      <button class="button" @mousedown.prevent="sendKey('CTRL_L')" title="Ctrl+L (Clear)">Ctrl+L</button>
      <button class="button" @mousedown.prevent="sendKey('UP')" title="Arrow Up">↑</button>
      <button class="button" @mousedown.prevent="sendKey('DOWN')" title="Arrow Down">↓</button>
      <button class="button" @mousedown.prevent="sendKey('LEFT')" title="Arrow Left">←</button>
      <button class="button" @mousedown.prevent="sendKey('RIGHT')" title="Arrow Right">→</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import SshWebSocketService from '@/services/sshWebSocketService';

const props = defineProps({
  nodeConfig: { type: Object, required: true },
});

const emit = defineEmits(['status-change']);

const xtermContainerRef = ref(null);
let term = null;
let fitAddon = null;
let wsService = null;
let destroyed = false;

const fixedTerminalTheme = {
  background: '#000000',
  foreground: '#FFFFFF',
  cursor: '#FFFFFF',
  cursorAccent: '#000000',
  selectionBackground: '#555555',
  black: '#2e3436', red: '#cc0000', green: '#4e9a06', yellow: '#c4a000',
  blue: '#3465a4', magenta: '#75507b', cyan: '#06989a', white: '#d3d7cf',
  brightBlack: '#555753', brightRed: '#ef2929', brightGreen: '#8ae234',
  brightYellow: '#fce94f', brightBlue: '#729fcf', brightMagenta: '#ad7fa8',
  brightCyan: '#34e2e2', brightWhite: '#eeeeec'
};

const initializeTerminal = async () => {
  if (!xtermContainerRef.value || !props.nodeConfig || destroyed) return;
  await nextTick();

  term = new Terminal({
    cursorBlink: true,
    fontFamily: '"Fira Code", Menlo, "DejaVu Sans Mono", Consolas, "Lucida Console", monospace',
    fontSize: 13, letterSpacing: 0.5, lineHeight: 1.25, rows: 24,
    allowProposedApi: true, scrollback: 2000, convertEol: true,
    theme: fixedTerminalTheme,
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());
  term.open(xtermContainerRef.value);

  try { fitAddon.fit(); } catch (e) {
    setTimeout(() => { try { fitAddon?.fit(); } catch {} }, 200);
  }

  const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
  let reconnectAttempt = 0;
  let reconnectTimer = null;

  const scheduleReconnect = () => {
    if (destroyed || reconnectAttempt >= RECONNECT_DELAYS.length) return;
    const delay = RECONNECT_DELAYS[reconnectAttempt++];
    reconnectTimer = setTimeout(() => {
      if (!destroyed) wsService?.connect(props.nodeConfig, callbacks);
    }, delay);
  };

  const clearReconnect = () => {
    reconnectAttempt = 0;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  };

  const callbacks = {
    onOpen: () => {
      if (destroyed) return;
      clearReconnect();
      emit('status-change', 'connected');
      term?.writeln('\r\n\x1b[32m✅ Session initiated\x1b[0m');
      term?.focus();
    },
    onMessage: (data) => {
      if (!destroyed) term?.write(typeof data === 'string' ? data : new Uint8Array(data));
    },
    onClose: () => {
      if (destroyed) return;
      emit('status-change', 'disconnected');
      if (wsService && !destroyed) scheduleReconnect();
    },
    onError: (errorEventOrMessage) => {
      if (destroyed) return;
      const errorMessage = typeof errorEventOrMessage === 'string' ? errorEventOrMessage
        : (errorEventOrMessage.message || 'Unknown WebSocket error');
      emit('status-change', 'error');
      term?.writeln(`\r\n\x1b[31m❌ ${errorMessage}\x1b[0m`);
      scheduleReconnect();
    }
  };

  wsService = new SshWebSocketService();
  emit('status-change', 'connecting');
  wsService.connect(props.nodeConfig, callbacks);

  term.onData((data) => {
    wsService?.sendMessage(data);
  });

  window.addEventListener('resize', handleResize);
};

const handleResize = () => {
  if (fitAddon && term && xtermContainerRef.value && xtermContainerRef.value.offsetWidth > 0) {
    try { fitAddon.fit(); } catch {}
  }
};

const sendKey = (keyType) => {
  if (!term || !wsService) return;
  let sequence = '';
  switch (keyType) {
    case 'ESC': sequence = '\x1B'; break;
    case 'TAB': sequence = '\t'; break;
    case 'CTRL_C': sequence = '\x03'; break;
    case 'CTRL_D': sequence = '\x04'; break;
    case 'CTRL_L': sequence = '\x0C'; break;
    case 'UP': sequence = '\x1B[A'; break;
    case 'DOWN': sequence = '\x1B[B'; break;
    case 'LEFT': sequence = '\x1B[C'; break;
    case 'RIGHT': sequence = '\x1B[D'; break;
    default: return;
  }
  wsService.sendMessage(sequence);
  term.focus();
};

onMounted(initializeTerminal);

onBeforeUnmount(() => {
  destroyed = true;
  window.removeEventListener('resize', handleResize);
  if (wsService) { wsService.disconnect(); wsService = null; }
  if (term) { term.dispose(); term = null; }
});
</script>

<style lang="scss" scoped>
.terminal-wrapper {
  display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden;
}
.xterm-container-parent {
  flex-grow: 1; width: 100%; box-sizing: border-box;
  background-color: #000000;
  :deep(.terminal), :deep(.xterm-viewport), :deep(.xterm-screen) { width: 100%; height: 100%; }
  :deep(.xterm-viewport) { overflow-y: hidden !important; }
}
.mobile-keys-toolbar {
  flex-shrink: 0; padding: 0.5rem; display: none; flex-wrap: wrap; gap: 0.3rem;
  justify-content: center; background-color: hsl(0,0%,12%); border-top: 1px solid hsl(0,0%,20%);
  @media screen and (max-width: 768px) { display: flex; }
  .button {
    background-color: hsl(0,0%,25%); color: hsl(0,0%,90%); border: 1px solid hsl(0,0%,35%);
    margin: 0.2rem;
    &:hover { background-color: hsl(0,0%,35%); border-color: hsl(0,0%,45%); }
    &:active { background-color: hsl(0,0%,20%); }
  }
}
</style>
