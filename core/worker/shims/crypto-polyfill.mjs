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
    return { tag: 0x02, length: len, value: buf.subarray(start, start + len), next: start + len };
  }
  if (buf[offset] === 0x03) { // BIT STRING
    const len = parseDERLen(buf, offset + 1);
    const start = offset + 2 + (buf[offset+1] >= 0x80 ? (buf[offset+1] & 0x7f) : 0);
    return { tag: 0x03, length: len, data: buf.subarray(start, start + len), next: start + len };
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
  'sha256': (d) => { const B = getBuf(); return B.from(require('crypto').createHash('sha256').update(d).digest()); },
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
    let data = der;
    // If SPKI format: SEQUENCE { SEQUENCE { OID, NULL }, BIT STRING { PKCS1_DER } }
    // Check if the inner element is a SEQUENCE (not INTEGER) → SPKI
    const outer = parseDER(data, 0);
    if (outer.tag !== 0x30) throw new Error('Expected SEQUENCE');
    // Try to parse first inner element
    const inner0 = parseDER(outer.data, 0);
    if (inner0.tag === 0x30) {
      // SPKI format: unwrap BIT STRING payload
      // Skip algorithm identifier SEQUENCE, read BIT STRING
      const algoSeq = inner0;
      const bitStr = parseDER(outer.data, algoSeq.next);
      if (bitStr.tag !== 0x03) throw new Error('Expected BIT STRING in SPKI');
      // BIT STRING: first byte is unused bits count, then raw DER follows
      const rawInner = bitStr.data.subarray(1);
      data = rawInner;
    } else if (inner0.tag === 0x02) {
      // PKCS#1 format: data is already correct
      data = der;
    } else {
      throw new Error('Unexpected DER structure');
    }
    // Parse PKCS1: SEQUENCE { INTEGER n, INTEGER e }
    const seq = parseDER(data, 0);
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

// ---- AES (pure JS, for createCipheriv/createDecipheriv) ----
// ---- AES (pure JS, for createCipheriv/createDecipheriv) ----
const AES_SBOX = [
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
];
const AES_RSBOX = [
  0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,
  0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,
  0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,
  0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,
  0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,
  0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,
  0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,
  0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,
  0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,
  0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,
  0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,
  0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,
  0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,
  0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,
  0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,
  0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d
];
const AES_RCON = [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36,0x6c,0xd8,0xab,0x4d,0x9a];

function gf_mul(a,b){let r=0;for(let i=0;i<8;i++){if(b&1)r^=a;const h=a&0x80;a=(a<<1)&0xff;if(h)a^=0x1b;b>>=1;}return r;}
function _xt(a){return((a<<1)^(((a>>7)&1)*0x1b))&0xff;}
function mc(x){const a=(x>>>24)&0xff,b=(x>>>16)&0xff,c=(x>>>8)&0xff,d=x&0xff;return((_xt(a)^gf_mul(b,3)^c^d)<<24)|((a^_xt(b)^gf_mul(c,3)^d)<<16)|((a^b^_xt(c)^gf_mul(d,3))<<8)|(gf_mul(a,3)^b^c^_xt(d));}
function imc(x){const a=(x>>>24)&0xff,b=(x>>>16)&0xff,c=(x>>>8)&0xff,d=x&0xff;return((gf_mul(a,14)^gf_mul(b,11)^gf_mul(c,13)^gf_mul(d,9))<<24)|((gf_mul(a,9)^gf_mul(b,14)^gf_mul(c,11)^gf_mul(d,13))<<16)|((gf_mul(a,13)^gf_mul(b,9)^gf_mul(c,14)^gf_mul(d,11))<<8)|(gf_mul(a,11)^gf_mul(b,13)^gf_mul(c,9)^gf_mul(d,14));}

function aesKeySchedule(key) {
  const Nk = key.length / 4, Nr = Nk + 6, nw = 4 * (Nr + 1);
  const w = new Uint32Array(nw);
  for (let i = 0; i < Nk; i++) w[i] = (key[4*i]<<24)|(key[4*i+1]<<16)|(key[4*i+2]<<8)|key[4*i+3];
  for (let i = Nk; i < nw; i++) {
    let t = w[i-1];
    if (i % Nk === 0) { const r = AES_RCON[i/Nk-1]; t = ((AES_SBOX[(t>>>16)&0xff]<<24)|(AES_SBOX[(t>>>8)&0xff]<<16)|(AES_SBOX[t&0xff]<<8)|AES_SBOX[t>>>24]) ^ (r<<24); }
    else if (Nk > 6 && i % Nk === 4) t = (AES_SBOX[(t>>>24)&0xff]<<24)|(AES_SBOX[(t>>>16)&0xff]<<16)|(AES_SBOX[(t>>>8)&0xff]<<8)|AES_SBOX[t&0xff];
    w[i] = w[i-Nk] ^ t;
  }
  return { w, Nr };
}

function aesEncryptBlock(block, w, Nr) {
  let s0 = (block[0]<<24)|(block[1]<<16)|(block[2]<<8)|block[3];
  let s1 = (block[4]<<24)|(block[5]<<16)|(block[6]<<8)|block[7];
  let s2 = (block[8]<<24)|(block[9]<<16)|(block[10]<<8)|block[11];
  let s3 = (block[12]<<24)|(block[13]<<16)|(block[14]<<8)|block[15];
  const sb = AES_SBOX;
  s0 ^= w[0]; s1 ^= w[1]; s2 ^= w[2]; s3 ^= w[3];
  for (let r = 1; r <= Nr; r++) {
    s0 = (sb[(s0>>>24)&0xff]<<24)|(sb[(s0>>>16)&0xff]<<16)|(sb[(s0>>>8)&0xff]<<8)|sb[s0&0xff];
    s1 = (sb[(s1>>>24)&0xff]<<24)|(sb[(s1>>>16)&0xff]<<16)|(sb[(s1>>>8)&0xff]<<8)|sb[s1&0xff];
    s2 = (sb[(s2>>>24)&0xff]<<24)|(sb[(s2>>>16)&0xff]<<16)|(sb[(s2>>>8)&0xff]<<8)|sb[s2&0xff];
    s3 = (sb[(s3>>>24)&0xff]<<24)|(sb[(s3>>>16)&0xff]<<16)|(sb[(s3>>>8)&0xff]<<8)|sb[s3&0xff];
    const t0 = ((s0&0xff000000))|((s1&0x00ff0000))|((s2&0x0000ff00))|((s3&0x000000ff));
    const t1 = ((s1&0xff000000))|((s2&0x00ff0000))|((s3&0x0000ff00))|((s0&0x000000ff));
    const t2 = ((s2&0xff000000))|((s3&0x00ff0000))|((s0&0x0000ff00))|((s1&0x000000ff));
    const t3 = ((s3&0xff000000))|((s0&0x00ff0000))|((s1&0x0000ff00))|((s2&0x000000ff));
    if (r < Nr) {
      s0 = mc(t0) ^ w[4*r]; s1 = mc(t1) ^ w[4*r+1]; s2 = mc(t2) ^ w[4*r+2]; s3 = mc(t3) ^ w[4*r+3];
    } else {
      s0 = t0 ^ w[4*r]; s1 = t1 ^ w[4*r+1]; s2 = t2 ^ w[4*r+2]; s3 = t3 ^ w[4*r+3];
    }
  }
  return new Uint8Array([(s0>>>24)&0xff,(s0>>>16)&0xff,(s0>>>8)&0xff,s0&0xff,(s1>>>24)&0xff,(s1>>>16)&0xff,(s1>>>8)&0xff,s1&0xff,(s2>>>24)&0xff,(s2>>>16)&0xff,(s2>>>8)&0xff,s2&0xff,(s3>>>24)&0xff,(s3>>>16)&0xff,(s3>>>8)&0xff,s3&0xff]);
}

function aesDecryptBlock(block, w, Nr) {
  const rsb = AES_RSBOX;
  let s0 = (block[0]<<24)|(block[1]<<16)|(block[2]<<8)|block[3];
  let s1 = (block[4]<<24)|(block[5]<<16)|(block[6]<<8)|block[7];
  let s2 = (block[8]<<24)|(block[9]<<16)|(block[10]<<8)|block[11];
  let s3 = (block[12]<<24)|(block[13]<<16)|(block[14]<<8)|block[15];
  s0 ^= w[4*Nr]; s1 ^= w[4*Nr+1]; s2 ^= w[4*Nr+2]; s3 ^= w[4*Nr+3];
  for (let r = Nr - 1; r >= 0; r--) {
    const t0 = ((s0&0xff000000))|((s3&0x00ff0000))|((s2&0x0000ff00))|((s1&0x000000ff));
    const t1 = ((s1&0xff000000))|((s0&0x00ff0000))|((s3&0x0000ff00))|((s2&0x000000ff));
    const t2 = ((s2&0xff000000))|((s1&0x00ff0000))|((s0&0x0000ff00))|((s3&0x000000ff));
    const t3 = ((s3&0xff000000))|((s2&0x00ff0000))|((s1&0x0000ff00))|((s0&0x000000ff));
    s0 = (rsb[(t0>>>24)&0xff]<<24)|(rsb[(t0>>>16)&0xff]<<16)|(rsb[(t0>>>8)&0xff]<<8)|rsb[t0&0xff];
    s1 = (rsb[(t1>>>24)&0xff]<<24)|(rsb[(t1>>>16)&0xff]<<16)|(rsb[(t1>>>8)&0xff]<<8)|rsb[t1&0xff];
    s2 = (rsb[(t2>>>24)&0xff]<<24)|(rsb[(t2>>>16)&0xff]<<16)|(rsb[(t2>>>8)&0xff]<<8)|rsb[t2&0xff];
    s3 = (rsb[(t3>>>24)&0xff]<<24)|(rsb[(t3>>>16)&0xff]<<16)|(rsb[(t3>>>8)&0xff]<<8)|rsb[t3&0xff];
    if (r > 0) {
      s0 = imc(s0 ^ w[4*r]); s1 = imc(s1 ^ w[4*r+1]); s2 = imc(s2 ^ w[4*r+2]); s3 = imc(s3 ^ w[4*r+3]);
    } else { s0 ^= w[0]; s1 ^= w[1]; s2 ^= w[2]; s3 ^= w[3]; }
  }
  return new Uint8Array([(s0>>>24)&0xff,(s0>>>16)&0xff,(s0>>>8)&0xff,s0&0xff,(s1>>>24)&0xff,(s1>>>16)&0xff,(s1>>>8)&0xff,s1&0xff,(s2>>>24)&0xff,(s2>>>16)&0xff,(s2>>>8)&0xff,s2&0xff,(s3>>>24)&0xff,(s3>>>16)&0xff,(s3>>>8)&0xff,s3&0xff]);
}

function parseCipherAlgo(algo) {
  const m = algo.match(/^(aes-(\d+))-(ctr|cbc|gcm)$/);
  if (!m) return null;
  const bits = parseInt(m[2]);
  if (bits !== 128 && bits !== 192 && bits !== 256) return null;
  return { bits: bits / 8, mode: m[3] };
}

// ---- createCipheriv polyfill ----
function createCipheriv(algo, key, iv) {
  const info = parseCipherAlgo(algo);
  if (!info || !key || !iv) throw new Error('Invalid cipher args: ' + algo);
  const keyBytes = key.slice(0, info.bits);
  const ivBytes = iv.slice(0, 16);
  const { w, Nr } = aesKeySchedule(keyBytes);
  const B = getBuf();
  let finalized = false;

  if (info.mode === 'ctr') {
    const counter = B.from(ivBytes);
    let ksBuf = null, ksPos = 16;
    return {
      update(data) {
        if (finalized) throw new Error('already finalized');
        const buf = typeof data === 'string' ? B.from(data) : B.from(data);
        const out = B.alloc(buf.length);
        for (let i = 0; i < buf.length; i++) {
          if (ksPos >= 16) { ksBuf = aesEncryptBlock(counter, w, Nr); ksPos = 0; for (let j = 15; j >= 0; j--) if (counter[j]++ !== 255) break; }
          out[i] = buf[i] ^ ksBuf[ksPos++];
        }
        return out;
      },
      final() { finalized = true; return B.alloc(0); },
      setAutoPadding() {},
    };
  }

  if (info.mode === 'cbc') {
    let prev = B.from(ivBytes);
    const chunks = [];
    return {
      update(data) {
        if (finalized) throw new Error('already finalized');
        const buf = typeof data === 'string' ? B.from(data) : B.from(data);
        chunks.push(buf);
        return B.alloc(0);
      },
      final() {
        finalized = true;
        const buf = B.concat(chunks);
        const padLen = 16 - (buf.length % 16);
        const padded = B.alloc(buf.length + padLen);
        padded.set(buf);
        padded.fill(padLen, buf.length);
        const out = B.alloc(padded.length);
        for (let off = 0; off < padded.length; off += 16) {
          const block = padded.subarray(off, off + 16);
          const xored = B.alloc(16);
          for (let j = 0; j < 16; j++) xored[j] = block[j] ^ prev[j];
          const enc = aesEncryptBlock(xored, w, Nr);
          out.set(enc, off);
          prev = enc;
        }
        return out;
      },
      setAutoPadding() {},
    };
  }

  throw new Error('Cipher mode not implemented: ' + info.mode);
}

function createDecipheriv(algo, key, iv) {
  const info = parseCipherAlgo(algo);
  if (!info || !key || !iv) throw new Error('Invalid decipher args: ' + algo);
  const keyBytes = key.slice(0, info.bits);
  const ivBytes = iv.slice(0, 16);
  const { w, Nr } = aesKeySchedule(keyBytes);
  const B = getBuf();
  let finalized = false;

  if (info.mode === 'ctr') {
    const counter = B.from(ivBytes);
    let ksBuf = null, ksPos = 16;
    return {
      update(data) {
        if (finalized) throw new Error('already finalized');
        const buf = typeof data === 'string' ? B.from(data) : B.from(data);
        const out = B.alloc(buf.length);
        for (let i = 0; i < buf.length; i++) {
          if (ksPos >= 16) { ksBuf = aesEncryptBlock(counter, w, Nr); ksPos = 0; for (let j = 15; j >= 0; j--) if (counter[j]++ !== 255) break; }
          out[i] = buf[i] ^ ksBuf[ksPos++];
        }
        return out;
      },
      final() { finalized = true; return B.alloc(0); },
      setAutoPadding() {},
    };
  }

  if (info.mode === 'cbc') {
    let prev = B.from(ivBytes);
    const chunks = [];
    return {
      update(data) {
        if (finalized) throw new Error('already finalized');
        const buf = typeof data === 'string' ? B.from(data) : B.from(data);
        chunks.push(buf);
        return B.alloc(0);
      },
      final() {
        finalized = true;
        const buf = B.concat(chunks);
        const out = B.alloc(buf.length);
        for (let off = 0; off < buf.length; off += 16) {
          const block = buf.subarray(off, off + 16);
          const dec = aesDecryptBlock(block, w, Nr);
          const plain = B.alloc(16);
          for (let j = 0; j < 16; j++) plain[j] = dec[j] ^ prev[j];
          out.set(plain, off);
          prev = block;
        }
        const pad = out[out.length - 1];
        return out.subarray(0, out.length - (pad > 0 && pad <= 16 ? pad : 0));
      },
      setAutoPadding() {},
    };
  }

  throw new Error('Decipher mode not implemented: ' + info.mode);
}

export { createECDH, createDiffieHellman, createDiffieHellmanGroup, createVerify, createCipheriv, createDecipheriv };
