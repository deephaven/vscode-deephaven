import { describe, it, expect, vi } from 'vitest';
import {
  getInitialServerStates,
  getPipServerUrl,
  parsePort,
} from './serverUtils';
import type { Port, ServerConnectionConfig } from '../types';

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
