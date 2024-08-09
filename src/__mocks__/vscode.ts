import { vi } from 'vitest';

export const workspace = {
  getConfiguration: vi.fn().mockReturnValue(new Map()),
};
