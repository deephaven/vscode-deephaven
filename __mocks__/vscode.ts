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

export class MarkdownString {
  constructor(value?: string, supportThemeIcons?: boolean) {
    this.value = value ?? '';
    this.supportThemeIcons = supportThemeIcons ?? false;
  }

  value: string;
  supportThemeIcons?: boolean;
}

export class Position {
  constructor(line: number, character: number) {
    this.line = line;
    this.character = character;
  }

  readonly line: number;
  readonly character: number;

  /**
   * Check if this position is before `other`.
   *
   * @param other A position.
   * @returns `true` if position is on a smaller line
   * or on the same line on a smaller character.
   */
  isBefore(other: Position): boolean {
    return (
      this.line < other.line ||
      (this.line === other.line && this.character < other.character)
    );
  }

  /**
   * Check if this position is after `other`.
   *
   * @param other A position.
   * @returns `true` if position is on a greater line
   * or on the same line on a greater character.
   */
  isAfter(other: Position): boolean {
    return (
      this.line > other.line ||
      (this.line === other.line && this.character > other.character)
    );
  }

  /**
   * Check if this position is equal to `other`.
   *
   * @param other A position.
   * @returns `true` if the line and character of the given position are equal to
   * the line and character of this position.
   */
  isEqual(other: Position): boolean {
    return this.line === other.line && this.character === other.character;
  }
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

  contains(position: Position): boolean {
    return (
      (this.start.line < position.line ||
        (this.start.line === position.line &&
          this.start.character <= position.character)) &&
      (this.end.line > position.line ||
        (this.end.line === position.line &&
          this.end.character >= position.character))
    );
  }
}

export class Selection {
  constructor(anchor: Position, active: Position);
  constructor(
    anchorLine: number,
    anchorCharacter: number,
    activeLine: number,
    activeCharacter: number
  );
  constructor(
    ...args: [Position, Position] | [number, number, number, number]
  ) {
    if (args.length === 2) {
      this.anchor = args[0];
      this.active = args[1];
    } else {
      this.anchor = new Position(args[0], args[1]);
      this.active = new Position(args[2], args[3]);
    }

    const [start, end] = this.anchor.isBefore(this.active)
      ? [this.anchor, this.active]
      : [this.active, this.anchor];

    this.start = start;
    this.end = end;
  }

  readonly start: Position;
  readonly end: Position;

  anchor: Position;
  active: Position;
}

export class ThemeColor {
  constructor(public id: string) {}
}

export class ThemeIcon {
  constructor(
    public id: string,
    public color?: ThemeColor
  ) {}
}

export enum TreeItemCheckboxState {
  Unchecked = 0,
  Checked = 1,
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export const window = {
  onDidChangeActiveColorTheme: vi.fn().mockName('onDidChangeActiveColorTheme'),
  onDidReceiveMessage: vi.fn().mockName('onDidReceiveMessage'),
  registerFileDecorationProvider: vi
    .fn()
    .mockName('registerFileDecorationProvider'),
  showInputBox: vi.fn().mockName('showInputBox'),
};

export const workspace = {
  asRelativePath: vi.fn().mockName('asRelativePath'),
  createFileSystemWatcher: vi
    .fn()
    .mockName('createFileSystemWatcher')
    .mockReturnValue({
      onDidCreate: vi.fn().mockName('onDidCreate'),
      onDidDelete: vi.fn().mockName('onDidDelete'),
    }),
  getConfiguration: vi
    .fn()
    .mockName('getConfiguration')
    .mockReturnValue(new Map()),
  openTextDocument: vi.fn().mockName('openTextDocument'),
  onDidChangeTextDocument: vi.fn().mockName('onDidChangeTextDocument'),
  onDidCloseTextDocument: vi.fn().mockName('onDidCloseTextDocument'),
  getWorkspaceFolder: vi.fn().mockName('getWorkspaceFolder'),
};

export class Uri {
  static joinPath = vi
    .fn()
    .mockName('joinPath')
    .mockImplementation((...args) => Uri.parse(args.join('/')));

  static parse = vi
    .fn()
    .mockName('parse')
    .mockImplementation((value: string, strict?: boolean) => {
      const [scheme, path] = value.split('://');
      if (strict && !path) {
        throw new Error('Invalid URI');
      }

      return new Uri(scheme, path, path);
    });

  private constructor(
    public scheme: string,
    public fsPath: string,
    public path: string
  ) {}

  toString() {
    return `${this.scheme}://${this.path}`;
  }
}
