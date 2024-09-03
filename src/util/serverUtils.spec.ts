import * as vscode from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import {
  getInitialServerStates,
  getPipServerUrl,
  getServerContextValue,
  getServerDescription,
  getServerGroupContextValue,
  getServerGroupTreeItem,
  getServerIconPath,
  getServerTreeItem,
} from './serverUtils';
import { ICON_ID, SERVER_TREE_ITEM_CONTEXT } from '../common';
import type { Port, ServerConnectionConfig, ServerState } from '../types';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

describe('getInitialServerStates', () => {
  it('should derive server states from config', () => {
    const givenConfigs: ServerConnectionConfig[] = [
      { label: 'SomeLabel', url: new URL('http://localhost:10000') },
      { url: new URL('http://localhost:10001') },
      new URL('http://localhost:10002'),
    ];

    const actual = getInitialServerStates('DHC', givenConfigs);

    expect(actual).toEqual([
      {
        label: 'SomeLabel',
        type: 'DHC',
        url: new URL('http://localhost:10000'),
      },
      {
        type: 'DHC',
        url: new URL('http://localhost:10001'),
      },
      {
        type: 'DHC',
        url: new URL('http://localhost:10002'),
      },
    ]);
  });
});

describe('getPipServerUrl', () => {
  it('should return a localhost url based on given port', () => {
    const givenPort = 9000 as Port;
    const expectedURL = new URL('http://localhost:9000');

    expect(getPipServerUrl(givenPort)).toEqual(expectedURL);
  });
});

describe('getServerContextValue', () => {
  it.each([
    [true, true, true, SERVER_TREE_ITEM_CONTEXT.isManagedServerConnected],
    [true, true, false, SERVER_TREE_ITEM_CONTEXT.isManagedServerConnected],
    [true, false, true, SERVER_TREE_ITEM_CONTEXT.isServerRunningConnected],
    [true, false, false, SERVER_TREE_ITEM_CONTEXT.isServerStopped],
    [false, true, true, SERVER_TREE_ITEM_CONTEXT.isManagedServerDisconnected],
    [false, true, false, SERVER_TREE_ITEM_CONTEXT.isManagedServerConnecting],
    [false, false, true, SERVER_TREE_ITEM_CONTEXT.isServerRunningDisconnected],
    [false, false, false, SERVER_TREE_ITEM_CONTEXT.isServerStopped],
  ])(
    'should return contextValue based on server state: isConnected=%s, isManaged=%s, isRunning=%s',
    (isConnected, isManaged, isRunning, expected) => {
      const actual = getServerContextValue({
        isConnected,
        isManaged,
        isRunning,
      });

      expect(actual).toEqual(expected);
    }
  );
});

describe('getServerDescription', () => {
  it.each([
    [0, true, 'some label', 'pip some label'],
    [1, true, 'some label', 'pip some label (1)'],
    [0, false, 'some label', 'some label'],
    [1, false, 'some label', 'some label (1)'],
    [0, true, undefined, 'pip'],
    [1, true, undefined, 'pip (1)'],
    [0, false, undefined, ''],
    [1, false, undefined, '(1)'],
  ])(
    'should return server description based on parameters: connectionCount=%s, isManaged=%s, label=%s',
    (connectionCount, isManaged, label, expectedDescription) => {
      const actual = getServerDescription(connectionCount, isManaged, label);
      expect(actual).toEqual(expectedDescription);
    }
  );
});

describe('getServerGroupContextValue', () => {
  it.each([
    ['Managed', true, SERVER_TREE_ITEM_CONTEXT.canStartServer],
    ['Running', true, undefined],
    ['Managed', false, undefined],
    ['Running', false, undefined],
  ] as const)(
    'should return context value when servers can be managed: group=%s, canStartServer=%s',
    (group, canStartServer, expected) => {
      const actual = getServerGroupContextValue(group, canStartServer);
      expect(actual).toEqual(expected);
    }
  );
});

describe('getServerGroupTreeItem', () => {
  it.each([
    ['Managed', true],
    ['Running', true],
    ['Managed', false],
    ['Running', false],
  ] as const)(
    'should return server group tree item: group=%s, canStartServer=%s',
    (group, canStartServer) => {
      const actual = getServerGroupTreeItem(group, canStartServer);

      expect(actual).toEqual({
        label: group,
        iconPath: new vscode.ThemeIcon(ICON_ID.server),
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        contextValue: getServerGroupContextValue(group, canStartServer),
      });
    }
  );
});

describe('getServerIconPath', () => {
  it.each([
    [true, true, true, ICON_ID.serverConnected],
    [true, true, false, ICON_ID.connecting],
    [true, false, true, ICON_ID.serverConnected],
    [true, false, false, ICON_ID.serverStopped],
    [false, true, true, ICON_ID.serverRunning],
    [false, true, false, ICON_ID.connecting],
    [false, false, true, ICON_ID.serverRunning],
    [false, false, false, ICON_ID.serverStopped],
  ])(
    'should return icon path based on server state: isConnected=%s, isManaged=%s, isRunning=%s',
    (isConnected, isManaged, isRunning, expected) => {
      const actual = getServerIconPath({ isConnected, isManaged, isRunning });
      expect(actual).toEqual(expected);
    }
  );
});

describe('getServerTreeItem', () => {
  const dhcServerState: ServerState = {
    type: 'DHC',
    url: new URL('http://localhost:10000'),
  };

  it.each([
    [true, true, true],
    [true, true, false],
    [true, false, true],
    [true, false, false],
    [false, true, true],
    [false, true, false],
    [false, false, true],
    [false, false, false],
  ])(
    'should return DHC server tree item: isConnected=%s, isManaged=%s, isRunning=%s',
    (isConnected, isManaged, isRunning) => {
      const actual = getServerTreeItem({
        server: dhcServerState,
        isConnected,
        isManaged,
        isRunning,
      });

      expect(actual).toMatchSnapshot();
    }
  );
});
