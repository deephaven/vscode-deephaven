import { describe, it, expect, vi } from 'vitest';
import {
  getServerContextValue,
  getServerDescription,
  getServerGroupContextValue,
  getServerGroupTreeItem,
  getServerIconID,
  getServerTreeItem,
  groupServers,
} from './treeViewUtils';
import type { ServerState } from '../types';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

describe('getServerContextValue', () => {
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
    'should return contextValue based on server state: isConnected=%s, isManaged=%s, isRunning=%s',
    (isConnected, isManaged, isRunning) => {
      const actual = getServerContextValue({
        isConnected,
        isManaged,
        isRunning,
      });
      expect(actual).toMatchSnapshot();
    }
  );
});

describe('getServerDescription', () => {
  it.each([
    [0, true, 'some label'],
    [1, true, 'some label'],
    [0, false, 'some label'],
    [1, false, 'some label'],
    [0, true, undefined],
    [1, true, undefined],
    [0, false, undefined],
    [1, false, undefined],
  ])(
    'should return server description based on parameters: connectionCount=%s, isManaged=%s, label=%s',
    (connectionCount, isManaged, label) => {
      const actual = getServerDescription(connectionCount, isManaged, label);
      expect(actual).toMatchSnapshot();
    }
  );
});

describe('getServerGroupContextValue', () => {
  it.each([
    ['Managed', true],
    ['Running', true],
    ['Managed', false],
    ['Running', false],
  ] as const)(
    'should return context value when servers can be managed: group=%s, canStartServer=%s',
    (group, canStartServer) => {
      const actual = getServerGroupContextValue(group, canStartServer);
      expect(actual).toMatchSnapshot();
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
      expect(actual).toMatchSnapshot();
    }
  );
});

describe('getServerIconID', () => {
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
    'should return icon id based on server state: isConnected=%s, isManaged=%s, isRunning=%s',
    (isConnected, isManaged, isRunning) => {
      const actual = getServerIconID({ isConnected, isManaged, isRunning });
      expect(actual).toMatchSnapshot();
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

describe('groupServers', () => {
  it('should group servers by state', () => {
    const props = [
      [true, true],
      [true, true],
      [true, false],
      [true, false],
      [false, true],
      [false, true],
      [false, false],
      [false, false],
    ];

    const servers = props.map(
      ([isManaged, isRunning], i) =>
        ({
          type: 'DHC' as const,
          url: new URL(`http://localhost:1000${i}`),
          isManaged,
          isRunning,
          psk: isManaged ? 'mock.psk' : undefined,
        }) as ServerState
    );

    const actual = groupServers(servers);

    expect(actual).toMatchSnapshot();
  });
});