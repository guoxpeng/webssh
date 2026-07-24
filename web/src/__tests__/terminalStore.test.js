// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTerminalStore } from '../stores/terminalStore.js';

describe('terminalStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    sessionStorage.clear();
  });

  it('starts with no sessions', () => {
    const store = useTerminalStore();
    expect(store.sessions).toHaveLength(0);
    expect(store.activeSessionId).toBeNull();
    expect(store.sessionCount).toBe(0);
    expect(store.activeSession).toBeUndefined();
  });

  it('createSession adds a session and sets it active', () => {
    const store = useTerminalStore();
    const id = store.createSession({ name: 'test', host: '192.168.1.1', port: 22, username: 'root' });

    expect(store.sessions).toHaveLength(1);
    expect(store.activeSessionId).toBe(id);
    expect(store.sessionCount).toBe(1);
    expect(store.activeSession.name).toBe('test');
    expect(store.activeSession.host).toBe('192.168.1.1');
  });

  it('createSession uses name as fallback label', () => {
    const store = useTerminalStore();
    const id = store.createSession({ host: '10.0.0.1' });
    expect(store.sessions[0].name).toBe('10.0.0.1');
  });

  it('closeSession removes session and switches active', () => {
    const store = useTerminalStore();
    const id1 = store.createSession({ name: 's1' });
    const id2 = store.createSession({ name: 's2' });

    store.closeSession(id1);
    expect(store.sessions).toHaveLength(1);
    expect(store.activeSessionId).toBe(id2);
  });

  it('closeSession sets null when last session removed', () => {
    const store = useTerminalStore();
    const id = store.createSession({ name: 's1' });
    store.closeSession(id);
    expect(store.sessions).toHaveLength(0);
    expect(store.activeSessionId).toBeNull();
  });

  it('setActiveSession switches to existing session', () => {
    const store = useTerminalStore();
    const id1 = store.createSession({ name: 's1' });
    const id2 = store.createSession({ name: 's2' });

    store.setActiveSession(id1);
    expect(store.activeSessionId).toBe(id1);
  });

  it('setActiveSession ignores nonexistent session', () => {
    const store = useTerminalStore();
    store.createSession({ name: 's1' });
    store.setActiveSession('nonexistent');
    expect(store.activeSessionId).toBe(store.sessions[0].id);
  });

  it('updateSessionStatus updates session status', () => {
    const store = useTerminalStore();
    const id = store.createSession({ name: 's1' });
    store.updateSessionStatus(id, 'connected');
    expect(store.sessions[0].status).toBe('connected');
  });

  it('clearAll removes all sessions', () => {
    const store = useTerminalStore();
    store.createSession({ name: 's1' });
    store.createSession({ name: 's2' });
    store.clearAll();
    expect(store.sessions).toHaveLength(0);
    expect(store.activeSessionId).toBeNull();
  });
});
