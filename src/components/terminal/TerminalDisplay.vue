<template>
  <div class="terminal-wrapper">
    <div v-if="quickSnippets.length > 0" class="quick-snippets-bar">
      <button v-for="(s, si) in quickSnippets" :key="s.id"
              class="quick-snippet-btn"
              :draggable="true"
              @dragstart="onSnippetDragStart($event, si)"
              @dragover.prevent="onSnippetDragOver($event, si)"
              @drop.prevent="onSnippetDrop(si)"
              @dragend="snippetDragIdx = null"
              :class="{ 'snippet-dragging': snippetDragIdx === si, 'snippet-dragover': snippetDragOverIdx === si }"
              :title="s.command">
        {{ s.title }}
      </button>
    </div>
    <div ref="xtermContainerRef" class="xterm-container-parent" @contextmenu.prevent="onTerminalContextMenu"></div>
    <div v-if="showSearch" class="search-overlay" @mousedown.stop>
      <input ref="searchInputRef" type="text" v-model="searchQuery" :placeholder="t('terminal.searchPlaceholder')"
             class="search-input" @keydown.enter="findNext" @keydown.escape="closeSearch"/>
      <span class="search-meta">{{ searchResultIndex }}/{{ searchResultCount }}</span>
      <button class="search-btn" @click="findPrev" :title="t('terminal.searchPrev')" :disabled="searchResultCount === 0"><ChevronLeft :size="14"/></button>
      <button class="search-btn" @click="findNext" :title="t('terminal.searchNext')" :disabled="searchResultCount === 0"><ChevronRight :size="14"/></button>
      <button class="search-btn" @click="closeSearch" :title="t('common.close')"><X :size="14"/></button>
    </div>

    <div class="command-bar-wrap">
      <div class="command-action-btns">
        <button class="cmd-act-btn" @click="copyFromTerminal" :title="t('common.copy')">
          <Copy :size="12"/> {{ t('common.copy') }}
        </button>
        <button class="cmd-act-btn" @click="pasteToTerminal" :title="t('common.paste')">
          <ClipboardPaste :size="12"/> {{ t('common.paste') }}
        </button>
        <span class="cmd-act-sep"></span>
        <button v-for="s in quickSnippets.slice(0, 6)" :key="s.id"
                class="cmd-act-btn cmd-snippet-btn" :title="s.command" @click="sendQuickSnippet(s)">
          {{ s.title }}
        </button>
        <button v-if="quickSnippets.length > 6" class="cmd-act-btn cmd-snippet-btn" :title="t('snippets.title')" disabled>…</button>
      </div>
      <div class="command-input-bar">
        <span class="cmd-prefix">$</span>
        <textarea ref="cmdInputRef" v-model="commandInput"
                  :placeholder="t('terminal.commandPlaceholder')"
                  class="cmd-input" rows="4"
                  @keydown.enter.prevent="sendCommand"
                  @keydown.escape="commandInput = ''; term?.focus()"/>
        <button class="cmd-send-btn" @click="sendCommand" :disabled="!commandInput.trim()" :title="t('terminal.sendCommand')">
          <Send :size="14"/> {{ t('terminal.sendCommand') }}
        </button>
      </div>
    </div>

    <div class="mobile-keys-toolbar is-hidden-tablet">
      <div class="mobile-keys-row">
        <button class="mkey" @mousedown.prevent="sendKey('ESC')" title="Escape">ESC</button>
        <button class="mkey" @mousedown.prevent="sendKey('TAB')" title="Tab">TAB</button>
        <button class="mkey" @mousedown.prevent="sendKey('CTRL_C')" title="Ctrl+C">^C</button>
        <button class="mkey" @mousedown.prevent="sendKey('CTRL_D')" title="Ctrl+D">^D</button>
      </div>
      <div class="mobile-keys-row">
        <button class="mkey" @mousedown.prevent="sendKey('CTRL_A')" title="Ctrl+A (Home)">^A</button>
        <button class="mkey" @mousedown.prevent="sendKey('CTRL_E')" title="Ctrl+E (End)">^E</button>
        <button class="mkey" @mousedown.prevent="sendKey('CTRL_L')" title="Ctrl+L (Clear)">^L</button>
        <button class="mkey" @mousedown.prevent="sendKey('CTRL_U')" title="Ctrl+U (Kill)">^U</button>
        <button class="mkey" @mousedown.prevent="sendKey('CTRL_W')" title="Ctrl+W (Word)">^W</button>
      </div>
      <div class="mobile-keys-row">
        <button class="mkey mkey-arrow" @mousedown.prevent="sendKey('LEFT')" title="Left">◀</button>
        <button class="mkey mkey-arrow" @mousedown.prevent="sendKey('DOWN')" title="Down">▼</button>
        <button class="mkey mkey-arrow" @mousedown.prevent="sendKey('UP')" title="Up">▲</button>
        <button class="mkey mkey-arrow" @mousedown.prevent="sendKey('RIGHT')" title="Right">▶</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import SshWebSocketService from '@/services/sshWebSocketService';
