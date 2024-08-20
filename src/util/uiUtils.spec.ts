import * as vscode from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import {
  createConnectTextAndTooltip,
  ConnectionOption,
  createConnectionOptions,
  createConnectionOption,
  updateConnectionStatusBarItem,
} from './uiUtils';
import type { CoreConnectionConfig } from '../types';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

const pythonServerConfig: CoreConnectionConfig = {
  url: 'http://localhost:10000',
  consoleType: 'python',
};

const groovyServerConfig: CoreConnectionConfig = {
  url: 'http://localhost:10001',
  consoleType: 'groovy',
};

describe('createConnectionOption', () => {
  it.each([
    ['DHC', pythonServerConfig],
    ['DHC', groovyServerConfig],
  ] as const)(`should return connection option: '%s', %s`, (type, config) => {
    const actual = createConnectionOption(type)(config);
    expect(actual).toMatchSnapshot();
  });
});

describe('createConnectionOptions', () => {
  const configs: CoreConnectionConfig[] = [
    pythonServerConfig,
    groovyServerConfig,
  ];

  it('should return connection options', () => {
    const actual = createConnectionOptions(configs);
    expect(actual).toMatchSnapshot();
  });
});

describe('createConnectTextAndTooltip', () => {
  const option: ConnectionOption = {
    type: 'DHC',
    consoleType: 'python',
    label: 'DHC: localhost:10000',
    url: 'http://localhost:10000',
  };

  const statuses = ['connecting', 'connected', 'disconnected'] as const;

  it.each(statuses)(`should return text and tooltip: '%s'`, status => {
    const actual = createConnectTextAndTooltip(status, option);
    expect(actual).toMatchSnapshot();
  });
});

describe('updateConnectionStatusBarItem', () => {
  const option: ConnectionOption = {
    type: 'DHC',
    consoleType: 'python',
    label: 'DHC: localhost:10000',
    url: 'http://localhost:10000',
  };

  const statuses = ['connecting', 'connected', 'disconnected'] as const;

  it.each(statuses)(
    `should update connection status bar item: '%s'`,
    status => {
      const statusBarItem = {} as vscode.StatusBarItem;
      const { text, tooltip } = createConnectTextAndTooltip(status, option);

      updateConnectionStatusBarItem(statusBarItem, status, option);

      expect(statusBarItem.text).toBe(text);
      expect(statusBarItem.tooltip).toBe(tooltip);
    }
  );
});
