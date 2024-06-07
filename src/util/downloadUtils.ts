import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';

export function getTempDir(recreate = false) {
  const tempDir = path.join(__dirname, 'tmp');

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
        console.error('Failed download of url:', url);
        reject();
      })
      .on('error', e => {
        if (retries > 0) {
          console.error('Retrying url:', url);
          setTimeout(
            () =>
              downloadFromURL(url, retries - 1, retryDelay).then(
                resolve,
                reject
              ),
            retryDelay
          );
        } else {
          console.error(
            `Hit retry limit. Stopping attempted include from ${url} with error`
          );
          console.error(e);
          reject();
        }
      });
  });
}