import { useTerminalStore } from '@/stores/terminalStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useUiStore } from '@/stores/uiStore';
import { useI18n } from 'vue-i18n';
import { useSnippetStore } from '@/stores/snippetStore';
import { useCodeNoteStore } from '@/stores/codeNoteStore';
import { ChevronLeft, ChevronRight, X, Send, Copy, ClipboardPaste } from 'lucide-vue-next';

const { t } = useI18n();
const terminalStore = useTerminalStore();
const connectionStore = useConnectionStore();
const snippetStore = useSnippetStore();
const codeNoteStore = useCodeNoteStore();
const uiStore = useUiStore();

const props = defineProps({
  nodeConfig: { type: Object, required: true },
  termSettings: { type: Object, default: null },
});

const emit = defineEmits(['status-change', 'error-message', 'shell-exit']);

const xtermContainerRef = ref(null);
const searchInputRef = ref(null);
const cmdInputRef = ref(null);
const showSearch = ref(false);
const searchQuery = ref('');
const searchResultIndex = ref(0);
const searchResultCount = ref(0);
const commandInput = ref('');
const snippetDragIdx = ref(null);
const snippetDragOverIdx = ref(null);
let term = null;
let fitAddon = null;
let searchAddon = null;
let wsService = null;
let destroyed = false;

const quickSnippets = computed(() => snippetStore.snippets.filter(s => s.favorite).slice(0, 12));

function sendCommand() {
  const cmd = commandInput.value.trim();
  if (!cmd || !wsService) return;
  wsService.sendMessage(cmd + '\n');
  codeNoteStore.addNote(cmd, 'terminal');
  commandInput.value = '';
  term?.focus();
}

async function pasteToTerminal() {
  if (!wsService) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text) wsService.sendMessage(text);
  } catch {}
  term?.focus();
}

function copyFromTerminal() {
  if (term?.hasSelection()) {
    const selected = term.getSelection();
    if (selected) { try { navigator.clipboard.writeText(selected); } catch {} }
  }
}

function sendQuickSnippet(s) {
  if (wsService) {
    wsService.sendMessage(s.command + '\n');
    codeNoteStore.addNote(s.command, 'terminal');
  }
}

function onSnippetDragStart(e, idx) { snippetDragIdx.value = idx; e.dataTransfer.effectAllowed = 'move'; }
function onSnippetDragOver(e, idx) { e.preventDefault(); snippetDragOverIdx.value = idx; }
function onSnippetDrop(idx) {
  if (snippetDragIdx.value === null || snippetDragIdx.value === idx) return;
  const favs = snippetStore.snippets.filter(s => s.favorite);
  const src = favs[snippetDragIdx.value];
  const dst = favs[idx];
  if (!src || !dst) return;
  snippetStore.reorderFavorites(src.id, dst.id);
  snippetDragIdx.value = null;
  snippetDragOverIdx.value = null;
}

const darkTerminalTheme = {
  background: '#0a0a0a',
  foreground: '#FFFFFF',
  cursor: '#FFFFFF',
  cursorAccent: '#0a0a0a',
  selectionBackground: '#555555',
  black: '#2e3436', red: '#cc0000', green: '#4e9a06', yellow: '#c4a000',
  blue: '#3465a4', magenta: '#75507b', cyan: '#06989a', white: '#d3d7cf',
  brightBlack: '#555753', brightRed: '#ef2929', brightGreen: '#8ae234',
  brightYellow: '#fce94f', brightBlue: '#729fcf', brightMagenta: '#ad7fa8',
  brightCyan: '#34e2e2', brightWhite: '#eeeeec'
};

