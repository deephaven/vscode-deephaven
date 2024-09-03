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
  groupServers,
  parsePort,
} from './serverUtils';
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

describe('getServerIconPath', () => {
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
    'should return icon path based on server state: isConnected=%s, isManaged=%s, isRunning=%s',
    (isConnected, isManaged, isRunning) => {
      const actual = getServerIconPath({ isConnected, isManaged, isRunning });
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

    const servers = props.map(([isManaged, isRunning], i) => ({
      type: 'DHC' as const,
      url: new URL(`http://localhost:1000${i}`),
      isManaged,
      isRunning,
    }));

    const actual = groupServers(servers);

    expect(actual).toMatchSnapshot();
  });
});

describe('parsePort', () => {
  it('should parse port from string', () => {
    const given = '10000';
    const expected = 10000 as Port;

    const actual = parsePort(given);

    expect(actual).toBe(expected);
  });

  it('should throw error when port is not a number', () => {
    const given = 'abc';

    expect(() => parsePort(given)).toThrowError(new Error('Invalid port: abc'));
  });
});
