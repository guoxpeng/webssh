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

// Node compat modules (CF Workers supports these natively via nodejs_compat_v2)
const nodeCompat = [
  'assert', 'buffer', 'crypto', 'events', 'path', 'process',
  'stream', 'string_decoder', 'util', 'url', 'zlib',
];

// Builtins NOT natively supported → stub them to avoid dynamic require violations
const nodeStubBuiltins = nodeBuiltins.filter(b => !nodeCompat.includes(b));

const workerdCompatPlugin = {
  name: 'workerd-compat',
  setup(build) {
    // Route node compat modules through node: prefix (CF Workers native support)
    build.onResolve({ filter: new RegExp(`^(${nodeCompat.join('|')})$`) }, (args) => ({
      path: `node:${args.path}`, external: true,
    }));
    // Stub unsupported node builtins
    build.onResolve({ filter: new RegExp(`^(${nodeStubBuiltins.join('|')})$`) }, (args) => ({
      path: `node-stub-${args.path}`, namespace: 'node-stub',
    }));
    build.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, external: true }));
    build.onResolve({ filter: /\.node$/ }, () => ({ path: 'noop', namespace: 'native-addon-stub' }));
    build.onLoad({ filter: /.*/, namespace: 'node-stub' }, (args) => {
      const name = args.path.replace('node-stub-', '');
      return { contents: `export default {};`, loader: 'js' };
    });
    build.onLoad({ filter: /.*/, namespace: 'native-addon-stub' }, () => ({ contents: 'export default undefined;', loader: 'js' }));
  },
};

// Replace ssh2/lib/agent with a stub - CF Workers can't do dynamic require('node:net')
const agentStub = {
  name: 'ssh2-agent-stub',
  setup(build) {
    build.onResolve({ filter: /^\.\/agent(\.js)?$/ }, (args) => {
      if (args.importer && args.importer.replace(/\\/g, '/').includes('ssh2')) {
        return { path: join(__dirname, 'worker/shims/ssh2-agent.js') };
      }
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
