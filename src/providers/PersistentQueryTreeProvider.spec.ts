import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import type { QueryInfo } from '@deephaven-enterprise/jsapi-types';
import { PersistentQueryTreeProvider } from './PersistentQueryTreeProvider';
import type {
  IPersistentQueryService,
  IPersistentQueryStatusFilterService,
  IServerManager,
  PersistentQueryNode,
  PersistentQueryTreeNode,
  ServerState,
  VariableDefintion,
  WorkerInfo,
} from '../types';
import {
  FILTER_PERSISTENT_QUERIES_CMD,
  OPEN_VARIABLE_PANELS_CMD,
  UNSET_QUERY_STATUS,
} from '../common';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

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
      jsApiUrl: `${WORKER_URL.href}jsapi/dh-core.js`,
      ideUrl: `${WORKER_URL.href}ide`,
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
  let persistentQueryService: IPersistentQueryService;
  let statusFilterService: IPersistentQueryStatusFilterService;
  // Default filter: hide the whole Stopped section.
  const hiddenStatuses: ReadonlySet<string> = new Set([
    'Stopping',
    'Stopped',
    'Failed',
    'Error',
    'Disconnected',
    'Completed',
    UNSET_QUERY_STATUS,
  ]);
  let onFilterDidUpdate: (() => void) | undefined;
  let provider: PersistentQueryTreeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    onFilterDidUpdate = undefined;

    statusFilterService = {
      onDidUpdate: vi.fn((listener: () => void) => {
        onFilterDidUpdate = listener;
        return vi.fn();
      }),
      isVisible: vi.fn(
        (status?: string | null) => !hiddenStatuses.has(status ?? '')
      ),
      getHiddenStatuses: vi.fn(() => hiddenStatuses),
      setHiddenStatuses: vi.fn(),
    } as unknown as IPersistentQueryStatusFilterService;

    persistentQueryService = {
      onDidUpdate: vi.fn(() => vi.fn()),
      getPersistentQueryInfos: vi.fn(async () => [makeQueryInfo()]),
      isSupported: vi.fn(async () => true),
    } as unknown as IPersistentQueryService;

    serverManager = {
      onDidUpdate: vi.fn(() => vi.fn()),
      onDidDisconnect: vi.fn(() => vi.fn()),
      getServers: vi.fn(() => [makeServerState()]),
      registerSessionlessConnection: vi.fn(
        async (): Promise<WorkerInfo> =>
          ({ workerUrl: WORKER_URL, name: 'My PQ' }) as WorkerInfo
      ),
    } as unknown as IServerManager;

    provider = new PersistentQueryTreeProvider(
      serverManager,
      persistentQueryService,
      statusFilterService
    );
  });

  describe('getChildren (root)', () => {
    it('returns only connected DHE servers', async () => {
      vi.mocked(serverManager.getServers).mockReturnValue([
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
    beforeEach(() => {
      vi.mocked(
        persistentQueryService.getPersistentQueryInfos
      ).mockResolvedValue([
        // The service returns these in unspecified order; the provider sorts.
        makeQueryInfo({ serial: 'serial-1', name: 'Zeta PQ' }),
        makeQueryInfo({
          serial: 'serial-2',
          name: 'Terminated PQ',
          designated: { status: 'Failed' },
        } as unknown as Partial<QueryInfo>),
        makeQueryInfo({ serial: 'serial-3', name: 'Alpha PQ' }),
        makeQueryInfo({
          serial: 'serial-4',
          name: 'No Status PQ',
          designated: undefined,
        }),
      ]);
    });

    const getQueryInfoName = (
      node: PersistentQueryTreeNode
    ): string | undefined =>
      'queryInfo' in node ? node.queryInfo.name : undefined;

    it('lists the visible queries under the server, alphabetized', async () => {
      const server = makeServerState();
      const [alpha, zeta, hiddenCounts] = await provider.getChildren(server);

      expect(
        persistentQueryService.getPersistentQueryInfos
      ).toHaveBeenCalledWith(server.url);

      expect([alpha, zeta].map(getQueryInfoName)).toEqual([
        'Alpha PQ',
        'Zeta PQ',
      ]);

      expect(hiddenCounts).toEqual({
        dheServerUrl: server.url,
        hiddenCount: 2,
      });
    });

    it('excludes the hidden statuses', async () => {
      const children = await provider.getChildren(makeServerState());

      const names = children.map(getQueryInfoName);
      expect(names).not.toContain('Terminated PQ');
      expect(names).not.toContain('No Status PQ');
    });

    it('shows a status it does not recognize (not in the hidden set)', async () => {
      vi.mocked(
        persistentQueryService.getPersistentQueryInfos
      ).mockResolvedValue([
        makeQueryInfo({
          name: 'Future PQ',
          designated: { status: 'Hibernating' },
        } as unknown as Partial<QueryInfo>),
      ]);

      const children = await provider.getChildren(makeServerState());

      expect(children.map(getQueryInfoName)).toEqual(['Future PQ']);
    });

    it('returns an empty list when the service reports none', async () => {
      vi.mocked(
        persistentQueryService.getPersistentQueryInfos
      ).mockResolvedValue([]);

      const children = await provider.getChildren(makeServerState());
      expect(children).toEqual([]);
    });
  });

  describe('getChildren (PQ -> object leaves)', () => {
    it('registers a sessionless connection and returns object leaves opened via OPEN_VARIABLE_PANELS_CMD', async () => {
      const node: PersistentQueryNode = {
        dheServerUrl: DHE_URL,
        queryInfo: makeQueryInfo(),
      };

      const leaves = (await provider.getChildren(node)) as [
        URL,
        VariableDefintion,
      ][];

      expect(serverManager.registerSessionlessConnection).toHaveBeenCalledWith(
        DHE_URL,
        node.queryInfo
      );

      expect(leaves).toEqual([
        [
          WORKER_URL,
          {
            id: 'v1',
            name: 'my_table',
            title: 'my_table',
            type: 'Table',
          },
        ],
        [
          WORKER_URL,
          {
            id: 'v2',
            name: 'my_figure',
            title: 'my_figure',
            type: 'Figure',
          },
        ],
      ]);

      for (const [url, def] of leaves) {
        const item = await provider.getTreeItem([url, def]);
        expect(item.command).toEqual({
          command: OPEN_VARIABLE_PANELS_CMD,
          title: 'Open Panel',
          arguments: [url, [def]],
        });
      }
    });

    it('returns no leaves when the sessionless connection cannot be registered', async () => {
      vi.mocked(serverManager.registerSessionlessConnection).mockResolvedValue(
        null
      );

      const node: PersistentQueryNode = {
        dheServerUrl: DHE_URL,
        queryInfo: makeQueryInfo(),
      };

      const leaves = await provider.getChildren(node);
      expect(leaves).toEqual([]);
    });
  });

  describe('getTreeItem', () => {
    it('renders a DHE server node with no count description', async () => {
      vi.mocked(
        persistentQueryService.getPersistentQueryInfos
      ).mockResolvedValue([
        makeQueryInfo({ serial: 'serial-1', name: 'Alpha PQ' }),
      ]);

      const item = await provider.getTreeItem(makeServerState());
      expect(item.label).toBe('DHE');
      expect(item.description).toBeUndefined();
    });

    it('renders the hidden-count node with the filter command', async () => {
      const item = await provider.getTreeItem({
        dheServerUrl: DHE_URL,
        hiddenCount: 20007,
      });

      expect(item.label).toBe('More (20,007)');
      expect(item.id).toBe(`pq:${DHE_URL.href}:more`);
      expect(item.command?.command).toBe(FILTER_PERSISTENT_QUERIES_CMD);
      expect(item.contextValue).toBe('isPersistentQueryHidden');
      expect((item.iconPath as vscode.ThemeIcon).id).toBe('ellipsis');
    });

    it('singularizes the hidden-count tooltip', async () => {
      const one = await provider.getTreeItem({
        dheServerUrl: DHE_URL,
        hiddenCount: 1,
      });
      const many = await provider.getTreeItem({
        dheServerUrl: DHE_URL,
        hiddenCount: 2,
      });

      expect(one.tooltip).toContain('1 query is hidden');
      expect(many.tooltip).toContain('2 queries are hidden');
    });

    it('renders a persistent-query node with its status circle + name', async () => {
      const node: PersistentQueryNode = {
        dheServerUrl: DHE_URL,
        queryInfo: makeQueryInfo({ name: 'My PQ' }),
      };
      const item = await provider.getTreeItem(node);
      expect(item.label).toBe('My PQ');
      expect(item.contextValue).toBe('isPersistentQuery');
      expect((item.iconPath as vscode.ThemeIcon).id).toBe(
        'circle-large-filled'
      );
    });

    it('renders an object leaf via the shared panel renderer', async () => {
      const leaf: [URL, VariableDefintion] = [
        WORKER_URL,
        {
          title: 'my_table_title',
          name: 'my_table_name',
          type: 'Table',
          id: 'v1',
        } as VariableDefintion,
      ];
      const item = await provider.getTreeItem(leaf);
      expect(item.label).toBe('my_table_title');
      expect(item.command?.command).toBe(OPEN_VARIABLE_PANELS_CMD);
    });
  });

  describe('getStatusCounts', () => {
    it('sums across servers and buckets an unset status under the empty string', async () => {
      const otherUrl = new URL('https://other.example.com/');
      vi.mocked(serverManager.getServers).mockReturnValue([
        makeServerState(),
        makeServerState({ url: otherUrl }),
        makeServerState({
          url: new URL('https://disconnected.example.com/'),
          isConnected: false,
        }),
      ]);

      vi.mocked(
        persistentQueryService.getPersistentQueryInfos
      ).mockImplementation(async url =>
        url === otherUrl
          ? [
              makeQueryInfo({ name: 'Other Running' }),
              makeQueryInfo({
                name: 'Other Unset',
                designated: undefined,
              }),
            ]
          : [
              makeQueryInfo({ name: 'Running' }),
              makeQueryInfo({
                name: 'Stopped',
                designated: { status: 'Stopped' },
              } as unknown as Partial<QueryInfo>),
            ]
      );

      const counts = await provider.getStatusCounts();

      expect(counts.get('Running')).toBe(2);
      expect(counts.get('Stopped')).toBe(1);
      expect(counts.get(UNSET_QUERY_STATUS)).toBe(1);
      // Disconnected servers contribute nothing.
      expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(4);
    });
  });

  describe('filter updates', () => {
    it('refreshes the tree when the filter service updates', () => {
      const onDidChangeTreeData = vi.fn();
      provider.onDidChangeTreeData(onDidChangeTreeData);
      expect(onDidChangeTreeData).not.toHaveBeenCalled();

      expect(onFilterDidUpdate).toBeDefined();
      onFilterDidUpdate?.();

      expect(onDidChangeTreeData).toHaveBeenCalled();
    });
  });

  describe('unsupported servers', () => {
    it('omits a server that cannot back the view from the root', async () => {
      vi.mocked(persistentQueryService.isSupported).mockResolvedValue(false);

      expect(await provider.getChildren()).toEqual([]);
    });

    it('omits only the unsupported servers when servers are mixed', async () => {
      const supported = makeServerState({
        url: new URL('https://supported.com:8123/'),
        label: 'A supported',
      });
      const unsupported = makeServerState({
        url: new URL('https://unsupported.com:8123/'),
        label: 'B unsupported',
      });

      vi.mocked(serverManager.getServers).mockReturnValue([
        supported,
        unsupported,
      ]);
      vi.mocked(persistentQueryService.isSupported).mockImplementation(
        async url => url.href === supported.url.href
      );

      expect(await provider.getChildren()).toEqual([supported]);
    });

    it('counts only the supported servers queries when servers are mixed', async () => {
      const supported = makeServerState({
        url: new URL('https://supported.com:8123/'),
      });
      const unsupported = makeServerState({
        url: new URL('https://unsupported.com:8123/'),
      });

      vi.mocked(serverManager.getServers).mockReturnValue([
        supported,
        unsupported,
      ]);
      vi.mocked(persistentQueryService.isSupported).mockImplementation(
        async url => url.href === supported.url.href
      );
      vi.mocked(
        persistentQueryService.getPersistentQueryInfos
      ).mockImplementation(async url =>
        url.href === supported.url.href
          ? [makeQueryInfo({ name: 'Supported Running' })]
          : [
              makeQueryInfo({ name: 'Unsupported Running' }),
              makeQueryInfo({
                name: 'Unsupported Stopped',
                designated: { status: 'Stopped' },
              } as unknown as Partial<QueryInfo>),
            ]
      );

      const counts = await provider.getStatusCounts();

      expect(counts).toEqual(new Map([['Running', 1]]));
      // The unsupported server is never even asked for its queries.
      expect(
        persistentQueryService.getPersistentQueryInfos
      ).not.toHaveBeenCalledWith(unsupported.url);
    });
  });
});
