// Build Cloudflare Pages _worker.js (wrangler handles node:compat properly)
import { cpSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure dist/client exists
const clientDir = join('dist', 'client');
if (!existsSync(clientDir)) mkdirSync(clientDir, { recursive: true });

// Use wrangler to build the worker with proper CF compat (avoids __require node:net issues)
// Output _worker.js directly into dist/client/ for Pages
try {
  execSync('npx wrangler deploy --dry-run --outdir dist/client --config wrangler.toml', {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
  });
} catch (e) {
  // If dry-run fails, try building via esbuild as fallback
  console.error('wrangler dry-run failed, trying direct build...');
  const esbuild = await import('esbuild');
  await esbuild.build({
    entryPoints: ['core/worker/index.mjs'],
    bundle: true,
    outfile: 'dist/client/_worker.js',
    format: 'esm',
    target: 'es2022',
    platform: 'neutral',
    external: ['cloudflare:*'],
    logLevel: 'info',
  });
}

console.log('Worker built to dist/client/_worker.js');
