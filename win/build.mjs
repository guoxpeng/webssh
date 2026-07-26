import { execSync } from 'child_process';
import { existsSync, copyFileSync, rmSync, createWriteStream } from 'fs';
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
  const searchPaths = [
    join(__dirname, 'rcedit-x64.exe'),
    join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign'),
  ];
  // Search in winCodeSign cache dirs
  const cacheDir = join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign');
  if (existsSync(cacheDir)) {
    for (const entry of execSync(`dir "${cacheDir}" /b /ad`, { encoding: 'utf8' }).split('\n').filter(Boolean)) {
      const candidate = join(cacheDir, entry.trim(), 'rcedit-x64.exe');
      if (existsSync(candidate)) return candidate;
    }
  }
  // Local copy
  if (existsSync(searchPaths[0])) return searchPaths[0];
  return null;
}

async function downloadRcedit() {
  const outPath = join(__dirname, 'rcedit-x64.exe');
  console.log('  Downloading rcedit...');
  await new Promise((resolve, reject) => {
    const f = createWriteStream(outPath);
    https.get('https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe', (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      res.pipe(f);
      f.on('finish', () => { f.close(); resolve(); });
    }).on('error', reject);
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

// Clean
try { execSync('powershell -Command "Get-Process -Name WebSSH -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'ignore' }); } catch {}
if (existsSync(releaseDir)) {
  try { rmSync(releaseDir, { recursive: true }); } catch {
    execSync(`powershell -Command "Remove-Item -LiteralPath '${releaseDir}' -Recurse -Force"`, { stdio: 'ignore' });
  }
}

// Step 1: Build win-unpacked dir
console.log('[1/3] Building unpacked app...');
execSync('npx electron-builder --win=dir', {
  cwd: __dirname, stdio: 'inherit', timeout: 300000,
});

// Step 2: Patch icon with rcedit
console.log('[2/3] Patching icon...');
try {
  let rceditPath = findRcedit();
  if (!rceditPath) rceditPath = await downloadRcedit();
  patchIcon(rceditPath);
} catch (e) {
  console.log('  Icon patch skipped:', e.message);
}

// Step 3: Create portable zip (strip non-essential files to keep under 100MB)
console.log('[3/3] Creating portable zip...');
const zipPath = join(releaseDir, 'WebSSH-portable.zip');
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
