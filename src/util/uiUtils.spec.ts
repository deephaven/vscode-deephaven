import { describe, it, expect, vi } from 'vitest';
import {
  createConnectTextAndTooltip,
  ConnectionOption,
  createConnectionOptions,
} from './uiUtils';
import { ConnectionConfig } from '../common';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

describe('createConnectionOptions', () => {
  const configs: ConnectionConfig[] = [
    { url: 'http://localhost:10000', consoleType: 'python' },
    { url: 'http://localhost:10001', consoleType: 'groovy' },
  ];

  it.each(configs)(
    'should return connection options: $url:$consoleType',
    config => {
      const actual = createConnectionOptions([config]);
      expect(actual).toMatchSnapshot();
    }
  );
});

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
