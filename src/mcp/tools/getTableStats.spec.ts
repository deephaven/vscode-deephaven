import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';

import { createGetTableStatsTool } from './getTableStats';
import type { IServerManager, ServerState } from '../../types';
import { DhcService } from '../../services';
import {
  fakeMcpToolTimings,
  mcpSuccessResult,
  mcpErrorResult,
  MOCK_DHC_URL,
} from '../utils/mcpTestUtils';

vi.mock('vscode');
vi.mock('../../services/DhcService');

const MOCK_TABLE = {
  size: 1000,
  columns: [
    { name: 'Symbol', type: 'java.lang.String', description: 'Stock symbol' },
    { name: 'Price', type: 'double' },
    { name: 'Volume', type: 'long', description: 'Trading volume' },
  ],
  isRefreshing: true,
  close: vi.fn(),
} as unknown as DhcType.Table;

const MOCK_SERVER_RUNNING: ServerState = {
  isRunning: true,
  type: 'DHC',
  url: MOCK_DHC_URL,
  isConnected: false,
  connectionCount: 0,
};

describe('getTableStats', () => {
  const mockSession = {
    getObject: vi.fn(),
  } as unknown as DhcType.IdeSession;

  const mockConnection = Object.assign(Object.create(DhcService.prototype), {
    initSession: vi.fn(),
    getSession: vi.fn(),
  }) as DhcService;

  const serverManager = {
    getServer: vi.fn(),
    getConnection: vi.fn(),
    getConnections: vi.fn(),
  } as unknown as IServerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeMcpToolTimings();

    // Default successful getServer mock
    vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_RUNNING);
    vi.mocked(serverManager.getConnections).mockReturnValue([mockConnection]);

    // Mock isInitialized getter
    Object.defineProperty(mockConnection, 'isInitialized', {
      get: vi.fn(() => true),
      configurable: true,
    });

    vi.mocked(mockConnection.getSession).mockResolvedValue(mockSession);
    vi.mocked(mockSession.getObject).mockResolvedValue(MOCK_TABLE);
  });

  it('should return correct tool spec', () => {
    const tool = createGetTableStatsTool({ serverManager });

    expect(tool.name).toBe('getTableStats');
    expect(tool.spec.title).toBe('Get Table Schema and Statistics');
  });

  it('should successfully retrieve table stats', async () => {
    const tool = createGetTableStatsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(mockSession.getObject).toHaveBeenCalledWith({
      type: 'Table',
      name: 'myTable',
    });
    expect(MOCK_TABLE.close).toHaveBeenCalled();
    expect(result.structuredContent).toEqual(
      mcpSuccessResult('Table stats retrieved', {
        tableName: 'myTable',
        size: 1000,
        columns: [
          {
            name: 'Symbol',
            type: 'java.lang.String',
            description: 'Stock symbol',
          },
          { name: 'Price', type: 'double' },
          { name: 'Volume', type: 'long', description: 'Trading volume' },
        ],
        isRefreshing: true,
      })
    );
  });

  it('should initialize session if not initialized', async () => {
    Object.defineProperty(mockConnection, 'isInitialized', {
      get: vi.fn(() => false),
      configurable: true,
    });

    vi.mocked(serverManager.getConnections).mockReturnValue([mockConnection]);

    const tool = createGetTableStatsTool({ serverManager });
    await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    // getSession() now handles session initialization internally
    expect(mockConnection.getSession).toHaveBeenCalled();
  });

  it.each([
    {
      name: 'invalid URL',
      connectionUrl: 'invalid-url',
      tableName: 'myTable',
      serverReturnValue: undefined,
      connectionReturnValue: undefined,
      sessionReturnValue: undefined,
      expected: mcpErrorResult('Invalid URL: Invalid URL', {
        connectionUrl: 'invalid-url',
      }),
      shouldCallGetServer: false,
    },
    {
      name: 'missing connection',
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      serverReturnValue: undefined,
      connectionReturnValue: undefined,
      sessionReturnValue: undefined,
      expected: mcpErrorResult('No connections or server found', {
        connectionUrl: MOCK_DHC_URL.href,
      }),
      shouldCallGetServer: true,
    },
    {
      name: 'missing session',
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      serverReturnValue: 'server',
      connectionReturnValue: 'mockConnection',
      sessionReturnValue: null,
      expected: mcpErrorResult('Unable to access session', {
        connectionUrl: MOCK_DHC_URL.href,
      }),
      shouldCallGetServer: true,
    },
  ])(
    'should handle $name',
    async ({
      connectionUrl,
      tableName,
      serverReturnValue,
      connectionReturnValue,
      sessionReturnValue,
      expected,
      shouldCallGetServer,
    }) => {
      if (serverReturnValue === 'server') {
        vi.mocked(serverManager.getServer).mockReturnValue(MOCK_SERVER_RUNNING);
      } else if (serverReturnValue === undefined) {
        vi.mocked(serverManager.getServer).mockReturnValue(undefined);
      }

      if (connectionReturnValue === 'mockConnection') {
        vi.mocked(serverManager.getConnections).mockReturnValue([
          mockConnection,
        ]);
      } else if (connectionReturnValue === undefined) {
        vi.mocked(serverManager.getConnections).mockReturnValue([]);
      }

      if (sessionReturnValue !== undefined) {
        vi.mocked(mockConnection.getSession).mockResolvedValue(
          sessionReturnValue
        );
      }

      const tool = createGetTableStatsTool({ serverManager });
      const result = await tool.handler({ connectionUrl, tableName });

      expect(result.structuredContent).toEqual(expected);
      if (!shouldCallGetServer) {
        expect(serverManager.getServer).not.toHaveBeenCalled();
      }
    }
  );

  it('should handle errors and close table', async () => {
    const error = new Error('Table not found');
    vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);
    vi.mocked(mockSession.getObject).mockRejectedValue(error);

    const tool = createGetTableStatsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'nonExistentTable',
    });

    expect(result.structuredContent).toMatchObject({
      success: false,
      message: 'Failed to get table stats: Table not found',
      details: {
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'nonExistentTable',
      },
    });
  });

  it('should close table even on success', async () => {
    vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

    const tool = createGetTableStatsTool({ serverManager });
    await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(MOCK_TABLE.close).toHaveBeenCalled();
  });
});
