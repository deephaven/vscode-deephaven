import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';

import { createGetColumnStatsTool } from './getColumnStats';
import type { IAsyncCacheService, IServerManager } from '../../types';
import {
  fakeMcpToolTimings,
  mcpSuccessResult,
  MOCK_DHC_URL,
} from '../utils/mcpTestUtils';
import { getTableOrError } from '../utils/tableUtils';

vi.mock('vscode');
vi.mock('../utils/tableUtils', () => ({
  getTableOrError: vi.fn(),
  convertColumnStatsToRecords: vi.fn(stats => ({
    statistics: Object.fromEntries(stats.statisticsMap),
    uniqueValues: Object.fromEntries(stats.uniqueValues),
  })),
}));

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
  columnName: 'Price',
  connectionUrl: MOCK_DHC_URL.href,
  statistics: {
    MIN: 10.5,
    MAX: 150.75,
    AVG: 75.25,
    SUM: 7525.0,
  },
  variableId: undefined,
  tableName: 'myTable',
  uniqueValues: {
    '10.5': 5,
    '75.25': 10,
    '150.75': 3,
  },
});

const EXPECTED_SUCCESS_NO_UNIQUE = mcpSuccessResult('Column stats retrieved', {
  columnName: 'Price',
  connectionUrl: MOCK_DHC_URL.href,
  statistics: {
    MIN: 1,
    MAX: 1000,
    AVG: 500,
  },
  variableId: undefined,
  tableName: 'myTable',
});
/* eslint-enable @typescript-eslint/naming-convention */

describe('createGetColumnStatsTool', () => {
  const coreJsApiCache = {
    get: vi.fn(),
    has: vi.fn(),
    invalidate: vi.fn(),
    dispose: vi.fn(),
    onDidInvalidate: vi.fn(),
  } as unknown as IAsyncCacheService<URL, typeof DhcType>;

  const serverManager = {
    getServer: vi.fn(),
    getConnection: vi.fn(),
    getConnections: vi.fn(),
  } as unknown as IServerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeMcpToolTimings();

    // Default successful mocks
    vi.mocked(getTableOrError).mockResolvedValue({
      success: true,
      table: MOCK_TABLE,
      connectionUrl: MOCK_DHC_URL,
    });
    vi.mocked(MOCK_TABLE.findColumn).mockReturnValue(MOCK_COLUMN);
    vi.mocked(MOCK_TABLE.getColumnStatistics).mockResolvedValue(
      MOCK_COLUMN_STATS
    );
  });

  it('should return correct tool spec', () => {
    const tool = createGetColumnStatsTool({ coreJsApiCache, serverManager });

    expect(tool.name).toBe('getColumnStats');
    expect(tool.spec.title).toBe('Get Column Statistics');
    expect(tool.spec.description).toBe(
      'Get statistical information for a column in a Deephaven table. Prefer variableId if available (from runCode or listVariables, must have type "Table"); use tableName when the user specifies a table by name and you have no variableId. Returns statistics like min, max, average, and unique value counts.'
    );
  });

  describe('success cases', () => {
    it.each([
      {
        label: 'with unique values',
        mockStats: MOCK_COLUMN_STATS,
        expected: EXPECTED_SUCCESS,
      },
      {
        label: 'without unique values',
        mockStats: MOCK_COLUMN_STATS_NO_UNIQUE,
        expected: EXPECTED_SUCCESS_NO_UNIQUE,
      },
    ])(
      'should successfully retrieve column stats $label',
      async ({ mockStats, expected }) => {
        vi.mocked(MOCK_TABLE.getColumnStatistics).mockResolvedValue(mockStats);

        const tool = createGetColumnStatsTool({
          coreJsApiCache,
          serverManager,
        });
        const result = await tool.handler({
          connectionUrl: MOCK_DHC_URL.href,
          tableName: 'myTable',
          columnName: 'Price',
        });

        expect(getTableOrError).toHaveBeenCalledWith({
          coreJsApiCache,
          connectionUrlStr: MOCK_DHC_URL.href,
          variableId: undefined,
          tableName: 'myTable',
          serverManager,
        });
        expect(MOCK_TABLE.findColumn).toHaveBeenCalledWith('Price');
        expect(MOCK_TABLE.getColumnStatistics).toHaveBeenCalledWith(
          MOCK_COLUMN
        );
        expect(MOCK_TABLE.close).toHaveBeenCalled();
        expect(result.structuredContent).toEqual(expected);
      }
    );
  });

  describe('error handling', () => {
    it('should handle errors when getting table fails', async () => {
      vi.mocked(getTableOrError).mockResolvedValue({
        success: false,
        errorMessage: 'Connection failed',
        details: {
          connectionUrl: MOCK_DHC_URL.href,
          tableName: 'myTable',
        },
      });

      const tool = createGetColumnStatsTool({ coreJsApiCache, serverManager });
      const result = await tool.handler({
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'myTable',
        columnName: 'Price',
      });

      expect(result.structuredContent).toMatchObject({
        success: false,
        message: 'Connection failed',
        details: {
          connectionUrl: MOCK_DHC_URL.href,
          tableName: 'myTable',
        },
      });
    });

    it('should handle column not found error', async () => {
      vi.mocked(MOCK_TABLE.findColumn).mockImplementation(() => {
        throw new Error('Column not found');
      });

      const tool = createGetColumnStatsTool({ coreJsApiCache, serverManager });
      const result = await tool.handler({
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'myTable',
        columnName: 'InvalidColumn',
      });

      expect(MOCK_TABLE.close).toHaveBeenCalled();
      expect(result.structuredContent).toMatchObject({
        success: false,
        message: 'Failed to get column stats: Column not found',
      });
    });
  });
});
