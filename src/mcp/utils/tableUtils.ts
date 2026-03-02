import type { dh as DhType } from '@deephaven/jsapi-types';
import type { IServerManager } from '../../types';
import { parseUrl } from '../../util';
import { getFirstConnectionOrCreate } from './serverUtils';

export type FetchTablePageResult = {
  columns: Array<{ name: string; type: string }>;
  data: Array<Record<string, unknown>>;
  hasMore: boolean;
  rowCount: number;
  totalRows: number;
};

type GetTableOrErrorSuccess = {
  success: true;
  table: DhType.Table;
  connectionUrl: URL;
};

type GetTableOrErrorError = {
  success: false;
  errorMessage: string;
  error?: unknown;
  hint?: string;
  details: { connectionUrl: string; variableId?: string; tableName?: string };
};

export type GetTableOrErrorResult =
  | GetTableOrErrorSuccess
  | GetTableOrErrorError;

/**
 * Convert column statistics to plain objects.
 * @param columnStats Column statistics from DH
 * @returns Object with statistics and uniqueValues records
 */
export function convertColumnStatsToRecords({
  statisticsMap,
  uniqueValues,
}: DhType.ColumnStatistics): {
  statistics: Record<string, unknown>;
  uniqueValues: Record<string, number>;
} {
  return {
    statistics: Object.fromEntries(statisticsMap),
    uniqueValues: Object.fromEntries(uniqueValues),
  };
}

/**
 * Format table columns with metadata.
 * @param columns Array of DH columns
 * @returns Array of formatted column objects
 */
export function formatTableColumns(columns: DhType.Column[]): Array<{
  name: string;
  type: string;
  description?: string;
}> {
  return columns.map(col => ({
    name: col.name,
    type: col.type,
    description: col.description ?? undefined,
  }));
}

/**
 * Format a table row for JSON serialization.
 * @param row DH row
 * @param columns Array of DH columns
 * @returns Plain object with formatted values
 */
export function formatTableRow(
  row: DhType.Row,
  columns: DhType.Column[]
): Record<string, unknown> {
  const rowObj: Record<string, unknown> = {};
  for (const col of columns) {
    const value = row.get(col);
    rowObj[col.name] = formatValue(value);
  }
  return rowObj;
}

/**
 * Format a value for JSON serialization.
 * @param value Value to format
 * @returns Formatted value
 */
export function formatValue(value: unknown): unknown {
  if (value == null) {
    return null;
  }

  if (typeof value === 'object') {
    return value.valueOf();
  }

  return value;
}

/**
 * Gets a table from a Deephaven server connection, handling URL parsing,
 * connection retrieval, session validation, and table fetching.
 *
 * This function encapsulates the common pattern of:
 * 1. Parsing the connection URL string
 * 2. Getting the first connection with getFirstConnectionOrCreate
 * 3. Handling connection errors
 * 4. Getting the session from the connection
 * 5. Validating the session exists
 * 6. Fetching the table by name
 *
 * @param params Configuration for getting the table
 * @param params.serverManager The server manager to query
 * @param params.connectionUrlStr The connection URL string
 * @param params.variableId Optional variable ID to fetch (takes precedence over tableName if provided)
 * @param params.tableName Optional name of the table to fetch (if variableId is not provided)
 * @returns Success with table, or error with message, hint, and details
 */
export async function getTableOrError(params: {
  serverManager: IServerManager;
  connectionUrlStr: string;
  variableId?: string;
  tableName?: string;
}): Promise<GetTableOrErrorResult> {
  const { serverManager, connectionUrlStr, variableId, tableName } = params;

  if (variableId == null && tableName == null) {
    return {
      success: false,
      errorMessage: 'Either variableId or tableName must be provided',
      details: { connectionUrl: connectionUrlStr },
    };
  }

  const parsedUrl = parseUrl(connectionUrlStr);
  if (!parsedUrl.success) {
    return {
      success: false,
      errorMessage: 'Invalid URL',
      error: parsedUrl.error,
      details: { connectionUrl: connectionUrlStr, variableId, tableName },
    };
  }

  const firstConnectionResult = await getFirstConnectionOrCreate({
    connectionUrl: parsedUrl.value,
    serverManager,
  });

  if (!firstConnectionResult.success) {
    return {
      ...firstConnectionResult,
      details: { ...firstConnectionResult.details, tableName },
    };
  }

  const { connection } = firstConnectionResult;
  const session = await connection.getSession();

  if (session == null) {
    return {
      success: false,
      errorMessage: 'Unable to access session',
      details: { connectionUrl: connectionUrlStr, tableName },
    };
  }

  const table = await session.getObject(
    variableId == null
      ? {
          type: 'Table',
          name: tableName,
        }
      : {
          type: 'Table',
          id: variableId,
        }
  );

  return {
    success: true,
    connectionUrl: parsedUrl.value,
    table,
  };
}

/**
 * Get a page of data from a table with pagination support.
 * @param table The Deephaven table to query
 * @param offset Number of rows to skip
 * @param limit Maximum number of rows to return
 * @returns Object with columns, data, pagination metadata
 */
export async function getTablePage(
  table: DhType.Table,
  offset: number,
  limit: number
): Promise<FetchTablePageResult> {
  const totalRows = table.size;
  const startRow = offset;
  const endRow = offset + limit - 1;

  table.setViewport(startRow, endRow);
  const viewportData = await table.getViewportData();

  const columns = table.columns.map(col => ({
    name: col.name,
    type: col.type,
  }));

  const data = viewportData.rows.map(row => formatTableRow(row, table.columns));

  const hasMore = endRow < totalRows - 1;

  return {
    columns,
    data,
    hasMore,
    rowCount: data.length,
    totalRows,
  };
}
