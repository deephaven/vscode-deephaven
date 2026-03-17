import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';

import { createGetTableDataTool } from './getTableData';
import type { IAsyncCacheService, IServerManager } from '../../types';
import {
  fakeMcpToolTimings,
  mcpSuccessResult,
  mcpErrorResult,
  MOCK_DHC_URL,
} from '../utils/mcpTestUtils';
import { getTableOrError, getTablePage } from '../utils/tableUtils';

vi.mock('vscode');
vi.mock('../utils/tableUtils', () => ({
  getTableOrError: vi.fn(),
  getTablePage: vi.fn(),
}));

const MOCK_TABLE = {
  size: 2,
  columns: [
    { name: 'Symbol', type: 'java.lang.String' },
    { name: 'Price', type: 'double' },
  ],
  close: vi.fn(),
  setViewport: vi.fn(),
  getViewportData: vi.fn(),
} as unknown as DhcType.Table;

const MOCK_PAGE_DATA = {
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
  hasMore: false,
  rowCount: 2,
  totalRows: 2,
};

describe('getTableData', () => {
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
    vi.mocked(getTablePage).mockResolvedValue(MOCK_PAGE_DATA);
  });

  it('should return correct tool spec', () => {
    const tool = createGetTableDataTool({ coreJsApiCache, serverManager });

    expect(tool.name).toBe('getTableData');
    expect(tool.spec.title).toBe('Get Table Data');
    expect(tool.spec.description).toBe(
      'Fetch paginated data from a Deephaven table. Prefer variableId if available (from runCode or listVariables, must have type "Table"); use tableName when the user specifies a table by name and you have no variableId.'
    );
  });

  it('should successfully query table data with defaults', async () => {
    const tool = createGetTableDataTool({ coreJsApiCache, serverManager });
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
    expect(getTablePage).toHaveBeenCalledWith(MOCK_TABLE, 0, 10);
    expect(MOCK_TABLE.close).toHaveBeenCalled();
    expect(result.structuredContent).toEqual(
      mcpSuccessResult('Fetched 2 rows', {
        /* eslint-disable @typescript-eslint/naming-convention */
        columns: [
          { name: 'Symbol', type: 'java.lang.String' },
          { name: 'Price', type: 'double' },
        ],
        connectionUrl: MOCK_DHC_URL.href,
        data: [
          { Symbol: 'AAPL', Price: 150.25 },
          { Symbol: 'GOOGL', Price: 2800.5 },
        ],
        hasMore: false,
        limit: 10,
        offset: 0,
        rowCount: 2,
        tableName: 'myTable',
        totalRows: 2,
        /* eslint-enable @typescript-eslint/naming-convention */
      })
    );
  });

  it('should apply limit and show hasMore when more rows available', async () => {
    const largeTable = {
      ...MOCK_TABLE,
      size: 100,
    } as unknown as DhcType.Table;

    vi.mocked(getTableOrError).mockResolvedValue({
      success: true,
      table: largeTable,
      connectionUrl: MOCK_DHC_URL,
    });
    vi.mocked(getTablePage).mockResolvedValue({
      ...MOCK_PAGE_DATA,
      hasMore: true,
      totalRows: 100,
    });

    const tool = createGetTableDataTool({ coreJsApiCache, serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'largeTable',
      limit: 10,
    });

    expect(getTablePage).toHaveBeenCalledWith(largeTable, 0, 10);
    expect(result.structuredContent).toMatchObject({
      success: true,
      message: 'Fetched 2 rows',
      details: {
        hasMore: true,
        limit: 10,
        offset: 0,
        rowCount: 2,
        totalRows: 100,
      },
    });
  });

  it('should apply offset for pagination', async () => {
    const largeTable = {
      ...MOCK_TABLE,
      size: 100,
    } as unknown as DhcType.Table;

    vi.mocked(getTableOrError).mockResolvedValue({
      success: true,
      table: largeTable,
      connectionUrl: MOCK_DHC_URL,
    });
    vi.mocked(getTablePage).mockResolvedValue({
      ...MOCK_PAGE_DATA,
      hasMore: true,
      totalRows: 100,
    });

    const tool = createGetTableDataTool({ coreJsApiCache, serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'largeTable',
      limit: 10,
      offset: 20,
    });

    expect(getTablePage).toHaveBeenCalledWith(largeTable, 20, 10);
    expect(result.structuredContent).toMatchObject({
      success: true,
      message: 'Fetched 2 rows',
      details: {
        hasMore: true,
        limit: 10,
        offset: 20,
        rowCount: 2,
        totalRows: 100,
      },
    });
  });

  it('should handle offset near end of table', async () => {
    const table = {
      ...MOCK_TABLE,
      size: 25,
    } as unknown as DhcType.Table;

    vi.mocked(getTableOrError).mockResolvedValue({
      success: true,
      table: table,
      connectionUrl: MOCK_DHC_URL,
    });
    vi.mocked(getTablePage).mockResolvedValue({
      ...MOCK_PAGE_DATA,
      hasMore: false,
      totalRows: 25,
    });

    const tool = createGetTableDataTool({ coreJsApiCache, serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'table',
      limit: 10,
      offset: 20,
    });

    // Should fetch rows 20-29 (no constraint by table size)
    expect(getTablePage).toHaveBeenCalledWith(table, 20, 10);
    expect(result.structuredContent).toMatchObject({
      success: true,
      message: 'Fetched 2 rows',
      details: {
        hasMore: false,
        limit: 10,
        offset: 20,
        rowCount: 2,
        totalRows: 25,
      },
    });
  });

  it('should handle offset exceeding table size', async () => {
    const tool = createGetTableDataTool({ coreJsApiCache, serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      limit: 10,
      offset: 100,
    });

    // No longer returns an error - just fetches what's available
    expect(getTablePage).toHaveBeenCalledWith(MOCK_TABLE, 100, 10);
    expect(result.structuredContent).toEqual(
      mcpSuccessResult('Fetched 2 rows', {
        /* eslint-disable @typescript-eslint/naming-convention */
        columns: [
          { name: 'Symbol', type: 'java.lang.String' },
          { name: 'Price', type: 'double' },
        ],
        connectionUrl: MOCK_DHC_URL.href,
        data: [
          { Symbol: 'AAPL', Price: 150.25 },
          { Symbol: 'GOOGL', Price: 2800.5 },
        ],
        hasMore: false,
        limit: 10,
        offset: 100,
        rowCount: 2,
        tableName: 'myTable',
        totalRows: 2,
        /* eslint-enable @typescript-eslint/naming-convention */
      })
    );
  });

  it('should handle invalid URL', async () => {
    vi.mocked(getTableOrError).mockResolvedValue({
      success: false,
      errorMessage: 'Invalid URL',
      error: 'Invalid URL',
      details: {
        connectionUrl: 'invalid-url',
        variableId: undefined,
        tableName: 'myTable',
      },
    });

    const tool = createGetTableDataTool({ coreJsApiCache, serverManager });
    const result = await tool.handler({
      connectionUrl: 'invalid-url',
      tableName: 'myTable',
    });

    expect(result.structuredContent).toMatchObject({
      success: false,
      message: 'Invalid URL: Invalid URL',
      details: {
        connectionUrl: 'invalid-url',
        variableId: undefined,
        tableName: 'myTable',
      },
    });
  });

  it('should handle missing connection', async () => {
    vi.mocked(getTableOrError).mockResolvedValue({
      success: false,
      errorMessage: 'No connections or server found',
      details: {
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'myTable',
      },
    });

    const tool = createGetTableDataTool({ coreJsApiCache, serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(result.structuredContent).toMatchObject({
      success: false,
      message: 'No connections or server found',
      details: {
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'myTable',
      },
    });
  });

  it('should handle missing session', async () => {
    vi.mocked(getTableOrError).mockResolvedValue({
      success: false,
      errorMessage: 'Unable to access connection',
      details: {
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'myTable',
      },
    });

    const tool = createGetTableDataTool({ coreJsApiCache, serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(result.structuredContent).toMatchObject({
      success: false,
      message: 'Unable to access connection',
      details: {
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'myTable',
      },
    });
  });

  it('should handle errors and close table', async () => {
    const error = new Error('Query failed');
    vi.mocked(getTablePage).mockRejectedValue(error);

    const tool = createGetTableDataTool({ coreJsApiCache, serverManager });
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

  it('should close table on success', async () => {
    const tool = createGetTableDataTool({ coreJsApiCache, serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(result.structuredContent.success).toBe(true);
    expect(MOCK_TABLE.close).toHaveBeenCalled();
  });
});
