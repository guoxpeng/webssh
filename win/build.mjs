import { execSync } from 'child_process';
import { existsSync, copyFileSync, rmSync, createWriteStream, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const releaseDir = join(__dirname, '..', 'release');
const unpackedDir = join(releaseDir, 'win-unpacked');
const unpackedExe = join(unpackedDir, 'WebSSH.exe');

// Helper: find rcedit from cache or download it
function findRcedit() {
  const local = join(__dirname, 'rcedit-x64.exe');
  if (existsSync(local)) return local;
  // Search in winCodeSign cache dirs (electron-builder downloads rcedit here
  // when it edits the exe; CI caches persist across builds).
  const cacheDir = join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign');
  if (existsSync(cacheDir)) {
    const found = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fp = join(dir, entry.name);
        if (entry.isDirectory()) walk(fp);
        else if (entry.name === 'rcedit-x64.exe') found.push(fp);
      }
    };
    try { walk(cacheDir); } catch {}
    if (found.length) return found[0];
  }
  return null;
}

async function downloadRcedit() {
  const outPath = join(__dirname, 'rcedit-x64.exe');
  console.log('  Downloading rcedit...');
  await new Promise((resolve, reject) => {
    const doGet = (url) => {
      https.get(url, { headers: { 'User-Agent': 'webssh-build' } }, (res) => {
        // GitHub release downloads redirect (302) to a CDN; follow up to a few.
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          doGet(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        const f = createWriteStream(outPath);
        res.pipe(f);
        f.on('finish', () => { f.close(); resolve(); });
        f.on('error', reject);
      }).on('error', reject);
    };
    doGet('https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe');
  });
  return outPath;
}

function patchIcon(rceditPath) {
  const tmpExe = join(releaseDir, 'tmp_patch.exe');
  const iconFile = join(__dirname, 'icon.ico');
  if (!existsSync(iconFile)) { console.log('  icon.ico not found, skipping patch'); return; }
  copyFileSync(unpackedExe, tmpExe);
  const cmd = `"${rceditPath}" "${tmpExe}" --set-icon "${iconFile}"`;
  execSync(cmd, { timeout: 15000, stdio: 'pipe' });
  copyFileSync(tmpExe, unpackedExe);
  try { rmSync(tmpExe); } catch {}
  console.log('  Icon patched');
}

// Clean — kill processes on port 9627, then remove old build
try { execSync('powershell -Command "Get-Process -Name WebSSH -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'ignore' }); } catch {}
try { execSync('powershell -Command "Get-NetTCPConnection -LocalPort 9627 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"', { stdio: 'ignore' }); } catch {}
if (existsSync(releaseDir)) {
  try { rmSync(releaseDir, { recursive: true }); } catch {
    execSync(`powershell -Command "Remove-Item -LiteralPath '${releaseDir}' -Recurse -Force"`, { stdio: 'ignore' });
  }
}

// Step 0: Bundle the Node server into a single self-contained file.
// The packaged app ships WITHOUT node_modules (extraResources excludes them),
// so `import { Client } from 'ssh2'` would fail at runtime unless bundled.
// Mirrors the proven approach in core/build-worker.mjs (stub .node, shim agent).
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

// Step 1: Build win-unpacked dir
console.log('[0/3] Bundling server...');
try {
  await bundleServer();
} catch (e) {
  console.error('  Server bundle FAILED — packaged app will not run:', e.message);
  process.exit(1);
}

console.log('[1/3] Building unpacked app...');
execSync('npx electron-builder --win=dir', {
  cwd: __dirname, stdio: 'inherit', timeout: 300000,
});

// The bundle is a build artifact — electron-builder already copied it into
// resources; keep the source tree clean.
try { rmSync(join(__dirname, '..', 'core', 'server', 'index.bundle.mjs')); } catch {}

// Step 2: Patch icon with rcedit (fallback — electron-builder embeds the icon
// itself via win.icon; rcedit only needs to succeed when that is skipped).
console.log('[2/3] Patching icon (fallback)...');
try {
  let rceditPath = findRcedit();
  if (!rceditPath) rceditPath = await downloadRcedit();
  patchIcon(rceditPath);
} catch (e) {
  console.log(`  Icon patch skipped (electron-builder should have embedded it): ${e.message}`);
}

// Step 3: Create portable zip (strip non-essential files to keep under 100MB)
console.log('[3/3] Creating portable zip...');
const zipPath = join(releaseDir, 'webssh-win.zip');
const keepLocales = new Set(['en-US.pak', 'zh-CN.pak', 'zh-TW.pak']);
const localeDir = join(unpackedDir, 'locales');
if (existsSync(localeDir)) {
  for (const f of execSync(`dir "${localeDir}" /b`, { encoding: 'utf8' }).split('\n').map(s => s.trim()).filter(Boolean)) {
    if (!keepLocales.has(f)) try { rmSync(join(localeDir, f)); } catch {}
  }
}
for (const f of ['vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll', 'LICENSES.chromium.html']) {
  const fp = join(unpackedDir, f);
  if (existsSync(fp)) try { rmSync(fp); } catch {}
}
try { rmSync(join(releaseDir, 'builder-debug.yml')); } catch {}
// Use 7-Zip if available for better compression
const sevenZip = (() => {
  const candidates = ['C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe'];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
})();
if (sevenZip) {
  execSync(`"${sevenZip}" a -tzip -mx=9 "${zipPath}" "${unpackedDir}\\*" -r`, { timeout: 120000 });
} else {
  execSync(`powershell -Command "Compress-Archive -Path '${unpackedDir}\\*' -DestinationPath '${zipPath}' -Force"`, { timeout: 60000 });
}

console.log(`\nDone!`);
console.log(`  Directory: ${unpackedDir}`);
console.log(`  Zip:       ${zipPath}`);
