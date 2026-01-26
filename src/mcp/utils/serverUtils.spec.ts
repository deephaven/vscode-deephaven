import { describe, expect, it } from 'vitest';
import { connectionToResult, serverToResult } from './serverUtils';
import type { ConnectionState, ServerState, Psk, UniqueID } from '../../types';
import { boolValues, matrix } from '../../testUtils';

describe('serverUtils', () => {
  const serverUrl = new URL('http://localhost:10000');

  describe('connectionToResult', () => {
    it.each(
      matrix(boolValues, boolValues, ['mock-tag' as UniqueID, undefined])
    )(
      'should map isConnected=%s, isRunningCode=%s',
      (isConnected, isRunningCode, tagId) => {
        const resultWithoutTag = connectionToResult({
          isConnected,
          isRunningCode,
          serverUrl,
          tagId,
        });

        expect(resultWithoutTag, 'without tag').toEqual({
          isConnected,
          isRunningCode,
          serverUrl: serverUrl.toString(),
          tagId,
        });
      }
    );
  });

  describe('serverToResult', () => {
    const label = 'mock label';
    const psk = 'test-psk' as Psk;
    const tagId = 'mock-tag' as UniqueID;

    const MOCK_CONNECTION: ConnectionState = {
      isConnected: true,
      isRunningCode: true,
      serverUrl,
      tagId,
    } as ConnectionState;

    it.each(
      matrix(
        boolValues,
        boolValues,
        boolValues,
        ['DHC', 'DHE'],
        [1, 2],
        [[MOCK_CONNECTION], []]
      )
    )(
      'should map isConnected=%s, isRunning=%s, isManaged=%s, type=%s, connectionCount=%d, connections=%o',
      (
        isConnected,
        isRunning,
        isManaged,
        type,
        connectionCount,
        connections
      ) => {
        const server: ServerState = {
          type,
          connectionCount,
          isConnected,
          isRunning,
          isManaged,
          label,
          psk,
          url: serverUrl,
        } as ServerState;

        const result = serverToResult(server, connections);

        expect(result).toEqual({
          type,
          url: serverUrl.toString(),
          connectionCount,
          label,
          isConnected,
          isManaged,
          isRunning,
          tags: isManaged ? ['pip', 'managed'] : [],
          connections: connections.map(connectionToResult),
        });
      }
    );
  });
});
