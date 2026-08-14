import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'logo.png');
const resDir = join(root, 'android', 'app', 'src', 'main', 'res');

if (!existsSync(src)) {
  console.error('logo.png not found — run from repo root');
  process.exit(1);
}

// Density → launcher icon size (px)
const DENSITIES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

// Adaptive icon foreground: 108dp canvas, ~66dp safe zone → keep the logo
// centered at ~60% so the adaptive mask doesn't crop it.
const FOREGROUND = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

async function main() {
  for (const [density, size] of Object.entries(DENSITIES)) {
    const dir = join(resDir, `mipmap-${density}`);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const icon = await sharp(src).resize(size, size).png().toBuffer();
    writeFileSync(join(dir, 'ic_launcher.png'), icon);
    writeFileSync(join(dir, 'ic_launcher_round.png'), icon);

    const fgSize = FOREGROUND[density];
    const fgIcon = await sharp(src).resize(Math.round(fgSize * 0.6), Math.round(fgSize * 0.6), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize(fgSize, fgSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    writeFileSync(join(dir, 'ic_launcher_foreground.png'), fgIcon);

    console.log(`  ✓ ${density} (${size}px)`);
  }

  // Legacy (pre-adaptive) launcher also benefits from a round icon fallback.
  const legacyDir = join(resDir, 'mipmap');
  if (existsSync(legacyDir)) {
    const icon = await sharp(src).resize(48, 48).png().toBuffer();
    writeFileSync(join(legacyDir, 'ic_launcher.png'), icon);
    writeFileSync(join(legacyDir, 'ic_launcher_round.png'), icon);
    console.log('  ✓ legacy mipmap');
  }

  // Adaptive background color: pick the DOMINANT color of the logo (mode), not
  // a single corner pixel — resize(1,1) samples the top-left pixel which is
  // rarely representative. Using the logo's dominant color keeps the launcher
  // background flush with the foreground so the circular/rounded mask does not
  // show a jarring ring that makes the icon look clipped.
  try {
    const { data } = await sharp(src).resize(32, 32).raw().toBuffer({ resolveWithObject: true });
    const counts = new Map();
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = (r & 0xf0) << 12 | (g & 0xf0) << 4 | (b & 0xf0); // 16-level buckets → stable mode
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let bestKey = 0, bestN = 0;
    for (const [k, n] of counts) if (n > bestN) { bestN = n; bestKey = k; }
    const r = (bestKey >> 12) & 0xf0, g = (bestKey >> 4) & 0xf0, b = bestKey & 0xf0;
    const color = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
    const valuesFile = join(resDir, 'values', 'ic_launcher_background.xml');
    const xml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${color}</color>\n</resources>\n`;
    if (existsSync(valuesFile)) {
      writeFileSync(valuesFile, xml);
    } else {
      // Fall back to writing colors in the same file shape Capacitor uses
      writeFileSync(join(resDir, 'values', 'ic_launcher_background.xml'), xml);
    }
    // Keep the pre-adaptive vector drawable in sync with the color resource.
    const drawableFile = join(resDir, 'drawable', 'ic_launcher_background.xml');
    if (existsSync(drawableFile)) {
      const vxml = `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp"\n    android:height="108dp"\n    android:viewportHeight="108"\n    android:viewportWidth="108">\n    <path\n        android:fillColor="${color}"\n        android:pathData="M0,0h108v108h-108z" />\n</vector>\n`;
      writeFileSync(drawableFile, vxml);
    }
    console.log(`  ✓ adaptive background ${color}`);
  } catch {
    console.log('  (keep existing adaptive background color)');
  }

  console.log('Android launcher icons regenerated from logo.png');
}

main().catch((e) => { console.error(e); process.exit(1); });
