import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type { IServerManager } from '../../types';
import { createMockDhcService, MOCK_DHC_URL } from './mcpTestUtils';
import { getFirstConnectionOrCreate } from './serverUtils';
import { formatTableRow, formatValue, getTableOrError } from './tableUtils';

vi.mock('vscode');

vi.mock('./serverUtils', () => ({
  getFirstConnectionOrCreate: vi.fn(),
}));

describe('tableUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTableOrError', () => {
    const mockTable = { type: 'Table' } as unknown as DhcType.Table;

    const serverManager: IServerManager = {
      getServer: vi.fn(),
      getConnections: vi.fn(),
      getDheServiceForWorker: vi.fn(),
      getWorkerInfo: vi.fn(),
    } as unknown as IServerManager;

    describe('error cases', () => {
      it('should return error when URL is invalid', async () => {
        const result = await getTableOrError({
          serverManager,
          connectionUrlStr: 'not-a-valid-url',
          tableName: 'my_table',
        });

        expect(result).toEqual({
          success: false,
          errorMessage: 'Invalid URL',
          error: expect.stringContaining('Invalid URL'),
          details: { connectionUrl: 'not-a-valid-url', tableName: 'my_table' },
        });
      });

      it('should return error when getFirstConnectionOrCreate fails', async () => {
        vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
          success: false,
          errorMessage: 'Mock error',
          details: { connectionUrl: MOCK_DHC_URL.href },
        });

        const result = await getTableOrError({
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

      it('should return error when session is not available', async () => {
        const mockConnection = createMockDhcService({
          serverUrl: MOCK_DHC_URL,
        });
        vi.spyOn(mockConnection, 'getSession').mockResolvedValue(null);

        vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
          success: true,
          connection: mockConnection,
          panelUrlFormat: 'mock.panelUrlFormat',
        });

        const result = await getTableOrError({
          serverManager,
          connectionUrlStr: MOCK_DHC_URL.href,
          tableName: 'my_table',
        });

        expect(result).toEqual({
          success: false,
          errorMessage: 'Unable to access session',
          details: { connectionUrl: MOCK_DHC_URL.href, tableName: 'my_table' },
        });
      });
    });

    describe('success cases', () => {
      it('should return table when connection and session are available', async () => {
        const mockConnection = createMockDhcService({
          serverUrl: MOCK_DHC_URL,
        });
        const mockSession = {
          getObject: vi.fn().mockResolvedValue(mockTable),
        } as unknown as DhcType.IdeSession;
        vi.spyOn(mockConnection, 'getSession').mockResolvedValue(mockSession);

        vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
          success: true,
          connection: mockConnection,
          panelUrlFormat: 'mock.panelUrlFormat',
        });

        const result = await getTableOrError({
          serverManager,
          connectionUrlStr: MOCK_DHC_URL.href,
          tableName: 'my_table',
        });

        expect(result).toEqual({
          success: true,
          table: mockTable,
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
});
