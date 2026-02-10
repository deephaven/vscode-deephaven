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

/* eslint-disable @typescript-eslint/naming-convention */
const EXPECTED_SUCCESS = mcpSuccessResult('Showing all 2 rows', {
  data: [
    { Symbol: 'AAPL', Price: 150.25 },
    { Symbol: 'GOOGL', Price: 2800.5 },
  ],
  columns: [
    { name: 'Symbol', type: 'java.lang.String' },
    { name: 'Price', type: 'double' },
  ],
  rowCount: 2,
  totalRows: 2,
});
/* eslint-enable @typescript-eslint/naming-convention */

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
    expect(result.structuredContent).toEqual(EXPECTED_SUCCESS);
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

    // getSession() now handles session initialization internally
    expect(mockConnection.getSession).toHaveBeenCalled();
  });

  it('should handle invalid URL', async () => {
    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
    const result = await tool.handler({
      connectionUrl: 'invalid-url',
      tableName: 'myTable',
    });

    expect(result.structuredContent).toEqual(EXPECTED_INVALID_URL);
    expect(serverManager.getServer).not.toHaveBeenCalled();
  });

  it('should handle missing connection', async () => {
    vi.mocked(serverManager.getServer).mockReturnValue(undefined);

    const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(result.structuredContent).toEqual(EXPECTED_NO_CONNECTION);
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

    expect(result.structuredContent).toEqual(EXPECTED_NO_SESSION);
  });

  describe('filter operations', () => {
    it.each([
      {
        operation: 'isNull' as const,
        value: undefined,
        valueType: undefined,
        mockMethod: 'isNull',
        mockReturnValue: { type: 'isNull' },
      },
      {
        operation: 'isTrue' as const,
        value: undefined,
        valueType: undefined,
        mockMethod: 'isTrue',
        mockReturnValue: { type: 'isTrue' },
      },
      {
        operation: 'isFalse' as const,
        value: undefined,
        valueType: undefined,
        mockMethod: 'isFalse',
        mockReturnValue: { type: 'isFalse' },
      },
      {
        operation: 'eq' as const,
        value: 'AAPL',
        valueType: 'string' as const,
        mockMethod: 'eq',
        mockReturnValue: { type: 'eq' },
      },
      {
        operation: 'notEq' as const,
        value: 'AAPL',
        valueType: 'string' as const,
        mockMethod: 'notEq',
        mockReturnValue: { type: 'notEq' },
      },
      {
        operation: 'greaterThan' as const,
        value: 100,
        valueType: 'number' as const,
        mockMethod: 'greaterThan',
        mockReturnValue: { type: 'greaterThan' },
      },
      {
        operation: 'lessThan' as const,
        value: 100,
        valueType: 'number' as const,
        mockMethod: 'lessThan',
        mockReturnValue: { type: 'lessThan' },
      },
      {
        operation: 'greaterThanOrEqualTo' as const,
        value: 100,
        valueType: 'number' as const,
        mockMethod: 'greaterThanOrEqualTo',
        mockReturnValue: { type: 'greaterThanOrEqualTo' },
      },
      {
        operation: 'lessThanOrEqualTo' as const,
        value: 100,
        valueType: 'number' as const,
        mockMethod: 'lessThanOrEqualTo',
        mockReturnValue: { type: 'lessThanOrEqualTo' },
      },
      {
        operation: 'contains' as const,
        value: 'apple',
        valueType: 'string' as const,
        mockMethod: 'contains',
        mockReturnValue: { type: 'contains' },
      },
      {
        operation: 'matches' as const,
        value: '^A.*',
        valueType: 'string' as const,
        mockMethod: 'matches',
        mockReturnValue: { type: 'matches' },
      },
    ])(
      'should apply $operation filter',
      async ({ operation, value, valueType, mockMethod, mockReturnValue }) => {
        vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

        const mockColumnFilter = {
          [mockMethod]: vi.fn().mockReturnValue(mockReturnValue),
        };
        vi.mocked(MOCK_COLUMN.filter).mockReturnValue(
          mockColumnFilter as unknown as any
        );

        const tool = createQueryTableDataTool({
          serverManager,
          coreJsApiCache,
        });
        await tool.handler({
          connectionUrl: 'http://localhost:10000',
          tableName: 'myTable',
          query: {
            filters: [
              {
                column: 'Symbol',
                operation,
                value,
                valueType,
              },
            ],
          },
        });

        expect(MOCK_TABLE.findColumn).toHaveBeenCalledWith('Symbol');
        expect(MOCK_COLUMN.filter).toHaveBeenCalled();
        expect(mockColumnFilter[mockMethod]).toHaveBeenCalled();
        expect(MOCK_TABLE.applyFilter).toHaveBeenCalled();
      }
    );

    it.each([
      {
        operation: 'in' as const,
        value: ['AAPL', 'GOOGL'],
        valueType: 'string' as const,
        mockMethod: 'in',
      },
      {
        operation: 'notIn' as const,
        value: ['AAPL', 'GOOGL'],
        valueType: 'string' as const,
        mockMethod: 'notIn',
      },
      {
        operation: 'inIgnoreCase' as const,
        value: ['aapl', 'googl'],
        valueType: 'string' as const,
        mockMethod: 'inIgnoreCase',
      },
      {
        operation: 'notInIgnoreCase' as const,
        value: ['aapl', 'googl'],
        valueType: 'string' as const,
        mockMethod: 'notInIgnoreCase',
      },
    ])(
      'should apply $operation filter with array value',
      async ({ operation, value, valueType, mockMethod }) => {
        vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

        const mockColumnFilter = {
          [mockMethod]: vi.fn().mockReturnValue({ type: operation }),
        };
        vi.mocked(MOCK_COLUMN.filter).mockReturnValue(
          mockColumnFilter as unknown as any
        );

        const tool = createQueryTableDataTool({
          serverManager,
          coreJsApiCache,
        });
        await tool.handler({
          connectionUrl: 'http://localhost:10000',
          tableName: 'myTable',
          query: {
            filters: [
              {
                column: 'Symbol',
                operation,
                value,
                valueType,
              },
            ],
          },
        });

        expect(mockColumnFilter[mockMethod]).toHaveBeenCalled();
        expect(MOCK_DH.FilterValue.ofString).toHaveBeenCalledTimes(
          value.length
        );
      }
    );

    it('should handle filter value types', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const mockColumnFilter = {
        eq: vi.fn().mockReturnValue({ type: 'eq' }),
      };
      vi.mocked(MOCK_COLUMN.filter).mockReturnValue(
        mockColumnFilter as unknown as any
      );

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });

      // Number filter
      await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
        query: {
          filters: [
            {
              column: 'Symbol',
              operation: 'eq',
              value: 123,
              valueType: 'number',
            },
          ],
        },
      });
      expect(MOCK_DH.FilterValue.ofNumber).toHaveBeenCalledWith(123);

      vi.clearAllMocks();
      vi.mocked(MOCK_COLUMN.filter).mockReturnValue(
        mockColumnFilter as unknown as any
      );

      // Boolean filter
      await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
        query: {
          filters: [
            {
              column: 'Symbol',
              operation: 'eq',
              value: true,
              valueType: 'boolean',
            },
          ],
        },
      });
      expect(MOCK_DH.FilterValue.ofBoolean).toHaveBeenCalledWith(true);

      vi.clearAllMocks();
      vi.mocked(MOCK_COLUMN.filter).mockReturnValue(
        mockColumnFilter as unknown as any
      );

      // DateTime filter
      await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
        query: {
          filters: [
            {
              column: 'Symbol',
              operation: 'eq',
              value: '2023-01-01',
              valueType: 'datetime',
            },
          ],
        },
      });
      expect(MOCK_DH.FilterValue.ofNumber).toHaveBeenCalled();
    });

    it('should throw error for unsupported filter value type', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const mockColumnFilter = {
        eq: vi.fn().mockReturnValue({ type: 'eq' }),
      };
      vi.mocked(MOCK_COLUMN.filter).mockReturnValue(
        mockColumnFilter as unknown as any
      );

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });

      await expect(
        tool.handler({
          connectionUrl: 'http://localhost:10000',
          tableName: 'myTable',
          query: {
            filters: [
              {
                column: 'Symbol',
                operation: 'eq',
                value: 'test',
                valueType: 'unsupported' as any,
              },
            ],
          },
        })
      ).resolves.toMatchObject({
        structuredContent: expect.objectContaining({
          success: false,
          message: expect.stringContaining('Failed to query table data'),
        }),
      });
    });

    it('should throw error when filter operation requires value but none provided', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });

      await expect(
        tool.handler({
          connectionUrl: 'http://localhost:10000',
          tableName: 'myTable',
          query: {
            filters: [
              {
                column: 'Symbol',
                operation: 'eq',
                value: undefined,
                valueType: undefined,
              },
            ],
          },
        })
      ).resolves.toMatchObject({
        structuredContent: expect.objectContaining({
          success: false,
          message: expect.stringContaining('Failed to query table data'),
        }),
      });
    });

    it('should throw error when array filter operation receives non-array value', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });

      await expect(
        tool.handler({
          connectionUrl: 'http://localhost:10000',
          tableName: 'myTable',
          query: {
            filters: [
              {
                column: 'Symbol',
                operation: 'in',
                value: 'AAPL',
                valueType: 'string',
              },
            ],
          },
        })
      ).resolves.toMatchObject({
        structuredContent: expect.objectContaining({
          success: false,
          message: expect.stringContaining('Failed to query table data'),
        }),
      });
    });
  });

  describe('sort operations', () => {
    const mockSort = {
      asc: vi.fn().mockReturnValue({ type: 'asc' }),
      desc: vi.fn().mockReturnValue({ type: 'desc' }),
    };

    beforeEach(() => {
      vi.mocked(MOCK_COLUMN.sort).mockReturnValue(mockSort as unknown as any);
    });

    it('should apply ascending sort', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
      await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
        query: {
          sortBy: [{ column: 'Symbol', direction: 'asc' }],
        },
      });

      expect(MOCK_TABLE.findColumn).toHaveBeenCalledWith('Symbol');
      expect(MOCK_COLUMN.sort).toHaveBeenCalled();
      expect(mockSort.asc).toHaveBeenCalled();
      expect(MOCK_TABLE.applySort).toHaveBeenCalled();
    });

    it('should apply descending sort', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
      await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
        query: {
          sortBy: [{ column: 'Symbol', direction: 'desc' }],
        },
      });

      expect(mockSort.desc).toHaveBeenCalled();
      expect(MOCK_TABLE.applySort).toHaveBeenCalled();
    });

    it('should apply multiple sorts', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
      await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
        query: {
          sortBy: [
            { column: 'Symbol', direction: 'asc' },
            { column: 'Price', direction: 'desc' },
          ],
        },
      });

      expect(MOCK_TABLE.applySort).toHaveBeenCalled();
    });

    it('should default to ascending when direction not specified', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
      await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
        query: {
          sortBy: [{ column: 'Symbol' }],
        },
      });

      expect(mockSort.asc).toHaveBeenCalled();
    });
  });

  describe('aggregation operations', () => {
    const mockTotalsTable = {
      ...MOCK_TABLE,
      close: vi.fn(),
    } as unknown as DhcType.TotalsTable;

    beforeEach(() => {
      vi.mocked(MOCK_TABLE.getTotalsTable).mockResolvedValue(mockTotalsTable);
    });

    it('should apply groupBy', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
      await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
        query: {
          groupBy: ['Symbol'],
        },
      });

      expect(MOCK_TABLE.getTotalsTable).toHaveBeenCalledWith(
        expect.objectContaining({
          groupBy: ['Symbol'],
        })
      );
    });

    it('should apply aggregations with operation map', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
      await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
        query: {
          groupBy: ['Symbol'],
          aggregations: [
            { column: 'Price', operation: 'Avg' },
            { column: 'Volume', operation: 'Sum' },
          ],
        },
      });

      expect(MOCK_TABLE.getTotalsTable).toHaveBeenCalledWith(
        /* eslint-disable @typescript-eslint/naming-convention */
        expect.objectContaining({
          groupBy: ['Symbol'],
          operationMap: {
            Price: ['Avg'],
            Volume: ['Sum'],
          },
        })
        /* eslint-enable @typescript-eslint/naming-convention */
      );
    });

    it('should apply default operation', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
      await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
        query: {
          groupBy: ['Symbol'],
          defaultOperation: 'Sum',
        },
      });

      expect(MOCK_TABLE.getTotalsTable).toHaveBeenCalledWith(
        expect.objectContaining({
          groupBy: ['Symbol'],
          defaultOperation: 'Sum',
        })
      );
    });

    it('should close both totals table and base table', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
      await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
        query: {
          groupBy: ['Symbol'],
        },
      });

      expect(mockTotalsTable.close).toHaveBeenCalled();
      expect(MOCK_TABLE.close).toHaveBeenCalled();
    });

    it('should handle multiple aggregations on same column', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
      await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
        query: {
          groupBy: ['Symbol'],
          aggregations: [
            { column: 'Price', operation: 'Min' },
            { column: 'Price', operation: 'Max' },
            { column: 'Price', operation: 'Avg' },
          ],
        },
      });

      expect(MOCK_TABLE.getTotalsTable).toHaveBeenCalledWith(
        /* eslint-disable @typescript-eslint/naming-convention */
        expect.objectContaining({
          operationMap: {
            Price: ['Min', 'Max', 'Avg'],
          },
        })
        /* eslint-enable @typescript-eslint/naming-convention */
      );
    });
  });

  describe('data formatting', () => {
    it('should format bigint values as strings', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const mockViewportDataWithBigInt = {
        rows: [
          {
            get: vi.fn((col: DhcType.Column) => {
              if (col.name === 'Volume') {
                return BigInt('9007199254740991');
              }
              return null;
            }),
          },
        ],
      } as unknown as DhcType.ViewportData;

      vi.mocked(MOCK_TABLE.getViewportData).mockResolvedValue(
        mockViewportDataWithBigInt
      );

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
      const result = await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
      });

      expect(result.structuredContent).toMatchObject({
        success: true,
        details: {
          /* eslint-disable @typescript-eslint/naming-convention */
          data: [
            {
              Symbol: null,
              Price: null,
            },
          ],
          /* eslint-enable @typescript-eslint/naming-convention */
        },
      });
    });

    it('should format Date values as timestamps', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const testDate = new Date('2023-01-01T12:00:00Z');
      const mockViewportDataWithDate = {
        rows: [
          {
            get: vi.fn((col: DhcType.Column) => {
              if (col.name === 'Symbol') {
                return testDate;
              }
              return null;
            }),
          },
        ],
      } as unknown as DhcType.ViewportData;

      vi.mocked(MOCK_TABLE.getViewportData).mockResolvedValue(
        mockViewportDataWithDate
      );

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
      const result = await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
      });

      expect(result.structuredContent).toMatchObject({
        success: true,
        details: {
          /* eslint-disable @typescript-eslint/naming-convention */
          data: [
            {
              Symbol: testDate.getTime(),
              Price: null,
            },
          ],
          /* eslint-enable @typescript-eslint/naming-convention */
        },
      });
    });

    it('should handle null and undefined values', async () => {
      vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

      const mockViewportDataWithNulls = {
        rows: [
          {
            get: vi.fn(() => null),
          },
          {
            get: vi.fn(() => undefined),
          },
        ],
      } as unknown as DhcType.ViewportData;

      vi.mocked(MOCK_TABLE.getViewportData).mockResolvedValue(
        mockViewportDataWithNulls
      );

      const tool = createQueryTableDataTool({ serverManager, coreJsApiCache });
      const result = await tool.handler({
        connectionUrl: 'http://localhost:10000',
        tableName: 'myTable',
      });

      expect(result.structuredContent).toMatchObject({
        success: true,
        details: {
          /* eslint-disable @typescript-eslint/naming-convention */
          data: [
            { Symbol: null, Price: null },
            { Symbol: null, Price: null },
          ],
          /* eslint-enable @typescript-eslint/naming-convention */
        },
      });
    });
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
