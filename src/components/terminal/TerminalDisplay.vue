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
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
// import { AttachAddon } from '@xterm/addon-attach'; // 如果您决定使用 AttachAddon

import { useUiStore } from '@/stores/uiStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { ConnectionStatus } from '@/utils/constants';

const props = defineProps({
  nodeConfig: {
    type: Object,
    required: true,
  }
});

const xtermContainerRef = ref(null);
const uiStore = useUiStore(); // 仅用于主题切换，如果终端颜色固定则不需要
const connectionStore = useConnectionStore();

let term = null;
let fitAddon = null;

// 固定为黑底白字主题
const fixedTerminalTheme = {
  background: '#000000', // 纯黑背景
  foreground: '#FFFFFF', // 纯白前景 (文字)
  cursor: '#FFFFFF',     // 白色光标
  cursorAccent: '#000000',
  selectionBackground: '#555555', // 深灰选中
  // ANSI 颜色 (确保在黑色背景上可读)
  black: '#2e3436',
  red: '#cc0000',
  green: '#4e9a06',
  yellow: '#c4a000',
  blue: '#3465a4',
  magenta: '#75507b',
  cyan: '#06989a',
  white: '#d3d7cf',
  brightBlack: '#555753',
  brightRed: '#ef2929',
  brightGreen: '#8ae234',
  brightYellow: '#fce94f',
  brightBlue: '#729fcf',
  brightMagenta: '#ad7fa8',
  brightCyan: '#34e2e2',
  brightWhite: '#eeeeec'
};

function applyFixedTheme() {
  if (term) {
    term.options.theme = fixedTerminalTheme;
  }
}

// 如果不再需要根据应用主题切换终端颜色，可以移除 uiStore 和相关的 watch
// watch(() => uiStore.currentTheme, () => {
//     applyTerminalTheme(); // 或者 applyFixedTheme() 如果希望它保持固定
// });

