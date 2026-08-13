import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryInfo } from '@deephaven-enterprise/jsapi-types';
import { PersistentQueryService } from './PersistentQueryService';
import { getQueryInfoTableMock } from '../testUtils';
import type { IAsyncCacheService, IDheService, IServerManager } from '../types';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

// Control the QueryConfigTableService the service constructs internally.
const getQueryInfoTable = vi.fn();
vi.mock('./QueryConfigTableService', async importActual => {
  const actual =
    await importActual<typeof import('./QueryConfigTableService')>();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    QueryConfigTableService: class {
      getQueryInfoTable = getQueryInfoTable;
      dispose = vi.fn(async () => {});
    },
  };
});

const DHE_URL = new URL('https://dhe.example.com:8123/');

function makeQueryInfo(overrides: Partial<QueryInfo> = {}): QueryInfo {
  return {
    serial: 'serial-1',
    name: 'My PQ',
    type: 'DeephavenCommunity',
    designated: { status: 'Running', objects: [] },
    ...overrides,
  } as unknown as QueryInfo;
}

/** A `QueryInfoTableSubscription` mock over the given serials. */
const makeSubscription = (serials: string[]): unknown =>
  getQueryInfoTableMock({ serials });

describe('PersistentQueryService', () => {
  let serverManager: IServerManager;
  let dheServiceCache: IAsyncCacheService<URL, IDheService>;
  let dheJsApiCache: IAsyncCacheService<URL, never>;
  let service: PersistentQueryService;
  let knownConfigs: QueryInfo[];

  beforeEach(() => {
    vi.clearAllMocks();

    knownConfigs = [makeQueryInfo()];

    const dheService = {
      getClient: vi.fn(async () => ({
        client: { getKnownConfigs: vi.fn(() => knownConfigs) },
      })),
    } as unknown as IDheService;

    dheServiceCache = {
      get: vi.fn(async () => dheService),
      has: vi.fn(() => true),
    } as unknown as IAsyncCacheService<URL, IDheService>;

    dheJsApiCache = {
      get: vi.fn(async () => ({}) as never),
      has: vi.fn(() => true),
    } as unknown as IAsyncCacheService<URL, never>;

    serverManager = {
      onDidDisconnect: vi.fn(() => vi.fn()),
    } as unknown as IServerManager;

    service = new PersistentQueryService(
      serverManager,
      dheServiceCache,
      dheJsApiCache
    );
  });

  it('applies an exclude-helper-types filter with no status filter', async () => {
    getQueryInfoTable.mockResolvedValue(makeSubscription(['serial-1']));

    await service.getPersistentQueries(DHE_URL);

    expect(getQueryInfoTable).toHaveBeenCalledWith({
      excludeHelperTypes: true,
    });
  });

  it('resolves the ticking serials to known configs, sorted by name', async () => {
    knownConfigs = [
      makeQueryInfo({ serial: 'serial-1', name: 'Zeta PQ' }),
      makeQueryInfo({ serial: 'serial-2', name: 'Alpha PQ' }),
      // InteractiveConsole — belongs to the Workers tree, never listed here.
      makeQueryInfo({ serial: 'serial-ic', type: 'InteractiveConsole' }),
      // Not in the filtered table — excluded.
      makeQueryInfo({ serial: 'serial-hidden', name: 'Hidden' }),
    ];

    getQueryInfoTable.mockResolvedValue(
      makeSubscription(['serial-1', 'serial-2', 'serial-ic'])
    );

    const queries = await service.getPersistentQueries(DHE_URL);
    expect(queries.map(q => q.name)).toEqual(['Alpha PQ', 'Zeta PQ']);
  });

  it('includes stopped queries (no status filter, no designated worker)', async () => {
    knownConfigs = [
      makeQueryInfo({
        serial: 'serial-stopped',
        name: 'Stopped PQ',
        designated: undefined,
      } as Partial<QueryInfo>),
    ];

    getQueryInfoTable.mockResolvedValue(makeSubscription(['serial-stopped']));

    const queries = await service.getPersistentQueries(DHE_URL);
    expect(queries.map(q => q.name)).toEqual(['Stopped PQ']);
  });

  it('returns an empty list when the table fails to load', async () => {
    getQueryInfoTable.mockRejectedValue(new Error('WebClientData down'));

    expect(await service.getPersistentQueries(DHE_URL)).toEqual([]);
  });

  it('reuses one subscription per server across calls', async () => {
    getQueryInfoTable.mockResolvedValue(makeSubscription(['serial-1']));

    await service.getPersistentQueries(DHE_URL);
    await service.getPersistentQueries(DHE_URL);

    expect(getQueryInfoTable).toHaveBeenCalledTimes(1);
  });
});
