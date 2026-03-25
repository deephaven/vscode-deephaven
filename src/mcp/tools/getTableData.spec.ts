import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';

import {
  createGetTableDataTool,
  DEFAULT_TABLE_PAGE_DATA_LIMIT,
  DEFAULT_TABLE_PAGE_DATA_OFFSET,
} from './getTableData';
import type { IAsyncCacheService, IServerManager } from '../../types';
import {
  fakeMcpToolTimings,
  mcpSuccessResult,
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
  /* eslint-disable @typescript-eslint/naming-convention */
  const mockDh = {
    VariableType: {
      TABLE: 'Table',
      TREETABLE: 'TreeTable',
      HIERARCHICALTABLE: 'HierarchicalTable',
      PARTITIONEDTABLE: 'PartitionedTable',
    },
  } as unknown as typeof DhcType;
  /* eslint-enable @typescript-eslint/naming-convention */

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

  it.each([
    {
      label: 'defaults',
      tableSize: 2,
      limit: DEFAULT_TABLE_PAGE_DATA_LIMIT,
      offset: DEFAULT_TABLE_PAGE_DATA_OFFSET,
      hasMore: false,
    },
    {
      label: 'limit with hasMore when more rows available',
      tableSize: 100,
      limit: DEFAULT_TABLE_PAGE_DATA_LIMIT,
      offset: DEFAULT_TABLE_PAGE_DATA_OFFSET,
      hasMore: true,
    },
    {
      label: 'custom limit',
      tableSize: 100,
      limit: 5,
      offset: DEFAULT_TABLE_PAGE_DATA_OFFSET,
      hasMore: true,
    },
    {
      label: 'offset for pagination',
      tableSize: 100,
      limit: DEFAULT_TABLE_PAGE_DATA_LIMIT,
      offset: 20,
      hasMore: true,
    },
    {
      label: 'offset near end of table',
      tableSize: 25,
      limit: DEFAULT_TABLE_PAGE_DATA_LIMIT,
      offset: 20,
      hasMore: false,
    },
    {
      label: 'offset exceeding table size',
      tableSize: 2,
      limit: DEFAULT_TABLE_PAGE_DATA_LIMIT,
      offset: 100,
      hasMore: false,
    },
  ])('should handle $label', async ({ tableSize, limit, offset, hasMore }) => {
    const table = {
      ...MOCK_TABLE,
      size: tableSize,
    } as unknown as DhcType.Table;

    vi.mocked(getTableOrError).mockResolvedValue({
      success: true,
      table,
      connectionUrl: MOCK_DHC_URL,
    });
    vi.mocked(getTablePage).mockResolvedValue({
      ...MOCK_PAGE_DATA,
      hasMore,
      totalRows: table.size,
    });

    const tool = createGetTableDataTool({ coreJsApiCache, serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'testTable',
      ...(limit !== DEFAULT_TABLE_PAGE_DATA_LIMIT ? { limit } : {}),
      ...(offset !== DEFAULT_TABLE_PAGE_DATA_OFFSET ? { offset } : {}),
    });

    expect(getTableOrError).toHaveBeenCalledWith({
      coreJsApiCache,
      connectionUrlStr: MOCK_DHC_URL.href,
      variableId: undefined,
      tableName: 'testTable',
      serverManager,
    });

    expect(getTablePage).toHaveBeenCalledWith(table, offset, limit);
    expect(MOCK_TABLE.close).toHaveBeenCalled();
    expect(result.structuredContent).toEqual(
      mcpSuccessResult('Fetched 2 rows', {
        ...MOCK_PAGE_DATA,
        connectionUrl: MOCK_DHC_URL.href,
        hasMore,
        limit,
        offset,
        tableName: 'testTable',
        totalRows: table.size,
      })
    );
  });

  it('should propagate errors from getTableOrError', async () => {
    vi.mocked(getTableOrError).mockResolvedValue({
      success: false,
      errorMessage: 'Connection error',
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
      message: 'Connection error',
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
