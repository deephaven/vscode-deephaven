/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Mock `vscode` module. Note that `vi.mock('vscode')` has to be explicitly
 * called in any test module needing to use this mock. It will not be loaded
 * automatically.
 */
import { vi } from 'vitest';

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
  /**
   * Determines an item can be neither collapsed nor expanded. Implies it has no children.
   */
  None = 0,
  /**
   * Determines an item is collapsed
   */
  Collapsed = 1,
  /**
   * Determines an item is expanded
   */
  Expanded = 2,
}

export const workspace = {
  getConfiguration: vi
    .fn()
    .mockName('getConfiguration')
    .mockReturnValue(new Map()),
};
