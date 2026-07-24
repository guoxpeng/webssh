import * as esbuild from 'esbuild';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const outDir = join('dist', 'client');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

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

Buffer.hasOwnProperty = function (prop) {
  return Object.prototype.hasOwnProperty.call(Buffer, prop);
};
Object.defineProperty(Buffer, 'hasOwnProperty', { enumerable: false });

if (Buffer.prototype) {
  Buffer.prototype.hasOwnProperty = function (prop) {
    return Object.prototype.hasOwnProperty.call(this, prop);
  };
}

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
  throw new Error('[webssh worker] Cannot require("' + id + '") in CF Workers');
};
`;

await esbuild.build({
  entryPoints: ['core/worker/index.mjs'],
  bundle: true,
  outfile: join(outDir, '_worker.js'),
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
      build.onResolve({ filter: /\.node$/ }, () => ({ path: 'stub', namespace: 'node-stub' }));
      build.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({
        contents: 'export default {};',
        loader: 'js',
      }));
      const bareBuiltins = /^(assert|buffer|child_process|crypto|dns|events|fs|http|https|net|os|path|stream|string_decoder|tls|url|util|zlib|querystring|punycode)$/;
      build.onResolve({ filter: bareBuiltins }, (args) => ({
        path: args.path,
        external: true,
      }));
      build.onResolve({ filter: /^stream$/ }, () => ({
        path: 'node:stream',
        external: true,
      }));
      build.onResolve({ filter: /^\.\/agent(\.js)?$/, namespace: 'file' }, (args) => {
        if (args.importer && args.importer.replace(/\\/g, '/').includes('ssh2')) {
          return { path: join(__dirname, 'worker/shims/ssh2-agent.js') };
        }
      });
    },
  }],
});

console.log('Worker built to dist/client/_worker.js');
