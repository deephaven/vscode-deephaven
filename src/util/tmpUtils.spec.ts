import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getTempDir } from './tmpUtils';
import { TMP_DIR_ROOT } from '../common';

vi.mock('vscode');
vi.mock('node:fs');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getTempDir', () => {
  it.each([
    [true, undefined, TMP_DIR_ROOT],
    [true, 'subDirectory', path.join(TMP_DIR_ROOT, 'subDirectory')],
    [false, undefined, TMP_DIR_ROOT],
    [false, 'subDirectory', path.join(TMP_DIR_ROOT, 'subDirectory')],
  ])(
    'should create temp directory if it does not already exist: %s, %s',
    (dirExists, subDirectory, expectedPath) => {
      vi.mocked(fs.existsSync).mockReturnValue(dirExists);
      getTempDir({ recreate: true, subDirectory });

      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);

      if (dirExists) {
        expect(fs.mkdirSync).not.toHaveBeenCalled();
      } else {
        expect(fs.mkdirSync).toHaveBeenCalledWith(expectedPath);
      }
    }
  );

  it.each([
    [true, undefined, TMP_DIR_ROOT],
    [true, 'subDirectory', path.join(TMP_DIR_ROOT, 'subDirectory')],
    [false, undefined, TMP_DIR_ROOT],
    [false, 'subDirectory', path.join(TMP_DIR_ROOT, 'subDirectory')],
  ])(
    'should remove directory if recreate is true: %s, %s, %s',
    (recreate, subDirectory, expectedPath) => {
      getTempDir({ recreate, subDirectory });

      if (recreate) {
        expect(fs.rmSync).toHaveBeenCalledWith(expectedPath, {
          recursive: true,
        });
      } else {
        expect(fs.rmSync).not.toHaveBeenCalled();
      }
    }
  );
});
