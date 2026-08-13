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

  // Adaptive background color: pick the dominant color of the logo.
  try {
    const bg = await sharp(src).resize(1, 1).raw().toBuffer();
    const r = bg[0], g = bg[1], b = bg[2];
    const color = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
    const valuesFile = join(resDir, 'values', 'ic_launcher_background.xml');
    const xml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${color}</color>\n</resources>\n`;
    if (existsSync(valuesFile)) {
      writeFileSync(valuesFile, xml);
    } else {
      // Fall back to writing colors in the same file shape Capacitor uses
      writeFileSync(join(resDir, 'values', 'ic_launcher_background.xml'), xml);
    }
    console.log(`  ✓ adaptive background ${color}`);
  } catch {
    console.log('  (keep existing adaptive background color)');
  }

  console.log('Android launcher icons regenerated from logo.png');
}

main().catch((e) => { console.error(e); process.exit(1); });
