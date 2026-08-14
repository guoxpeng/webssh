#!/usr/bin/env node
// Pre-deploy verification for the built frontend + Cloudflare Worker bundle.
// Catches the failure modes that only surface on a deployed site — missing
// worker bundle, missing PWA icons/manifest, and (crucially) a Worker bundle
// that was built from stale code with an outdated WEBSSH_VERSION.
//
// Run AFTER `npm run build && node core/build-worker.mjs`:
//   node scripts/check-dist.mjs
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// `--web` skips the platform (Android/desktop) checks. Used by `npm run build`
// postbuild, which runs before any platform build step (the APK/desktop
// artifacts don't exist yet at that point). Full mode is used by CI and by
// hand before a platform release.
const WEB_ONLY = process.argv.includes('--web');
let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL', m); };
const pass = (m) => console.log('  PASS', m);

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// ── Frontend artifacts (served by both CF Pages and the Node server) ──
const dist = join(root, 'dist', 'client');
for (const f of ['index.html', 'icon-192.png', 'icon-512.png', 'icon.svg', 'apple-touch-icon.png', 'manifest.json']) {
  if (existsSync(join(dist, f))) pass(`dist/client/${f}`);
  else fail(`dist/client/${f} is missing — run \`npm run build\` first`);
}

// ── Cloudflare Worker bundle ──
const workerPath = join(dist, '_worker.js');
if (existsSync(workerPath)) {
  pass('dist/client/_worker.js');
  const bundle = readFileSync(workerPath, 'utf8');
  // The bundle inlines WEBSSH_VERSION from core/shared/version.mjs. Compare it
  // against package.json — a stale build (from before a version bump) fails here.
  const m = bundle.match(/WEBSSH_VERSION\s*=\s*['"]([^'"]+)/);
  if (m) {
    if (m[1] === pkg.version) pass(`worker bundle version ${m[1]} matches package.json`);
    else fail(`worker bundle reports ${m[1]} but package.json says ${pkg.version} — rebuild the worker`);
  } else {
    fail('WEBSSH_VERSION not found in worker bundle');
  }
} else {
  fail('dist/client/_worker.js is missing — run `node core/build-worker.mjs` first');
}

// ── Manifest consistency (PWA icons referenced by manifest must exist) ──
try {
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
  for (const icon of manifest.icons || []) {
    const src = String(icon.src || '').replace(/^\//, '');
    if (existsSync(join(dist, src))) pass(`manifest icon ${icon.src}`);
    else fail(`manifest references ${icon.src} but it is not in dist/client`);
  }
} catch {
  fail('manifest.json is not valid JSON');
}

// ── Mobile (Android APK) artifacts ────────────────────────────────────────
// Conditional: only checked when the android/ project exists (i.e. this is the
// mobile-capable checkout). A pure web/Worker deployment has no android dir
// and must NOT be penalized. When android/ IS present, a release expects the
// APK plus the launcher icons the Android build embeds.
if (WEB_ONLY) {
  console.log('  SKIP  platform (Android/desktop) checks skipped via --web');
} else {

const androidDir = join(root, 'android');
if (existsSync(androidDir)) {
  const apk = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (existsSync(apk)) {
    pass('android APK (app-debug.apk)');
    // The APK must embed the CURRENT version — Android versionName comes from
    // app/build.gradle, which is bumped alongside package.json on release.
    try {
      const vg = readFileSync(join(androidDir, 'app', 'build.gradle'), 'utf8');
      const ver = /versionName\s+['"]([^'"]+)/.exec(vg);
      if (ver && ver[1] !== pkg.version) fail(`Android versionName ${ver[1]} != package.json ${pkg.version} — bump app/build.gradle`);
      else if (ver) pass(`Android versionName ${ver[1]} matches package.json`);
    } catch { /* app/build.gradle unreadable — skip */ }
  } else {
    fail('android/app/build/outputs/apk/debug/app-debug.apk missing — run `npm run cap:build:android`');
  }

  // Launcher icons: generated into res/mipmap-* by `npm run android:icons`.
  const hdpi = join(androidDir, 'app', 'src', 'main', 'res', 'mipmap-hdpi', 'ic_launcher.png');
  if (existsSync(hdpi)) pass('Android launcher icons (mipmap-hdpi/ic_launcher.png)');
  else fail('Android launcher icons missing — run `npm run android:icons`');

  // Web assets must be synced into the Android project before building.
  const assets = join(androidDir, 'app', 'src', 'main', 'assets', 'public', 'index.html');
  if (existsSync(assets)) pass('Android bundled web assets (assets/public/index.html)');
  else fail('Android web assets missing — run `npx cap sync android` after `npm run build`');
} else {
  console.log('  SKIP  android/ not present in this checkout — APK checks skipped');
}

// ── Desktop (Electron) artifacts ──────────────────────────────────────────
// Conditional like the APK: `npm run desktop` / `npm run desktop:mac` emit into
// release/. A checkout that never builds the desktop shell has no release dir.
const releaseDir = join(root, 'release');
if (existsSync(releaseDir)) {
  const unpackedExe = join(releaseDir, 'win-unpacked', 'WebSSH.exe');
  if (existsSync(unpackedExe)) pass('desktop win-unpacked/WebSSH.exe');
  else console.log('  SKIP  win-unpacked/WebSSH.exe not found (Windows desktop not built here)');

  const winZip = join(releaseDir, 'webssh-win.zip');
  if (existsSync(winZip)) pass('desktop webssh-win.zip');
  else console.log('  SKIP  webssh-win.zip not found (portable zip not built here)');

  const macExe = join(releaseDir, 'mac', 'WebSSH.app');
  if (existsSync(macExe)) pass('desktop mac/WebSSH.app');
  else console.log('  SKIP  mac/WebSSH.app not found (macOS desktop not built here)');

  // Any desktop artifact must be present — an empty release/ dir is a failure.
  const releaseEntries = readdirSync(releaseDir).filter((e) => !e.startsWith('.'));
  if (releaseEntries.length === 0) fail('release/ exists but is empty — desktop build produced nothing');
} else {
  console.log('  SKIP  release/ not present in this checkout — desktop checks skipped');
}

}

if (failures) {
  console.error(`\n[check-dist] ${failures} problem(s) — fix before deploying.`);
  process.exit(1);
}
console.log('\n[check-dist] OK: deployment artifacts are complete and version-consistent.');
