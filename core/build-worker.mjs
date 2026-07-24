// Forward to v2.2.5 root build-worker.mjs for CF Pages compatibility
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await import(pathToFileURL(join(root, 'build-worker.mjs')).href);
