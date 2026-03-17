import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';

import { createGetTableStatsTool } from './getTableStats';
import type { IAsyncCacheService, IServerManager } from '../../types';
import {
  fakeMcpToolTimings,
  mcpSuccessResult,
  mcpErrorResult,
  MOCK_DHC_URL,
} from '../utils/mcpTestUtils';
import { getTableOrError } from '../utils/tableUtils';

vi.mock('vscode');
vi.mock('../utils/tableUtils', () => ({
  getTableOrError: vi.fn(),
  formatTableColumns: vi.fn(cols => cols),
}));

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

describe('getTableStats', () => {
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
  });

  it('should return correct tool spec', () => {
    const tool = createGetTableStatsTool({ serverManager, coreJsApiCache });

    expect(tool.name).toBe('getTableStats');
    expect(tool.spec.title).toBe('Get Table Schema and Statistics');
    expect(tool.spec.description).toBe(
      'Get schema information and basic statistics for a Deephaven table. Prefer variableId if available (from runCode or listVariables, must have type "Table"); use tableName when the user specifies a table by name and you have no variableId. Returns column names, types, descriptions, row count, and other table metadata.'
    );
  });

  it('should successfully retrieve table stats', async () => {
    const tool = createGetTableStatsTool({ serverManager, coreJsApiCache });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(getTableOrError).toHaveBeenCalledWith({
      coreJsApiCache,
      connectionUrlStr: MOCK_DHC_URL.href,
      variableId: undefined,
      tableName: 'myTable',
      serverManager,
    });
    expect(MOCK_TABLE.close).toHaveBeenCalled();

    const { size, columns, isRefreshing } = MOCK_TABLE;

    expect(result.structuredContent).toEqual(
      mcpSuccessResult('Table stats retrieved', {
        columns,
        connectionUrl: MOCK_DHC_URL.href,
        isRefreshing,
        size,
        variableId: undefined,
        tableName: 'myTable',
      })
    );
  });

  it.each([
    {
      name: 'invalid URL',
      connectionUrl: 'invalid-url',
      errorMessage: 'Invalid URL',
      error: 'Invalid URL',
      expectedMessage: 'Invalid URL: Invalid URL',
      errorDetails: {
        connectionUrl: 'invalid-url',
        variableId: undefined,
        tableName: 'mock.table',
      },
    },
    {
      name: 'missing connection',
      connectionUrl: MOCK_DHC_URL.href,
      errorMessage: 'No connections or server found',
      expectedMessage: 'No connections or server found',
      errorDetails: {
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'mock.table',
      },
    },
    {
      name: 'missing session',
      connectionUrl: MOCK_DHC_URL.href,
      errorMessage: 'Unable to access connection',
      expectedMessage: 'Unable to access connection',
      errorDetails: {
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'mock.table',
      },
    },
  ])(
    'should handle $name',
    async ({
      connectionUrl,
      errorMessage,
      error,
      expectedMessage,
      errorDetails,
    }) => {
      vi.mocked(getTableOrError).mockResolvedValue({
        success: false,
        errorMessage,
        error,
        details: errorDetails,
      });

      const tool = createGetTableStatsTool({ serverManager, coreJsApiCache });
      const result = await tool.handler({
        connectionUrl,
        tableName: 'mock.table',
      });

      expect(result.structuredContent).toMatchObject({
        success: false,
        message: expectedMessage,
      });
    }
  );

  it('should handle errors and close table', async () => {
    const error = new Error('Table not found');
    vi.mocked(getTableOrError).mockResolvedValue({
      success: false,
      errorMessage: 'Table not found',
      error,
      details: {
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'nonExistentTable',
      },
    });

    const tool = createGetTableStatsTool({ serverManager, coreJsApiCache });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'nonExistentTable',
    });

    expect(result.structuredContent).toMatchObject({
      success: false,
      message: 'Table not found: Table not found',
      details: {
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'nonExistentTable',
      },
    });
  });

  it('should close table even on success', async () => {
    const tool = createGetTableStatsTool({ serverManager, coreJsApiCache });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(result.structuredContent.success).toBe(true);
    expect(MOCK_TABLE.close).toHaveBeenCalled();
  });
});