const initializeTerminal = async () => {
  if (!xtermContainerRef.value || !props.nodeConfig) {
    console.error('TerminalDisplay: Container or node config not available for init.');
    connectionStore.setConnectionStatus(ConnectionStatus.ERROR);
    return;
  }
  await nextTick();

  term = new Terminal({
    cursorBlink: true,
    fontFamily: '"Fira Code", Menlo, "DejaVu Sans Mono", Consolas, "Lucida Console", monospace',
    fontSize: 13,
    letterSpacing: 0.5,
    lineHeight: 1.25,
    rows: 24,
    allowProposedApi: true,
    scrollback: 2000,
    convertEol: true,
    theme: fixedTerminalTheme,
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  const webLinksAddon = new WebLinksAddon();
  term.loadAddon(webLinksAddon);

  term.open(xtermContainerRef.value);
  
  try {
    fitAddon.fit();
  } catch (e) {
    console.warn("Initial fitAddon.fit() failed:", e);
    setTimeout(() => {
        try { fitAddon.fit(); } catch (e2) { console.error("Retry fitAddon.fit() failed:", e2); }
    }, 200);
  }
  
  const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
  let reconnectAttempt = 0;
  let reconnectTimer = null;

  const scheduleReconnect = () => {
    if (reconnectAttempt >= RECONNECT_DELAYS.length) {
      term.writeln('\r\n\x1b[31m❌ Max reconnection attempts reached.\x1b[0m');
      return;
    }
    const delay = RECONNECT_DELAYS[reconnectAttempt++];
    term.writeln(`\r\n\x1b[33m↻ Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempt}/${RECONNECT_DELAYS.length})...\x1b[0m`);
    reconnectTimer = setTimeout(() => {
      connectionStore.connectToShell(props.nodeConfig, callbacks);
    }, delay);
  };

  const clearReconnect = () => {
    reconnectAttempt = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const callbacks = {
    onOpen: () => {
      clearReconnect();
      term.writeln('\r\n\x1b[32m✅ SSH session initiated.\x1b[0m');
      term.focus();
    },
    onMessage: (data) => {
      term.write(typeof data === 'string' ? data : new Uint8Array(data));
    },
    onClose: (event) => {
      const reason = event.reason || (event.wasClean ? 'Clean close.' : 'Unclean close.');
      term.writeln(`\r\n\x1b[33mℹ️ Connection closed. Code: ${event.code}. ${reason}\x1b[0m`);
      if (connectionStore.connectionStatus !== ConnectionStatus.DISCONNECTED) {
        scheduleReconnect();
      }
    },
    onError: (errorEventOrMessage) => {
      const errorMessage = typeof errorEventOrMessage === 'string' ? errorEventOrMessage
        : (errorEventOrMessage.message || 'Unknown WebSocket error');
      term.writeln(`\r\n\x1b[31m❌ Error: ${errorMessage}\x1b[0m`);
      scheduleReconnect();
    }
  };

  connectionStore.connectToShell(props.nodeConfig, callbacks);

  term.onData((data) => {
    connectionStore.sendShellData(data);
  });

  window.addEventListener('resize', handleResize);
};

const handleResize = () => {
  if (fitAddon && term && xtermContainerRef.value && xtermContainerRef.value.offsetWidth > 0) {
    try {
      fitAddon.fit();
      if (connectionStore.isConnected && term && term.cols && term.rows) {
        // 如果后端支持 PTY resize，可以在这里发送
        // connectionStore.sendShellData(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    } catch(e) { console.warn("fitAddon.fit() on resize failed:", e); }
  }
};

// --- 手机端按键处理 ---
const sendKey = (keyType) => {
  if (!term || !connectionStore.isConnected) {
    console.warn("Terminal not ready or not connected.");
    return;
  }
  let sequence = '';
  switch (keyType) {
    case 'ESC':    sequence = '\x1B'; break; // ESC (Escape)
    case 'TAB':    sequence = '\t';   break; // TAB
    case 'CTRL_C': sequence = '\x03'; break; // Ctrl+C (ETX - End of Text, SIGINT)
    case 'CTRL_D': sequence = '\x04'; break; // Ctrl+D (EOT - End of Transmission, EOF)
    case 'CTRL_L': sequence = '\x0C'; break; // Ctrl+L (FF - Form Feed, often clears screen)
    // case 'CTRL_Z': sequence = '\x1A'; break; // Ctrl+Z (SUB - Substitute, SIGTSTP)
    case 'UP':     sequence = '\x1B[A'; break; // Arrow Up
    case 'DOWN':   sequence = '\x1B[B'; break; // Arrow Down
    case 'LEFT':   sequence = '\x1B[D'; break; // Arrow Left
    case 'RIGHT':  sequence = '\x1B[C'; break; // Arrow Right
    default:
      console.warn("Unknown keyType:", keyType);
      return;
  }
  // term.input(sequence); // term.input 会尝试模拟本地行规程，可能不是我们想要的
  // term.write(sequence); // term.write 更直接地写入 PTY stream
  connectionStore.sendShellData(sequence); // 通过 WebSocket 发送给后端 PTY
  term.focus(); // 操作后重新聚焦终端
};


watch(() => props.nodeConfig, (newConfig, oldConfig) => {
    if (newConfig && (!oldConfig || newConfig.name !== oldConfig.name || newConfig.host !== oldConfig.host)) {
        if (term) term.dispose();
        connectionStore.disconnectShell(); // Disconnect old WebSocket via store
        initializeTerminal();
    }
}, { deep: true });

onMounted(() => {
  initializeTerminal();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  if (connectionStore.connectionStatus === ConnectionStatus.CONNECTED || connectionStore.connectionStatus === ConnectionStatus.CONNECTING) {
    connectionStore.disconnectShell();
  }
  if (term) {
    term.dispose();
  }
});

const focusTerminal = () => {
  term?.focus();
};
defineExpose({ focusTerminal, fitTerminal: handleResize });

</script>

<style lang="scss" scoped>
.terminal-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%; // 确保此包装器填满其父容器
  overflow: hidden; // 防止内部滚动条影响布局
}

.xterm-container-parent {
  flex-grow: 1; // xterm 容器占据主要空间
  width: 100%;
  // padding: 8px; // 之前的padding，如果需要可以保留
  box-sizing: border-box;
  background-color: #000000; // 固定黑色背景

  :deep(.terminal), :deep(.xterm-viewport), :deep(.xterm-screen) {
    width: 100%;
    height: 100%;
  }
  :deep(.xterm-viewport) {
    overflow-y: hidden !important;
  }
}

.mobile-keys-toolbar {
  flex-shrink: 0; // 工具栏不收缩
  padding: 0.5rem;
  // background-color: var(--bulma-scheme-main-ter); // 使用 Bulma 变量
  background-color: hsl(0,0%,12%); // 暗色背景
  border-top: 1px solid hsl(0,0%,20%);
  // :root:not(.is-dark-mode) & { // 如果应用是浅色模式，工具栏也可以是浅色
  //   background-color: hsl(0,0%,96%);
  //   border-top: 1px solid hsl(0,0%,86%);
  // }

  // 默认隐藏，仅在小于 tablet 断点时通过 Bulma 的 is-hidden-tablet 显示
  // 为了让它在手机上显示，我们使用 is-flex on mobile, is-hidden-tablet
  display: none; // 默认在桌面隐藏
  // 使用 flex 布局，并允许换行
  flex-wrap: wrap;
  gap: 0.3rem; // 按钮间距
  justify-content: center; // 居中按钮行

  @media screen and (max-width: 768px) { // Bulma tablet 断点 (769px) 以下
    display: flex; // 在手机端显示为 flex
  }

  .button {
    // background-color: var(--bulma-button-static-background-color);
    // color: var(--bulma-button-static-color);
    // border-color: var(--bulma-button-static-border-color);
    background-color: hsl(0,0%,25%);
    color: hsl(0,0%,90%);
    border: 1px solid hsl(0,0%,35%);
    margin: 0.2rem; // 按钮外边距，替代gap如果gap不支持旧浏览器

    &:hover {
      background-color: hsl(0,0%,35%);
      border-color: hsl(0,0%,45%);
    }
    &:active {
      background-color: hsl(0,0%,20%);
    }
  }
}
</style>

