/**
 * This module contains test utils that should only be consumed by `.spec.ts`
 * files, but since it's not a `.spec.ts` file, it is special cased to exclude
 * from the extension build (tsconfig.json) and include in the unit test build
 * (tsconfig.unit.json). It shouldn't be imported by the extension code or have
 * any dependencies on the extension code.
 */

import { expect, vi } from 'vitest';
import type * as vscode from 'vscode';
export const bitValues = [0, 1] as const;
export const boolValues = [true, false] as const;

export type MessageHandler<TData> = (
  event: Partial<MessageEvent<TData>>
) => unknown;

/**
 * Return last registered event handler to a given registration function for a
 * given event type. Assumes that the registration function has been mocked or
 * spied on.
 * @param type event type to filter on
 * @param addEventListener the mocked event registration function
 * @returns the last registered event handler for the given event type. Throws
 * if none found.
 */
export function getLastEventListener<
  TEventType extends string,
  TEventFn extends (
    eventType: TEventType,
    listener: (...args: any[]) => any
  ) => void,
>(type: TEventType, addEventListener: TEventFn): Parameters<TEventFn>[1] {
  const calls = vi
    .mocked(addEventListener)
    .mock.calls.filter(([callType]) => callType === type);

  expect(calls.length).toBeGreaterThan(0);

  return calls.at(-1)![1];
}

/**
 * Return last registered event handler for 'message' event. Assumes that
 * `window.addEventListener` has been mocked or spied on.
 */
export function getLastMessageHandler<TData>(): MessageHandler<TData> {
  const messageCalls = vi
    .mocked(window.addEventListener<'message'>)
    .mock.calls.filter(([type]) => type === 'message');

  expect(messageCalls.length).toBeGreaterThan(0);

  return messageCalls.at(-1)![1] as MessageHandler<TData>;
}

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
