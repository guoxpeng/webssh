import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encryptCredential, decryptCredential, setupMasterPassword, verifyMasterPassword, computeChecksum, encryptBackupData, decryptBackupData, STORAGE_VERIFY_KEY, STORAGE_SALT_KEY } from '@/utils/crypto.js';

const MASTER_PW = 'test-master-password-42!';

describe('crypto', () => {
  it('encrypts and decrypts a password correctly', async () => {
    const plaintext = 'my-secret-ssh-password!@#';
    const encrypted = await encryptCredential(plaintext, MASTER_PW);
    expect(encrypted).toBeTruthy();
    expect(typeof encrypted).toBe('string');

    const decrypted = await decryptCredential(encrypted, MASTER_PW);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertexts each time (salt+iv)', async () => {
    const plaintext = 'same-password';
    const a = await encryptCredential(plaintext, MASTER_PW);
    const b = await encryptCredential(plaintext, MASTER_PW);
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with wrong password', async () => {
    const encrypted = await encryptCredential('secret', MASTER_PW);
    await expect(decryptCredential(encrypted, 'wrong-password')).rejects.toThrow();
  });

  it('handles empty string', async () => {
    const encrypted = await encryptCredential('', MASTER_PW);
    const decrypted = await decryptCredential(encrypted, MASTER_PW);
    expect(decrypted).toBe('');
  });

  it('handles special characters', async () => {
    const plaintext = '!@#$%^&*()_+{}[]|\\:;"\'<>,.?/~`\n\t';
    const encrypted = await encryptCredential(plaintext, MASTER_PW);
    const decrypted = await decryptCredential(encrypted, MASTER_PW);
    expect(decrypted).toBe(plaintext);
  });

  it('handles long strings', async () => {
    const plaintext = 'x'.repeat(10000);
    const encrypted = await encryptCredential(plaintext, MASTER_PW);
    const decrypted = await decryptCredential(encrypted, MASTER_PW);
    expect(decrypted).toBe(plaintext);
  });

  it('prefixes ciphertext with a scheme marker (secure context → AES)', async () => {
    const encrypted = await encryptCredential('secret', MASTER_PW);
    expect(encrypted.startsWith('v2aes:')).toBe(true);
  });

  it('still decrypts legacy (unmarked) ciphertext', async () => {
    const encrypted = await encryptCredential('secret', MASTER_PW);
    // Legacy payloads had no scheme prefix — the blob is what followed it.
    const legacy = encrypted.replace(/^v2aes:/, '');
    const decrypted = await decryptCredential(legacy, MASTER_PW);
    expect(decrypted).toBe('secret');
  });

  it('decrypts an XOR-scheme (insecure-context) backup on a secure device', async () => {
    const realCrypto = globalThis.crypto;
    const random = realCrypto.getRandomValues.bind(realCrypto);
    // Simulate a non-HTTPS context: WebCrypto is unavailable, so encryption
    // falls back to the pure-JS XOR scheme.
    vi.stubGlobal('crypto', { getRandomValues: random });
    let encrypted;
    try {
      encrypted = await encryptCredential('secret', MASTER_PW);
    } finally {
      vi.stubGlobal('crypto', realCrypto);
    }
    expect(encrypted.startsWith('v2xor:')).toBe(true);
    // Restored WebCrypto = a "secure" device; the marker must make the XOR
    // payload decryptable anyway (cross-device backup interoperability).
    const decrypted = await decryptCredential(encrypted, MASTER_PW);
    expect(decrypted).toBe('secret');
  });
});

