import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const nodeBuiltins = [
  'assert', 'buffer', 'child_process', 'crypto', 'dns', 'events',
  'fs', 'http', 'https', 'net', 'os', 'path', 'process', 'stream',
  'tls', 'url', 'util', 'zlib',
];

const workerdCompatPlugin = {
  name: 'workerd-compat',
  setup(build) {
    build.onResolve({ filter: new RegExp(`^(${nodeBuiltins.join('|')})$`) }, (args) => ({
      path: `node:${args.path}`, external: true,
    }));
    build.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, external: true }));
    build.onResolve({ filter: /\.node$/ }, () => ({ path: 'noop', namespace: 'native-addon-stub' }));
    build.onLoad({ filter: /.*/, namespace: 'native-addon-stub' }, () => ({ contents: 'export default undefined;', loader: 'js' }));
  },
};

// Replace ssh2/lib/agent with a stub - CF Workers can't do dynamic require('node:net')
const agentStub = {
  name: 'ssh2-agent-stub',
  setup(build) {
    // Intercept require('./agent') from ssh2/lib/index.js
    build.onResolve({ filter: /\/ssh2\/lib\/agent\.js$/ }, () => {
      return { path: join(__dirname, 'worker/shims/ssh2-agent.js') };
    });
  },
};

await esbuild.build({
  entryPoints: ['core/worker/index.mjs'],
  bundle: true,
  outfile: 'dist/worker/index.mjs',
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['workerd', 'worker', 'import', 'require'],
  external: ['cloudflare:*'],
  plugins: [workerdCompatPlugin, agentStub],
  logLevel: 'info',
});

// Copy frontend assets to dist/client/ for wrangler assets
const clientDir = join('dist', 'client');
if (!existsSync(clientDir)) mkdirSync(clientDir, { recursive: true });

const distDir = join('dist');
for (const entry of readdirSync(distDir)) {
  if (entry === 'worker' || entry === 'client') continue;
  const src = join(distDir, entry);
  const dest = join(clientDir, entry);
  cpSync(src, dest, { recursive: true, force: true });
}

console.log('Frontend assets copied to dist/client/');

// Copy worker to dist/ for Pages _worker.js compatibility
const workerPath = join('dist', 'worker', 'index.mjs');
const pagesWorkerPath = join('dist', '_worker.js');
if (existsSync(workerPath)) {
  cpSync(workerPath, pagesWorkerPath);
  console.log('Worker also copied to dist/_worker.js (Pages compatible)');
}
