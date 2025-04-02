/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Mock `vscode` module. Note that `vi.mock('vscode')` has to be explicitly
 * called in any test module needing to use this mock. It will not be loaded
 * automatically. This module also needs to be located under the `__mocks__`
 * directory under the project root to be found when `vi.mock('vscode')` is
 * called.
 */
import { vi } from 'vitest';

export class EventEmitter {
  fire = vi.fn().mockName('fire');
}

export class Position {
  constructor(line: number, character: number) {
    this.line = line;
    this.character = character;
  }

  readonly line: number;
  readonly character: number;
}

export enum QuickPickItemKind {
  Separator = -1,
  Default = 0,
}

export class Range {
  constructor(start: Position, end: Position);
  constructor(
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number
  );
  constructor(
    ...args: [Position, Position] | [number, number, number, number]
  ) {
    if (args.length === 2) {
      this.start = args[0];
      this.end = args[1];
    } else {
      const [startLine, startCharacter, endLine, endCharacter] = args;
      this.start = new Position(startLine, startCharacter);
      this.end = new Position(endLine, endCharacter);
    }
  }

  readonly start: Position;
  readonly end: Position;
}

export const ThemeColor = vi
  .fn()
  .mockName('ThemeColor')
  .mockImplementation((id: string) => ({
    id,
  }));

export const ThemeIcon = vi
  .fn()
  .mockName('ThemeIcon')
  .mockImplementation((id: string, color?: typeof ThemeColor) => ({
    id,
    color,
  }));

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export const window = {};

export const workspace = {
  getConfiguration: vi
    .fn()
    .mockName('getConfiguration')
    .mockReturnValue(new Map()),
  onDidChangeTextDocument: vi.fn().mockName('onDidChangeTextDocument'),
  onDidCloseTextDocument: vi.fn().mockName('onDidCloseTextDocument'),
};
