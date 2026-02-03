import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createListConnectionsTool } from './listConnections';
import type {
  IServerManager,
  ConnectionState,
  UniqueID,
  WorkerInfo,
} from '../../types';
import { McpToolResponse } from '../utils/mcpUtils';

vi.mock('vscode');

const MOCK_EXECUTION_TIME_MS = 100;

const MOCK_CONNECTIONS: ConnectionState[] = [
  {
    serverUrl: new URL('http://localhost:10000'),
    isConnected: true,
    isRunningCode: false,
    tagId: 'conn1' as UniqueID,
  },
  {
    serverUrl: new URL('http://localhost:10001'),
    isConnected: true,
    isRunningCode: true,
    tagId: 'conn2' as UniqueID,
  },
] as const;

const EXPECTED_ALL_CONNECTIONS = {
  success: true,
  message: 'Found 2 connection(s)',
  details: {
    connections: MOCK_CONNECTIONS.map(c => ({
      ...c,
      serverUrl: c.serverUrl.toString(),
      querySerial: undefined,
    })),
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_FILTERED_CONNECTIONS = {
  success: true,
  message: 'Found 1 connection(s)',
  details: {
    connections: [
      {
        ...MOCK_CONNECTIONS[0],
        serverUrl: MOCK_CONNECTIONS[0].serverUrl.toString(),
        querySerial: undefined,
      },
    ],
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_NO_CONNECTIONS = {
  success: true,
  message: 'Found 0 connection(s)',
  details: {
    connections: [],
  },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_INVALID_URL = {
  success: false,
  message: 'Invalid URL: Invalid URL',
  details: { serverUrl: 'invalid-url' },
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

const EXPECTED_GET_CONNECTIONS_ERROR = {
  success: false,
  message: 'Failed to list connections: getConnections error',
  executionTimeMs: MOCK_EXECUTION_TIME_MS,
} as const;

describe('listConnections', () => {
  const serverManager = {
    getConnections: vi.fn(),
    getWorkerInfo: vi.fn(),
  } as unknown as IServerManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock getElapsedTimeMs to return a fixed value
    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );

    // Mock getWorkerInfo to return undefined by default (DHC servers)
    vi.mocked(serverManager.getWorkerInfo).mockResolvedValue(undefined);
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
      name: 'list all connections when no serverUrl provided',
      serverUrl: undefined,
      connections: MOCK_CONNECTIONS,
      expectedGetConnectionsArg: undefined,
      expected: EXPECTED_ALL_CONNECTIONS,
    },
    {
      name: 'filter connections by serverUrl',
      serverUrl: 'http://localhost:10000',
      connections: [MOCK_CONNECTIONS[0]],
      expectedGetConnectionsArg: new URL('http://localhost:10000'),
      expected: EXPECTED_FILTERED_CONNECTIONS,
    },
    {
      name: 'return empty list when serverUrl does not match any connections',
      serverUrl: 'http://localhost:9999',
      connections: [],
      expectedGetConnectionsArg: new URL('http://localhost:9999'),
      expected: EXPECTED_NO_CONNECTIONS,
    },
    {
      name: 'return empty list when no connections exist',
      serverUrl: undefined,
      connections: [],
      expectedGetConnectionsArg: undefined,
      expected: EXPECTED_NO_CONNECTIONS,
    },
  ])(
    'should $name',
    async ({ serverUrl, connections, expectedGetConnectionsArg, expected }) => {
      vi.mocked(serverManager.getConnections).mockReturnValue(connections);

      const tool = createListConnectionsTool({ serverManager });
      const result = await tool.handler({ serverUrl });

      expect(serverManager.getConnections).toHaveBeenCalledWith(
        expectedGetConnectionsArg
      );
      expect(result.structuredContent).toEqual(expected);
    }
  );

  it('should handle invalid URL', async () => {
    const tool = createListConnectionsTool({ serverManager });
    const result = await tool.handler({ serverUrl: 'invalid-url' });

    expect(result.structuredContent).toEqual(EXPECTED_INVALID_URL);
    expect(serverManager.getConnections).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'with undefined serverUrl',
      serverUrl: undefined,
    },
    {
      name: 'with valid serverUrl',
      serverUrl: 'http://localhost:10000',
    },
  ])('should handle errors from serverManager $name', async ({ serverUrl }) => {
    const error = new Error('getConnections error');
    vi.mocked(serverManager.getConnections).mockImplementation(() => {
      throw error;
    });

    const tool = createListConnectionsTool({ serverManager });
    const result = await tool.handler({ serverUrl });

    expect(result.structuredContent).toEqual(EXPECTED_GET_CONNECTIONS_ERROR);
  });

  it('should include querySerial when workerInfo is available', async () => {
    const mockWorkerInfo = {
      serial: 'test-serial-123',
    } as WorkerInfo;

    vi.mocked(serverManager.getConnections).mockReturnValue([
      MOCK_CONNECTIONS[0],
    ]);
    vi.mocked(serverManager.getWorkerInfo).mockResolvedValue(mockWorkerInfo);

    const tool = createListConnectionsTool({ serverManager });
    const result = await tool.handler({ serverUrl: undefined });

    expect(result.structuredContent).toEqual({
      success: true,
      message: 'Found 1 connection(s)',
      details: {
        connections: [
          {
            ...MOCK_CONNECTIONS[0],
            serverUrl: MOCK_CONNECTIONS[0].serverUrl.toString(),
            querySerial: 'test-serial-123',
          },
        ],
      },
      executionTimeMs: MOCK_EXECUTION_TIME_MS,
    });
  });
});