describe('master password verify hash', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_VERIFY_KEY);
    localStorage.removeItem(STORAGE_SALT_KEY);
  });

  it('stores a scheme-marked hash that round-trips', async () => {
    await setupMasterPassword(MASTER_PW);
    const stored = localStorage.getItem(STORAGE_VERIFY_KEY);
    expect(stored.startsWith('v2v1:')).toBe(true);
    expect(await verifyMasterPassword(MASTER_PW)).toBe(true);
    expect(await verifyMasterPassword('wrong-password')).toBe(false);
  });

  it('verifies a hash created on an insecure (non-HTTPS) context from a secure one', async () => {
    const realCrypto = globalThis.crypto;
    const random = realCrypto.getRandomValues.bind(realCrypto);
    // Simulate HTTP: WebCrypto unavailable, so the OLD code would have derived
    // the hash differently than on HTTPS. The marked scheme must not care.
    vi.stubGlobal('crypto', { getRandomValues: random });
    try {
      await setupMasterPassword(MASTER_PW);
    } finally {
      vi.stubGlobal('crypto', realCrypto);
    }
    expect(await verifyMasterPassword(MASTER_PW)).toBe(true);
  });

  it('verifies a hash created on a secure context from an insecure one', async () => {
    await setupMasterPassword(MASTER_PW);
    const realCrypto = globalThis.crypto;
    const random = realCrypto.getRandomValues.bind(realCrypto);
    vi.stubGlobal('crypto', { getRandomValues: random });
    try {
      expect(await verifyMasterPassword(MASTER_PW)).toBe(true);
    } finally {
      vi.stubGlobal('crypto', realCrypto);
    }
  });

  it('still unlocks a legacy unmarked hash created in the same (secure) context', async () => {
    // Reconstruct the pre-marker secure-context hash exactly as the old
    // setupMasterPassword did: PBKDF2 100k -> export raw -> SHA-256 -> btoa.
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(MASTER_PW), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    );
    const raw = await crypto.subtle.exportKey('raw', key);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
    localStorage.setItem(STORAGE_VERIFY_KEY, btoa(String.fromCharCode(...hash)));
    localStorage.setItem(STORAGE_SALT_KEY, btoa(String.fromCharCode(...salt)));
    expect(await verifyMasterPassword(MASTER_PW)).toBe(true);
    expect(await verifyMasterPassword('wrong-password')).toBe(false);
  });

  it('returns false when no password has been set', async () => {
    expect(await verifyMasterPassword(MASTER_PW)).toBe(false);
  });
});

describe('backup checksum & cross-context backups', () => {
  it('computeChecksum produces identical output with and without WebCrypto', async () => {
    const text = JSON.stringify({ connections: [{ name: '主机A', host: '1.2.3.4' }], notes: '你好' });
    const secureSum = await computeChecksum(text);
    const realCrypto = globalThis.crypto;
    const random = realCrypto.getRandomValues.bind(realCrypto);
    vi.stubGlobal('crypto', { getRandomValues: random });
    let insecureSum;
    try {
      insecureSum = await computeChecksum(text);
    } finally {
      vi.stubGlobal('crypto', realCrypto);
    }
    expect(secureSum).toBe(insecureSum);
  });

  it('restores an insecure-context (XOR) backup on a secure device, checksum intact', async () => {
    const data = { connections: [{ name: 'cf-host', host: 'example.com' }], version: 2 };
    const realCrypto = globalThis.crypto;
    const random = realCrypto.getRandomValues.bind(realCrypto);
    // Create on an HTTP device: no WebCrypto → XOR scheme + pure-JS checksum.
    vi.stubGlobal('crypto', { getRandomValues: random });
    let backup;
    try {
      backup = await encryptBackupData(data, MASTER_PW);
    } finally {
      vi.stubGlobal('crypto', realCrypto);
    }
    expect(backup.startsWith('v2xor:')).toBe(true);
    // Restore on an HTTPS device: marker picks XOR, checksum verified via WebCrypto.
    const restored = await decryptBackupData(backup, MASTER_PW);
    expect(restored).not.toBeNull();
    expect(restored.data).toEqual(data);
  });

  it('a secure-context (AES) backup fails cleanly on an insecure device (no silent corruption)', async () => {
    const data = { connections: [{ name: 'a', host: 'h' }] };
    const backup = await encryptBackupData(data, MASTER_PW);
    expect(backup.startsWith('v2aes:')).toBe(true);
    const realCrypto = globalThis.crypto;
    const random = realCrypto.getRandomValues.bind(realCrypto);
    vi.stubGlobal('crypto', { getRandomValues: random });
    let restored;
    try {
      restored = await decryptBackupData(backup, MASTER_PW);
    } finally {
      vi.stubGlobal('crypto', realCrypto);
    }
    // Insecure contexts have no WebCrypto to AES-decrypt with — must fail
    // with null rather than returning garbage.
    expect(restored).toBeNull();
  });
});
