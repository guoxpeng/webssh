// @vitest-environment jsdom
// Tests for the storage registry + helpers (web/src/utils/storage.ts).
// Locks in the invariant the registry exists to guarantee: a key's declared
// area routes to the real storage API, so a SESSION_STORAGE_* name can never
// again silently live in localStorage.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  STORAGE_KEYS, storageGet, storageSet, storageRemove,
  storageGetJSON, storageSetJSON,
  storageGetPrefixed, storageSetPrefixed, storageRemovePrefixed, storageListPrefixed,
} from '@/utils/storage.js';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('storage registry', () => {
  it('registers every key with a real area and purpose', () => {
    const names = Object.keys(STORAGE_KEYS);
    expect(names.length).toBeGreaterThan(30);
    for (const name of names) {
      const def = STORAGE_KEYS[name];
      expect(def.key).toBeTruthy();
      expect(['local', 'session']).toContain(def.area);
      expect(def.purpose).toBeTruthy();
    }
  });

  it('routes local keys to localStorage and session keys to sessionStorage', () => {
    // A 'session' key must NOT appear in localStorage and vice versa.
    storageSet('theme', 'dark');
    expect(localStorage.getItem('appTheme')).toBe('dark');
    expect(sessionStorage.getItem('appTheme')).toBeNull();

    storageSet('sessions', 'x');
    expect(sessionStorage.getItem('webssh_saved_sessions')).toBe('x');
    expect(localStorage.getItem('webssh_saved_sessions')).toBeNull();
  });

  it('the connections key (the historical SESSION_STORAGE misnomer) is local', () => {
    expect(STORAGE_KEYS.connections.area).toBe('local');
    expect(STORAGE_KEYS.connections.key).toBe('webssh_local_connections');
  });

  it('rejects nothing at runtime but get returns null for unknown/corrupt data safely', () => {
    expect(storageGet('fontSize')).toBeNull();
    localStorage.setItem('webssh_local_connections', '{corrupt');
    expect(storageGetJSON('connections', [])).toEqual([]);
  });
});

describe('storage helpers', () => {
  it('storageGet/Set/Remove round-trip through the declared area', () => {
    storageSet('fontSize', '16');
    expect(storageGet('fontSize')).toBe('16');
    expect(localStorage.getItem('appFontSize')).toBe('16');
    storageRemove('fontSize');
    expect(storageGet('fontSize')).toBeNull();
    expect(localStorage.getItem('appFontSize')).toBeNull();
  });

  it('storageSetJSON/storageGetJSON round-trip structured data', () => {
    const list = [{ id: 'a' }, { id: 'b' }];
    storageSetJSON('history', list);
    expect(storageGetJSON('history', [])).toEqual(list);
    expect(storageGetJSON('history', null)).toEqual(list);
    // Fallback when absent.
    expect(storageGetJSON('macros', [])).toEqual([]);
  });

  it('prefix helpers read/write/list `${prefix}${suffix}` keys in the declared area', () => {
    storageSetPrefixed('sessionCredPrefix', 'srv-1', '{"pw":"x"}');
    expect(storageGetPrefixed('sessionCredPrefix', 'srv-1')).toBe('{"pw":"x"}');
    expect(sessionStorage.getItem('sshWebAppCred_srv-1')).toBe('{"pw":"x"}');
    // The prefix goes to sessionStorage, so localStorage stays empty.
    expect(localStorage.getItem('sshWebAppCred_srv-1')).toBeNull();

    expect(storageListPrefixed('sessionCredPrefix')).toEqual(['srv-1']);
    storageRemovePrefixed('sessionCredPrefix', 'srv-1');
    expect(storageGetPrefixed('sessionCredPrefix', 'srv-1')).toBeNull();
    expect(storageListPrefixed('sessionCredPrefix')).toEqual([]);
  });

  it('local credential prefix lives in localStorage (persistent credentials)', () => {
    storageSetPrefixed('localCredPrefix', 'srv-2', 'enc');
    expect(localStorage.getItem('sshWebAppCredLocal_srv-2')).toBe('enc');
    expect(sessionStorage.getItem('sshWebAppCredLocal_srv-2')).toBeNull();
  });

  it('prefix list only returns keys under that prefix', () => {
    storageSetPrefixed('sessionCredPrefix', 'a', '1');
    sessionStorage.setItem('unrelated-key', '2');
    expect(storageListPrefixed('sessionCredPrefix')).toEqual(['a']);
  });

  it('survives storage being unavailable (try/catch inside helpers)', () => {
    // jsdom storage always works; simulate a throwing getItem to prove the
    // helpers swallow it instead of crashing the app.
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('denied'); };
    try {
      expect(storageGet('theme')).toBeNull();
      expect(storageGetJSON('history', [])).toEqual([]);
      storageSet('theme', 'x'); // should not throw
      storageRemove('theme');   // should not throw
    } finally {
      Storage.prototype.getItem = orig;
    }
  });
});