const lightTerminalTheme = {
  background: '#ffffff',
  foreground: '#333333',
  cursor: '#333333',
  cursorAccent: '#ffffff',
  selectionBackground: '#d6d6d6',
  black: '#2e3436', red: '#cc0000', green: '#4e9a06', yellow: '#c4a000',
  blue: '#3465a4', magenta: '#75507b', cyan: '#06989a', white: '#d3d7cf',
  brightBlack: '#555753', brightRed: '#ef2929', brightGreen: '#8ae234',
  brightYellow: '#fce94f', brightBlue: '#729fcf', brightMagenta: '#ad7fa8',
  brightCyan: '#34e2e2', brightWhite: '#eeeeec'
};

function defaultTerminalTheme() {
  return uiStore.currentTheme === 'dark' ? darkTerminalTheme : lightTerminalTheme;
}

const terminalThemes = {
  'solarized-dark': {
    background: '#002b36', foreground: '#839496', cursor: '#839496', cursorAccent: '#002b36',
    selectionBackground: '#073642', black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
    brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  'solarized-light': {
    background: '#fdf6e3', foreground: '#657b83', cursor: '#657b83', cursorAccent: '#fdf6e3',
    selectionBackground: '#eee8d5', black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
    brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  'dracula': {
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#282a36',
    selectionBackground: '#44475a', black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5',
    brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff',
  },
  'monokai': {
    background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#272822',
    selectionBackground: '#49483e', black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75',
    blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
    brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e', brightYellow: '#f4bf75',
    brightBlue: '#66d9ef', brightMagenta: '#ae81ff', brightCyan: '#a1efe4', brightWhite: '#f9f8f5',
  },
  'nord': {
    background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', cursorAccent: '#2e3440',
    selectionBackground: '#434c5e', black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
    blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
    brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4',
  },
  'one-dark': {
    background: '#282c34', foreground: '#abb2bf', cursor: '#abb2bf', cursorAccent: '#282c34',
    selectionBackground: '#3e4452', black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#d19a66',
    blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
    brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#d19a66',
    brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff',
  },
};

function getTerminalTheme(ts) {
  if (ts.themeId === 'custom' && ts.bgColor) {
    const bg = ts.bgColor;
    const fg = ts.fgColor || '#FFFFFF';
    return {
      background: bg, foreground: fg, cursor: fg, cursorAccent: bg,
      selectionBackground: adjustColor(bg, 30),
      black: adjustColor(bg, -20), red: '#cc0000', green: '#4e9a06', yellow: '#c4a000',
      blue: '#3465a4', magenta: '#75507b', cyan: '#06989a', white: adjustColor(fg, -40),
      brightBlack: adjustColor(bg, 20), brightRed: '#ef2929', brightGreen: '#8ae234',
      brightYellow: '#fce94f', brightBlue: '#729fcf', brightMagenta: '#ad7fa8',
      brightCyan: '#34e2e2', brightWhite: fg,
    };
  }
  return terminalThemes[ts.themeId] || defaultTerminalTheme();
}

function adjustColor(hex, amount) {
  if (!hex || hex.length < 7) return hex;
  const r = Math.min(255, Math.max(0, parseInt(hex.slice(1, 3), 16) + amount));
  const g = Math.min(255, Math.max(0, parseInt(hex.slice(3, 5), 16) + amount));
  const b = Math.min(255, Math.max(0, parseInt(hex.slice(5, 7), 16) + amount));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

const initializeTerminal = async () => {
  if (!xtermContainerRef.value || !props.nodeConfig || destroyed) return;
  await nextTick();

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const fitWidth = xtermContainerRef.value?.offsetWidth || 800;

  const ts = props.termSettings || {};
  const theme = getTerminalTheme(ts);
  term = new Terminal({
    cursorBlink: ts.cursorBlink !== undefined ? ts.cursorBlink : true,
    cursorStyle: ts.cursorStyle || 'block',
    fontFamily: '"Fira Code", Menlo, "DejaVu Sans Mono", Consolas, "Lucida Console", monospace',
    fontSize: ts.fontSize || (isMobile ? Math.max(11, Math.floor(fitWidth / 28)) : 13),
    letterSpacing: 0.5, lineHeight: 1.25, rows: 24,
    allowProposedApi: true, scrollback: 2000, convertEol: true,
    theme,
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());
  searchAddon = new SearchAddon();
  searchAddon.onDidChangeResults((results) => {
    searchResultCount.value = results.resultCount;
    searchResultIndex.value = Math.min(results.resultIndex + 1, results.resultCount);
  });
  term.loadAddon(searchAddon);
  try { term.loadAddon(new WebglAddon()); } catch {}
  term.open(xtermContainerRef.value);

  try { fitAddon.fit(); } catch (e) {
    setTimeout(() => { try { fitAddon?.fit(); } catch {} }, 200);
  }

  let connected = false;

  const callbacks = {
    onOpen: () => {
      if (destroyed || connected) return;
      connected = true;
      emit('status-change', 'connected');
      const cfg = props.nodeConfig;
      if (cfg?.id && cfg?.auth_value) {
        connectionStore.saveCredentialToSessionStorage(cfg.id, cfg.auth_type || 'password', cfg.auth_value);
      }
      term?.writeln('\r\n\x1b[32m┌─────────────────────────────────────┐\x1b[0m');
      term?.writeln('\x1b[32m│      ✅  Connection established      │\x1b[0m');
      term?.writeln('\x1b[32m└─────────────────────────────────────┘\x1b[0m');
      term?.focus();
      terminalStore.setActiveSendFunction((data) => wsService?.sendMessage(data));
    },
    // ⚠ DO NOT intercept/filter onMessage — terminal data must pass through as-is.
    // Any JSON parsing here will break SSH when shell outputs JSON-like text.
    onMessage: (data) => {
      if (!destroyed) term?.write(typeof data === 'string' ? data : new Uint8Array(data));
    },
    onClose: (event, manual) => {
      if (destroyed) return;
      connected = false;
      emit('status-change', 'disconnected');
      terminalStore.setActiveSendFunction(null);
      if (event && event.wasClean && !manual && event.code === 1000) {
        emit('shell-exit');
      }
    },
    onError: (errorEventOrMessage) => {
      if (destroyed) return;
      const errorMessage = typeof errorEventOrMessage === 'string' ? errorEventOrMessage
        : (errorEventOrMessage.message || 'Unknown WebSocket error');
      emit('status-change', 'error');
      emit('error-message', errorMessage);
      terminalStore.setActiveSendFunction(null);
      term?.writeln(`\r\n\x1b[31m┌─────────────────────────────────────┐\x1b[0m`);
      term?.writeln(`\x1b[31m│  ❌ ${errorMessage.padEnd(32)}\x1b[31m│\x1b[0m`);
      term?.writeln(`\x1b[31m└─────────────────────────────────────┘\x1b[0m`);
    }
  };

  wsService = new SshWebSocketService();
  emit('status-change', 'connecting');
  term?.writeln('\r\n\x1b[33m⏳ Connecting...\x1b[0m');
  wsService.connect(props.nodeConfig, callbacks);

  term.onData((data) => {
    wsService?.sendMessage(data);
  });



  term.attachCustomKeyEventHandler((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f' && e.type === 'keydown') {
      openSearch();
      return false;
    }
    return true;
  });

  window.addEventListener('resize', handleResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize);
  }
};

let resizeTimer = null;
const handleResize = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!term || !xtermContainerRef.value || xtermContainerRef.value.offsetWidth <= 0) return;
    try { fitAddon?.fit(); } catch {}
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      const newSize = Math.max(11, Math.floor(xtermContainerRef.value.offsetWidth / 28));
      if (Math.abs(newSize - term.options.fontSize) > 1) {
        term.options.fontSize = newSize;
        try { fitAddon?.fit(); } catch {}
      }
    } else {
      const defaultSize = props.termSettings?.fontSize || 13;
      if (term.options.fontSize !== defaultSize) {
        term.options.fontSize = defaultSize;
        try { fitAddon?.fit(); } catch {}
      }
    }
  }, 100);
};

