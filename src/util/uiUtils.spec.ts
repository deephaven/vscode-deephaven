import * as vscode from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import {
  createConnectText,
  ConnectionOption,
  createConnectionOption,
  updateConnectionStatusBarItem,
  createSeparatorPickItem,
} from './uiUtils';
import type { CoreConnectionConfig } from '../types';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

const pythonServerConfig: CoreConnectionConfig = {
  label: 'python',
  url: new URL('http://localhost:10000'),
};

const groovyServerConfig: CoreConnectionConfig = {
  label: 'groovy',
  url: new URL('http://localhost:10001'),
};

describe('createConnectionOption', () => {
  it.each([
    ['DHC', pythonServerConfig],
    ['DHC', groovyServerConfig],
  ] as const)(`should return connection option: '%s', %s`, (type, config) => {
    const actual = createConnectionOption(type)(config.url);
    expect(actual).toMatchSnapshot();
  });
});

describe('createConnectText', () => {
  const option: ConnectionOption = {
    type: 'DHC',
    label: 'DHC: localhost:10000',
    url: new URL('http://localhost:10000'),
  };

  const statuses = ['connecting', 'connected', 'disconnected'] as const;

  it.each(statuses)(`should return text and tooltip: '%s'`, status => {
    const actual = createConnectText(status, option);
    expect(actual).toMatchSnapshot();
  });
});

describe('updateConnectionStatusBarItem', () => {
  const option: ConnectionOption = {
    type: 'DHC',
    label: 'DHC: localhost:10000',
    url: new URL('http://localhost:10000'),
  };

  const statuses = ['connecting', 'connected', 'disconnected'] as const;

  it.each(statuses)(
    `should update connection status bar item: '%s'`,
    status => {
      const statusBarItem = {} as vscode.StatusBarItem;
      const text = createConnectText(status, option);

      updateConnectionStatusBarItem(statusBarItem, status, option);

      expect(statusBarItem.text).toBe(text);
    }
  );
});

describe('createSeparatorPickItem', () => {
  it('should create a separator quick pick item with label', () => {
    const label = 'Some Label';
    const actual = createSeparatorPickItem(label);
    expect(actual).toEqual({
      label,
      kind: vscode.QuickPickItemKind.Separator,
    });
  });
});
