import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { getExcludeReplicasFilter, getQueryTableFilters } from './queryUtils';

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
  isNull: () => RecordedCondition;
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
    isNull: (): RecordedCondition => ({ column: name, op: 'isNull' }),
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

  it('always restricts to parent queries, ahead of the caller filters', () => {
    const [parent, owner] = getQueryTableFilters(dh, mock.table, {
      owners: ['alice'],
    });

    expect(parent).toMatchObject({ column: 'Parent', op: 'isNull' });
    expect(owner).toMatchObject({ column: 'Owner' });
  });

  it('returns only the parent-query condition for empty filters', () => {
    const [parent, extra] = getQueryTableFilters(dh, mock.table, {});

    expect(parent).toMatchObject({ column: 'Parent', op: 'isNull' });
    expect(extra).toBeUndefined();
    expect(mock.findColumn).toHaveBeenCalledExactlyOnceWith('Parent');
  });

  it('builds an `in` filter on Owner', () => {
    const [, owner] = getQueryTableFilters(dh, mock.table, {
      owners: ['alice', 'bob'],
    });

    expect(owner).toMatchObject({
      column: 'Owner',
      op: 'in',
      terms: [{ value: 'alice' }, { value: 'bob' }],
    });
  });

  it('builds an `in` filter on QueryType', () => {
    const [, type] = getQueryTableFilters(dh, mock.table, {
      types: ['InteractiveConsole'],
    });

    expect(type).toMatchObject({
      column: 'QueryType',
      op: 'in',
      terms: [{ value: 'InteractiveConsole' }],
    });
  });

  it('builds an `in` filter on Status', () => {
    const [, status] = getQueryTableFilters(dh, mock.table, {
      statuses: ['Running'],
    });

    expect(status).toMatchObject({
      column: 'Status',
      op: 'in',
      terms: [{ value: 'Running' }],
    });
  });

  it('builds a case-insensitive contains filter on Name for search', () => {
    const [, name] = getQueryTableFilters(dh, mock.table, {
      search: 'my-query',
    });

    expect(name).toEqual({
      column: 'Name',
      op: 'containsIgnoreCase',
      term: { value: 'my-query' },
    });
  });

  it('ignores an empty search string', () => {
    const [, name] = getQueryTableFilters(dh, mock.table, { search: '' });

    expect(name).toBeUndefined();
  });

  it('ignores empty owner/type/status arrays', () => {
    const [, extra] = getQueryTableFilters(dh, mock.table, {
      owners: [],
      types: [],
      statuses: [],
    });

    expect(extra).toBeUndefined();
  });

  it('excludes helper query types via `not in` when excludeHelperTypes is set', () => {
    const [, type] = getQueryTableFilters(dh, mock.table, {
      excludeHelperTypes: true,
    });

    expect(type).toMatchObject({ column: 'QueryType', op: 'notIn' });
  });

  it('prefers an explicit type allow-list over excludeHelperTypes', () => {
    const [, type, extra] = getQueryTableFilters(dh, mock.table, {
      types: ['InteractiveConsole'],
      excludeHelperTypes: true,
    });

    expect(type).toMatchObject({
      column: 'QueryType',
      op: 'in',
      terms: [{ value: 'InteractiveConsole' }],
    });
    // The allow-list replaces the helper exclusion rather than joining it.
    expect(extra).toBeUndefined();
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
    ).toEqual(['Parent', 'Owner', 'QueryType', 'Status', 'Name']);
  });
});

describe('getExcludeReplicasFilter', () => {
  let mock: ReturnType<typeof createMockTable>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = createMockTable();
  });

  it('matches parent queries only', () => {
    const condition = getExcludeReplicasFilter(mock.table);

    expect(mock.findColumn).toHaveBeenCalledWith('Parent');
    expect(condition).toMatchObject({ column: 'Parent', op: 'isNull' });
  });
});
