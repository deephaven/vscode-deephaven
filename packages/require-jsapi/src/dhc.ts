import * as fs from 'node:fs';
import * as path from 'node:path';
import type { dh as DhType } from '@deephaven/jsapi-types';
import { polyfillDh } from './polyfill';
import { downloadFromURL, hasStatusCode } from './serverUtils';

export const AUTH_HANDLER_TYPE_DHE =
  'io.deephaven.enterprise.dnd.authentication.DheAuthenticationHandler';

/**
 * Check if a given server is running by checking if the `dh-core.js` file is
 * accessible.
 * @param serverUrl
 */
export async function isDhcServerRunning(serverUrl: URL): Promise<boolean> {
  try {
    return await hasStatusCode(
      new URL('jsapi/dh-core.js', serverUrl.toString()),
      [200, 204]
    );
  } catch {
    return false;
  }
}

/**
 * Polyfill browser apis, download jsapi to a local directory, and return the
 * default export.
 * @param serverUrl URL of the server to download the jsapi from
 * @param storageDir Directory to save the downloaded jsapi
 * @returns Default export of downloaded jsapi
 */
export async function initDhcApi(
  serverUrl: URL,
  storageDir: string
): Promise<typeof DhType> {
  polyfillDh();
  return getDhc(serverUrl, true, storageDir);
}

/**
 * Download and import the Deephaven JS API from the server.
 * 1. Download `dh-internal.js` and `dh-core.js` from the server and save them
 * to `out/tmp` as `.cjs` files (renaming of import / export to cjs compatible code).
 * 2. requires `dh-core.mjs` and return the default export.
 * Copy / modified from https://github.com/deephaven/deephaven.io/blob/main/tools/run-examples/includeAPI.mjs
 * NOTE: there is a limitation in current vscode extension apis such that es6 imports are not supported. This is why
 * we have to save / convert to .cjs.
 * See https://stackoverflow.com/questions/70620025/how-do-i-import-an-es6-javascript-module-in-my-vs-code-extension-written-in-type
 */
async function getDhc(
  serverUrl: URL,
  download: boolean,
  storageDir: string
): Promise<typeof DhType> {
  if (download) {
    const dhInternal = await downloadFromURL(
      path.join(serverUrl.toString(), 'jsapi/dh-internal.js')
    );
    // Convert to .cjs
    fs.writeFileSync(
      path.join(storageDir, 'dh-internal.cjs'),
      dhInternal.replace(
        `export{__webpack_exports__dhinternal as dhinternal};`,
        `module.exports={dhinternal:__webpack_exports__dhinternal};`
      )
    );

    const dhCore = await downloadFromURL(
      path.join(serverUrl.toString(), 'jsapi/dh-core.js')
    );
    fs.writeFileSync(
      path.join(storageDir, 'dh-core.cjs'),
      // Convert to .cjs
      dhCore
        .replace(
          `import {dhinternal} from './dh-internal.js';`,
          `const {dhinternal} = require("./dh-internal.cjs");`
        )
        .replace(`export default dh;`, `module.exports = dh;`)
    );
  }

  return require(path.join(storageDir, 'dh-core.cjs'));
}
