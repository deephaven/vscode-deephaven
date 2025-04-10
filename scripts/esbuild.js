/* eslint-disable no-console */
const esbuild = require('esbuild-wasm');
const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config({ path: ['.env.local', '.env'] });

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const { DHC_PACKAGES_PATH } = process.env;

const optionalPlugins = [];

// Alias @deephaven/* packages to custom path
if (DHC_PACKAGES_PATH != null) {
  if (!fs.existsSync(DHC_PACKAGES_PATH)) {
    throw new Error(`DHC packages path ${DHC_PACKAGES_PATH} does not exist.`);
  }

  console.log('Aliasing @deephaven/* packages to:', DHC_PACKAGES_PATH);

  optionalPlugins.push({
    name: 'dh-alias-plugin',
    setup(build) {
      build.onResolve({ filter: /^@deephaven\/.*/ }, args => {
        // Resolve all @deephaven/xxx packages to a custom directory
        const aliasPath = path.resolve(
          __dirname,
          DHC_PACKAGES_PATH,
          args.path.replace('@deephaven/', ''),
          'src/index.ts'
        );
        return { path: aliasPath };
      });
    },
  });
}

/**
 * @type {import('esbuild-wasm').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  // Note that background problem matchers define regexes to match the console.log
  // output of `build.onStart` and `build.onEnd`. This is how the debugger knows
  // if background tasks are ready, since there will be no exit code. We are using
  // the recommended `connor4312.esbuild-problem-matchers` extension which provides
  // the `$esbuild-watch` problem matcher. It expects '[watch] build started'
  // and '[watch] build finished' to be explicitly logged to the console by the
  // respective `onStart` and `onEnd` events.
  // See https://github.com/connor4312/esbuild-problem-matchers/blob/main/package.json#L61-L64
  setup(build) {
    build.onStart(() => {
      console.log(`${watch ? '[watch] ' : ''}build started`);
    });
    build.onEnd(result => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`
        );
      });
      console.log(`${watch ? '[watch] ' : ''}build finished`);
    });
  },
};

async function main() {
  const cjsCtxPromise = esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outdir: 'out',
    external: ['esbuild-wasm', 'vscode'],
    logLevel: 'silent',
    plugins: [
      ...optionalPlugins,
      /* this plugin needs to be the last one */
      esbuildProblemMatcherPlugin,
    ],
  });

  const esmWebViewCtxPromise = esbuild.context({
    entryPoints: [
      // Webview resources get referenced from the file system by the webview.
      // Build these separately to allow referencing directly.
      'src/webViews/createQueryView/main.ts',
      'src/webViews/createQueryView/styles.css',
    ],
    bundle: true,
    format: 'esm',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outdir: 'out/webViews/createQueryView',
    external: ['esbuild-wasm', 'vscode'],
    logLevel: 'silent',
    loader: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      '.css': 'copy',
    },
    plugins: [
      /* this plugin needs to be the last one */
      esbuildProblemMatcherPlugin,
    ],
  });

  const [cjsCtx, esmWebViewCtx] = await Promise.all([
    cjsCtxPromise,
    esmWebViewCtxPromise,
  ]);

  if (watch) {
    await Promise.all([cjsCtx.watch(), esmWebViewCtx.watch()]);
  } else {
    await Promise.all([cjsCtx.rebuild(), esmWebViewCtx.rebuild()]);
    await ctx.dispose();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
