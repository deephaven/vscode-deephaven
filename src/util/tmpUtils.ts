import * as fs from 'node:fs';
import * as path from 'node:path';
import { TMP_DIR_ROOT } from '../common';

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
