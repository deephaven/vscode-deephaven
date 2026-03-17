import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { fetchVariableDefinitionByPredicate } from '@deephaven/jsapi-utils';
import type { IAsyncCacheService, IServerManager } from '../../types';
import { createMockDhcService, MOCK_DHC_URL } from './mcpTestUtils';
import { getFirstConnectionOrCreate } from './serverUtils';
import {
  convertColumnStatsToRecords,
  formatTableColumns,
  formatTableRow,
  formatValue,
  getTableOrError,
  getTablePage,
  isTableType,
} from './tableUtils';

vi.mock('vscode');

vi.mock('@deephaven/jsapi-utils', () => ({
  fetchVariableDefinitionByPredicate: vi.fn(),
}));

vi.mock('./serverUtils', () => ({
  getFirstConnectionOrCreate: vi.fn(),
}));

describe('tableUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTableOrError', () => {
    const mockTable = { type: 'Table' } as unknown as DhcType.Table;

    const mockDh = {
      VariableType: {
        TABLE: 'Table',
        TREETABLE: 'TreeTable',
        HIERARCHICALTABLE: 'HierarchicalTable',
        PARTITIONEDTABLE: 'PartitionedTable',
      },
    } as unknown as typeof DhcType;

    const coreJsApiCache = {
      get: vi.fn().mockResolvedValue(mockDh),
      has: vi.fn(),
      invalidate: vi.fn(),
      dispose: vi.fn(),
      onDidInvalidate: vi.fn(),
    } as unknown as IAsyncCacheService<URL, typeof DhcType>;

    const serverManager: IServerManager = {
      getServer: vi.fn(),
      getConnections: vi.fn(),
      getDheServiceForWorker: vi.fn(),
      getWorkerInfo: vi.fn(),
    } as unknown as IServerManager;

    describe('error cases', () => {
      it('should return error when neither variableId nor tableName provided', async () => {
        const result = await getTableOrError({
          coreJsApiCache,
          serverManager,
          connectionUrlStr: MOCK_DHC_URL.href,
        });

        expect(result).toEqual({
          success: false,
          errorMessage: 'Either variableId or tableName must be provided',
          details: { connectionUrl: MOCK_DHC_URL.href },
        });
      });

      it('should return error when URL is invalid', async () => {
        const result = await getTableOrError({
          coreJsApiCache,
          serverManager,
          connectionUrlStr: 'not-a-valid-url',
          tableName: 'my_table',
        });

        expect(result).toEqual({
          success: false,
          errorMessage: 'Invalid URL',
          error: expect.stringContaining('Invalid URL'),
          details: {
            connectionUrl: 'not-a-valid-url',
            variableId: undefined,
            tableName: 'my_table',
          },
        });
      });

      it('should return error when getFirstConnectionOrCreate fails', async () => {
        vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
          success: false,
          errorMessage: 'Mock error',
          details: { connectionUrl: MOCK_DHC_URL.href },
        });

        const result = await getTableOrError({
          coreJsApiCache,
          serverManager,
          connectionUrlStr: MOCK_DHC_URL.href,
          tableName: 'my_table',
        });

        expect(result).toEqual({
          success: false,
          errorMessage: 'Mock error',
          details: { connectionUrl: MOCK_DHC_URL.href, tableName: 'my_table' },
        });
      });

      it('should return error when connection is not available', async () => {
        const mockConnection = createMockDhcService({
          serverUrl: MOCK_DHC_URL,
        });
        vi.spyOn(mockConnection, 'getConnection').mockResolvedValue(null);

        vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
          success: true,
          connection: mockConnection,
          panelUrlFormat: 'mock.panelUrlFormat',
        });

        const result = await getTableOrError({
          coreJsApiCache,
          serverManager,
          connectionUrlStr: MOCK_DHC_URL.href,
          tableName: 'my_table',
        });

        expect(result).toEqual({
          success: false,
          errorMessage: 'Unable to access connection',
          details: { connectionUrl: MOCK_DHC_URL.href, tableName: 'my_table' },
        });
      });

      it('should return error when variable is not a table type', async () => {
        const mockConnection = createMockDhcService({
          serverUrl: MOCK_DHC_URL,
        });
        const mockVariableDef = {
          type: 'Figure',
          id: 'mock-id',
          name: 'my_figure',
          title: 'my_figure',
        } as DhcType.ide.VariableDefinition;
        const mockSession = {
          getObject: vi.fn().mockResolvedValue({} as unknown as DhcType.Table),
        } as unknown as DhcType.IdeSession;
        vi.spyOn(mockConnection, 'getConnection').mockResolvedValue(
          mockSession
        );
        vi.mocked(fetchVariableDefinitionByPredicate).mockResolvedValue(
          mockVariableDef
        );

        vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
          success: true,
          connection: mockConnection,
          panelUrlFormat: 'mock.panelUrlFormat',
        });

        const result = await getTableOrError({
          coreJsApiCache,
          serverManager,
          connectionUrlStr: MOCK_DHC_URL.href,
          tableName: 'my_figure',
        });

        expect(result).toEqual({
          success: false,
          errorMessage: 'Variable is not a table',
          details: {
            connectionUrl: MOCK_DHC_URL.href,
            variableId: undefined,
            tableName: 'my_figure',
          },
        });
      });
    });

    describe('success cases', () => {
      it('should return table when connection and session are available', async () => {
        const mockConnection = createMockDhcService({
          serverUrl: MOCK_DHC_URL,
        });
        const mockVariableDef = {
          type: 'Table',
          id: 'mock-id',
          name: 'my_table',
          title: 'my_table',
        } as DhcType.ide.VariableDefinition;
        const mockSession = {
          getObject: vi.fn().mockResolvedValue(mockTable),
        } as unknown as DhcType.IdeSession;
        vi.spyOn(mockConnection, 'getConnection').mockResolvedValue(
          mockSession
        );
        vi.mocked(fetchVariableDefinitionByPredicate).mockResolvedValue(
          mockVariableDef
        );

        vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
          success: true,
          connection: mockConnection,
          panelUrlFormat: 'mock.panelUrlFormat',
        });

        const result = await getTableOrError({
          coreJsApiCache,
          serverManager,
          connectionUrlStr: MOCK_DHC_URL.href,
          tableName: 'my_table',
        });

        expect(fetchVariableDefinitionByPredicate).toHaveBeenCalledWith(
          mockSession,
          expect.any(Function)
        );
        // Verify the predicate function works correctly
        const predicate = vi
          .mocked(fetchVariableDefinitionByPredicate)
          .mock.calls[0][1];
        expect(predicate({ name: 'my_table' } as DhcType.ide.VariableDefinition)).toBe(true);
        expect(predicate({ name: 'other_table' } as DhcType.ide.VariableDefinition)).toBe(false);

        expect(result).toEqual({
          success: true,
          table: mockTable,
          connectionUrl: MOCK_DHC_URL,
        });
      });

      it('should return table when variableId is provided', async () => {
        const mockConnection = createMockDhcService({
          serverUrl: MOCK_DHC_URL,
        });
        const mockVariableDef = {
          type: 'Table',
          id: 'my-var-id',
          name: 'my_table',
          title: 'my_table',
        } as DhcType.ide.VariableDefinition;
        const mockSession = {
          getObject: vi.fn().mockResolvedValue(mockTable),
        } as unknown as DhcType.IdeSession;
        vi.spyOn(mockConnection, 'getConnection').mockResolvedValue(
          mockSession
        );
        vi.mocked(fetchVariableDefinitionByPredicate).mockResolvedValue(
          mockVariableDef
        );

        vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
          success: true,
          connection: mockConnection,
          panelUrlFormat: 'mock.panelUrlFormat',
        });

        const result = await getTableOrError({
          coreJsApiCache,
          serverManager,
          connectionUrlStr: MOCK_DHC_URL.href,
          variableId: 'my-var-id',
        });

        expect(fetchVariableDefinitionByPredicate).toHaveBeenCalledWith(
          mockSession,
          expect.any(Function)
        );
        // Verify the predicate function works correctly for variableId
        const predicate = vi
          .mocked(fetchVariableDefinitionByPredicate)
          .mock.calls[0][1];
        expect(predicate({ id: 'my-var-id' } as DhcType.ide.VariableDefinition)).toBe(true);
        expect(predicate({ id: 'other-id' } as DhcType.ide.VariableDefinition)).toBe(false);

        expect(result).toEqual({
          success: true,
          table: mockTable,
          connectionUrl: MOCK_DHC_URL,
        });
      });

      it('should return tree table when tableName resolves to TreeTable type', async () => {
        const mockTreeTable = {
          type: 'TreeTable',
        } as unknown as DhcType.Table;
        const mockConnection = createMockDhcService({
          serverUrl: MOCK_DHC_URL,
        });
        const mockTreeVariableDef = {
          type: 'TreeTable',
          id: 'tree-id',
          name: 'my_tree',
          title: 'my_tree',
        } as DhcType.ide.VariableDefinition;
        const mockSession = {
          getObject: vi.fn().mockResolvedValue(mockTreeTable),
        } as unknown as DhcType.IdeSession;
        vi.spyOn(mockConnection, 'getConnection').mockResolvedValue(
          mockSession
        );
        vi.mocked(fetchVariableDefinitionByPredicate).mockResolvedValue(
          mockTreeVariableDef
        );

        vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
          success: true,
          connection: mockConnection,
          panelUrlFormat: 'mock.panelUrlFormat',
        });

        const result = await getTableOrError({
          coreJsApiCache,
          serverManager,
          connectionUrlStr: MOCK_DHC_URL.href,
          tableName: 'my_tree',
        });

        expect(mockSession.getObject).toHaveBeenCalledWith(mockTreeVariableDef);
        expect(result).toEqual({
          success: true,
          table: mockTreeTable,
          connectionUrl: MOCK_DHC_URL,
        });
      });
    });
  });

  describe('formatValue', () => {
    it.each([
      {
        name: 'null',
        input: null,
        expected: null,
      },
      {
        name: 'undefined',
        input: undefined,
        expected: null,
      },
      {
        name: 'string',
        input: 'string',
        expected: 'string',
      },
      {
        name: 'number',
        input: 123,
        expected: 123,
      },
      {
        name: 'boolean',
        input: true,
        expected: true,
      },
    ])('should handle $name values', ({ input, expected }) => {
      expect(formatValue(input)).toBe(expected);
    });

    it('should call valueOf() on objects', () => {
      const obj = {
        valueOf: vi.fn().mockReturnValue(42),
      };
      expect(formatValue(obj)).toBe(42);
      expect(obj.valueOf).toHaveBeenCalled();
    });

    it('should handle Date objects', () => {
      const date = new Date('2023-01-01T00:00:00Z');
      const result = formatValue(date);
      expect(result).toBe(date.getTime());
    });

    it('should handle bigint values', () => {
      const value = { valueOf: (): string => '9007199254740991' };
      expect(formatValue(value)).toBe('9007199254740991');
    });
  });

  describe('formatTableRow', () => {
    it('should format row with multiple columns', () => {
      const mockRow = {
        get: vi.fn((col: DhcType.Column) => {
          if (col.name === 'Symbol') {
            return 'AAPL';
          }
          if (col.name === 'Price') {
            return 150.25;
          }
          return null;
        }),
      } as unknown as DhcType.Row;

      const columns = [
        { name: 'Symbol', type: 'string' },
        { name: 'Price', type: 'double' },
      ] as DhcType.Column[];

      const result = formatTableRow(mockRow, columns);

      /* eslint-disable @typescript-eslint/naming-convention */
      expect(result).toEqual({
        Symbol: 'AAPL',
        Price: 150.25,
      });
      /* eslint-enable @typescript-eslint/naming-convention */
    });

    it('should handle null values', () => {
      const mockRow = {
        get: vi.fn(() => null),
      } as unknown as DhcType.Row;

      const columns = [{ name: 'Symbol', type: 'string' }] as DhcType.Column[];

      const result = formatTableRow(mockRow, columns);

      /* eslint-disable @typescript-eslint/naming-convention */
      expect(result).toEqual({
        Symbol: null,
      });
      /* eslint-enable @typescript-eslint/naming-convention */
    });
  });

  describe('convertColumnStatsToRecords', () => {
    it('should convert column statistics to records', () => {
      const mockStats = {
        statisticsMap: new Map([
          ['MIN', 10.5],
          ['MAX', 150.75],
          ['AVG', 75.25],
        ]),
        uniqueValues: new Map([
          ['10.5', 5],
          ['75.25', 10],
          ['150.75', 3],
        ]),
      } as unknown as DhcType.ColumnStatistics;

      const result = convertColumnStatsToRecords(mockStats);

      /* eslint-disable @typescript-eslint/naming-convention */
      expect(result).toEqual({
        statistics: {
          MIN: 10.5,
          MAX: 150.75,
          AVG: 75.25,
        },
        uniqueValues: {
          '10.5': 5,
          '75.25': 10,
          '150.75': 3,
        },
      });
      /* eslint-enable @typescript-eslint/naming-convention */
    });

    it('should handle empty statistics', () => {
      const mockStats = {
        statisticsMap: new Map(),
        uniqueValues: new Map(),
      } as unknown as DhcType.ColumnStatistics;

      const result = convertColumnStatsToRecords(mockStats);

      expect(result).toEqual({
        statistics: {},
        uniqueValues: {},
      });
    });
  });

  describe('formatTableColumns', () => {
    it('should format columns with metadata', () => {
      const columns = [
        { name: 'Symbol', type: 'java.lang.String', description: 'Stock symbol' },
        { name: 'Price', type: 'double' },
        { name: 'Volume', type: 'long', description: 'Trading volume' },
      ] as DhcType.Column[];

      const result = formatTableColumns(columns);

      expect(result).toEqual([
        { name: 'Symbol', type: 'java.lang.String', description: 'Stock symbol' },
        { name: 'Price', type: 'double' },
        { name: 'Volume', type: 'long', description: 'Trading volume' },
      ]);
    });

    it('should handle columns without descriptions', () => {
      const columns = [
        { name: 'Symbol', type: 'java.lang.String', description: null },
        { name: 'Price', type: 'double' },
      ] as unknown as DhcType.Column[];

      const result = formatTableColumns(columns);

      expect(result).toEqual([
        { name: 'Symbol', type: 'java.lang.String' },
        { name: 'Price', type: 'double' },
      ]);
    });
  });

  describe('getTablePage', () => {
    it('should get paginated table data', async () => {
      const mockRow1 = {
        get: vi.fn((col: DhcType.Column) => {
          if (col.name === 'Symbol') {
            return 'AAPL';
          }
          if (col.name === 'Price') {
            return 150.25;
          }
          return null;
        }),
      } as unknown as DhcType.Row;

      const mockRow2 = {
        get: vi.fn((col: DhcType.Column) => {
          if (col.name === 'Symbol') {
            return 'GOOGL';
          }
          if (col.name === 'Price') {
            return 2800.5;
          }
          return null;
        }),
      } as unknown as DhcType.Row;

      const mockTable = {
        size: 100,
        columns: [
          { name: 'Symbol', type: 'java.lang.String' },
          { name: 'Price', type: 'double' },
        ],
        setViewport: vi.fn(),
        getViewportData: vi.fn().mockResolvedValue({
          rows: [mockRow1, mockRow2],
        }),
      } as unknown as DhcType.Table;

      const result = await getTablePage(mockTable, 0, 10);

      expect(mockTable.setViewport).toHaveBeenCalledWith(0, 9);
      expect(result).toEqual({
        columns: [
          { name: 'Symbol', type: 'java.lang.String' },
          { name: 'Price', type: 'double' },
        ],
        data: [
          /* eslint-disable @typescript-eslint/naming-convention */
          { Symbol: 'AAPL', Price: 150.25 },
          { Symbol: 'GOOGL', Price: 2800.5 },
          /* eslint-enable @typescript-eslint/naming-convention */
        ],
        hasMore: true,
        rowCount: 2,
        totalRows: 100,
      });
    });

    it('should set hasMore to false when at end of table', async () => {
      const mockTable = {
        size: 5,
        columns: [{ name: 'Symbol', type: 'java.lang.String' }],
        setViewport: vi.fn(),
        getViewportData: vi.fn().mockResolvedValue({ rows: [] }),
      } as unknown as DhcType.Table;

      const result = await getTablePage(mockTable, 0, 10);

      expect(result.hasMore).toBe(false);
    });
  });

  describe('isTableType', () => {
    const mockDh = {
      VariableType: {
        TABLE: 'Table',
        TREETABLE: 'TreeTable',
        HIERARCHICALTABLE: 'HierarchicalTable',
        PARTITIONEDTABLE: 'PartitionedTable',
        FIGURE: 'Figure',
      },
    } as unknown as typeof DhcType;

    it.each([
      { type: 'Table', expected: true },
      { type: 'TreeTable', expected: true },
      { type: 'HierarchicalTable', expected: true },
      { type: 'PartitionedTable', expected: true },
      { type: 'Figure', expected: false },
      { type: 'OtherType', expected: false },
    ])('should return $expected for type $type', ({ type, expected }) => {
      const result = isTableType(mockDh, type);
      expect(result).toBe(expected);
    });
  });
});
