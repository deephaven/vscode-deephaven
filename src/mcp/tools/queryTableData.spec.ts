import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';

import { createQueryTableDataTool } from './queryTableData';
import type {
  IAsyncCacheService,
  IServerManager,
  ServerState,
} from '../../types';
import { DhcService } from '../../services';
import {
  fakeMcpToolTimings,
  mcpSuccessResult,
  mcpErrorResult,
  MOCK_DHC_URL,
} from '../utils/mcpTestUtils';

vi.mock('vscode');
vi.mock('../../services/DhcService');

/* eslint-disable @typescript-eslint/naming-convention */
const MOCK_DH = {
  FilterValue: {
    ofString: vi.fn((val: string) => ({ type: 'string', value: val })),
    ofNumber: vi.fn((val: number) => ({ type: 'number', value: val })),
    ofBoolean: vi.fn((val: boolean) => ({ type: 'boolean', value: val })),
  },
} as unknown as typeof DhcType;
/* eslint-enable @typescript-eslint/naming-convention */

const MOCK_COLUMN = {
  name: 'Symbol',
  type: 'java.lang.String',
  filter: vi.fn(),
  sort: vi.fn(),
} as unknown as DhcType.Column;

const MOCK_VIEWPORT_DATA = {
  rows: [
    {
      get: vi.fn((col: DhcType.Column) => {
        if (col.name === 'Symbol') {
          return 'AAPL';
        }
        if (col.name === 'Price') {
          return 150.25;
        }
        return null;
      }),
    },
    {
      get: vi.fn((col: DhcType.Column) => {
        if (col.name === 'Symbol') {
          return 'GOOGL';
        }
        if (col.name === 'Price') {
          return 2800.5;
        }
        return null;
      }),
    },
  ],
} as unknown as DhcType.ViewportData;

const MOCK_TABLE = {
  size: 2,
  columns: [
    { name: 'Symbol', type: 'java.lang.String' },
    { name: 'Price', type: 'double' },
  ],
  close: vi.fn(),
  findColumn: vi.fn(),
  setViewport: vi.fn(),
  getViewportData: vi.fn(),
  applyFilter: vi.fn(),
  applySort: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  getTotalsTable: vi.fn(),
} as unknown as DhcType.Table;

const MOCK_SERVER_RUNNING: ServerState = {
  isRunning: true,
  type: 'DHC',
  url: MOCK_DHC_URL,
  isConnected: false,
  connectionCount: 0,
};

