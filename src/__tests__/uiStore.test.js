// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUiStore } from '../stores/uiStore.ts';

describe('uiStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('initializes with light theme', () => {
    const store = useUiStore();
    expect(store.currentTheme).toBe('light');
    expect(store.notifications).toHaveLength(0);
  });

  it('toggleTheme switches between light and dark', () => {
    const store = useUiStore();
    store.toggleTheme();
    expect(store.currentTheme).toBe('dark');
    store.toggleTheme();
    expect(store.currentTheme).toBe('light');
  });

  it('addNotification adds to list', () => {
    const store = useUiStore();
    store.addNotification({ message: 'test', type: 'success' });
    expect(store.notifications).toHaveLength(1);
    expect(store.notifications[0].message).toBe('test');
    expect(store.notifications[0].type).toBe('success');
  });

  it('removeNotification removes by id', () => {
    const store = useUiStore();
    store.addNotification({ message: 'a', duration: 0 });
    store.addNotification({ message: 'b', duration: 0 });
    const id = store.notifications[0].id;
    store.removeNotification(id);
    expect(store.notifications).toHaveLength(1);
    expect(store.notifications[0].message).toBe('b');
  });

  it('setThemePreset changes theme', () => {
    const store = useUiStore();
    store.setThemePreset('dracula');
    expect(store.currentTheme).toBe('dark');
    expect(store.currentPreset).toBe('dracula');
  });

  it('stores theme in localStorage', () => {
    const store = useUiStore();
    store.setThemePreset('nord');
    expect(localStorage.getItem('appThemePreset')).toBe('nord');
    expect(localStorage.getItem('appTheme')).toBe('dark');
  });
});
