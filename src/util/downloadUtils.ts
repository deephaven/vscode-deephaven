import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';
import { TMP_DIR_ROOT } from '../common';
import { Logger } from './Logger';

const logger = new Logger('downloadUtils');

/**
 * Return the path of the temp directory with optional sub directory. If recreate
 * is true, the directory will be deleted and recreated.
 * @param recreate If true, delete and recreate the directory
 * @param subDirectory Optional sub directory to create
 * @returns The path of the temp directory
 */
export function getTempDir(recreate: boolean, subDirectory?: string): string {
  let tempDir = TMP_DIR_ROOT;
  if (subDirectory != null) {
    tempDir = path.join(tempDir, subDirectory);
  }

  if (recreate) {
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch {
      // Ignore if can't delete. Likely doesn't exist
    }
  }

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  return tempDir;
}

/**
 * Require a JS module from a URL. Loads the module in memory and returns its exports
 * Copy / modified from https://github.com/deephaven/deephaven.io/blob/main/tools/run-examples/includeAPI.mjs
 *
 * @param {string} url The URL with protocol to require from. Supports http or https
 * @returns {Promise<string>} Promise which resolves to the module's exports
 */
export async function downloadFromURL(
  url: string,
  retries = 10,
  retryDelay = 1000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    let transporter: typeof http | typeof https;
    if (urlObj.protocol === 'http:') {
      transporter = http;
    } else if (urlObj.protocol === 'https:') {
      transporter = https;
    } else {
      reject(
        `Only http: and https: protocols are supported. Received ${urlObj.protocol}`
      );
      return;
    }

    transporter
      .get(url, { timeout: 5000 }, res => {
        let file = '';
        res.on('data', d => {
          file += d;
        });

        res.on('end', async () => {
          resolve(file);
        });
      })
      .on('timeout', () => {
        logger.error('Failed download of url:', url);
        reject();
      })
      .on('error', e => {
        if (retries > 0) {
          logger.error('Retrying url:', url);
          setTimeout(
            () =>
              downloadFromURL(url, retries - 1, retryDelay).then(
                resolve,
                reject
              ),
            retryDelay
          );
        } else {
          logger.error(
            `Hit retry limit. Stopping attempted include from ${url} with error`
          );
          logger.error(e);
          reject(e);
        }
      });
  });
}
