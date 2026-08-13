// macOS build — run this script ON macOS (electron-builder cannot produce
// mac targets from Linux/Windows). Mirrors build.mjs: bundle the server,
// package with electron-builder, then report artifacts.
//
//   cd win && node build-mac.mjs
//
// Output: ../release/WebSSH-<ver>-arm64.dmg / -x64.dmg (and .zip)
import { execSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const releaseDir = join(__dirname, '..', 'release');

// Icons are gitignored build artifacts — regenerate them from logo.png so a
// fresh clone can build without manual steps.
async function ensureIcons() {
  const targets = [
    ['icon.png', 1024], ['iconTemplate.png', 22], ['iconTemplate@2x.png', 44],
  ];
  if (targets.every(([f]) => existsSync(join(__dirname, f)))) return;
  const sharp = (await import('sharp')).default;
  const logo = join(__dirname, '..', 'logo.png');
  for (const [file, size] of targets) {
    const out = join(__dirname, file);
    if (!existsSync(out)) {
      await sharp(logo).resize(size, size).png().toFile(out);
      console.log(`  Generated ${file}`);
    }
  }
}

if (process.platform !== 'darwin') {
  console.error('build-mac.mjs must run on macOS — electron-builder cannot cross-build mac targets.');
  console.error('Copy the repo to a Mac and run: cd win && node build-mac.mjs');
  process.exit(1);
}

// Clean previous mac outputs
for (const d of ['mac', 'mac-arm64', 'mac-x64']) {
  const p = join(releaseDir, d);
  if (existsSync(p)) { try { rmSync(p, { recursive: true }); } catch {} }
}

// Step 0: Bundle the Node server into a single self-contained file.
// The packaged app ships WITHOUT node_modules (extraResources excludes them),
// so `import { Client } from 'ssh2'` would fail at runtime unless bundled.
async function bundleServer() {
  const esbuild = await import('esbuild');
  const path = await import('path');
  const entry = join(__dirname, '..', 'core', 'server', 'index.mjs');
  const outfile = join(__dirname, '..', 'core', 'server', 'index.bundle.mjs');
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile,
    banner: { js: 'import { createRequire as __cr } from "module"; import { fileURLToPath as __fup } from "url"; import { dirname as __dn } from "path"; const require = __cr(import.meta.url); const __filename = __fup(import.meta.url); const __dirname = __dn(__filename);' },
    plugins: [{
      name: 'node-stub',
      setup(build) {
        build.onResolve({ filter: /\.node$/ }, () => ({ path: 'stub', namespace: 'node-stub' }));
        build.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({ contents: 'export default {};', loader: 'js' }));
        build.onResolve({ filter: /^\.\/agent(\.js)?$/ }, (args) => {
          if (args.importer && args.importer.replace(/\\/g, '/').includes('ssh2')) {
            return { path: path.resolve(__dirname, '..', 'core', 'worker', 'shims', 'ssh2-agent.js') };
          }
        });
      },
    }],
    logLevel: 'warning',
  });
  console.log('  Server bundled to core/server/index.bundle.mjs');
}

console.log('[0/3] Checking icons...');
await ensureIcons();

console.log('[1/3] Bundling server...');
try {
  await bundleServer();
} catch (e) {
  console.error('  Server bundle FAILED — packaged app will not run:', e.message);
  process.exit(1);
}

console.log('[2/3] Building macOS app (dmg + zip, per-arch)...');
// Which architectures to build. Defaults to both; CI on arm64 runners sets
// WEBSSH_MAC_ARCHS=arm64 because cross-building the x64 DMG on Apple Silicon
// hits a known electron-builder `hdiutil detach` failure on /Volumes/WebSSH.
const archs = (process.env.WEBSSH_MAC_ARCHS || 'arm64,x64')
  .split(',').map(a => a.trim()).filter(Boolean);
// Build each architecture in a SEPARATE electron-builder invocation. Running a
// single `--mac` for both arm64+x64 sequentially collides on the shared DMG
// volume name (/Volumes/WebSSH), making the second build's `hdiutil detach`
// fail on arm64 CI runners. Splitting per-arch lets each invocation detach its
// own volume cleanly.
for (const arch of archs) {
  console.log(`  [2/3] electron-builder --mac --${arch}...`);
  execSync(`npx electron-builder --mac --${arch}`, {
    cwd: __dirname, stdio: 'inherit', timeout: 900000,
  });
}

// Build artifact — already copied into the app resources; keep tree clean.
try { rmSync(join(__dirname, '..', 'core', 'server', 'index.bundle.mjs')); } catch {}

console.log('[3/3] Done.');
console.log(`  Artifacts in: ${releaseDir}`);
console.log('  Unsigned build — first launch: right-click WebSSH.app → Open,');
console.log('  or run: xattr -dr com.apple.quarantine /path/to/WebSSH.app');
