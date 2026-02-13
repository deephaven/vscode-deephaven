import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';

import {
  buildAggregationOperationMap,
  createFilterConditions,
  createFilterValue,
  createSorts,
  formatTableRow,
  formatValue,
} from './tableUtils';

vi.mock('vscode');

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

const MOCK_TABLE = {
  findColumn: vi.fn(),
} as unknown as DhcType.Table;

describe('tableUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MOCK_TABLE.findColumn).mockReturnValue(MOCK_COLUMN);
  });

  describe('buildAggregationOperationMap', () => {
    it('should build operation map from aggregation specs', () => {
      const result = buildAggregationOperationMap([
        { column: 'Price', operation: 'Sum' },
        { column: 'Volume', operation: 'Max' },
        { column: 'Price', operation: 'Avg' },
      ]);

      /* eslint-disable @typescript-eslint/naming-convention */
      expect(result).toEqual({
        Price: ['Sum', 'Avg'],
        Volume: ['Max'],
      });
      /* eslint-enable @typescript-eslint/naming-convention */
    });

    it('should return empty map for empty array', () => {
      const result = buildAggregationOperationMap([]);
      expect(result).toEqual({});
    });
  });

  describe('createFilterValue', () => {
    it.each([
      {
        name: 'string',
        value: 'AAPL',
        valueType: 'string' as const,
        expectedMethod: 'ofString' as const,
        expectedArg: 'AAPL',
        expectedResult: { type: 'string', value: 'AAPL' },
      },
      {
        name: 'number',
        value: 123,
        valueType: 'number' as const,
        expectedMethod: 'ofNumber' as const,
        expectedArg: 123,
        expectedResult: { type: 'number', value: 123 },
      },
      {
        name: 'boolean',
        value: true,
        valueType: 'boolean' as const,
        expectedMethod: 'ofBoolean' as const,
        expectedArg: true,
        expectedResult: { type: 'boolean', value: true },
      },
    ])(
      'should create $valueType filter value',
      ({ value, valueType, expectedMethod, expectedArg, expectedResult }) => {
        const result = createFilterValue(MOCK_DH, value, valueType);
        expect(
          (MOCK_DH.FilterValue as any)[expectedMethod]
        ).toHaveBeenCalledWith(expectedArg);
        expect(result).toEqual(expectedResult);
      }
    );

    it('should create datetime filter value from Date', () => {
      const date = new Date('2023-01-01T00:00:00Z');
      createFilterValue(MOCK_DH, date, 'datetime');
      expect(MOCK_DH.FilterValue.ofNumber).toHaveBeenCalledWith(date.getTime());
    });

    it('should create datetime filter value from string', () => {
      const dateString = '2023-01-01T00:00:00Z';
      const expectedTime = new Date(dateString).getTime();
      createFilterValue(MOCK_DH, dateString, 'datetime');
      expect(MOCK_DH.FilterValue.ofNumber).toHaveBeenCalledWith(expectedTime);
    });

    it('should throw error for unsupported value type', () => {
      expect(() =>
        createFilterValue(MOCK_DH, 'test', 'unsupported' as any)
      ).toThrow('Unsupported filter value type: unsupported');
    });
  });

  describe('createFilterConditions', () => {
    it.each([
      { operation: 'isNull' as const },
      { operation: 'isTrue' as const },
      { operation: 'isFalse' as const },
    ])('should create $operation filter without value', ({ operation }) => {
      const mockColumnFilter = {
        [operation]: vi.fn().mockReturnValue({ type: operation }),
      };
      vi.mocked(MOCK_COLUMN.filter).mockReturnValue(
        mockColumnFilter as unknown as any
      );

      const result = createFilterConditions(MOCK_DH, MOCK_TABLE, [
        {
          column: 'Symbol',
          operation,
          value: undefined,
          valueType: undefined,
        },
      ]);

      expect(MOCK_TABLE.findColumn).toHaveBeenCalledWith('Symbol');
      expect(MOCK_COLUMN.filter).toHaveBeenCalled();
      expect(mockColumnFilter[operation]).toHaveBeenCalled();
      expect(result).toEqual([{ type: operation }]);
    });

    it.each([
      {
        operation: 'eq' as const,
        value: 'AAPL',
        valueType: 'string' as const,
      },
      {
        operation: 'notEq' as const,
        value: 'AAPL',
        valueType: 'string' as const,
      },
      {
        operation: 'greaterThan' as const,
        value: 100,
        valueType: 'number' as const,
      },
      {
        operation: 'lessThan' as const,
        value: 100,
        valueType: 'number' as const,
      },
      {
        operation: 'contains' as const,
        value: 'apple',
        valueType: 'string' as const,
      },
      {
        operation: 'matches' as const,
        value: '^A.*',
        valueType: 'string' as const,
      },
    ])(
      'should create $operation filter with value',
      ({ operation, value, valueType }) => {
        const mockColumnFilter = {
          [operation]: vi.fn().mockReturnValue({ type: operation }),
        };
        vi.mocked(MOCK_COLUMN.filter).mockReturnValue(
          mockColumnFilter as unknown as any
        );

        const result = createFilterConditions(MOCK_DH, MOCK_TABLE, [
          {
            column: 'Symbol',
            operation,
            value,
            valueType,
          },
        ]);

        expect(mockColumnFilter[operation]).toHaveBeenCalled();
        expect(result).toEqual([{ type: operation }]);
      }
    );

    it.each([
      {
        operation: 'in' as const,
        value: ['AAPL', 'GOOGL'],
        valueType: 'string' as const,
      },
      {
        operation: 'notIn' as const,
        value: ['AAPL', 'GOOGL'],
        valueType: 'string' as const,
      },
      {
        operation: 'inIgnoreCase' as const,
        value: ['aapl', 'googl'],
        valueType: 'string' as const,
      },
    ])(
      'should create $operation filter with array value',
      ({ operation, value, valueType }) => {
        const mockColumnFilter = {
          [operation]: vi.fn().mockReturnValue({ type: operation }),
        };
        vi.mocked(MOCK_COLUMN.filter).mockReturnValue(
          mockColumnFilter as unknown as any
        );

        const result = createFilterConditions(MOCK_DH, MOCK_TABLE, [
          {
            column: 'Symbol',
            operation,
            value,
            valueType,
          },
        ]);

        expect(mockColumnFilter[operation]).toHaveBeenCalled();
        expect(MOCK_DH.FilterValue.ofString).toHaveBeenCalledTimes(
          value.length
        );
        expect(result).toEqual([{ type: operation }]);
      }
    );

    it('should throw error when value required but not provided', () => {
      expect(() =>
        createFilterConditions(MOCK_DH, MOCK_TABLE, [
          {
            column: 'Symbol',
            operation: 'eq',
            value: undefined,
            valueType: undefined,
          },
        ])
      ).toThrow(
        "Filter operation 'eq' requires 'value' and 'valueType' fields"
      );
    });

    it('should throw error when array operation receives non-array value', () => {
      expect(() =>
        createFilterConditions(MOCK_DH, MOCK_TABLE, [
          {
            column: 'Symbol',
            operation: 'in',
            value: 'AAPL',
            valueType: 'string',
          },
        ])
      ).toThrow("Filter operation 'in' requires an array value");
    });

    it('should throw error when array operation missing valueType', () => {
      expect(() =>
        createFilterConditions(MOCK_DH, MOCK_TABLE, [
          {
            column: 'Symbol',
            operation: 'in',
            value: ['AAPL'],
            valueType: undefined,
          },
        ])
      ).toThrow("Filter operation 'in' requires 'valueType' field");
    });
  });

  describe('createSorts', () => {
    it('should create ascending sort by default', () => {
      const mockSort = {
        asc: vi.fn().mockReturnValue({ direction: 'asc' }),
        desc: vi.fn(),
      };
      vi.mocked(MOCK_COLUMN.sort).mockReturnValue(mockSort as unknown as any);

      const result = createSorts(MOCK_TABLE, [{ column: 'Symbol' }]);

      expect(MOCK_TABLE.findColumn).toHaveBeenCalledWith('Symbol');
      expect(MOCK_COLUMN.sort).toHaveBeenCalled();
      expect(mockSort.asc).toHaveBeenCalled();
      expect(result).toEqual([{ direction: 'asc' }]);
    });

    it('should create descending sort', () => {
      const mockSort = {
        asc: vi.fn(),
        desc: vi.fn().mockReturnValue({ direction: 'desc' }),
      };
      vi.mocked(MOCK_COLUMN.sort).mockReturnValue(mockSort as unknown as any);

      const result = createSorts(MOCK_TABLE, [
        { column: 'Symbol', direction: 'desc' },
      ]);

      expect(mockSort.desc).toHaveBeenCalled();
      expect(result).toEqual([{ direction: 'desc' }]);
    });

    it('should create multiple sorts in order', () => {
      const mockSort = {
        asc: vi.fn().mockReturnValue({ direction: 'asc' }),
        desc: vi.fn().mockReturnValue({ direction: 'desc' }),
      };
      vi.mocked(MOCK_COLUMN.sort).mockReturnValue(mockSort as unknown as any);

      const result = createSorts(MOCK_TABLE, [
        { column: 'Symbol', direction: 'asc' },
        { column: 'Price', direction: 'desc' },
      ]);

      expect(result).toHaveLength(2);
      expect(mockSort.asc).toHaveBeenCalled();
      expect(mockSort.desc).toHaveBeenCalled();
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
