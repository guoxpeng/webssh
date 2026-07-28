// Pure JS polyfills for crypto functions workerd doesn't implement
// Uses BigInt for elliptic curve arithmetic and modular exponentiation
// Supports ECDH, Diffie-Hellman, and RSA signature verification

// ---- Helpers ----
function getBuf() {
  if (typeof Buffer !== 'undefined') return Buffer;
  try { return require('buffer').Buffer; } catch {}
  throw new Error('Buffer not available');
}
function bufToBig(buf) {
  return BigInt('0x' + (buf instanceof Uint8Array ? Buffer.from(buf) : buf).toString('hex'));
}
function bigToBuf(n, len) {
  let hex = n.toString(16);
  while (hex.length < len * 2) hex = '0' + hex;
  return Buffer.from(hex, 'hex');
}

// ---- Modular inverse (Extended Euclidean) ----
function modInv(a, p) {
  a = ((a % p) + p) % p;
  let [old_r, r] = [a, p];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return ((old_s % p) + p) % p;
}

// ---- Modular exponentiation ----
function modPow(base, exp, mod) {
  let r = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return r;
}

// ---- SHA-256 (pure JS, used by RSA verify) ----
function sha256(data) {
  const B = typeof Buffer !== 'undefined' ? Buffer : getBuf();
  const rightRotate = (x, c) => (x >>> c) | (x << (32 - c));
  const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const ml = data.length * 8;
  let offset = 0;
  const padLen = ((data.length + 9 + 63) >>> 6) * 64;
  const pad = new Uint8Array(padLen);
  pad.set(data);
  pad[data.length] = 0x80;
  new DataView(pad.buffer).setUint32(padLen - 4, ml >>> 32, false);
  new DataView(pad.buffer).setUint32(padLen - 8, ml & 0xffffffff, false);
  let H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const W = new Uint32Array(64);
  while (offset < padLen) {
    for (let t = 0; t < 16; t++) {
      W[t] = (pad[offset] << 24) | (pad[offset+1] << 16) | (pad[offset+2] << 8) | pad[offset+3];
      offset += 4;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rightRotate(W[t-15], 7) ^ rightRotate(W[t-15], 18) ^ (W[t-15] >>> 3);
      const s1 = rightRotate(W[t-2], 17) ^ rightRotate(W[t-2], 19) ^ (W[t-2] >>> 10);
      W[t] = (W[t-16] + s0 + W[t-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i*4] = H[i] >>> 24; out[i*4+1] = H[i] >>> 16;
    out[i*4+2] = H[i] >>> 8; out[i*4+3] = H[i] & 0xff;
  }
  return out;
}

// ---- ASN.1 decoder (minimal, for RSA PKCS1 key parsing) ----
function parseDER(buf, offset) {
  if (buf[offset] === 0x30) { // SEQUENCE
    const len = parseDERLen(buf, offset + 1);
    const start = offset + 2 + (buf[offset+1] >= 0x80 ? (buf[offset+1] & 0x7f) : 0);
    return { tag: 0x30, length: len, data: buf.subarray(start, start + len), next: start + len };
  }
  if (buf[offset] === 0x02) { // INTEGER
    const len = parseDERLen(buf, offset + 1);
    const start = offset + 2 + (buf[offset+1] >= 0x80 ? (buf[offset+1] & 0x7f) : 0);
    let val = buf.subarray(start, start + len);
    return { tag: 0x02, length: len, value: val, next: start + len };
  }
  throw new Error('Unknown DER tag: ' + buf[offset]);
}
function parseDERLen(buf, offset) {
  if (buf[offset] < 0x80) return buf[offset];
  const nBytes = buf[offset] & 0x7f;
  let len = 0;
  for (let i = 0; i < nBytes; i++) len = (len << 8) | buf[offset + 1 + i];
  return len;
}

// ---- PEM parsing ----
function parsePEM(pem) {
  const B = getBuf();
  const b64 = pem.replace(/-----BEGIN [\w ]+-----/, '').replace(/-----END [\w ]+-----/, '').replace(/[\s\n\r]/g, '');
  return B.from(b64, 'base64');
}

// ---- RSA PKCS1v15 DigestInfo templates ----
const DIGEST_INFO = {
  'sha256': [0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20],
  'sha384': [0x30, 0x41, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x02, 0x05, 0x00, 0x04, 0x30],
  'sha512': [0x30, 0x51, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x03, 0x05, 0x00, 0x04, 0x40],
  'sha1':   [0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2b, 0x0e, 0x03, 0x02, 0x1a, 0x05, 0x00, 0x04, 0x14],
};
const HASH_FNS = {
  'sha256': (d) => sha256(d),
  'sha384': (d) => { const B = getBuf(); return B.from(require('crypto').createHash('sha384').update(d).digest()); },
  'sha512': (d) => { const B = getBuf(); return B.from(require('crypto').createHash('sha512').update(d).digest()); },
  'sha1':   (d) => { const B = getBuf(); return B.from(require('crypto').createHash('sha1').update(d).digest()); },
};

// ---- RSA signature verification ----
function rsaVerify(hashName, data, sigBuf, nBI, eBI) {
  const B = getBuf();
  const nBytes = bigToBuf(nBI, 0).length; // approximate

  // Compute m = sig^e mod n
  const mBI = modPow(bufToBig(sigBuf), eBI, nBI);
  const keyLen = bigToBuf(nBI, 0).length;

  // Convert m to buffer
  let mBuf = bigToBuf(mBI, keyLen);
  if (mBuf.length > keyLen) mBuf = mBuf.subarray(mBuf.length - keyLen);
  else if (mBuf.length < keyLen) {
    const tmp = B.alloc(keyLen);
    mBuf.copy(tmp, keyLen - mBuf.length);
    mBuf = tmp;
  }

  // PKCS1v15 padding check: 00 01 FF...FF 00 <DigestInfo>
  if (mBuf[0] !== 0x00 || mBuf[1] !== 0x01) return false;
  let sep = 2;
  while (sep < mBuf.length && mBuf[sep] === 0xff) sep++;
  if (sep >= mBuf.length || mBuf[sep] !== 0x00) return false;

  const diTemplate = DIGEST_INFO[hashName];
  if (!diTemplate) return false;
  const diLen = diTemplate.length;
  const hashFn = HASH_FNS[hashName];
  if (!hashFn) return false;

  // Extract DigestInfo from mBuf
  const diStart = sep + 1;
  if (diStart + diLen + (hashName === 'sha1' ? 20 : hashName === 'sha256' ? 32 : hashName === 'sha384' ? 48 : 64) > mBuf.length)
    return false;

  // Compare DigestInfo template
  for (let i = 0; i < diLen; i++) {
    if (mBuf[diStart + i] !== diTemplate[i]) return false;
  }

  // Compare hash value
  const hashVal = hashFn(data);
  const hashLen = hashVal.length;
  const hashStart = diStart + diLen;
  for (let i = 0; i < hashLen; i++) {
    if (mBuf[hashStart + i] !== hashVal[i]) return false;
  }

  return true;
}

// ---- RSA key extraction from PEM ----
function rsaKeyFromPEM(pem) {
  try {
    const der = parsePEM(pem);
    const seq = parseDER(der, 0);
    if (seq.tag !== 0x30) throw new Error('Expected SEQUENCE');
    const nInt = parseDER(seq.data, 0);
    if (nInt.tag !== 0x02) throw new Error('Expected INTEGER');
    const eInt = parseDER(seq.data, nInt.next);
    if (eInt.tag !== 0x02) throw new Error('Expected INTEGER');
    return { n: bufToBig(nInt.value), e: bufToBig(eInt.value) };
  } catch (ex) {
    throw new Error('Failed to parse RSA key: ' + ex.message);
  }
}

// ---- createVerify polyfill ----
function createVerify(algo) {
  if (typeof algo !== 'string' || !algo.startsWith('sha'))
    throw new Error('Unsupported hash algorithm: ' + algo);
  const hashName = algo.toLowerCase();
  if (!DIGEST_INFO[hashName]) throw new Error('Unsupported hash: ' + algo);

  const B = getBuf();
  const dataChunks = [];

  return {
    update(data) {
      if (typeof data === 'string') dataChunks.push(B.from(data, 'utf8'));
      else dataChunks.push(B.from(data));
      return this;
    },
    verify(key, signature) {
      if (typeof signature === 'string')
        signature = B.from(signature, 'hex');
      else if (signature instanceof Uint8Array)
        signature = B.from(signature);

      // Handle key as PEM string
      let keyStr;
      if (typeof key === 'string') keyStr = key;
      else if (key && key.key) keyStr = key.key;
      else if (key instanceof Uint8Array) {
        // Assume raw key data, try PEM decode
        const k = B.from(key);
        keyStr = k.toString('utf8');
      }

      if (!keyStr) throw new Error('Unable to parse key');
      const combined = B.concat(dataChunks);

      // Detect key type
      if (keyStr.includes('BEGIN RSA PUBLIC KEY') || keyStr.includes('BEGIN PUBLIC KEY')) {
        const keyData = rsaKeyFromPEM(keyStr);
        return rsaVerify(hashName, combined, signature, keyData.n, keyData.e);
      }

      // Raw SSH key format: algo_str + e + n
      if (keyStr.includes('ssh-rsa') || keyStr.includes('ssh-dss')) {
        const parts = keyStr.split(/\s+/);
        const raw = parts.length > 1 && parts[1] ? B.from(parts[1], 'base64') : B.from(keyStr);
        const keyData = parseSSHRSAKey(raw);
        if (!keyData) throw new Error('Unsupported key format');
        return rsaVerify(hashName, combined, signature, keyData.n, keyData.e);
      }

      throw new Error('Unsupported key type in PEM');
    },
  };
}

function parseSSHRSAKey(buf) {
  const B = getBuf();
  let pos = 0;
  function readLen() {
    const l = (buf[pos] << 24) | (buf[pos+1] << 16) | (buf[pos+2] << 8) | buf[pos+3];
    pos += 4;
    return l;
  }
  function readStr() { const l = readLen(); const s = buf.subarray(pos, pos + l); pos += l; return s; }
  try {
    const algo = readStr().toString('utf8');
    if (!algo.includes('rsa')) return null;
    const e = readStr();
    const n = readStr();
    return { n: bufToBig(n), e: bufToBig(e) };
  } catch { return null; }
}

// ---- Elliptic curve parameters ----
const CURVES = {
  'prime256v1': {
    p: 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn,
    a: 0xffffffff00000001000000000000000000000000fffffffffffffffffffffffcn,
    b: 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn,
    Gx: 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n,
    Gy: 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n,
    n: 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n,
    byteLen: 32,
  },
  'secp384r1': {
    p: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffffn,
    a: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000fffffffcn,
    b: 0xb3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aefn,
    Gx: 0xaa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7n,
    Gy: 0x3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5fn,
    n: 0xffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973n,
    byteLen: 48,
  },
  'secp521r1': {
    p: 0x01ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn,
    a: 0x01fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffcn,
    b: 0x0051953eb9618e1c9a1f929a21a0b68540eea2da725b99b315f3b8b489918ef109e156193951ec7e937b1652c0bd3bb1bf073573df883d2c34f1ef451fd46b503f00n,
    Gx: 0x00c6858e06b70404e9cd9e3ecb662395b4429c648139053fb521f828af606b4d3dbaa14b5e77efe75928fe1dc127a2ffa8de3348b3c1856a429bf97e7e31c2e5bd66n,
    Gy: 0x011839296a789a3bc0045c8a5fb42c7d1bd998f54449579b446817afbd17273e662c97ee72995ef42640c550b9013fad0761353c7086a272c24088be94769fd16650n,
    n: 0x01fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa51868783bf2f966b7fcc0148f709a5d03bb5c9b8899c47aebb6fb71e91386409n,
    byteLen: 66,
  },
};

// ---- EC point arithmetic (affine, short Weierstrass) ----
function ecAdd(curve, x1, y1, x2, y2) {
  if (x1 === null) return { x: x2, y: y2 };
  if (x2 === null) return { x: x1, y: y1 };
  if (x1 === x2) {
    if ((y1 + y2) % curve.p === 0n) return { x: null, y: null };
    return ecDbl(curve, x1, y1);
  }
  const s = ((y2 - y1) * modInv(x2 - x1, curve.p)) % curve.p;
  const x3 = (((s * s - x1 - x2) % curve.p) + curve.p) % curve.p;
  const y3 = (((s * (x1 - x3) - y1) % curve.p) + curve.p) % curve.p;
  return { x: x3, y: y3 };
}
function ecDbl(curve, x, y) {
  const s = ((3n * x * x + curve.a) * modInv(2n * y, curve.p)) % curve.p;
  const x3 = (((s * s - 2n * x) % curve.p) + curve.p) % curve.p;
  const y3 = (((s * (x - x3) - y) % curve.p) + curve.p) % curve.p;
  return { x: x3, y: y3 };
}
function ecMult(curve, k, x, y) {
  let rx = null, ry = null;
  let nx = x, ny = y;
  while (k > 0n) {
    if (k & 1n) { const r = ecAdd(curve, rx, ry, nx, ny); rx = r.x; ry = r.y; }
    const d = ecDbl(curve, nx, ny); nx = d.x; ny = d.y;
    k >>= 1n;
  }
  return { x: rx, y: ry };
}

// ---- ECDH polyfill ----
function createECDH(curveName) {
  const B = getBuf();
  const curve = CURVES[curveName];
  if (!curve) throw new Error('Unsupported curve: ' + Object.keys(CURVES).join(', '));

  let privKey = null;
  let pubPoint = null;

  function genPriv() {
    if (privKey !== null) return;
    const extra = curve.byteLen + 8;
    const rand = crypto.getRandomValues(new Uint8Array(extra));
    privKey = (bufToBig(B.from(rand)) % (curve.n - 1n)) + 1n;
    pubPoint = null;
  }

  function getPub() {
    if (pubPoint) return pubPoint;
    genPriv();
    pubPoint = ecMult(curve, privKey, curve.Gx, curve.Gy);
    return pubPoint;
  }

  function encPoint(pt) {
    const buf = B.alloc(1 + curve.byteLen * 2);
    buf[0] = 0x04;
    const xb = bigToBuf(pt.x, curve.byteLen);
    const yb = bigToBuf(pt.y, curve.byteLen);
    xb.copy(buf, 1);
    yb.copy(buf, 1 + curve.byteLen);
    return buf;
  }

  function decPoint(buf) {
    if (buf[0] !== 0x04 || buf.length !== 1 + curve.byteLen * 2)
      throw new Error('Invalid point encoding');
    const x = bufToBig(buf.subarray(1, 1 + curve.byteLen));
    const y = bufToBig(buf.subarray(1 + curve.byteLen));
    return { x, y };
  }

  return {
    generateKeys() { genPriv(); return encPoint(getPub()); },
    getPublicKey() { return encPoint(getPub()); },
    setPrivateKey(key) { privKey = bufToBig(key); pubPoint = null; },
    getPrivateKey() { if (privKey === null) genPriv(); return bigToBuf(privKey, curve.byteLen); },
    setPublicKey(key) { pubPoint = decPoint(key); },
    computeSecret(otherPub) {
      if (privKey === null) genPriv();
      const pt = decPoint(otherPub);
      const secret = ecMult(curve, privKey, pt.x, pt.y);
      return bigToBuf(secret.x, curve.byteLen);
    },
  };
}

// ---- Diffie-Hellman polyfill (RFC 3526) ----
const MODP_PRIMES = {
  'modp14': {
    prime: 0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFFn,
    size: 256,
  },
};

function createDiffieHellman(primeOrGroup) {
  const B = getBuf();
  let group;
  if (typeof primeOrGroup === 'string') {
    group = MODP_PRIMES[primeOrGroup];
    if (!group) throw new Error('Unsupported DH group: ' + primeOrGroup);
  } else if (primeOrGroup && primeOrGroup.type === 'Buffer' || primeOrGroup instanceof Uint8Array) {
    const p = bufToBig(primeOrGroup);
    group = { prime: p, size: primeOrGroup.length };
  } else {
    throw new Error('Invalid DH argument');
  }

  const g = B.from([2]);
  let privKey = null;

  function genPriv() {
    if (privKey !== null) return;
    const rand = crypto.getRandomValues(new Uint8Array(64));
    privKey = bufToBig(B.from(rand));
  }

  function getPubBI() {
    if (privKey === null) genPriv();
    return modPow(2n, privKey, group.prime);
  }

  return {
    generateKeys() { genPriv(); return bigToBuf(getPubBI(), group.size); },
    getPrime() { return bigToBuf(group.prime, group.size); },
    getGenerator() { return g; },
    getPublicKey() { return bigToBuf(getPubBI(), group.size); },
    getPrivateKey() { if (privKey === null) genPriv(); return bigToBuf(privKey, group.size); },
    setPrivateKey(key) { privKey = bufToBig(key); },
    setPublicKey(key) { /* pubKey is computed lazily */ const pb = bufToBig(key); },
    computeSecret(otherPub) {
      if (privKey === null) genPriv();
      const otherBI = bufToBig(otherPub);
      return bigToBuf(modPow(otherBI, privKey, group.prime), group.size);
    },
  };
}

function createDiffieHellmanGroup(groupName) {
  return createDiffieHellman(groupName);
}

export { createECDH, createDiffieHellman, createDiffieHellmanGroup };
