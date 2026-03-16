import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { fetchVariableDefinition } from '@deephaven/jsapi-utils';

import { createGetTableDataTool } from './getTableData';
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
vi.mock('@deephaven/jsapi-utils', () => ({
  fetchVariableDefinition: vi.fn(),
}));

const MOCK_VARIABLE_DEF = {
  type: 'Table',
  id: 'mock-id',
  name: 'myTable',
  title: 'myTable',
};

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
  setViewport: vi.fn(),
  getViewportData: vi.fn(),
} as unknown as DhcType.Table;

const MOCK_SERVER_RUNNING: ServerState = {
  isRunning: true,
  type: 'DHC',
  url: MOCK_DHC_URL,
  isConnected: false,
  connectionCount: 0,
};

describe('getTableData', () => {
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
    vi.mocked(MOCK_TABLE.getViewportData).mockResolvedValue(MOCK_VIEWPORT_DATA);
    vi.mocked(fetchVariableDefinition).mockResolvedValue(MOCK_VARIABLE_DEF);
  });

  it('should return correct tool spec', () => {
    const tool = createGetTableDataTool({ serverManager });

    expect(tool.name).toBe('getTableData');
    expect(tool.spec.title).toBe('Get Table Data');
    expect(tool.spec.description).toBe(
      'Fetch paginated data from a Deephaven table. Prefer variableId if available (from runCode or listVariables, must have type "Table"); use tableName when the user specifies a table by name and you have no variableId.'
    );
  });

  it('should successfully query table data with defaults', async () => {
    const tool = createGetTableDataTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(fetchVariableDefinition).toHaveBeenCalledWith(mockSession, 'myTable');
    expect(mockSession.getObject).toHaveBeenCalledWith(MOCK_VARIABLE_DEF);
    expect(MOCK_TABLE.setViewport).toHaveBeenCalledWith(0, 9);
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
    vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

    const largeTable = {
      ...MOCK_TABLE,
      size: 100,
    } as unknown as DhcType.Table;

    vi.mocked(mockSession.getObject).mockResolvedValue(largeTable);

    const tool = createGetTableDataTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'largeTable',
      limit: 10,
    });

    expect(largeTable.setViewport).toHaveBeenCalledWith(0, 9);
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
    vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

    const largeTable = {
      ...MOCK_TABLE,
      size: 100,
    } as unknown as DhcType.Table;

    vi.mocked(mockSession.getObject).mockResolvedValue(largeTable);

    const tool = createGetTableDataTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'largeTable',
      limit: 10,
      offset: 20,
    });

    expect(largeTable.setViewport).toHaveBeenCalledWith(20, 29);
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
    vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

    const table = {
      ...MOCK_TABLE,
      size: 25,
    } as unknown as DhcType.Table;

    vi.mocked(mockSession.getObject).mockResolvedValue(table);

    const tool = createGetTableDataTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'table',
      limit: 10,
      offset: 20,
    });

    // Should fetch rows 20-29 (no constraint by table size)
    expect(table.setViewport).toHaveBeenCalledWith(20, 29);
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
    const tool = createGetTableDataTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
      limit: 10,
      offset: 100,
    });

    // No longer returns an error - just fetches what's available
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

  it('should initialize session if not initialized', async () => {
    Object.defineProperty(mockConnection, 'isInitialized', {
      get: vi.fn(() => false),
      configurable: true,
    });

    vi.mocked(serverManager.getConnections).mockReturnValue([mockConnection]);

    const tool = createGetTableDataTool({ serverManager });
    await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(mockConnection.getSession).toHaveBeenCalled();
  });

  it('should handle invalid URL', async () => {
    const tool = createGetTableDataTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: 'invalid-url',
      tableName: 'myTable',
    });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('Invalid URL: Invalid URL', {
        connectionUrl: 'invalid-url',
        tableName: 'myTable',
      })
    );
    expect(serverManager.getServer).not.toHaveBeenCalled();
  });

  it('should handle missing connection', async () => {
    vi.mocked(serverManager.getServer).mockReturnValue(undefined);

    const tool = createGetTableDataTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('No connections or server found', {
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'myTable',
      })
    );
  });

  it('should handle missing session', async () => {
    vi.mocked(serverManager.getConnections).mockReturnValue([mockConnection]);
    vi.mocked(mockConnection.getSession).mockResolvedValue(null);

    const tool = createGetTableDataTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myTable',
    });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('Unable to access session', {
        connectionUrl: MOCK_DHC_URL.href,
        tableName: 'myTable',
      })
    );
  });

  it('should handle errors and close table', async () => {
    const error = new Error('Query failed');
    vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);
    vi.mocked(MOCK_TABLE.getViewportData).mockRejectedValue(error);

    const tool = createGetTableDataTool({ serverManager });
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
    vi.mocked(serverManager.getConnection).mockReturnValue(mockConnection);

    const tool = createGetTableDataTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: 'http://localhost:10000',
      tableName: 'myTable',
    });

    expect(result.structuredContent.success).toBe(true);
    expect(MOCK_TABLE.close).toHaveBeenCalled();
  });

  it('should fetch rollup table using actual variable type from fetchVariableDefinition', async () => {
    const rollupVariableDef = {
      type: 'RollupTable',
      id: 'rollup-id',
      name: 'myRollup',
      title: 'myRollup',
    };
    vi.mocked(fetchVariableDefinition).mockResolvedValue(rollupVariableDef);

    const tool = createGetTableDataTool({ serverManager });
    const result = await tool.handler({
      connectionUrl: MOCK_DHC_URL.href,
      tableName: 'myRollup',
    });

    expect(fetchVariableDefinition).toHaveBeenCalledWith(
      mockSession,
      'myRollup'
    );
    expect(mockSession.getObject).toHaveBeenCalledWith(rollupVariableDef);
    expect(result.structuredContent.success).toBe(true);
  });
});
