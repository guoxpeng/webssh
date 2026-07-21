import { describe, it, expect, beforeEach } from 'vitest';
import { encryptCredential, decryptCredential } from '@/utils/crypto.js';

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
});
