import * as vscode from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import {
  createConnectText,
  ConnectionOption,
  createConnectionOption,
  updateConnectionStatusBarItem,
  createConnectionQuickPickOptions,
  createSeparatorPickItem,
} from './uiUtils';
import type {
  ConnectionState,
  CoreConnectionConfig,
  IDhService,
  ServerState,
} from '../types';

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

describe('createConnectionQuickPickOptions', () => {
  const serverUrlA = new URL('http://localhost:10000');
  const serverUrlB = new URL('http://localhost:10001');
  const serverUrlC = new URL('http://localhost:10002');
  const serverUrlD = new URL('http://localhost:10003');

  it.each([
    ['No active', undefined],
    ['Active A', serverUrlA],
  ])(
    'should return quick pick options: editorActiveConnectionUrl=%s',
    (_label, editorActiveConnectionUrl) => {
      const serversWithoutConnections: ServerState[] = [
        {
          type: 'DHC',
          url: serverUrlB,
          isConnected: false,
          isRunning: false,
          connectionCount: 0,
        },
        {
          type: 'DHC',
          url: serverUrlD,
          isConnected: false,
          isRunning: false,
          connectionCount: 0,
        },
      ];
      const connections: ConnectionState[] = [
        { serverUrl: serverUrlA, isConnected: true },
        { serverUrl: serverUrlC, isConnected: true },
      ];

      const actual = createConnectionQuickPickOptions(
        serversWithoutConnections,
        connections,
        'python',
        editorActiveConnectionUrl
      );
      expect(actual).toMatchSnapshot();
    }
  );

  it('should throw if no servers or connections', () => {
    const servers: ServerState[] = [];
    const connections: IDhService[] = [];

    expect(() =>
      createConnectionQuickPickOptions(servers, connections, 'python')
    ).toThrowError('No available servers to connect to.');
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
