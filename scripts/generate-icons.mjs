import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';

function crc32(buf) {
  let c = 0xffffffff;
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let k = n;
    for (let i = 0; i < 8; i++) k = k & 1 ? 0xedb88320 ^ (k >>> 1) : k >>> 1;
    table[n] = k;
  }
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.concat([t, data]);
  const crcVal = crc32(crcBuf);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crcVal);
  return Buffer.concat([len, t, data, crc]);
}

function createPNG(width, height, r, g, b) {
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);
  const cx = width / 2, cy = height / 2;
  const radius = Math.min(width, height) * 0.42;
  const innerR = radius * 0.55;
  for (let y = 0; y < height; y++) {
    const row = y * rowSize;
    rawData[row] = 0;
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = row + 1 + x * 4;
      if (dist < innerR) {
        rawData[offset] = 255; rawData[offset+1] = 255; rawData[offset+2] = 255; rawData[offset+3] = 255;
      } else if (dist < radius) {
        const edge = (dist - innerR) / (radius - innerR);
        const pr = Math.round(r + (255 - r) * (1 - edge));
        const pg = Math.round(g + (255 - g) * (1 - edge));
        const pb = Math.round(b + (255 - b) * (1 - edge));
        rawData[offset] = pr; rawData[offset+1] = pg; rawData[offset+2] = pb; rawData[offset+3] = 255;
      } else {
        rawData[offset] = r; rawData[offset+1] = g; rawData[offset+2] = b; rawData[offset+3] = 255;
      }
    }
  }
  const compressed = deflateSync(rawData, { level: 9 });

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public', { recursive: true });

const sizes = [192, 512, 180];
const labels = ['icon-192', 'icon-512', 'apple-touch-icon'];
for (let i = 0; i < sizes.length; i++) {
  const s = sizes[i];
  const png = createPNG(s, s, 79, 70, 229);
  writeFileSync(`public/${labels[i]}.png`, png);
  console.log(`Generated public/${labels[i]}.png (${s}x${s})`);
}
console.log('Done!');
