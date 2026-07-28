<template>
  <div class="terminal-wrapper">
    <div ref="xtermContainerRef" class="xterm-container-parent" @contextmenu="onTerminalContextMenu"></div>
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
        <button class="cmd-act-btn" @click="clearTerminal" :title="t('terminal.clear')">
          <Trash2 :size="12"/> {{ t('terminal.clear') }}
        </button>
        <button class="cmd-act-btn" @click="toggleSnippets" :title="t('snippets.title')">
          <Star :size="12"/> {{ t('snippets.title') }}
        </button>
        <button class="cmd-act-btn" @click="toggleChat" :title="t('chat.title')">
          <Bot :size="12"/> AI
        </button>
        <div class="cmd-dropdown" ref="cmdDropdownRef">
          <button class="cmd-act-btn" @click="showCmdMenu = !showCmdMenu" :title="t('common.more')">
            <Menu :size="12"/>
          </button>
          <div v-if="showCmdMenu" class="cmd-dropdown-menu" @click="showCmdMenu = false">
            <button @click="toggleCodeNotes"><TerminalSquare :size="13"/> {{ t('codeNotes.title') }}</button>
            <button @click="openSettings"><Settings :size="13"/> {{ t('nav.settings') }}</button>
            <button @click="openMacro"><PlayCircle :size="13"/> {{ t('macro.title') }}</button>
          </div>
        </div>
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
                      @keydown.enter="onCmdEnter"
                      @keydown.escape="commandInput = ''; term?.focus()"/>
        <button class="cmd-send-btn" @click="sendCommand" :disabled="!commandInput.trim()" :title="t('terminal.sendCommand')">
          <Send :size="15"/>
        </button>
      </div>
    </div>

    <div class="mobile-keys-toolbar is-hidden-tablet">
      <div class="mobile-keys-row mobile-keys-row-main">
        <button class="mkey mkey-sm" @mousedown.prevent="sendKey('ESC')" title="Escape">ESC</button>
        <button class="mkey mkey-sm" @mousedown.prevent="sendKey('TAB')" title="Tab">TAB</button>
        <span class="mkey-sep"></span>
        <button class="mkey mkey-arrow" @mousedown.prevent="sendKey('UP')" title="Up">▲</button>
        <button class="mkey mkey-arrow" @mousedown.prevent="sendKey('DOWN')" title="Down">▼</button>
        <button class="mkey mkey-arrow" @mousedown.prevent="sendKey('LEFT')" title="Left">◀</button>
        <button class="mkey mkey-arrow" @mousedown.prevent="sendKey('RIGHT')" title="Right">▶</button>
        <span class="mkey-sep"></span>
        <button class="mkey" @mousedown.prevent="sendKey('ENTER')" title="Enter">↵</button>
        <button class="mkey mkey-wider" @mousedown.prevent="sendKey('SPACE')" title="Space">␣</button>
      </div>
      <div class="mobile-keys-row mobile-keys-row-ctrl">
        <button class="mkey mkey-xs" @mousedown.prevent="sendKey('CTRL_C')" title="Ctrl+C (Break)">^C</button>
        <button class="mkey mkey-xs" @mousedown.prevent="sendKey('CTRL_D')" title="Ctrl+D (EOF)">^D</button>
        <button class="mkey mkey-xs" @mousedown.prevent="sendKey('CTRL_Z')" title="Ctrl+Z (Suspend)">^Z</button>
        <button class="mkey mkey-xs" @mousedown.prevent="sendKey('CTRL_X')" title="Ctrl+X">^X</button>
        <button class="mkey mkey-xs" @mousedown.prevent="sendKey('CTRL_L')" title="Ctrl+L (Clear)">^L</button>
        <button class="mkey mkey-xs" @mousedown.prevent="sendKey('CTRL_U')" title="Ctrl+U (Kill)">^U</button>
        <button class="mkey mkey-xs" @mousedown.prevent="sendKey('CTRL_A')" title="Ctrl+A (Home)">^A</button>
        <button class="mkey mkey-xs" @mousedown.prevent="sendKey('CTRL_E')" title="Ctrl+E (End)">^E</button>
        <button class="mkey mkey-xs" @mousedown.prevent="sendKey('CTRL_W')" title="Ctrl+W (Word)">^W</button>
        <button class="mkey mkey-xs" @mousedown.prevent="sendKey('CTRL_K')" title="Ctrl+K (Cut)">^K</button>
        <button class="mkey mkey-xs" @mousedown.prevent="sendKey('CTRL_R')" title="Ctrl+R (Search)">^R</button>
        <button class="mkey mkey-xs" @mousedown.prevent="sendKey('CTRL_Y')" title="Ctrl+Y (Paste)">^Y</button>
        <button class="mkey mkey-xs" @mousedown.prevent="sendKey('CTRL_P')" title="Ctrl+P (Prev)">^P</button>
        <button class="mkey mkey-xs" @mousedown.prevent="sendKey('CTRL_N')" title="Ctrl+N (Next)">^N</button>
      </div>
    </div>

    <div v-if="showPasteFallback" class="paste-fallback-overlay" @click.self="cancelPasteFallback">
      <div class="paste-fallback-box" @keydown.escape="cancelPasteFallback">
        <p class="paste-fallback-label">{{ t('terminal.pasteHere') }}</p>
        <textarea ref="pasteFallbackRef" v-model="pasteFallbackText"
                  class="paste-fallback-textarea" rows="6"
                  @keydown.enter.prevent="confirmPasteFallback"
                  :placeholder="t('terminal.pastePlaceholder')"></textarea>
        <div class="paste-fallback-actions">
          <button class="button is-small" @click="cancelPasteFallback">{{ t('common.cancel') }}</button>
          <button class="button is-small is-primary" @click="confirmPasteFallback" :disabled="!pasteFallbackText.trim()">{{ t('common.paste') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, inject } from 'vue';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import SshWebSocketService from '@/services/sshWebSocketService';
import { useTerminalStore } from '@/stores/terminalStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useUiStore } from '@/stores/uiStore';
import { useI18n } from 'vue-i18n';
import { useSnippetStore } from '@/stores/snippetStore';
import { useCodeNoteStore } from '@/stores/codeNoteStore';
import { ChevronLeft, ChevronRight, X, Send, Copy, ClipboardPaste, Star, Menu, Bot, TerminalSquare, Settings, PlayCircle, Trash2 } from 'lucide-vue-next';

const { t } = useI18n();
const terminalStore = useTerminalStore();
const connectionStore = useConnectionStore();
const snippetStore = useSnippetStore();
const codeNoteStore = useCodeNoteStore();
const toggleSnippets = inject('toggleSnippets', () => {});
const toggleCodeNotes = inject('toggleCodeNotes', () => {});
const toggleChat = inject('toggleChat', () => {});
const showCmdMenu = ref(false);
const cmdDropdownRef = ref(null);
const uiStore = useUiStore();

function openSettings() {
  document.dispatchEvent(new CustomEvent('open-settings'));
}
function openMacro() {
  document.dispatchEvent(new CustomEvent('open-macro'));
}

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
function onCmdEnter(e) {
  e.preventDefault();
  if (e.shiftKey) {
    const ta = cmdInputRef.value;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = commandInput.value;
    commandInput.value = val.substring(0, start) + '\n' + val.substring(end);
    nextTick(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
  } else {
    sendCommand();
  }
}

function clearTerminal() {
  if (term) {
    term.clear();
    term.focus();
  }
}

const showPasteFallback = ref(false);
const pasteFallbackText = ref('');
const pasteFallbackRef = ref(null);

async function pasteToTerminal() {
  const cmdInput = cmdInputRef.value;
  if (cmdInput && document.activeElement === cmdInput) {
    const text = await navigator.clipboard.readText().catch(() => '');
    if (text) {
      const start = cmdInput.selectionStart;
      const end = cmdInput.selectionEnd;
      const val = commandInput.value;
      commandInput.value = val.substring(0, start) + text + val.substring(end);
      nextTick(() => { cmdInput.selectionStart = cmdInput.selectionEnd = start + text.length; });
    }
    return;
  }
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (!wsService) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      wsService.sendMessage(text);
      uiStore.addNotification({ message: t('terminal.pasted'), type: 'info', duration: 2000 });
      term?.focus();
      return;
    }
  } catch {}
  showPasteFallback.value = true;
  nextTick(() => pasteFallbackRef.value?.focus());
}