function openSearch() {
  showSearch.value = true;
  searchQuery.value = '';
  searchResultIndex.value = 0;
  searchResultCount.value = 0;
  nextTick(() => searchInputRef.value?.focus());
}

function closeSearch() {
  showSearch.value = false;
  searchQuery.value = '';
  searchAddon?.clearActiveSearch();
  term?.focus();
}

async function onTerminalContextMenu() {
  if (!term || !wsService) return;
  if (term.hasSelection()) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text) wsService.sendMessage(text);
  } catch {}
  term.focus();
}

function findNext() {
  if (!searchQuery.value || !searchAddon) return;
  searchAddon.findNext(searchQuery.value, { caseSensitive: false, wholeWord: false, regex: false });
}

function findPrev() {
  if (!searchQuery.value || !searchAddon) return;
  searchAddon.findPrevious(searchQuery.value, { caseSensitive: false, wholeWord: false, regex: false });
}

const sendKey = (keyType) => {
  if (!term || !wsService) return;
  let sequence = '';
  switch (keyType) {
    case 'ESC': sequence = '\x1B'; break;
    case 'TAB': sequence = '\t'; break;
    case 'CTRL_C': sequence = '\x03'; break;
    case 'CTRL_D': sequence = '\x04'; break;
    case 'CTRL_L': sequence = '\x0C'; break;
    case 'CTRL_A': sequence = '\x01'; break;
    case 'CTRL_E': sequence = '\x05'; break;
    case 'CTRL_U': sequence = '\x15'; break;
    case 'CTRL_W': sequence = '\x17'; break;
    case 'UP': sequence = '\x1B[A'; break;
    case 'DOWN': sequence = '\x1B[B'; break;
    case 'LEFT': sequence = '\x1B[D'; break;
    case 'RIGHT': sequence = '\x1B[C'; break;
    default: return;
  }
  wsService.sendMessage(sequence);
  term.focus();
};

