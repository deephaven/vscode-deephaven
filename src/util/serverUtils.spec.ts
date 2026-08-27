import { describe, it, expect, vi } from 'vitest';
import {
  getInitialServerStates,
  getPipServerUrl,
  getServerUrlFromState,
  isConnectionState,
  parsePort,
} from './serverUtils';
import type {
  ConnectionState,
  Port,
  ServerConnectionConfig,
  ServerState,
} from '../types';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

const mockServerUrl = new URL('http://localhost:10000');

const mockServerState = {
  url: mockServerUrl,
} as ServerState;

const mockConnectionState = {
  serverUrl: mockServerUrl,
} as ConnectionState;

describe('getInitialServerStates', () => {
  it('should derive server states from config', () => {
    const givenConfigs: ServerConnectionConfig[] = [
      { label: 'SomeLabel', url: new URL('http://localhost:10000') },
      { url: new URL('http://localhost:10001') },
      new URL('http://localhost:10002'),
    ];

    const actual = getInitialServerStates('DHC', givenConfigs);

    expect(actual).toMatchSnapshot();
  });
});

describe('getPipServerUrl', () => {
  it('should return a localhost url based on given port', () => {
    const givenPort = 9000 as Port;
    const expectedURL = new URL('http://localhost:9000');

    expect(getPipServerUrl(givenPort)).toEqual(expectedURL);
  });
});

describe('getServerUrlFromState', () => {
  it.each([mockServerState, mockConnectionState])(
    'should return the server URL from a ServerState or ConnectionState',
    serverOrConnectionState => {
      const url = getServerUrlFromState(serverOrConnectionState);
      expect(url).toEqual(mockServerUrl);
    }
  );
});

describe('isConnectionState', () => {
  it.each([
    [mockConnectionState, true],
    [mockServerState, false],
  ])(
    'should return true for ConnectionState',
    (maybeConnectionState, expected) => {
      expect(isConnectionState(maybeConnectionState)).toBe(expected);
    }
  );
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
