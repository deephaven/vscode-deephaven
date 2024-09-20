import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EnterpriseDhType as DheType } from '@deephaven-enterprise/jsapi-types';
import { polyfillDh } from './polyfill';
import { downloadFromURL, hasStatusCode } from './serverUtils';

/**
 * Check if a given server is running by checking if the `irisapi/irisapi.nocache.js`
 * file is accessible.
 * @param serverUrl
 */
export async function isDheServerRunning(serverUrl: URL): Promise<boolean> {
  try {
    return await hasStatusCode(
      new URL('irisapi/irisapi.nocache.js', serverUrl.toString()),
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
export async function initDheApi(
  serverUrl: URL,
  storageDir: string
): Promise<DheType> {
  polyfillDh();
  return getDhe(serverUrl, true, storageDir);
}

declare global {
  export const iris: DheType;
}

async function getDhe(
  serverUrl: URL,
  download: boolean,
  storageDir: string
): Promise<DheType> {
  const dheFilePath = path.join(storageDir, 'irisapi.nocache.js');

  if (download) {
    const dhe = await downloadFromURL(
      path.join(serverUrl.toString(), 'irisapi/irisapi.nocache.js')
    );

    fs.writeFileSync(dheFilePath, dhe);
  }

  require(dheFilePath);

  return iris;
}
