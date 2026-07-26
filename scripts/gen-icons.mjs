import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pub = join(root, 'web', 'public');
const src = join(root, 'logo.png');

async function main() {
  // 1. Browser tab SVG favicon (64x64 PNG embedded in SVG)
  const png64 = await sharp(src).resize(64, 64).png().toBuffer();
  const b64 = png64.toString('base64');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><image href="data:image/png;base64,${b64}" width="64" height="64"/></svg>`;
  writeFileSync(join(pub, 'icon.svg'), svg);
  console.log('✓ web/public/icon.svg');

  // 3. PWA icons
  await sharp(src).resize(192, 192).png().toFile(join(pub, 'icon-192.png'));
  console.log('✓ web/public/icon-192.png');
  await sharp(src).resize(512, 512).png().toFile(join(pub, 'icon-512.png'));
  console.log('✓ web/public/icon-512.png');

  // 4. Apple touch icon
  await sharp(src).resize(180, 180).png().toFile(join(pub, 'apple-touch-icon.png'));
  console.log('✓ web/public/apple-touch-icon.png');

  // 5. Update logo.jpg
  await sharp(src).resize(400, 400).jpeg({ quality: 85 }).toFile(join(pub, 'logo.jpg'));
  console.log('✓ web/public/logo.jpg');

  // 6. Update manifest.json
  const manifest = JSON.parse(readFileSync(join(pub, 'manifest.json'), 'utf8'));
  manifest.icons = [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
  ];
  writeFileSync(join(pub, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('✓ web/public/manifest.json');

  // 7. Generate a multi-size ICO for Windows (32x32, 48x48, 128x128, 256x256)
  const png32 = await sharp(src).resize(32, 32).png().toBuffer();
  const png48 = await sharp(src).resize(48, 48).png().toBuffer();
  const png128 = await sharp(src).resize(128, 128).png().toBuffer();
  const png256 = await sharp(src).resize(256, 256).png().toBuffer();
  const sizes = [32, 48, 128, 256];
  const iconDatas = [png32, png48, png128, png256];
  const count = sizes.length;
  const header2 = Buffer.alloc(6);
  header2.writeUInt16LE(0, 0);
  header2.writeUInt16LE(1, 2);
  header2.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + count * 16;
  for (let i = 0; i < count; i++) {
    const e = Buffer.alloc(16);
    const s = sizes[i] >= 256 ? 0 : sizes[i];
    e.writeUInt8(s, 0);
    e.writeUInt8(s, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(iconDatas[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += iconDatas[i].length;
    entries.push(e);
  }
  const icoMulti = Buffer.concat([header2, ...entries, ...iconDatas]);
  writeFileSync(join(root, 'win', 'icon.ico'), icoMulti);
  console.log('✓ win/icon.ico (multi-size, updated)');
}

main().catch(console.error);
