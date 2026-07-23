import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = join(fileURLToPath(import.meta.url), '..', '..');
const AUDIT_DIR = join(__dirname, 'data');
const AUDIT_PATH = join(AUDIT_DIR, 'audit.log');

if (!existsSync(AUDIT_DIR)) mkdirSync(AUDIT_DIR, { recursive: true });

const MAX_SIZE = 5 * 1024 * 1024;
let entries = [];
let fd = null;

function rotate() {
  try {
    if (existsSync(AUDIT_PATH) && readFileSync(AUDIT_PATH).length > MAX_SIZE) {
      writeFileSync(AUDIT_PATH.replace('.log', '.old.log'), readFileSync(AUDIT_PATH));
    }
  } catch {}
}

function append(entry) {
  try {
    const line = JSON.stringify(entry) + '\n';
    writeFileSync(AUDIT_PATH, line, { flag: 'a' });
  } catch (e) {
    console.error('[Audit] Failed to write:', e.message);
  }
}

export function audit(event, details = {}) {
  const entry = {
    t: Date.now(),
    e: event,
    ...details,
  };
  entries.push(entry);
  if (entries.length > 1000) entries = entries.slice(-500);
  append(entry);
}

export function getAuditLog(limit = 200) {
  try {
    if (existsSync(AUDIT_PATH)) {
      const lines = readFileSync(AUDIT_PATH, 'utf8').split('\n').filter(Boolean);
      return lines.slice(-limit).map(l => JSON.parse(l));
    }
  } catch {}
  return [];
}

export function clearAuditLog() {
  try { writeFileSync(AUDIT_PATH, ''); } catch {}
  entries = [];
}