function confirmPasteFallback() {
  const text = pasteFallbackText.value;
  if (text && wsService) {
    wsService.sendMessage(text);
    uiStore.addNotification({ message: t('terminal.pasted'), type: 'info', duration: 2000 });
  }
  pasteFallbackText.value = '';
  showPasteFallback.value = false;
  term?.focus();
}

function cancelPasteFallback() {
  pasteFallbackText.value = '';
  showPasteFallback.value = false;
  term?.focus();
}

function copyToClipboard(text, done) {
  navigator.clipboard.writeText(text).then(done).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    done();
  });
}

function copyFromTerminal() {
  const cmdInput = cmdInputRef.value;
  if (cmdInput && document.activeElement === cmdInput) {
    const start = cmdInput.selectionStart;
    const end = cmdInput.selectionEnd;
    if (start !== end) {
      copyToClipboard(commandInput.value.substring(start, end), () =>
        uiStore.addNotification({ message: t('terminal.copied'), type: 'info', duration: 2000 }));
    }
    return;
  }
  if (term?.hasSelection()) {
    const selected = term.getSelection();
    if (selected) {
      copyToClipboard(selected, () =>
        uiStore.addNotification({ message: t('terminal.copied'), type: 'info', duration: 2000 }));
    }
  }
}

function sendQuickSnippet(s) {
  if (wsService) {
    wsService.sendMessage(s.command + '\n');
    codeNoteStore.addNote(s.command, 'terminal');
  }
}

