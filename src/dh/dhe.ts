import { hasStatusCode } from '../util';

/**
 * Check if a given server is running by checking if the `irisapi/irisapi.nocache.js`
 * file is accessible.
 * @param serverUrl
 */
export async function isDheServerRunning(serverUrl: string): Promise<boolean> {
  try {
    return await hasStatusCode(
      new URL('irisapi/irisapi.nocache.js', serverUrl),
      200
    );
  } catch {
    return false;
  }
}
