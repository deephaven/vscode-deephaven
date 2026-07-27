import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryInfo } from '@deephaven-enterprise/jsapi-types';
import { PersistentQueryTreeProvider } from './PersistentQueryTreeProvider';
import { getQueryInfoTableMock } from '../testUtils';
import type {
  IAsyncCacheService,
  IDheService,
  IServerManager,
  PersistentQueryNode,
  PersistentQueryTreeNode,
  ServerState,
  VariableDefintion,
  WorkerInfo,
} from '../types';
import { OPEN_VARIABLE_PANELS_CMD } from '../common';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

// Control the QueryConfigTableService the provider constructs internally.
const getQueryInfoTable = vi.fn();
vi.mock('../services', async importActual => {
  const actual = await importActual<typeof import('../services')>();
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
const WORKER_URL = new URL('https://dhe.example.com:8123/worker/1/');

/** Build a minimal `QueryInfo` for tests. */
function makeQueryInfo(overrides: Partial<QueryInfo> = {}): QueryInfo {
  return {
    serial: 'serial-1',
    name: 'My PQ',
    owner: 'alice',
    type: 'DeephavenCommunity',
    designated: {
      status: 'Running',
      objects: [
        { title: 'my_table', name: 'my_table', type: 'Table', id: 'v1' },
        { title: 'my_figure', name: 'my_figure', type: 'Figure', id: 'v2' },
      ],
    },
    ...overrides,
  } as unknown as QueryInfo;
}

function makeServerState(overrides: Partial<ServerState> = {}): ServerState {
  return {
    type: 'DHE',
    url: DHE_URL,
    label: 'DHE',
    isConnected: true,
    isRunning: true,
    connectionCount: 0,
    ...overrides,
  } as ServerState;
}

describe('PersistentQueryTreeProvider', () => {
  let serverManager: IServerManager;
  let dheService: IDheService;
  let dheServiceCache: IAsyncCacheService<URL, IDheService>;
  let dheJsApiCache: IAsyncCacheService<URL, never>;
  let provider: PersistentQueryTreeProvider;
  let knownConfigs: QueryInfo[];

  beforeEach(() => {
    vi.clearAllMocks();

    knownConfigs = [makeQueryInfo()];

    dheService = {
      getClient: vi.fn(async () => ({
        client: {
          getKnownConfigs: vi.fn(() => knownConfigs),
        },
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
      onDidUpdate: vi.fn(() => vi.fn()),
      onDidDisconnect: vi.fn(() => vi.fn()),
      getServers: vi.fn(() => [makeServerState()]),
      registerBrowseConnection: vi.fn(
        async (): Promise<WorkerInfo> =>
          ({ workerUrl: WORKER_URL, name: 'My PQ' }) as WorkerInfo
      ),
    } as unknown as IServerManager;

    provider = new PersistentQueryTreeProvider(
      serverManager,
      dheServiceCache,
      dheJsApiCache
    );
  });

  describe('getChildren (root)', () => {
    it('returns only connected DHE servers', async () => {
      (serverManager.getServers as ReturnType<typeof vi.fn>).mockReturnValue([
        makeServerState({ isConnected: true }),
        makeServerState({
          url: new URL('https://other.example.com/'),
          isConnected: false,
        }),
      ]);

      const children = (await provider.getChildren()) as ServerState[];
      expect(children).toHaveLength(1);
      expect(children[0].isConnected).toBe(true);
      expect(serverManager.getServers).toHaveBeenCalledWith({ type: 'DHE' });
    });
  });

  describe('getChildren (server -> persistent queries)', () => {
    it('lists running non-IC PQs resolved from getKnownConfigs, excluding IC + replica children', async () => {
      knownConfigs = [
        makeQueryInfo({ serial: 'serial-1', name: 'Zeta PQ' }),
        makeQueryInfo({ serial: 'serial-2', name: 'Alpha PQ' }),
        // InteractiveConsole — must be excluded.
        makeQueryInfo({ serial: 'serial-ic', type: 'InteractiveConsole' }),
        // Not in the (filtered) table viewport — excluded.
        makeQueryInfo({ serial: 'serial-hidden', name: 'Hidden' }),
      ];

      getQueryInfoTable.mockResolvedValue(
        getQueryInfoTableMock({
          // Serial column values in the filtered viewport; `serial-hidden`
          // omitted, `serial-child` has a Parent set.
          /* eslint-disable @typescript-eslint/naming-convention */
          rows: [
            { Serial: 'serial-1', Parent: null },
            { Serial: 'serial-2', Parent: null },
            { Serial: 'serial-ic', Parent: null },
            { Serial: 'serial-child', Parent: 'serial-1' },
          ],
          /* eslint-enable @typescript-eslint/naming-convention */
        })
      );

      const server = makeServerState();
      const children = (await provider.getChildren(
        server
      )) as PersistentQueryNode[];

      const names = children.map(c => c.queryInfo.name);
      // Sorted by name; IC + hidden excluded.
      expect(names).toEqual(['Alpha PQ', 'Zeta PQ']);
      children.forEach(c => expect(c.dheServerUrl).toBe(server.url));
    });

    it('applies a running + exclude-helper-types server-side filter', async () => {
      getQueryInfoTable.mockResolvedValue(
        getQueryInfoTableMock({
          // eslint-disable-next-line @typescript-eslint/naming-convention
          rows: [{ Serial: 'serial-1', Parent: null }],
        })
      );

      await provider.getChildren(makeServerState());

      expect(getQueryInfoTable).toHaveBeenCalledWith({
        statuses: ['Running'],
        excludeHelperTypes: true,
      });
    });

    it('returns an empty list when the table fails to load', async () => {
      getQueryInfoTable.mockRejectedValue(new Error('WebClientData down'));

      const children = await provider.getChildren(makeServerState());
      expect(children).toEqual([]);
    });
  });

  describe('getChildren (PQ -> object leaves)', () => {
    it('registers a browse connection and returns object leaves opened via OPEN_VARIABLE_PANELS_CMD', async () => {
      const node: PersistentQueryNode = {
        dheServerUrl: DHE_URL,
        queryInfo: makeQueryInfo(),
      };

      const leaves = (await provider.getChildren(node)) as [
        URL,
        VariableDefintion,
      ][];

      expect(serverManager.registerBrowseConnection).toHaveBeenCalledWith(
        DHE_URL,
        node.queryInfo
      );

      expect(leaves).toHaveLength(2);
      expect(leaves.map(([, v]) => v.title)).toEqual([
        'my_table',
        'my_figure',
      ]);
      // Leaves are keyed by the worker URL (from the browse connection).
      leaves.forEach(([url]) => expect(url.href).toBe(WORKER_URL.href));

      // Verify the open command wiring via the tree item.
      const item = provider.getTreeItem(leaves[0]);
      expect(item.command?.command).toBe(OPEN_VARIABLE_PANELS_CMD);
      expect(item.command?.arguments?.[0]).toBe(leaves[0][0]);
    });

    it('returns no leaves when the browse connection cannot be registered', async () => {
      (
        serverManager.registerBrowseConnection as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      const node: PersistentQueryNode = {
        dheServerUrl: DHE_URL,
        queryInfo: makeQueryInfo(),
      };

      const leaves = await provider.getChildren(node);
      expect(leaves).toEqual([]);
    });
  });

  describe('getTreeItem', () => {
    it('renders a DHE server node', () => {
      const item = provider.getTreeItem(makeServerState());
      expect(item.label).toBe('DHE');
    });

    it('renders a persistent-query node with status icon + name', () => {
      const node: PersistentQueryNode = {
        dheServerUrl: DHE_URL,
        queryInfo: makeQueryInfo({ name: 'My PQ' }),
      };
      const item = provider.getTreeItem(node);
      expect(item.label).toBe('My PQ');
      expect(item.contextValue).toBe('isPersistentQuery');
    });

    it('renders an object leaf via the shared panel renderer', () => {
      const leaf: PersistentQueryTreeNode = [
        WORKER_URL,
        { title: 'my_table', name: 'my_table', type: 'Table', id: 'v1' },
      ] as [URL, VariableDefintion];
      const item = provider.getTreeItem(leaf);
      expect(item.label).toBe('my_table');
      expect(item.command?.command).toBe(OPEN_VARIABLE_PANELS_CMD);
    });
  });
});
