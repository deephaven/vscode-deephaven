import path from 'node:path';

export const WS_PATH = path.resolve(__dirname, '..', '..', 'test-ws/');
export const SIMPLE_TICKING_MD = createFileInfo('simple_ticking.md');
export const SIMPLE_TICKING3_PY = createFileInfo('simple_ticking3.py');
export const TEST_GROOVY = createFileInfo('test.groovy');
export const TEST_TXT = createFileInfo('test.txt');

/** Create name + path info from a given name. */
function createFileInfo<TName extends string>(
  name: TName
): { name: TName; path: string } {
  return {
    name,
    path: path.join(WS_PATH, name),
  };
}
