import { describe, expect, it } from 'vitest';
import { connectionToResult, serverToResult } from './serverUtils';
import type { ConnectionState, ServerState, Psk, UniqueID } from '../../types';
import { boolValues, matrixObject } from '../../testUtils';

describe('serverUtils', () => {
  const serverUrl = new URL('http://localhost:10000');

  describe('connectionToResult', () => {
    it.each(
      matrixObject({
        isConnected: boolValues,
        isRunningCode: boolValues,
        tagId: ['mock-tag' as UniqueID, undefined],
      })
    )(
      'should map isConnected=$isConnected, isRunningCode=$isRunningCode, tagId=$tagId',
      ({ isConnected, isRunningCode, tagId }) => {
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
      matrixObject({
        isConnected: boolValues,
        isRunning: boolValues,
        isManaged: boolValues,
        type: ['DHC', 'DHE'],
        connectionCount: [1, 2],
        connections: [[MOCK_CONNECTION], []],
      })
    )(
      'should map isConnected=$isConnected, isRunning=$isRunning, isManaged=$isManaged, type=$type, connectionCount=$connectionCount, connections=$connections',
      ({
        isConnected,
        isRunning,
        isManaged,
        type,
        connectionCount,
        connections,
      }) => {
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
