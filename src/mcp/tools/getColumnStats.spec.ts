import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';

import { createGetColumnStatsTool } from './getColumnStats';
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

const MOCK_COLUMN = {
  name: 'Price',
  type: 'double',
} as DhcType.Column;

const MOCK_COLUMN_STATS = {
  statisticsMap: new Map([
    ['MIN', 10.5],
    ['MAX', 150.75],
    ['AVG', 75.25],
    ['SUM', 7525.0],
  ]),
  uniqueValues: new Map([
    ['10.5', 5],
    ['75.25', 10],
    ['150.75', 3],
  ]),
} as unknown as DhcType.ColumnStatistics;

const MOCK_COLUMN_STATS_NO_UNIQUE = {
  statisticsMap: new Map([
    ['MIN', 1],
    ['MAX', 1000],
    ['AVG', 500],
  ]),
  uniqueValues: new Map(),
} as unknown as DhcType.ColumnStatistics;

const MOCK_TABLE = {
  columns: [
    { name: 'Symbol', type: 'java.lang.String' },
    { name: 'Price', type: 'double' },
    { name: 'Volume', type: 'long' },
  ],
  close: vi.fn(),
  findColumn: vi.fn(),
  getColumnStatistics: vi.fn(),
} as unknown as DhcType.Table;

/* eslint-disable @typescript-eslint/naming-convention */
const EXPECTED_SUCCESS = mcpSuccessResult('Column stats retrieved', {
  statistics: {
    MIN: 10.5,
    MAX: 150.75,
    AVG: 75.25,
    SUM: 7525.0,
  },
  uniqueValues: {
    '10.5': 5,
    '75.25': 10,
    '150.75': 3,
  },
});

const EXPECTED_SUCCESS_NO_UNIQUE = mcpSuccessResult('Column stats retrieved', {
  statistics: {
    MIN: 1,
    MAX: 1000,
    AVG: 500,
  },
});
/* eslint-enable @typescript-eslint/naming-convention */

const EXPECTED_COLUMN_NOT_FOUND = mcpErrorResult('Column not found', {
  columnName: 'InvalidColumn',
  tableName: 'myTable',
  availableColumns: ['Symbol', 'Price', 'Volume'],
});

const EXPECTED_INVALID_URL = mcpErrorResult('Invalid URL: Invalid URL', {
  connectionUrl: 'invalid-url',
});

const EXPECTED_NO_CONNECTION = mcpErrorResult(
  'No connections or server found',
  { connectionUrl: MOCK_DHC_URL.href }
);

const EXPECTED_NO_SESSION = mcpErrorResult('Unable to access session', {
  connectionUrl: MOCK_DHC_URL.href,
});

const MOCK_SERVER_RUNNING: ServerState = {
  isRunning: true,
  type: 'DHC',
  url: MOCK_DHC_URL,
  isConnected: false,
  connectionCount: 0,
};

describe('getColumnStats', () => {
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
    vi.mocked(MOCK_TABLE.findColumn).mockReturnValue(MOCK_COLUMN);
    vi.mocked(MOCK_TABLE.getColumnStatistics).mockResolvedValue(
      MOCK_COLUMN_STATS
    );
  });

  it('should return correct tool spec', () => {
    const tool = createGetColumnStatsTool({ serverManager });

    expect(tool.name).toBe('getColumnStats');
    expect(tool.spec.title).toBe('Get Column Statistics');
  });

  it('should successfully retrieve column stats with unique values', async () => {
    const tool = createGetColumnStatsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      columnName: 'Price',
    });

    expect(mockSession.getObject).toHaveBeenCalledWith({
      type: 'Table',
      name: 'myTable',
    });
    expect(MOCK_TABLE.findColumn).toHaveBeenCalledWith('Price');
    expect(MOCK_TABLE.getColumnStatistics).toHaveBeenCalledWith(MOCK_COLUMN);
    expect(MOCK_TABLE.close).toHaveBeenCalled();
    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS);
  });

  it('should successfully retrieve column stats without unique values', async () => {
    vi.mocked(MOCK_TABLE.getColumnStatistics).mockResolvedValue(
      MOCK_COLUMN_STATS_NO_UNIQUE
    );

    const tool = createGetColumnStatsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      columnName: 'Price',
    });

    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS_NO_UNIQUE);
  });

  it('should handle column not found', async () => {
    vi.mocked(MOCK_TABLE.findColumn).mockReturnValue(
      undefined as unknown as DhcType.Column
    );

    const tool = createGetColumnStatsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      columnName: 'InvalidColumn',
    });

    expect(MOCK_TABLE.close).toHaveBeenCalled();
    expect(result.structuredContent).toEqual(EXPECTED_COLUMN_NOT_FOUND);
  });

  it('should initialize session if not initialized', async () => {
    Object.defineProperty(mockConnection, 'isInitialized', {
      get: vi.fn(() => false),
      configurable: true,
    });

    vi.mocked(serverManager.getConnections).mockReturnValue([mockConnection]);

    const tool = createGetColumnStatsTool({ serverManager });
    await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      columnName: 'Price',
    });

    // getSession() now handles session initialization internally
    expect(mockConnection.getSession).toHaveBeenCalled();
  });

  it.each([
    {
      name: 'invalid URL',
      connectionUrl: 'invalid-url',
      tableName: 'myTable',
      columnName: 'Price',
      serverReturnValue: undefined,
      connectionReturnValue: undefined,
      sessionReturnValue: undefined,
      expected: EXPECTED_INVALID_URL,
      shouldCallGetServer: false,
    },
    {
      name: 'missing connection',
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      columnName: 'Price',
      serverReturnValue: undefined,
      connectionReturnValue: undefined,
      sessionReturnValue: undefined,
      expected: EXPECTED_NO_CONNECTION,
      shouldCallGetServer: true,
    },
    {
      name: 'missing session',
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      columnName: 'Price',
      serverReturnValue: 'server',
      connectionReturnValue: 'mockConnection',
      sessionReturnValue: null,
      expected: EXPECTED_NO_SESSION,
      shouldCallGetServer: true,
    },
  ])(
    'should handle $name',
    async ({
      connectionUrl,
      tableName,
      columnName,
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

      const tool = createGetColumnStatsTool({ serverManager });
      const result = await tool.handler({
        connectionUrl,
        tableName,
        columnName,
      });

      expect(result.structuredContent).toEqual(expected);
      if (!shouldCallGetServer) {
        expect(serverManager.getServer).not.toHaveBeenCalled();
      }
    }
  );

  it('should handle errors and close table', async () => {
    const error = new Error('Failed to get stats');
    vi.mocked(MOCK_TABLE.getColumnStatistics).mockRejectedValue(error);

    const tool = createGetColumnStatsTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      columnName: 'Price',
    });

    expect(MOCK_TABLE.close).toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({
      success: false,
      message: 'Failed to get column stats: Failed to get stats',
      details: {
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'myTable',
        columnName: 'Price',
      },
    });
  });

  it('should close table even on success', async () => {
    const tool = createGetColumnStatsTool({ serverManager });
    await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      columnName: 'Price',
    });

    expect(MOCK_TABLE.close).toHaveBeenCalled();
  });
});
