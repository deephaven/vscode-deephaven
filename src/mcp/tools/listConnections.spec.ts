import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createListConnectionsTool } from './listConnections';
import type {
  IServerManager,
  ConnectionState,
  UniqueID,
  WorkerInfo,
} from '../../types';
import {
  fakeMcpToolTimings,
  mcpErrorResult,
  mcpSuccessResult,
  MOCK_DHC_URL,
} from '../utils/mcpTestUtils';

vi.mock('vscode');

const MOCK_CONNECTION_1: ConnectionState = {
  serverUrl: MOCK_DHC_URL,
  isConnected: true,
  isRunningCode: false,
  tagId: 'conn1' as UniqueID,
} as const;

const MOCK_CONNECTION_2: ConnectionState = {
  serverUrl: new URL('http://localhost:10001'),
  isConnected: true,
  isRunningCode: true,
  tagId: 'conn2' as UniqueID,
} as const;

const EXPECTED_CONNECTION_1 = {
  ...MOCK_CONNECTION_1,
  serverUrl: MOCK_CONNECTION_1.serverUrl.toString(),
} as const;

const EXPECTED_CONNECTION_2 = {
  ...MOCK_CONNECTION_2,
  serverUrl: MOCK_CONNECTION_2.serverUrl.toString(),
} as const;

describe('listConnections', () => {
  const serverManager = {
    getConnections: vi.fn(),
    getWorkerInfo: vi.fn(),
  } as unknown as IServerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeMcpToolTimings();
  });

  it('should return correct tool spec', () => {
    const tool = createListConnectionsTool({ serverManager });

    expect(tool.name).toBe('listConnections');
    expect(tool.spec.title).toBe('List Connections');
    expect(tool.spec.description).toBe(
      'List all active Deephaven connections, optionally filtered by server URL.'
    );
  });

  it.each([
    {
      name: 'list all connections',
      serverUrl: undefined,
      connections: [MOCK_CONNECTION_1, MOCK_CONNECTION_2],
      expectedGetConnectionsArg: undefined,
      expectedConnections: [EXPECTED_CONNECTION_1, EXPECTED_CONNECTION_2],
    },
    {
      name: 'filter by serverUrl',
      serverUrl: MOCK_DHC_URL.href,
      connections: [MOCK_CONNECTION_1],
      expectedGetConnectionsArg: MOCK_DHC_URL,
      expectedConnections: [EXPECTED_CONNECTION_1],
    },
    {
      name: 'include querySerial when workerInfo available',
      serverUrl: MOCK_DHC_URL.href,
      connections: [MOCK_CONNECTION_1],
      expectedGetConnectionsArg: MOCK_DHC_URL,
      expectedConnections: [
        { ...EXPECTED_CONNECTION_1, querySerial: 'test-serial-123' },
      ],
      workerInfo: { serial: 'test-serial-123' } as WorkerInfo,
    },
    {
      name: 'return empty array when serverUrl has no matches',
      serverUrl: 'http://localhost:9999',
      connections: [],
      expectedGetConnectionsArg: new URL('http://localhost:9999'),
      expectedConnections: [],
    },
    {
      name: 'return empty array when no connections exist',
      serverUrl: undefined,
      connections: [],
      expectedGetConnectionsArg: undefined,
      expectedConnections: [],
    },
  ])(
    'should $name',
    async ({
      serverUrl,
      connections,
      expectedGetConnectionsArg,
      expectedConnections,
      workerInfo,
    }) => {
      vi.mocked(serverManager.getConnections).mockReturnValue(connections);
      vi.mocked(serverManager.getWorkerInfo).mockResolvedValue(workerInfo);

      const tool = createListConnectionsTool({ serverManager });
      const result = await tool.handler({ serverUrl });

      expect(serverManager.getConnections).toHaveBeenCalledWith(
        expectedGetConnectionsArg
      );
      expect(result.structuredContent).toEqual(
        mcpSuccessResult(`Found ${expectedConnections.length} connection(s)`, {
          connections: expectedConnections,
        })
      );
    }
  );

  it('should handle invalid URL', async () => {
    const tool = createListConnectionsTool({ serverManager });
    const result = await tool.handler({ serverUrl: 'invalid-url' });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('Invalid URL: Invalid URL', { serverUrl: 'invalid-url' })
    );
    expect(serverManager.getConnections).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'with undefined serverUrl',
      serverUrl: undefined,
    },
    {
      name: 'with valid serverUrl',
      serverUrl: MOCK_DHC_URL.href,
    },
  ])('should handle errors from serverManager $name', async ({ serverUrl }) => {
    const error = new Error('getConnections error');
    vi.mocked(serverManager.getConnections).mockImplementation(() => {
      throw error;
    });

    const tool = createListConnectionsTool({ serverManager });
    const result = await tool.handler({ serverUrl });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('Failed to list connections: getConnections error')
    );
  });
});
