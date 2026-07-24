const ITERATIONS = 600000;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;

export const STORAGE_VERIFY_KEY = 'webssh_verify';
export const STORAGE_SALT_KEY = 'webssh_verify_salt';

// crypto.subtle methods are undefined on HTTP (non-localhost), provide fallback
function haveSubtle(): boolean {
  if (typeof crypto === 'undefined') return false;
  const s = (crypto as any).subtle;
  return typeof s !== 'undefined' && s !== null && typeof s.digest === 'function';
}

export function isSecureContext(): boolean {
  return haveSubtle();
}

// ---- Pure JS SHA-256 fallback ----
function sha256(data: Uint8Array): Uint8Array {
  const rightRotate = (x: number, c: number) => (x >>> c) | (x << (32 - c));
  const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const ml = data.length * 8;
  let offset = 0;
  const padLen = ((data.length + 9 + 63) >>> 6) * 64;
  const pad = new Uint8Array(padLen);
  pad.set(data);
  pad[data.length] = 0x80;
  new DataView(pad.buffer).setUint32(padLen - 4, ml, false);
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let block = 0; block < padLen; block += 64) {
    for (let t = 0; t < 16; t++) W[t] = new DataView(pad.buffer).getUint32(block + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rightRotate(W[t - 15], 7) ^ rightRotate(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rightRotate(W[t - 2], 17) ^ rightRotate(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) & 0xffffffff;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) & 0xffffffff;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) & 0xffffffff;
      h = g; g = f; f = e; e = (d + temp1) & 0xffffffff;
      d = c; c = b; b = a; a = (temp1 + temp2) & 0xffffffff;
    }
    H[0] = (H[0] + a) & 0xffffffff; H[1] = (H[1] + b) & 0xffffffff;
    H[2] = (H[2] + c) & 0xffffffff; H[3] = (H[3] + d) & 0xffffffff;
    H[4] = (H[4] + e) & 0xffffffff; H[5] = (H[5] + f) & 0xffffffff;
    H[6] = (H[6] + g) & 0xffffffff; H[7] = (H[7] + h) & 0xffffffff;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) { out[i * 4] = H[i] >>> 24; out[i * 4 + 1] = H[i] >>> 16; out[i * 4 + 2] = H[i] >>> 8; out[i * 4 + 3] = H[i]; }
  return out;
}

function pbkdf2Fallback(password: string, salt: Uint8Array, iterations: number): Uint8Array {
  const enc = new TextEncoder();
  const pw = enc.encode(password);
  const data = new Uint8Array(salt.length + 4);
  data.set(salt);
  let dk = new Uint8Array();
  const block = new Uint8Array(pw.length + data.length);
  block.set(pw);
  for (let i = 1; dk.length < 32; i++) {
    new DataView(data.buffer).setUint32(salt.length, i, false);
    let U = sha256(new Uint8Array([...pw, ...data]));
    let T = new Uint8Array(U);
    for (let j = 1; j < iterations; j++) {
      U = sha256(new Uint8Array([...pw, ...U]));
      for (let k = 0; k < U.length; k++) T[k] ^= U[k];
    }
    dk = new Uint8Array([...dk, ...T]);
  }
  return dk.slice(0, 32);
}

function xorEncrypt(plain: Uint8Array, key: Uint8Array): Uint8Array {
  const out = new Uint8Array(plain.length);
  for (let i = 0; i < plain.length; i++) out[i] = plain[i] ^ key[i % key.length];
  return out;
}

async function deriveKey(masterPassword: string, salt: Uint8Array): Promise<CryptoKey | Uint8Array> {
  if (haveSubtle()) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(masterPassword), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
      keyMaterial, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    );
  }
  return pbkdf2Fallback(masterPassword, salt, Math.min(ITERATIONS, 10000));
}

async function exportKeyRaw(key: CryptoKey | Uint8Array): Promise<Uint8Array> {
  if (key instanceof Uint8Array) return key.slice(0, 16);
  const raw = await crypto.subtle.exportKey('raw', key as CryptoKey);
  return new Uint8Array(raw);
}

export async function setupMasterPassword(password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  if (haveSubtle()) {
    const key = await deriveKey(password, salt) as CryptoKey;
    const raw = await crypto.subtle.exportKey('raw', key);
    const hash = await crypto.subtle.digest('SHA-256', raw);
    localStorage.setItem(STORAGE_VERIFY_KEY, btoa(String.fromCharCode(...new Uint8Array(hash))));
  } else {
    const dk = pbkdf2Fallback(password, salt, Math.min(ITERATIONS, 10000));
    const hash = sha256(dk);
    localStorage.setItem(STORAGE_VERIFY_KEY, btoa(String.fromCharCode(...hash)));
  }
  localStorage.setItem(STORAGE_SALT_KEY, btoa(String.fromCharCode(...salt)));
}

export async function verifyMasterPassword(password: string): Promise<boolean> {
  const storedHash = localStorage.getItem(STORAGE_VERIFY_KEY);
  const storedSalt = localStorage.getItem(STORAGE_SALT_KEY);
  if (!storedHash || !storedSalt) return false;
  const salt = Uint8Array.from(atob(storedSalt), c => c.charCodeAt(0));
  if (haveSubtle()) {
    const key = await deriveKey(password, salt) as CryptoKey;
    const raw = await crypto.subtle.exportKey('raw', key);
    const hash = await crypto.subtle.digest('SHA-256', raw);
    const computedHash = btoa(String.fromCharCode(...new Uint8Array(hash)));
    return computedHash === storedHash;
  }
  const dk = pbkdf2Fallback(password, salt, Math.min(ITERATIONS, 10000));
  const hash = sha256(dk);
  return btoa(String.fromCharCode(...hash)) === storedHash;
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
  const enc = new TextEncoder();
  if (haveSubtle()) {
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(text));
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
  }
  return btoa(String.fromCharCode(...sha256(enc.encode(text))));
}

export async function encryptCredential(plaintext: string, masterPassword: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(masterPassword, salt);
  if (key instanceof Uint8Array) {
    const plain = new TextEncoder().encode(plaintext);
    const encrypted = xorEncrypt(plain, key);
    const combined = new Uint8Array(salt.length + iv.length + encrypted.length);
    combined.set(salt); combined.set(iv, salt.length); combined.set(encrypted, salt.length + iv.length);
    return btoa(String.fromCharCode(...combined));
  }
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key as CryptoKey, new TextEncoder().encode(plaintext));
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
  if (key instanceof Uint8Array) {
    const decrypted = xorEncrypt(data, key);
    return new TextDecoder().decode(decrypted);
  }
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key as CryptoKey, data);
  return new TextDecoder().decode(decrypted);
}
