import * as esbuild from 'esbuild';

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
    build.onLoad({ filter: /.*/, namespace: 'native-addon-stub' }, () => ({ contents: 'module.exports = undefined;', loader: 'js' }));
  },
};

await esbuild.build({
  entryPoints: ['worker/index.mjs'],
  bundle: true,
  outfile: 'dist/worker/index.mjs',
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['workerd', 'worker', 'import', 'require'],
  external: ['cloudflare:*'],
  plugins: [workerdCompatPlugin],
  logLevel: 'info',
});
