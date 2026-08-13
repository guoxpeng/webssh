// Shared keychain storage — used by the Keychain page (KeysView) and by the
// connection form's "pick from keychain" action. Keys live in localStorage.
export interface KeychainKey {
  id: string;
  name: string;
  content: string;
  createdAt: number;
}

const KEYCHAIN_STORAGE = 'webssh_keychain';

export function loadKeychain(): KeychainKey[] {
  try {
    const arr = JSON.parse(localStorage.getItem(KEYCHAIN_STORAGE) || '[]');
    return Array.isArray(arr) ? arr.filter((k) => k && k.content) : [];
  } catch {
    return [];
  }
}

export function saveKeychain(keys: KeychainKey[]): void {
  try {
    localStorage.setItem(KEYCHAIN_STORAGE, JSON.stringify(keys));
  } catch {
    // storage full/unavailable — keychain is best-effort
  }
}
