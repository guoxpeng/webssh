import { encryptCredential, decryptCredential } from './crypto';

function getMaster(): string {
  const m = sessionStorage.getItem('webssh_master');
  if (!m) throw new Error('Not unlocked');
  return m;
}

export async function encrypt(plaintext: string): Promise<string> {
  return encryptCredential(plaintext, getMaster());
}

export async function decrypt(ciphertext: string): Promise<string> {
  return decryptCredential(ciphertext, getMaster());
}