watch(() => uiStore.currentTheme, () => {
  if (!term) return;
  term.options.theme = defaultTerminalTheme();
  term.refresh(0, term.rows - 1);
});

onMounted(initializeTerminal);

onBeforeUnmount(() => {
  destroyed = true;
  window.removeEventListener('resize', handleResize);
  terminalStore.setActiveSendFunction(null);
  if (wsService) { wsService.disconnect(); wsService = null; }
  if (term) { term.dispose(); term = null; }
});
</script>

<style lang="scss" scoped>
.terminal-wrapper {
  display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; position: relative;
}
.xterm-container-parent {
  flex: 1 1 0; min-height: 0; width: 100%; box-sizing: border-box;
  background-color: var(--term-bg);
  :deep(.terminal), :deep(.xterm-viewport), :deep(.xterm-screen) { width: 100%; height: 100%; }
  :deep(.xterm-viewport) { overflow-y: auto !important; scrollbar-width: thin; }
  :deep(.xterm-rows) { will-change: transform; }
}
.mobile-keys-toolbar {
  flex: 0 0 auto; padding: 0.35rem; display: none; flex-direction: column; gap: 0.25rem;
  justify-content: center; background-color: var(--term-bg); border-top: 1px solid var(--term-border);
  @media screen and (max-width: 768px) { display: flex; }
}
.mobile-keys-row {
  display: flex; justify-content: center; gap: 0.3rem;
}
.mkey {
  background-color: var(--term-border); color: var(--term-text); border: 1px solid var(--term-text-dim);
  border-radius: 6px; padding: 0.35rem 0.5rem; min-width: 2.2rem;
  font-size: 0.7rem; font-family: inherit; cursor: pointer; user-select: none;
  -webkit-tap-highlight-color: transparent;
  &:hover { background-color: var(--term-text-dim); border-color: var(--term-text-dim); }
  &:active { background-color: var(--term-border); transform: scale(0.95); }
}
.mkey-arrow { background-color: var(--term-bg2); min-width: 2.5rem; }

