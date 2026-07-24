import { encryptCredential, decryptCredential } from './crypto';

export function initCrypto(): string {
  const stored = sessionStorage.getItem('webssh_master');
  if (stored) {
  // 已经在 App.vue 中通过 UnlockScreen 设置了 sessionStorage
  }
  return stored || '';
}

export async function encrypt(plaintext: string): Promise<string> {
  const master = sessionStorage.getItem('webssh_master');
  if (!master) throw new Error('Not unlocked');
  return encryptCredential(plaintext, master);
}

export async function decrypt(ciphertext: string): Promise<string> {
  const master = sessionStorage.getItem('webssh_master');
  if (!master) throw new Error('Not unlocked');
  return decryptCredential(ciphertext, master);
}

export function isReady(): boolean {
  return !!sessionStorage.getItem('webssh_master');
}