const darkTerminalTheme = {
  background: '#0a0a0a',
  foreground: '#FFFFFF',
  cursor: '#FFFFFF',
  cursorAccent: '#0a0a0a',
  selectionBackground: 'rgba(85,85,85,0.15)',
  selectionForeground: '#ffffff',
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
  selectionBackground: 'rgba(214,214,214,0.2)',
  selectionForeground: '#000000',
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
    selectionBackground: 'rgba(7,54,66,0.15)', selectionForeground: '#ffffff', black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
    brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  'solarized-light': {
    background: '#fdf6e3', foreground: '#657b83', cursor: '#657b83', cursorAccent: '#fdf6e3',
    selectionBackground: 'rgba(238,232,213,0.25)', selectionForeground: '#000000', black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
    brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  'dracula': {
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#282a36',
    selectionBackground: 'rgba(68,71,90,0.15)', selectionForeground: '#ffffff', black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5',
    brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff',
  },
  'monokai': {
    background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#272822',
    selectionBackground: 'rgba(73,72,62,0.15)', selectionForeground: '#ffffff', black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75',
    blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
    brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e', brightYellow: '#f4bf75',
    brightBlue: '#66d9ef', brightMagenta: '#ae81ff', brightCyan: '#a1efe4', brightWhite: '#f9f8f5',
  },
  'nord': {
    background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', cursorAccent: '#2e3440',
    selectionBackground: 'rgba(67,76,94,0.15)', selectionForeground: '#ffffff', black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
    blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
    brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4',
  },
  'one-dark': {
    background: '#282c34', foreground: '#abb2bf', cursor: '#abb2bf', cursorAccent: '#282c34',
    selectionBackground: 'rgba(62,68,82,0.15)', selectionForeground: '#ffffff', black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#d19a66',
    blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
    brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#d19a66',
    brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff',
  },
};

function getTerminalTheme(ts) {
  if (ts.themeId === 'custom' && ts.bgColor) {
    const bg = ts.bgColor;
    const fg = ts.fgColor || '#FFFFFF';
    const br = parseInt(bg.slice(1,3),16), bg2 = parseInt(bg.slice(3,5),16), bb = parseInt(bg.slice(5,7),16);
    const selFg = (br*299 + bg2*587 + bb*114) / 1000 > 128 ? '#000000' : '#ffffff';
    return {
      background: bg, foreground: fg, cursor: fg, cursorAccent: bg,
      selectionBackground: adjustColor(bg, 30), selectionForeground: selFg,
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

function injectSelectionStyles(container) {
  const style = document.createElement('style');
  style.textContent = `.xterm-selection div { opacity: 0.12 !important; }`;
  container.appendChild(style);
}

const initializeTerminal = async () => {
  if (!xtermContainerRef.value || !props.nodeConfig || destroyed) return;
  await nextTick();

  injectSelectionStyles(xtermContainerRef.value);

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const fitWidth = xtermContainerRef.value?.offsetWidth || 800;

  const ts = props.termSettings || {};
  const theme = getTerminalTheme(ts);
  const savedCursorStyle = localStorage.getItem('termCursorStyle');
  const savedCursorBlink = localStorage.getItem('termCursorBlink');
  term = new Terminal({
    cursorBlink: ts.cursorBlink !== undefined ? ts.cursorBlink : (savedCursorBlink !== null ? savedCursorBlink === 'true' : true),
    cursorStyle: ts.cursorStyle || savedCursorStyle || 'block',
    fontFamily: '"Fira Code", Menlo, "DejaVu Sans Mono", Consolas, "Lucida Console", monospace',
    fontSize: ts.fontSize || parseInt(localStorage.getItem('appFontSize')) || (isMobile ? Math.max(11, Math.floor(fitWidth / 28)) : 13),
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
  term.open(xtermContainerRef.value);

  try { fitAddon.fit(); } catch (e) {
    setTimeout(() => { try { fitAddon?.fit(); } catch {} }, 200);
  }

  let connected = false;

  function friendlyError(msg) {
  const raw = msg || '';
  const m = raw.toLowerCase();
  if (m.includes('timed out') || m.includes('timeout') || m.includes('handshake') || m.includes('ETIMEDOUT')) return t('terminal.connTimeout') + ' [' + raw + ']';
  if (m.includes('authentication') || m.includes('auth failed') || m.includes('password') || m.includes('permission denied')) return t('terminal.authFailed') + ' [' + raw + ']';
  if (m.includes('refused') || m.includes('ECONNREFUSED') || m.includes('not allowed')) return t('terminal.connRefused') + ' [' + raw + ']';
  if (m.includes('lost') || m.includes('closed') || m.includes('reset')) return t('terminal.connLost') + ' [' + raw + ']';
  return raw;
}

const callbacks = {
    onOpen: () => {
      if (destroyed || connected) return;
      connected = true;
      emit('status-change', 'connected');
      const cfg = props.nodeConfig;
      if (cfg?.id && cfg?.auth_value) {
        connectionStore.saveCredentialToSessionStorage(cfg.id, cfg.auth_type || 'password', cfg.auth_value);
      }
      // Move out of "未成功连接" group on successful connection
      if (cfg?.id) {
        connectionStore.moveConnectionOutOfFailedGroup(cfg.id);
      }
  term?.writeln(`\r\n\x1b[32m${t('terminal.connected')}\x1b[0m`);
      term?.focus();
      terminalStore.setActiveSendFunction((data) => wsService?.sendMessage(data));
    },
    // ⚠ DO NOT intercept/filter onMessage — terminal data must pass through as-is.
    // Any JSON parsing here will break SSH when shell outputs JSON-like text.
    onMessage: (data) => {
      if (!destroyed) {
        term?.write(typeof data === 'string' ? data : new Uint8Array(data));
      }
    },
    onServerError: (rawMsg) => {
      const friendly = friendlyError(rawMsg);
      uiStore.addNotification({ message: friendly, type: 'danger', duration: 5000 });
      emit('status-change', 'error');
      emit('error-message', friendly);
      // Write translated error to terminal instead of raw [Error] text
      term?.writeln(`\r\n\x1b[31m${friendly}\x1b[0m\r\n`);
      const cfg = props.nodeConfig;
      if (cfg && (cfg.host || cfg.name)) {
        connectionStore.saveFailedConnection(cfg);
      }
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
      const errorMessage = friendlyError(typeof errorEventOrMessage === 'string' ? errorEventOrMessage
        : (errorEventOrMessage.message || ''));
      emit('status-change', 'error');
      emit('error-message', errorMessage);
      terminalStore.setActiveSendFunction(null);
      term?.writeln(`\r\n\x1b[33m┌─────────────────────────────────────┐\x1b[0m`);
      term?.writeln(`\x1b[33m│  ⚠ ${errorMessage.padEnd(32)}\x1b[33m│\x1b[0m`);
      term?.writeln(`\x1b[33m└─────────────────────────────────────┘\x1b[0m`);
      uiStore.addNotification({ message: errorMessage, type: 'danger', duration: 5000 });
      const cfg = props.nodeConfig;
      if (cfg && (cfg.host || cfg.name)) {
        connectionStore.saveFailedConnection(cfg);
      }
    }
  };

  wsService = new SshWebSocketService();
emit('status-change', 'connecting');
    term?.writeln(`\r\n\x1b[33m⏳ ${t('terminal.connecting')}\x1b[0m`);
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

async function onTerminalContextMenu(e) {
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  e.preventDefault();
  if (!term) return;
  const selected = term.getSelection();
  if (selected) {
    copyToClipboard(selected, () => {
      term.clearSelection();
      uiStore.addNotification({ message: t('terminal.copied'), type: 'info', duration: 2000 });
    });
    return;
  }
  if (!wsService) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      wsService.sendMessage(text);
      uiStore.addNotification({ message: t('terminal.pasted'), type: 'info', duration: 2000 });
      term.focus();
      return;
    }
  } catch {}
  showPasteFallback.value = true;
  nextTick(() => pasteFallbackRef.value?.focus());
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
    case 'CTRL_P': sequence = '\x10'; break;
    case 'CTRL_N': sequence = '\x0E'; break;
    case 'CTRL_R': sequence = '\x12'; break;
    case 'CTRL_K': sequence = '\x0B'; break;
    case 'CTRL_Y': sequence = '\x19'; break;
    case 'CTRL_X': sequence = '\x18'; break;
    case 'CTRL_Z': sequence = '\x1A'; break;
    case 'UP': sequence = '\x1B[A'; break;
    case 'DOWN': sequence = '\x1B[B'; break;
    case 'LEFT': sequence = '\x1B[D'; break;
    case 'RIGHT': sequence = '\x1B[C'; break;
    case 'ENTER': sequence = '\r'; break;
    case 'SPACE': sequence = ' '; break;
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

watch(() => props.termSettings, (ts) => {
  if (!term || !ts) return;
  if (ts.cursorStyle) term.options.cursorStyle = ts.cursorStyle;
  if (ts.cursorBlink !== undefined) term.options.cursorBlink = ts.cursorBlink;
  if (ts.fontSize) { term.options.fontSize = ts.fontSize; fitAddon?.fit(); }
}, { deep: true });

function onTermSettingsChange(e) {
  if (!term) return;
  const detail = e.detail || {};
  if (detail.cursorStyle) term.options.cursorStyle = detail.cursorStyle;
  if (detail.cursorBlink !== undefined) term.options.cursorBlink = detail.cursorBlink;
  if (detail.fontSize) { term.options.fontSize = detail.fontSize; fitAddon?.fit(); }
}

function onDocClickForMenu(e) {
  if (showCmdMenu.value && cmdDropdownRef.value && !cmdDropdownRef.value.contains(e.target)) {
    showCmdMenu.value = false;
  }
}
watch(showCmdMenu, (val) => {
  if (val) {
    nextTick(() => document.addEventListener('click', onDocClickForMenu, { capture: true }));
  } else {
    document.removeEventListener('click', onDocClickForMenu, { capture: true });
  }
});

onMounted(() => {
  initializeTerminal();
  window.addEventListener('term-settings-change', onTermSettingsChange);
});

onBeforeUnmount(() => {
  destroyed = true;
  document.removeEventListener('click', onDocClickForMenu, { capture: true });
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('term-settings-change', onTermSettingsChange);
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
  flex: 0 0 auto; padding: 0.2rem; display: none; flex-direction: column; gap: 0.15rem;
  justify-content: center; background-color: var(--term-bg); border-top: 1px solid var(--term-border);
  @media screen and (max-width: 768px) { display: flex; }
}
.mobile-keys-row {
  display: flex; justify-content: center; gap: 0.2rem; flex-wrap: wrap;
}
.mobile-keys-row-main { gap: 0.15rem; }
.mobile-keys-row-ctrl { gap: 0.15rem; }
.mkey {
  background-color: var(--term-border); color: var(--term-text); border: 1px solid var(--term-text-dim);
  border-radius: 5px; padding: 0.25rem 0.45rem; min-width: 2rem;
  font-size: 0.65rem; font-family: inherit; cursor: pointer; user-select: none;
  -webkit-tap-highlight-color: transparent; line-height: 1.2;
  &:active { background-color: var(--term-bg2); transform: scale(0.92); }
}
.mkey-sm { padding: 0.15rem 0.35rem; min-width: 1.8rem; font-size: 0.6rem; }
.mkey-xs { padding: 0.12rem 0.25rem; min-width: 1.5rem; font-size: 0.55rem; }
.mkey-wider { min-width: 3rem; }
.mkey-arrow { background-color: var(--term-bg2); min-width: 2rem; }
.mkey-sep { width: 1px; background: var(--term-text-dim); opacity: 0.2; margin: 0 0.1rem; }

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

.cmd-dropdown { position: relative; }
.cmd-dropdown-menu {
  position: absolute; bottom: 100%; left: 0; z-index: 100; min-width: 140px;
  background: var(--bulma-scheme-main); border: 1px solid var(--bulma-border-light);
  border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); overflow: hidden;
  margin-bottom: 4px;
  button {
    display: flex; align-items: center; gap: 0.4rem; width: 100%; padding: 0.4rem 0.65rem;
    border: none; background: none; font-size: 0.75em; cursor: pointer; color: var(--bulma-text);
    text-align: left; white-space: nowrap;
    &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-primary); }
  }
}

.command-input-bar {
  display: flex; align-items: flex-end; gap: 0.3rem;
  padding: 0.3rem 0.35rem; background: var(--term-bg);
}
.cmd-prefix { color: var(--term-text-dim); font-family: monospace; font-size: 0.8em; padding-bottom: 0.15rem; flex-shrink: 0; }
.cmd-input {
  flex: 1; background: var(--term-bg2); border: 1px solid var(--term-border);
  border-radius: 4px; padding: 0.25rem 0.4rem; font-size: 0.8em;
  font-family: monospace; color: var(--term-text); outline: none; resize: vertical;
  line-height: 1.4; min-width: 80px; min-height: calc(1.4em * 4 + 0.5rem);
  &::placeholder { color: var(--term-text-dim); }
  &:focus { border-color: var(--term-text-dim); }
}
.cmd-send-btn {
  background: var(--term-bg2); border: 1px solid var(--term-border); border-radius: 4px;
  padding: 0.3rem 0.45rem; cursor: pointer; color: var(--term-text); display: flex;
  align-items: center; justify-content: center; flex-shrink: 0;
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

.paste-fallback-overlay {
  position: absolute; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}
.paste-fallback-box {
  background: var(--bulma-scheme-main); border-radius: 8px;
  padding: 1rem; width: 90%; max-width: 480px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}
.paste-fallback-label {
  font-size: 0.85em; color: var(--bulma-text); margin-bottom: 0.5rem;
}
.paste-fallback-textarea {
  width: 100%; border: 1px solid var(--bulma-border);
  border-radius: 6px; padding: 0.5rem; font-family: monospace;
  font-size: 0.8em; background: var(--bulma-scheme-main-ter);
  color: var(--bulma-text); outline: none; resize: vertical;
  &:focus { border-color: var(--bulma-primary); }
}
.paste-fallback-actions {
  display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;
}
</style>
