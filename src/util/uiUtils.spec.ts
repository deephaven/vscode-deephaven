import { describe, it, expect, vi } from 'vitest';
import { createConnectTextAndTooltip, ConnectionOption } from './uiUtils';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

describe('createConnectTextAndTooltip', () => {
  const option: ConnectionOption = {
    type: 'DHC',
    consoleType: 'python',
    label: 'DHC: localhost:10000',
    url: 'http://localhost:10000',
  };

  it.each([['connecting'], ['connected'], ['disconnected']] as const)(
    `should return text and tooltip: '%s'`,
    status => {
      const actual = createConnectTextAndTooltip(status, option);
      expect(actual).toMatchSnapshot();
    }
  );
});
