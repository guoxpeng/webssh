// Shared keychain storage — used by the Keychain page (KeysView) and by the
// connection form's "pick from keychain" action. Keys live in localStorage.
export interface KeychainKey {
  id: string;
  name: string;
  content: string;
  createdAt: number;
}

import { storageGet, storageSet } from './storage';

export function loadKeychain(): KeychainKey[] {
  try {
    const arr = JSON.parse(storageGet('keychain') || '[]');
    return Array.isArray(arr) ? arr.filter((k) => k && k.content) : [];
  } catch {
    return [];
  }
}

export function saveKeychain(keys: KeychainKey[]): void {
  storageSet('keychain', JSON.stringify(keys));
}
