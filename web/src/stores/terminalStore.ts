import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface TerminalSession {
  id: string;
  name: string;
  host: string;
  port: number;
  username?: string;
  config: Record<string, any>;
  status: string;
  createdAt: number;
}

export interface PaneConfig {
  type: string;
  protocol: string;
  config: Record<string, any>;
  name: string;
  tabColor?: string;
}

interface SessionConfig {
  name?: string;
  host: string;
  port?: number;
  username?: string;
  [key: string]: any;
}

export const useTerminalStore = defineStore('terminal', () => {
  const SESSIONS_KEY = 'webssh_saved_sessions';
  const PANE_CONFIGS_KEY = 'webssh_pane_configs';
  const RECENT_CMDS_KEY = 'webssh_recent_commands';
  const MAX_RECENT = 20;

  const saved = sessionStorage.getItem(SESSIONS_KEY);
  let initialSessions: TerminalSession[] = [];
  if (saved) { try { initialSessions = JSON.parse(saved); } catch { initialSessions = []; } }
  const sessions = ref<TerminalSession[]>(initialSessions);
  const activeSessionId = ref<string | null>(null);
  const recentCommands = ref<string[]>(loadRecentCommands());
  const activeSendFunction = ref<((data: string) => void) | null>(null);
  const paneConfigs = ref<PaneConfig[]>(loadPaneConfigs());

  function loadRecentCommands(): string[] {
    try {
      const raw = localStorage.getItem(RECENT_CMDS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function loadPaneConfigs(): PaneConfig[] {
    try {
      const raw = sessionStorage.getItem(PANE_CONFIGS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function persistPaneConfigs(): void {
    sessionStorage.setItem(PANE_CONFIGS_KEY, JSON.stringify(paneConfigs.value));
  }

  function setPaneConfigs(configs: PaneConfig[]): void {
    paneConfigs.value = configs;
    persistPaneConfigs();
  }

  function clearPaneConfigs(): void {
    paneConfigs.value = [];
    sessionStorage.removeItem(PANE_CONFIGS_KEY);
  }

  function persistRecentCommands(): void {
    localStorage.setItem(RECENT_CMDS_KEY, JSON.stringify(recentCommands.value));
  }

  function addRecentCommand(cmd: string): void {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    recentCommands.value = [trimmed, ...recentCommands.value.filter(c => c !== trimmed)].slice(0, MAX_RECENT);
    persistRecentCommands();
  }

  function clearRecentCommands(): void {
    recentCommands.value = [];
    localStorage.removeItem(RECENT_CMDS_KEY);
  }

  function persistSessions(): void {
    sessionStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.value));
  }

  const activeSession = computed(() => sessions.value.find(s => s.id === activeSessionId.value));
  const sessionCount = computed(() => sessions.value.length);

  function createSession(config: SessionConfig): string {
    const id = `term_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
    const session: TerminalSession = {
      id,
      name: config.name || config.host,
      host: config.host,
      port: config.port || 22,
      username: config.username,
      config: { ...config },
      status: 'disconnected',
      createdAt: Date.now(),
    };
    sessions.value.push(session);
    activeSessionId.value = id;
    persistSessions();
    return id;
  }

  function closeSession(id: string): void {
    const idx = sessions.value.findIndex(s => s.id === id);
    if (idx === -1) return;
    sessions.value.splice(idx, 1);
    persistSessions();
    if (activeSessionId.value === id) {
      activeSessionId.value = sessions.value.length > 0
        ? sessions.value[Math.min(idx, sessions.value.length - 1)].id
        : null;
    }
  }

  function setActiveSession(id: string): void {
    if (sessions.value.find(s => s.id === id)) {
      activeSessionId.value = id;
    }
  }

  function updateSessionStatus(id: string, status: string): void {
    const session = sessions.value.find(s => s.id === id);
    if (session) session.status = status;
  }

  function restoreActiveSession(): string | null {
    return sessions.value.length > 0 ? sessions.value[sessions.value.length - 1].id : null;
  }

  function clearAll(): void {
    sessions.value = [];
    activeSessionId.value = null;
    activeSendFunction.value = null;
    sessionStorage.removeItem(SESSIONS_KEY);
  }

  function setActiveSendFunction(fn: ((data: string) => void) | null): void {
    activeSendFunction.value = fn;
  }

  // ── Macro recording: capture typed commands from the active terminal ──
  const isRecording = ref(false);
  const recordedSteps = ref<{ command: string; delay: number }[]>([]);
  let recordBuffer = '';
  let lastInputAt = 0;

  function startRecording(): void {
    isRecording.value = true;
    recordedSteps.value = [];
    recordBuffer = '';
    lastInputAt = Date.now();
  }

  // Called by the terminal on every keystroke while recording.
  function recordInput(data: string): void {
    if (!isRecording.value) return;
    const now = Date.now();
    const elapsed = Math.max(0, Math.min(now - lastInputAt, 10000));
    lastInputAt = now;
    for (const ch of data) {
      if (ch === '\r' || ch === '\n') {
        recordedSteps.value.push({
          command: recordBuffer,
          delay: recordedSteps.value.length === 0 ? 0 : Math.max(300, elapsed),
        });
        recordBuffer = '';
      } else if (ch === '\x7f') {
        recordBuffer = recordBuffer.slice(0, -1); // backspace
      } else if (ch >= ' ') {
        recordBuffer += ch;
      }
    }
  }

  function stopRecording(): { command: string; delay: number }[] {
    isRecording.value = false;
    if (recordBuffer.trim()) {
      recordedSteps.value.push({ command: recordBuffer, delay: 300 });
      recordBuffer = '';
    }
    return recordedSteps.value.filter(s => s.command.trim() !== '');
  }

  return {
    sessions, activeSessionId, activeSession, sessionCount, recentCommands,
    paneConfigs,
    activeSendFunction, setActiveSendFunction,
    createSession, closeSession, setActiveSession, updateSessionStatus, restoreActiveSession,
    addRecentCommand, clearRecentCommands, clearAll,
    setPaneConfigs, clearPaneConfigs,
    isRecording, startRecording, recordInput, stopRecording,
  };
});
