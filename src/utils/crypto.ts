const ALGORITHM = { name: 'AES-GCM', length: 256 } as const;
const ITERATIONS = 600000;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;

export const STORAGE_VERIFY_KEY = 'haossh_verify';
export const STORAGE_SALT_KEY = 'haossh_verify_salt';

async function deriveKey(masterPassword: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(masterPassword), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial, ALGORITHM, false, ['encrypt', 'decrypt']
  );
}

export async function setupMasterPassword(password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(password, salt);
  const raw = await crypto.subtle.exportKey('raw', key);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  localStorage.setItem(STORAGE_VERIFY_KEY, btoa(String.fromCharCode(...new Uint8Array(hash))));
  localStorage.setItem(STORAGE_SALT_KEY, btoa(String.fromCharCode(...salt)));
}

export async function verifyMasterPassword(password: string): Promise<boolean> {
  const storedHash = localStorage.getItem(STORAGE_VERIFY_KEY);
  const storedSalt = localStorage.getItem(STORAGE_SALT_KEY);
  if (!storedHash || !storedSalt) return false;
  const salt = Uint8Array.from(atob(storedSalt), c => c.charCodeAt(0));
  const key = await deriveKey(password, salt);
  const raw = await crypto.subtle.exportKey('raw', key);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  const computedHash = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return computedHash === storedHash;
}

export async function encryptBackupData(data: object, masterPassword: string): Promise<string> {
  const json = JSON.stringify(data);
  const checksum = await computeChecksum(json);
  const payload = JSON.stringify({ data, checksum, version: 2 });
  return encryptCredential(payload, masterPassword);
}

export async function decryptBackupData(ciphertext: string, masterPassword: string): Promise<{ data: any; checksum: string; version: number } | null> {
  try {
    const decrypted = await decryptCredential(ciphertext, masterPassword);
    const parsed = JSON.parse(decrypted);
    const json = JSON.stringify(parsed.data);
    const actualChecksum = await computeChecksum(json);
    if (actualChecksum !== parsed.checksum) return null;
    return parsed;
  } catch { return null; }
}

async function computeChecksum(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export async function encryptCredential(plaintext: string, masterPassword: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(masterPassword, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)
  );
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptCredential(ciphertext: string, masterPassword: string): Promise<string> {
  const raw = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const salt = raw.slice(0, SALT_LENGTH);
  const iv = raw.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const data = raw.slice(SALT_LENGTH + IV_LENGTH);
  const key = await deriveKey(masterPassword, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}
