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

interface SessionConfig {
  name?: string;
  host: string;
  port?: number;
  username?: string;
  [key: string]: any;
}

export const useTerminalStore = defineStore('terminal', () => {
  const SESSIONS_KEY = 'haossh_saved_sessions';
  const RECENT_CMDS_KEY = 'haossh_recent_commands';
  const MAX_RECENT = 20;

  const saved = sessionStorage.getItem(SESSIONS_KEY);
  const sessions = ref<TerminalSession[]>(saved ? JSON.parse(saved) : []);
  const activeSessionId = ref<string | null>(null);
  const recentCommands = ref<string[]>(loadRecentCommands());

  function loadRecentCommands(): string[] {
    try {
      const raw = localStorage.getItem(RECENT_CMDS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
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
    sessionStorage.removeItem(SESSIONS_KEY);
  }

  return {
    sessions, activeSessionId, activeSession, sessionCount, recentCommands,
    createSession, closeSession, setActiveSession, updateSessionStatus, restoreActiveSession,
    addRecentCommand, clearRecentCommands, clearAll,
  };
});
