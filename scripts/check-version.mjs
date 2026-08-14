#!/usr/bin/env node
// Verifies that the single version source (core/shared/version.mjs) matches
// package.json "version", so a release bump can't drift between the places
// that previously hardcoded it (package.json / MCP client / Worker
// clientInfo / desktop electron-builder metadata). Exit code 1 on mismatch.
//
// Desktop builds (win/build.mjs, win/build-mac.mjs) contain NO version string
// themselves — electron-builder reads win/package.json and stamps that version
// into the exe/dmg metadata. win/package.json is therefore a real drift point:
// a root release bump that forgets it ships a desktop app labeled with the
// previous version. It is checked here so the same gate guards it.
//
// Run:  node scripts/check-version.mjs
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const desktopPkg = JSON.parse(readFileSync(join(root, 'win', 'package.json'), 'utf8'));
const versionSource = readFileSync(join(root, 'core', 'shared', 'version.mjs'), 'utf8');

const match = versionSource.match(/export\s+const\s+WEBSSH_VERSION\s*=\s*'([^']+)'/);
if (!match) {
  console.error('[check-version] FATAL: WEBSSH_VERSION not found in core/shared/version.mjs');
  process.exit(1);
}

const shared = match[1];
if (shared !== pkg.version) {
  console.error(`[check-version] MISMATCH: package.json version is "${pkg.version}" but core/shared/version.mjs exports "${shared}".`);
  console.error('               Bump both in the same commit (they are intentionally single-source).');
  process.exit(1);
}

// win/build.mjs and win/build-mac.mjs must stay free of version literals —
// electron-builder pulls the version from win/package.json, so a hardcoded
// string in the build scripts would silently diverge from the metadata.
for (const f of ['core/server/lib/mcp-client.mjs', 'core/worker/index.mjs', 'win/build.mjs', 'win/build-mac.mjs']) {
  const src = readFileSync(join(root, f), 'utf8');
  const hardcoded = new RegExp(`version: '${pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`);
  if (hardcoded.test(src)) {
    console.error(`[check-version] ${f} hardcodes version '${pkg.version}' — import WEBSSH_VERSION instead.`);
    process.exit(1);
  }
}

if (desktopPkg.version !== pkg.version) {
  console.error(`[check-version] MISMATCH: desktop win/package.json version is "${desktopPkg.version}" but root package.json is "${pkg.version}".`);
  console.error('               Bump win/package.json in the same commit (electron-builder stamps it into the exe/dmg).');
  process.exit(1);
}

console.log(`[check-version] OK: package.json, core/shared/version.mjs, and win/package.json agree on ${pkg.version}`);
