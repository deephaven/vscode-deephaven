import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  EnterpriseClient,
  EnterpriseDhType as DheType,
  QueryInfo,
  Table,
  DeserializedRowData,
  Row,
  Column,
} from './dhe-types';
import {
  downloadFromURL,
  getTempDir,
  polyfillDh,
  urlToDirectoryName,
} from '../util';

declare global {
  // TODO: Whenever we have ES6 / CommonJS jsapi-types we can hopefully do away
  // with defining iris on the global object
  export const iris: DheType;
}

/**
 * Initialize an `iris` jsapi instance.
 * 1. Polyfill the `iris` jsapi
 * 2. Download the `iris` jsapi from the server to a tmp location and load it
 * @param serverUrl
 * @returns
 */
export async function initDheApi(serverUrl: string): Promise<DheType> {
  polyfillDh();
  return getDhe(serverUrl, true);
}

/**
 * Download the `iris` jsapi from the server to a tmp location, load the module,
 * and return it.
 * @param serverUrl
 * @param download
 * @returns The `iris` jsapi module
 */
export async function getDhe(
  serverUrl: string,
  download: boolean
): Promise<DheType> {
  const tmpDir = getTempDir(false, urlToDirectoryName(serverUrl));

  if (download) {
    const dhe = await downloadFromURL(
      path.join(serverUrl, 'irisapi/irisapi.nocache.js')
    );
    fs.writeFileSync(path.join(tmpDir, 'irisapi.nocache.js'), dhe);
  }

  require(path.join(tmpDir, 'irisapi.nocache.js'));

  return iris;
}

/**
 * Get the websocket URL based on the given server url.
 * @param serverUrl
 */
export function getWsUrl(serverUrl: string): string {
  const url = new URL('/socket', serverUrl);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else {
    url.protocol = 'wss:';
  }
  return url.href;
}
