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

export enum QuickPickItemKind {
  Separator = -1,
  Default = 0,
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

export const workspace = {
  getConfiguration: vi
    .fn()
    .mockName('getConfiguration')
    .mockReturnValue(new Map()),
};
