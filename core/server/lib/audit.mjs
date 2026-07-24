import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = join(fileURLToPath(import.meta.url), '..', '..');
const AUDIT_DIR = join(__dirname, 'data');
const AUDIT_PATH = join(AUDIT_DIR, 'audit.log');
const AUDIT_OLD_PATH = join(AUDIT_DIR, 'audit.old.log');

if (!existsSync(AUDIT_DIR)) mkdirSync(AUDIT_DIR, { recursive: true });

const MAX_SIZE = 5 * 1024 * 1024;
let entries = [];

function rotate() {
  try {
    if (existsSync(AUDIT_PATH)) {
      const stat = readFileSync(AUDIT_PATH);
      if (stat.length > MAX_SIZE) {
        writeFileSync(AUDIT_OLD_PATH, stat);
        writeFileSync(AUDIT_PATH, '');
        entries = [];
      }
    }
  } catch (e) {
    console.error('[Audit] Rotation failed:', e.message);
  }
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
  rotate();
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
