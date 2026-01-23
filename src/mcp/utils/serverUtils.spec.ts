import { describe, expect, it } from 'vitest';
import { connectionToResult, serverToResult } from './serverUtils';
import type { ConnectionState, ServerState, Psk } from '../../types';

describe('serverUtils', () => {
  const serverUrl = new URL('http://localhost:10000');
  const tagId = 'worker-1';
  const psk = 'test-psk' as Psk;

  describe('connectionToResult', () => {
    it.each([
      {
        name: 'connection with all fields',
        connection: {
          isConnected: true,
          isRunningCode: true,
          serverUrl,
          tagId,
        } as ConnectionState,
        expected: {
          isConnected: true,
          isRunningCode: true,
          serverUrl: serverUrl.toString(),
          tagId,
        },
      },
      {
        name: 'connection without tagId',
        connection: {
          isConnected: true,
          isRunningCode: false,
          serverUrl,
        } as ConnectionState,
        expected: {
          isConnected: true,
          isRunningCode: false,
          serverUrl: serverUrl.toString(),
          tagId: undefined,
        },
      },
      {
        name: 'disconnected connection',
        connection: {
          isConnected: false,
          isRunningCode: false,
          serverUrl,
          tagId,
        } as ConnectionState,
        expected: {
          isConnected: false,
          isRunningCode: false,
          serverUrl: serverUrl.toString(),
          tagId,
        },
      },
    ])('should map $name', ({ connection, expected }) => {
      const result = connectionToResult(connection);

      expect(result).toEqual(expected);
    });
  });

  describe('serverToResult', () => {
    const MOCK_CONNECTION: ConnectionState = {
      isConnected: true,
      isRunningCode: true,
      serverUrl,
      tagId,
    } as ConnectionState;

    it.each([
      {
        name: 'managed server with connections',
        server: {
          type: 'DHE',
          url: serverUrl,
          label: 'Test Server',
          isConnected: true,
          isRunning: true,
          connectionCount: 1,
          isManaged: true,
          psk,
        } as ServerState,
        connections: [MOCK_CONNECTION],
        expected: {
          type: 'DHE',
          url: serverUrl.toString(),
          label: 'Test Server',
          isConnected: true,
          isRunning: true,
          connectionCount: 1,
          isManaged: true,
          tags: ['pip', 'managed'],
          connections: [
            {
              isConnected: true,
              isRunningCode: true,
              serverUrl: serverUrl.toString(),
              tagId,
            },
          ],
        },
      },
      {
        name: 'unmanaged server without label',
        server: {
          type: 'DHC',
          url: serverUrl,
          isConnected: false,
          isRunning: false,
          connectionCount: 0,
          isManaged: false,
        } as ServerState,
        connections: [],
        expected: {
          type: 'DHC',
          url: serverUrl.toString(),
          label: undefined,
          isConnected: false,
          isRunning: false,
          connectionCount: 0,
          isManaged: false,
          tags: [],
          connections: [],
        },
      },
    ])('should map $name', ({ server, connections, expected }) => {
      const result = serverToResult(server, connections);

      expect(result).toEqual(expected);
    });
  });
});
