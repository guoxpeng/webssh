// Build _worker.js for CF Pages using esbuild with proper compat handling
import * as esbuild from 'esbuild';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// CF Workers node compat modules (available via nodejs_compat_v2) → externalize
const nodeCompat = [
  'assert', 'buffer', 'crypto', 'events', 'path', 'process',
  'stream', 'string_decoder', 'util', 'url', 'zlib',
];

// Node builtins NOT available in CF Workers → stub them
const nodeStubBuiltins = [
  'child_process', 'dns', 'fs', 'http', 'https', 'net', 'os', 'tls',
];

const outDir = join('dist', 'client');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: ['core/worker/index.mjs'],
  bundle: true,
  outfile: join(outDir, '_worker.js'),
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['workerd', 'worker', 'import'],
  external: ['cloudflare:*'],
  logLevel: 'info',
  plugins: [{
    name: 'cf-worker',
    setup(build) {
      // CF-native node modules → node: prefix (available via nodejs_compat_v2)
      build.onResolve({ filter: new RegExp(`^(${nodeCompat.join('|')})$`) }, (args) => ({
        path: `node:${args.path}`, external: true,
      }));
      build.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, external: true }));
      // Unsupported builtins → empty stub
      build.onResolve({ filter: new RegExp(`^(${nodeStubBuiltins.join('|')})$`) }, () => ({
        path: 'stub', namespace: 'node-stub',
      }));
      // Native .node addons → stub
      build.onResolve({ filter: /\.node$/ }, () => ({ path: 'stub', namespace: 'node-stub' }));
      build.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({
        contents: 'export default {};',
        loader: 'js',
      }));
      // Stub ssh2/lib/agent.js (uses dynamic require of unsupported builtins)
      build.onResolve({ filter: /^\.\/agent(\.js)?$/ }, (args) => {
        if (args.importer && args.importer.replace(/\\/g, '/').includes('ssh2')) {
          return { path: join(__dirname, 'worker/shims/ssh2-agent.js') };
        }
      });
    },
  }],
});

console.log('Worker built to dist/client/_worker.js');
