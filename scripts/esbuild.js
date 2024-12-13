/* eslint-disable no-console */
const esbuild = require('esbuild-wasm');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

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
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['esbuild-wasm', 'vscode'],
    logLevel: 'silent',
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
