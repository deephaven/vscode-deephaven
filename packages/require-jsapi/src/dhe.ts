import { hasStatusCode } from './serverUtils';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  EnterpriseDhType as DheType,
  EnterpriseClient,
} from '@deephaven-enterprise/jsapi-types';

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

export async function createDheClient(
  dhe: DheType,
  serverUrl: URL
): Promise<EnterpriseClient> {
  const dheClient = new dhe.Client(serverUrl.toString());

  return new Promise(resolve => {
    const unsubscribe = dheClient.addEventListener(
      dhe.Client.EVENT_CONNECT,
      () => {
        unsubscribe();
        resolve(dheClient);
      }
    );
  });
}

export async function initDheApi(serverUrl: URL): Promise<DheType> {
  polyfillDh();
  return getDhe(serverUrl, true);
}

declare global {
  export const iris: DheType;
}

export async function getDhe(
  serverUrl: URL,
  download: boolean
): Promise<DheType> {
  const tmpDir = getTempDir(false, urlToDirectoryName(serverUrl));
  const dheFilePath = path.join(tmpDir, 'irisapi.nocache.js');

  if (download) {
    const dhe = await downloadFromURL(
      path.join(serverUrl.toString(), 'irisapi/irisapi.nocache.js')
    );

    fs.writeFileSync(dheFilePath, dhe);
  }

  require(dheFilePath);

  return iris;
}

export async function getDheAuthToken(
  client: EnterpriseClient
): Promise<{ type: string; token: string }> {
  const token = await client.createAuthToken('RemoteQueryProcessor');
  return {
    type: 'io.deephaven.proto.auth.Token',
    token,
  };
}

export function getWsUrl(serverUrl: URL): URL {
  const url = new URL('/socket', serverUrl);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else {
    url.protocol = 'wss:';
  }
  return url;
}
