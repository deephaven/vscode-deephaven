/**
 * Mock `vscode` module. Note that `vi.mock('vscode')` has to be explicitly
 * called in any test module needing to use this mock. It will not be loaded
 * automatically.
 */
import { vi } from 'vitest';

export const workspace = {
  getConfiguration: vi.fn().mockReturnValue(new Map()),
};
