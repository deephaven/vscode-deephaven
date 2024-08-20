import * as vscode from 'vscode';
import { hasStatusCode } from '../util';

/**
 * Check if a given server is running by checking if the `irisapi/irisapi.nocache.js`
 * file is accessible.
 * @param serverUrl
 */
export async function isDheServerRunning(
  serverUrl: vscode.Uri
): Promise<boolean> {
  try {
    return await hasStatusCode(
      new URL('irisapi/irisapi.nocache.js', serverUrl.toString()),
      200
    );
  } catch {
    return false;
  }
}
