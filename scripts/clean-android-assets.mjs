import { existsSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const target = join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public');

if (!existsSync(target)) {
  console.log('Android assets not present, nothing to clean.');
  process.exit(0);
}

let removed = 0;
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (entry.endsWith('.gz')) {
      unlinkSync(full);
      removed += 1;
    }
  }
};
walk(target);
console.log(`Removed ${removed} .gz files from Android assets.`);