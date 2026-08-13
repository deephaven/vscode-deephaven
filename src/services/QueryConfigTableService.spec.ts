import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { getQueryTableFilters } from './QueryConfigTableService';

/** The API-object parameter type of `getQueryTableFilters`. */
type QueryFilterApi = Parameters<typeof getQueryTableFilters>[0];

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

/** A recorded filter condition produced by the mocked filter builder. */
interface RecordedCondition {
  column: string;
  op: string;
  terms?: unknown[];
  term?: unknown;
  not?: () => RecordedCondition;
}

/** Mocked filter builder returned by `column.filter()`. */
interface MockFilterValue {
  in: (terms: unknown[]) => RecordedCondition;
  containsIgnoreCase: (term: unknown) => RecordedCondition;
}

function makeFilterValue(name: string): MockFilterValue {
  return {
    // `.in(...)` supports chaining `.not()` for the helper-type exclusion branch.
    in: (terms: unknown[]): RecordedCondition => ({
      column: name,
      op: 'in',
      terms,
      not: (): RecordedCondition => ({ column: name, op: 'notIn', terms }),
    }),
    containsIgnoreCase: (term: unknown): RecordedCondition => ({
      column: name,
      op: 'containsIgnoreCase',
      term,
    }),
  };
}

/**
 * Build a mocked `dh.Table` whose `findColumn(name).filter()` returns a filter
 * builder that records the operations invoked on it. Each produced
 * `FilterCondition` records the column it came from and the operation applied,
 * so tests can assert the correct server-side filters were constructed.
 */
function createMockTable(): {
  table: DhcType.Table;
  findColumn: ReturnType<typeof vi.fn>;
} {
  const findColumn = vi.fn((name: string) => ({
    name,
    filter: (): MockFilterValue => makeFilterValue(name),
  }));

  return {
    table: { findColumn } as unknown as DhcType.Table,
    findColumn,
  };
}

const dh = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  FilterValue: {
    ofString: (value: string): { value: string } => ({ value }),
  },
} as unknown as QueryFilterApi;

describe('getQueryTableFilters', () => {
  let mock: ReturnType<typeof createMockTable>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = createMockTable();
  });

  it('returns no conditions for empty filters', () => {
    const conditions = getQueryTableFilters(dh, mock.table, {});
    expect(conditions).toHaveLength(0);
    expect(mock.findColumn).not.toHaveBeenCalled();
  });

  it('builds an `in` filter on Owner', () => {
    const conditions = getQueryTableFilters(dh, mock.table, {
      owners: ['alice', 'bob'],
    });
    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toMatchObject({
      column: 'Owner',
      op: 'in',
      terms: [{ value: 'alice' }, { value: 'bob' }],
    });
  });

  it('builds an `in` filter on QueryType', () => {
    const conditions = getQueryTableFilters(dh, mock.table, {
      types: ['InteractiveConsole'],
    });
    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toMatchObject({
      column: 'QueryType',
      op: 'in',
      terms: [{ value: 'InteractiveConsole' }],
    });
  });

  it('builds an `in` filter on Status', () => {
    const conditions = getQueryTableFilters(dh, mock.table, {
      statuses: ['Running'],
    });
    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toMatchObject({
      column: 'Status',
      op: 'in',
      terms: [{ value: 'Running' }],
    });
  });

  it('builds a case-insensitive contains filter on Name for search', () => {
    const conditions = getQueryTableFilters(dh, mock.table, {
      search: 'my-query',
    });
    expect(conditions).toEqual([
      {
        column: 'Name',
        op: 'containsIgnoreCase',
        term: { value: 'my-query' },
      },
    ]);
  });

  it('ignores an empty search string', () => {
    const conditions = getQueryTableFilters(dh, mock.table, { search: '' });
    expect(conditions).toHaveLength(0);
  });

  it('ignores empty owner/type/status arrays', () => {
    const conditions = getQueryTableFilters(dh, mock.table, {
      owners: [],
      types: [],
      statuses: [],
    });
    expect(conditions).toHaveLength(0);
  });

  it('excludes helper query types via `not in` when excludeHelperTypes is set', () => {
    const conditions = getQueryTableFilters(dh, mock.table, {
      excludeHelperTypes: true,
    });
    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toMatchObject({
      column: 'QueryType',
      op: 'notIn',
    });
  });

  it('prefers an explicit type allow-list over excludeHelperTypes', () => {
    const conditions = getQueryTableFilters(dh, mock.table, {
      types: ['InteractiveConsole'],
      excludeHelperTypes: true,
    });
    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toMatchObject({
      column: 'QueryType',
      op: 'in',
      terms: [{ value: 'InteractiveConsole' }],
    });
  });

  it('ANDs multiple filters together in order', () => {
    const conditions = getQueryTableFilters(dh, mock.table, {
      owners: ['alice'],
      types: ['InteractiveConsole'],
      statuses: ['Running'],
      search: 'foo',
    });
    expect(
      conditions.map(c => (c as unknown as { column: string }).column)
    ).toEqual(['Owner', 'QueryType', 'Status', 'Name']);
  });
});
