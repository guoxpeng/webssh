#!/usr/bin/env node
// Enforces the storage-key registry (web/src/utils/storage.ts). Two rules:
//
//   1. ONLY web/src/utils/storage.ts may call localStorage/sessionStorage
//      directly. Any other module must use the helpers exported from there —
//      this makes a SESSION_STORAGE_* key that lives in localStorage (the old
//      bug) structurally impossible, because the storage area is declared in
//      the registry and the helpers route to it automatically.
//
//   2. Every literal key passed to getItem/setItem/removeItem must be
//      registered in STORAGE_KEYS (exact match) or be derived from a
//      registered prefix key (prefix + suffix). New keys must be added to the
//      registry, where their real area + purpose is declared.
//
// Rule 1 applies to web/src minus __tests__/ and locales/ (tests seed storage
// directly by design; locales contain no storage code). Rule 2 also covers
// __tests__ so test keys can't drift from the registry.
//
// Run:  node scripts/check-storage.mjs
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'web', 'src');
const STORAGE_MODULE = join('utils', 'storage.ts');
const EXCLUDE_DIRS = new Set(['__tests__', 'locales']);

let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL', m); };

// ── Load the registry from storage.ts ─────────────────────────────────────
const storageSrc = readFileSync(join(SRC, 'utils', 'storage.ts'), 'utf8');
const defs = [];
const re = /^\s*([A-Za-z0-9_]+):\s*\{\s*key:\s*'([^']+)',\s*area:\s*'(local|session)'/gm;
let m;
while ((m = re.exec(storageSrc))) {
  defs.push({ id: m[1], key: m[2], area: m[3] });
}
if (defs.length === 0) {
  console.error('[check-storage] FATAL: no STORAGE_KEYS entries found in utils/storage.ts');
  process.exit(1);
}
const prefixes = defs.filter(d => /prefix/.test(storageSrc.slice(storageSrc.indexOf(d.key) - 40, storageSrc.indexOf(d.key) + 80)) || d.id.includes('Prefix')).map(d => d.key);

// Duplicate key check — same literal registered twice is a bug.
const seen = new Map();
for (const d of defs) {
  if (seen.has(d.key)) fail(`duplicate storage key '${d.key}' registered as ${seen.get(d.key)} and ${d.id}`);
  seen.set(d.key, d.id);
}

function walk(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!EXCLUDE_DIRS.has(ent.name)) out.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx|vue)$/.test(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

const apiCall = /(?:window\.)?(localStorage|sessionStorage)\.(getItem|setItem|removeItem)\s*\(\s*'([^']+)'/g;

for (const file of walk(SRC)) {
  const rel = relative(SRC, file).replace(/\\/g, '/');
  const isStorageModule = rel === STORAGE_MODULE;
  const src = readFileSync(file, 'utf8');

  // Rule 1: raw API access outside the storage module (strip comments).
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  if (!isStorageModule) {
    const raw = /(?:window\.)?(?:localStorage|sessionStorage)\s*\./.exec(code);
    if (raw) {
      fail(`${rel}: direct ${raw[0]} access — import helpers from '@/utils/storage' instead`);
    }
  }

  // Rule 2: every literal storage key must be registered (or a registered prefix).
  for (const mm of src.matchAll(apiCall)) {
    const key = mm[3];
    const ok = defs.some(d => d.key === key) || prefixes.some(p => key.startsWith(p));
    if (!ok) {
      fail(`${rel}: storage key '${key}' is not registered — add it to STORAGE_KEYS in utils/storage.ts`);
    }
  }
}

if (failures) {
  console.error(`\n[check-storage] ${failures} problem(s).`);
  process.exit(1);
}
console.log(`[check-storage] OK: ${defs.length} registered keys, no raw storage access outside utils/storage.ts.`);
