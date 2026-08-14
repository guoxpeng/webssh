#!/usr/bin/env node
// i18n regression scanner.
//
// All user-facing text in the web client must come from web/src/locales/*.ts
// and be referenced through t(). This script fails the build/CI run when a
// component, service, store, or view ships a literal Chinese (CJK ideograph)
// string that should have been localized.
//
// Usage:
//   node scripts/check-i18n.mjs          — scan the web client (web/src)
//   node scripts/check-i18n.mjs core     — scan the backend (core/), where the
//                                         intentional Chinese error messages
//                                         (no locale system on the server yet)
//                                         are tracked in scripts/core-i18n-
//                                         allowlist.json. A line is allowed
//                                         only when EVERY CJK run it contains is
//                                         in that allowlist, so new or edited
//                                         messages fail until consciously
//                                         reviewed and added.
//
// Exclusions:
//   - web/src/locales/**      — the dictionaries themselves
//   - **/__tests__/** and *.test.* / *.spec.* — test fixtures may quote UI text
//   - node_modules, dist, .git
//
// Line-level opt-out: a line whose trailing comment starts with `i18n-ignore`
// is skipped. Use it for a literal CJK value that must stay literal (e.g. a
// legacy persisted sentinel that predates i18n) — never for user-facing UI:
//
//   const LEGACY_SENTINEL = '未成功连接'; // i18n-ignore: legacy data migration

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] === 'core' ? 'core' : 'web';
const SCAN_DIR = target === 'core' ? join(ROOT, 'core') : join(ROOT, 'web', 'src');

// CJK Unified Ideographs (U+4E00–U+9FFF) + Extension A (U+3400–U+4DBF) +
// Compatibility Ideographs (U+F900–U+FAFF). This deliberately does NOT match
// em-dashes, arrows, box-drawing glyphs, or other non-CJK symbols.
const CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;

const SKIP_DIRS = new Set(
  target === 'core'
    ? ['__tests__', 'node_modules', 'dist', '.git']
    : ['locales', '__tests__', 'node_modules', 'dist'],
);
const SOURCE_EXT = /\.(?:ts|tsx|js|jsx|mjs|vue)$/;
const TEST_FILE = /\.(?:test|spec)\.[jt]sx?$/;
// Matches `// i18n-ignore`, `/* i18n-ignore ... */` and `<!-- i18n-ignore -->`
// (Vue template comments). Requiring the comment opener keeps a stray string
// literal like "i18n-ignore" from silently opting a line out.
const IGNORE_MARKER = /(?:\/\/|\/\*|<!--)\s*i18n-ignore/;

function hasIgnoreMarker(line) {
  return IGNORE_MARKER.test(line);
}

function collect(dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collect(full, files);
    } else if (SOURCE_EXT.test(entry.name) && !TEST_FILE.test(entry.name)) {
      files.push(full);
    }
  }
}

// Backend strings are intentional (the server has no locale system yet); the
// allowlist is the reviewed inventory of them. New/edited Chinese that is not
// in it fails the check.
let allowlist = null;
if (target === 'core') {
  try {
    const raw = readFileSync(join(ROOT, 'scripts', 'core-i18n-allowlist.json'), 'utf8');
    allowlist = new Set(JSON.parse(raw));
  } catch {
    console.error('check-i18n (core): cannot load scripts/core-i18n-allowlist.json');
    process.exit(1);
  }
}

const files = [];
collect(SCAN_DIR, files);
files.sort();

let violations = 0;
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (hasIgnoreMarker(line)) return;
    const runs = line.match(CJK_RUN);
    if (!runs) return;
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (allowlist) {
      const missing = runs.filter((r) => !allowlist.has(r));
      if (missing.length === 0) return;
      violations += 1;
      console.error(
        `${rel}:${idx + 1}: Chinese not in the server allowlist → ${JSON.stringify(missing.join(''))}`,
      );
    } else {
      violations += 1;
      console.error(`${rel}:${idx + 1}: hardcoded Chinese → ${JSON.stringify(runs.join(''))}`);
    }
  });
}

if (violations > 0) {
  if (allowlist) {
    console.error(
      `\ncheck-i18n (core) failed: ${violations} line(s) contain Chinese outside ` +
        'scripts/core-i18n-allowlist.json.',
    );
    console.error(
      'The backend has no locale system yet; add an intentional message to the allowlist ' +
        'only after reviewing it, or localize it if it reaches the client.',
    );
  } else {
    console.error(`\ncheck-i18n failed: ${violations} line(s) contain hardcoded Chinese.`);
    console.error('Move user-facing text into web/src/locales/{zh-CN,en-US}.ts and reference it with t().');
  }
  process.exit(1);
}

console.log(
  allowlist
    ? `check-i18n (core) passed: scanned ${files.length} files, all Chinese matches the allowlist.`
    : `check-i18n passed: scanned ${files.length} files, no hardcoded Chinese found.`,
);