.quick-snippets-bar {
  display: flex; align-items: center; gap: 3px; padding: 2px 0.35rem;
  background: var(--term-bg); border-bottom: 1px solid var(--term-border);
  flex: 0 0 auto; overflow-x: auto; flex-wrap: wrap;
  scrollbar-width: none; &::-webkit-scrollbar { display: none; }
}
.quick-snippet-btn {
  background: var(--term-bg2); color: var(--term-text); border: 1px solid var(--term-border);
  border-radius: 4px; padding: 0.15rem 0.4rem; font-size: 0.65em;
  cursor: pointer; white-space: nowrap; transition: background 0.1s; user-select: none;
  &:hover { background: var(--term-hover); color: var(--term-text); }
  &.snippet-dragging { opacity: 0.3; }
  &.snippet-dragover { border-color: var(--bulma-primary); }
}

.command-bar-wrap {
  flex: 0 0 auto; display: flex; flex-direction: column;
  border-top: 1px solid var(--term-border);
  z-index: 10;
}
.command-action-btns {
  display: flex; align-items: center; gap: 2px; padding: 2px 0.35rem;
  background: var(--term-bg); flex-wrap: wrap;
}
.cmd-act-btn {
  background: var(--term-bg2); color: var(--term-text); border: 1px solid var(--term-border);
  border-radius: 4px; padding: 0.15rem 0.4rem; font-size: 0.65em;
  cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 0.2rem;
  transition: background 0.1s; user-select: none;
  &:hover { background: var(--term-hover); color: var(--term-text); }
}
.cmd-snippet-btn { background: var(--term-bg2); border-color: var(--term-bg2); max-width: 80px; overflow: hidden; text-overflow: ellipsis; }
.cmd-act-sep { width: 1px; height: 16px; background: var(--term-border); margin: 0 2px; }

.command-input-bar {
  display: flex; align-items: flex-end; gap: 0.3rem;
  padding: 0.3rem 0.35rem; background: var(--term-bg);
}
.cmd-prefix { color: var(--term-text-dim); font-family: monospace; font-size: 0.75em; padding-bottom: 0.1rem; }
.cmd-input {
  flex: 1; background: var(--term-bg2); border: 1px solid var(--term-border);
  border-radius: 4px; padding: 0.2rem 0.35rem; font-size: 0.75em;
  font-family: monospace; color: var(--term-text); outline: none; resize: none; line-height: 1.4;
  &::placeholder { color: var(--term-text-dim); }
  &:focus { border-color: var(--term-text-dim); }
}
.cmd-send-btn {
  background: var(--term-bg2); border: 1px solid var(--term-border); border-radius: 4px;
  padding: 0.35rem 0.6rem; cursor: pointer; color: var(--term-text); display: flex;
  align-items: center; gap: 0.2rem; font-size: 0.7em; flex-shrink: 0;
  &:hover:not(:disabled) { background: var(--bulma-primary); color: white; border-color: var(--bulma-primary); }
  &:disabled { opacity: 0.3; cursor: default; }
}

.search-overlay {
  position: absolute; top: 0; right: 0; z-index: 10;
  display: flex; align-items: center; gap: 0.25rem;
  padding: 0.3rem 0.4rem; background: var(--term-bg);
  border-bottom-left-radius: 8px; border: 1px solid var(--term-border);
  border-top: none; border-right: none;
}
.search-overlay .search-input {
  width: 160px; padding: 0.2rem 0.4rem; border: 1px solid var(--term-border);
  border-radius: 4px; font-size: 0.75em; background: var(--term-bg2);
  color: var(--term-text); outline: none;
  &::placeholder { color: var(--term-text-dim); }
  &:focus { border-color: var(--term-primary); }
}
.search-meta { font-size: 0.65em; color: var(--term-text-dim); min-width: 30px; text-align: center; }
.search-btn {
  background: none; border: 1px solid var(--term-border); border-radius: 4px;
  padding: 0.2rem; cursor: pointer; color: var(--term-text); display: flex;
  &:hover { background: var(--term-border); color: var(--term-text); }
  &:disabled { opacity: 0.3; cursor: default; }
}
</style>
