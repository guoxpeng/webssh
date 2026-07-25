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

const requireShimBanner = `
import * as __shim_assert from 'node:assert';
import * as __shim_buffer from 'node:buffer';
import * as __shim_crypto from 'node:crypto';
import * as __shim_events from 'node:events';
import * as __shim_path from 'node:path';
import * as __shim_stream from 'node:stream';
import * as __shim_string_decoder from 'node:string_decoder';
import * as __shim_url from 'node:url';
import * as __shim_util from 'node:util';
import * as __shim_zlib from 'node:zlib';

const Buffer = __shim_buffer.Buffer;
globalThis.Buffer = Buffer;
globalThis.Duplex = __shim_stream.Duplex;
globalThis.Readable = __shim_stream.Readable;
globalThis.Writable = __shim_stream.Writable;
globalThis.Transform = __shim_stream.Transform;

var __CF_nodeModules = {
  'assert': __shim_assert, 'node:assert': __shim_assert,
  'buffer': { Buffer, ...__shim_buffer },
  'node:buffer': { Buffer, ...__shim_buffer },
  'crypto': __shim_crypto, 'node:crypto': __shim_crypto,
  'events': __shim_events, 'node:events': __shim_events,
  'path': __shim_path, 'node:path': __shim_path,
  'stream': __shim_stream, 'node:stream': __shim_stream,
  'string_decoder': __shim_string_decoder, 'node:string_decoder': __shim_string_decoder,
  'url': __shim_url, 'node:url': __shim_url,
  'util': __shim_util, 'node:util': __shim_util,
  'zlib': __shim_zlib, 'node:zlib': __shim_zlib,
  'child_process': {}, 'dns': {}, 'fs': {}, 'net': {}, 'os': {}, 'tls': {},
  'http': { Agent: class Agent {} }, 'https': { Agent: class Agent {} },
};

globalThis.require = function require(id) {
  if (__CF_nodeModules[id] !== undefined) return __CF_nodeModules[id];
  throw new Error('[webssh worker] Cannot require("' + id + '") in Cloudflare Workers');
};
`;

const shimDir = join(__dirname, 'worker/shims');

await esbuild.build({
  entryPoints: ['worker/index.mjs'],
  bundle: true,
  outfile: 'dist/worker/index.mjs',
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  mainFields: ['module', 'main'],
  external: ['cloudflare:*', 'node:*'],
  banner: { js: requireShimBanner },
  logLevel: 'info',
  plugins: [{
    name: 'cf-worker',
    setup(build) {
      // Stub .node native addons
      build.onResolve({ filter: /\.node$/ }, () => ({ path: 'stub', namespace: 'node-stub' }));
      build.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({
        contents: 'export default {};',
        loader: 'js',
      }));
      // Stub cpu-features native addon
      build.onResolve({ filter: /^cpu-features$/ }, () => ({
        path: join(shimDir, 'cpu-features/index.js'),
        namespace: 'file',
      }));
      // Stub ssh2's agent module
      build.onResolve({ filter: /^\.\/agent(\.js)?$/, namespace: 'file' }, (args) => {
        if (args.importer && args.importer.replace(/\\/g, '/').includes('ssh2')) {
          return { path: join(shimDir, 'ssh2-agent.js') };
        }
      });
      // Stub ssh2's SFTP protocol module
      build.onResolve({ filter: /protocol[/\\\\]SFTP/ }, (args) => {
        if (args.importer && args.importer.replace(/\\/g, '/').includes('ssh2')) {
          return { path: join(shimDir, 'sftp-stub.mjs') };
        }
      });
      // Bare node builtins → node: prefix
      build.onResolve({ filter: new RegExp(`^(${nodeBuiltins.join('|')})$`) }, (args) => ({
        path: `node:${args.path}`, external: true,
      }));
    },
  }],
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