describe('queryTableData', () => {
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

  const coreJsApiCache = {
    get: vi.fn(),
  } as unknown as IAsyncCacheService<URL, typeof DhcType>;

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
    vi.mocked(coreJsApiCache.get).mockResolvedValue(MOCK_DH);
    vi.mocked(MOCK_TABLE.findColumn).mockReturnValue(MOCK_COLUMN);
    vi.mocked(MOCK_TABLE.getViewportData).mockResolvedValue(MOCK_VIEWPORT_DATA);

    // Mock event listeners for filter/sort changes
    (MOCK_TABLE.addEventListener as any) = vi.fn(
      (event: string, handler: any) => {
        // Immediately trigger the handler to simulate filter/sort completion
        setTimeout(handler, 0);
      }
    );
  });

  it('should return correct tool spec', () => {
    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });

    expect(tool.name).toBe('queryTableData');
    expect(tool.spec.title).toBe('Query Table Data');
    expect(tool.spec.description).toBe(
      'Query data from a Deephaven table with support for filtering, sorting, aggregations, and row limiting. Returns data in a format easily represented as a table or values in chat.'
    );
  });

  it('should successfully query table data without filters', async () => {
    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(mockSession.getObject).toHaveBeenCalledWith({
      type: 'Table',
      name: 'myTable',
    });
    expect(MOCK_TABLE.setViewport).toHaveBeenCalledWith(0, 1);
    expect(MOCK_TABLE.close).toHaveBeenCalled();
    expect(result.structuredContent).toEqual(
      mcpSuccessResult('Showing all 2 rows', {
        /* eslint-disable @typescript-eslint/naming-convention */
        data: [
          { Symbol: 'AAPL', Price: 150.25 },
          { Symbol: 'GOOGL', Price: 2800.5 },
        ],
        /* eslint-enable @typescript-eslint/naming-convention */
        columns: [
          { name: 'Symbol', type: 'java.lang.String' },
          { name: 'Price', type: 'double' },
        ],
        rowCount: 2,
        totalRows: 2,
      })
    );
  });

  it('should apply maxRows limit', async () => {
    vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

    const largeTable = {
      ...MOCK_TABLE,
      size: 1000,
    } as unknown as DhcType.Table;

    vi.mocked(mockSession.getObject).mockResolvedValue(largeTable);

    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'largeTable',
      maxRows: 50,
    });

    expect(largeTable.setViewport).toHaveBeenCalledWith(0, 49);
    expect(result.structuredContent).toMatchObject({
      success: true,
      message: 'Showing 2 of 1000 rows',
      details: {
        rowCount: 2,
        totalRows: 1000,
      },
    });
  });

  it('should initialize session if not initialized', async () => {
    Object.defineProperty(mockConnection, 'isInitialized', {
      get: vi.fn(() => false),
      configurable: true,
    });

    vi.mocked(serverManager.getConnections).mockReturnValue([mockConnection]);
    vi.mocked(coreJsApiCache.get).mockResolvedValue(MOCK_DH);

    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
    await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(mockConnection.getSession).toHaveBeenCalled();
  });

  it('should handle invalid URL', async () => {
    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
    const result = await tool.handler({
      connectionUrl: 'invalid-url',
      tableName: 'myTable',
    });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('Invalid URL: Invalid URL', {
        connectionUrl: 'invalid-url',
      })
    );
    expect(serverManager.getServer).not.toHaveBeenCalled();
  });

  it('should handle missing connection', async () => {
    vi.mocked(serverManager.getServer).mockReturnValue(undefined);

    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('No connections or server found', {
        connectionUrl: MOCK_DHC_URL.href,
      })
    );
  });

  it('should handle errors and close table', async () => {
    const error = new Error('Query failed');
    vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);
    vi.mocked(MOCK_TABLE.getViewportData).mockRejectedValue(error);

    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(MOCK_TABLE.close).toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({
      success: false,
      message: 'Failed to query table data: Query failed',
      details: {
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'myTable',
      },
    });
  });

  it('should apply filters', async () => {
    vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

    const mockColumnFilter = {
      eq: vi.fn().mockReturnValue({ type: 'condition' }),
    };
    vi.mocked(MOCK_COLUMN.filter).mockReturnValue(
      mockColumnFilter as unknown as any
    );

    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
    await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      query: {
        filters: [
          {
            column: 'Symbol',
            operation: 'eq',
            value: 'AAPL',
            valueType: 'string',
          },
        ],
      },
    });

    expect(MOCK_DH.FilterValue.ofString).toHaveBeenCalledWith('AAPL');
    expect(MOCK_TABLE.applyFilter).toHaveBeenCalled();
  });

  it('should handle missing session', async () => {
    vi.mocked(serverManager.getConnections).mockReturnValue([mockConnection]);
    vi.mocked(mockConnection.getSession).mockResolvedValue(null);

    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('Unable to access session', {
        connectionUrl: MOCK_DHC_URL.href,
      })
    );
  });

  it('should apply filters and wait for filterchanged event', async () => {
    vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

    const mockColumnFilter = {
      eq: vi.fn().mockReturnValue({ type: 'condition' }),
    };
    vi.mocked(MOCK_COLUMN.filter).mockReturnValue(
      mockColumnFilter as unknown as any
    );

    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
    await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      query: {
        filters: [
          {
            column: 'Symbol',
            operation: 'eq',
            value: 'AAPL',
            valueType: 'string',
          },
        ],
      },
    });

    expect(MOCK_DH.FilterValue.ofString).toHaveBeenCalledWith('AAPL');
    expect(MOCK_TABLE.applyFilter).toHaveBeenCalled();
  });

  it('should apply sorts and wait for sortchanged event', async () => {
    vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

    const mockSort = {
      asc: vi.fn().mockReturnValue({ type: 'asc' }),
    };
    vi.mocked(MOCK_COLUMN.sort).mockReturnValue(mockSort as unknown as any);

    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
    await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      query: {
        sortBy: [{ column: 'Symbol', direction: 'asc' }],
      },
    });

    expect(MOCK_TABLE.findColumn).toHaveBeenCalledWith('Symbol');
    expect(MOCK_TABLE.applySort).toHaveBeenCalled();
  });

  it('should apply groupBy and aggregations', async () => {
    vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

    const mockTotalsTable = {
      ...MOCK_TABLE,
      close: vi.fn(),
      setViewport: vi.fn(),
      getViewportData: vi.fn().mockResolvedValue(MOCK_VIEWPORT_DATA),
    } as unknown as DhcType.TotalsTable;

    vi.mocked(MOCK_TABLE.getTotalsTable).mockResolvedValue(mockTotalsTable);

    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
    await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      query: {
        groupBy: ['Symbol'],
        aggregations: [{ column: 'Price', operation: 'Sum' }],
      },
    });

    expect(MOCK_TABLE.getTotalsTable).toHaveBeenCalledWith(
      /* eslint-disable @typescript-eslint/naming-convention */
      expect.objectContaining({
        groupBy: ['Symbol'],
        operationMap: { Price: ['Sum'] },
      })
      /* eslint-enable @typescript-eslint/naming-convention */
    );
    expect(mockTotalsTable.close).toHaveBeenCalled();
    expect(MOCK_TABLE.close).toHaveBeenCalled();
  });

  it('should close table even on success', async () => {
    vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
    await tool.handler({
      connectionUrl: 'http://localhost:10000',
      tableName: 'myTable',
    });

    expect(MOCK_TABLE.close).toHaveBeenCalled();
  });
});
