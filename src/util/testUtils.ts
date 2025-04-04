import type * as vscode from 'vscode';
export const bitValues = [0, 1] as const;
export const boolValues = [true, false] as const;

/**
 * Generate a 2 dimensional array of all possible combinations of the given value
 * lists.
 *
 * e.g.
 * matrix([1, 2], ['a', 'b']) => [[1, 'a'], [1, 'b'], [2, 'a'], [2, 'b']]
 *
 * matrix([1, 2], ['a', 'b', 'c']) => [
 *  [1, 'a'], [1, 'b'], [1, 'c'],
 *  [2, 'a'], [2, 'b'], [2, 'c'],
 * ]
 *
 * @param args Value lists
 * @returns 2D array of all possible combinations
 */
export function matrix<
  TArgs extends (unknown[] | readonly unknown[])[],
  TReturn extends { [P in keyof TArgs]: TArgs[P][number] },
>(...args: TArgs): TReturn[] {
  const [first, ...rest] = args;

  if (rest.length === 0) {
    return first.map(value => [value] as TReturn);
  }

  // recursively call matrix
  const restMatrix = matrix(...rest);

  return first.flatMap(value =>
    restMatrix.map(values => [value, ...values] as TReturn)
  );
}

function lineAt(this: vscode.TextDocument, line: number): vscode.TextLine;
function lineAt(
  this: vscode.TextDocument,
  position: vscode.Position
): vscode.TextLine;
function lineAt(
  this: vscode.TextDocument,
  lineOrPosition: number | vscode.Position
): vscode.TextLine {
  const lineNumber =
    typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;

  return mockT<vscode.TextLine>({
    lineNumber,
    text: this.getText().split('\n')[lineNumber] ?? '',
  });
}

/** Mock a `vscode.TextDocument` */
export function mockDocument(
  fileName: string,
  version: number = 1,
  content = ''
): vscode.TextDocument {
  return mockT<vscode.TextDocument>({
    fileName,
    uri: mockUri(`file://mock/path/${fileName}`),
    version,
    getText: () => content,
    lineAt,
  });
}

/** Mock an object providing partial properties */
export function mockT<T>(partial: Partial<T>): T {
  return partial as T;
}

/** Mock a `vscode.Uri` */
export function mockUri(path: string): vscode.Uri {
  return mockT<vscode.Uri>({
    path,
    toString: () => path,
  });
}
