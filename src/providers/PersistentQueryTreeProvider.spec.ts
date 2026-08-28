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
  let hiddenStatuses: Set<string>;
  let onFilterDidUpdate: (() => void) | undefined;
  let provider: PersistentQueryTreeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    onFilterDidUpdate = undefined;

    // Default filter: hide the completely-stopped statuses. `Stopping` is not
    // one of them — it is still winding down, so it stays visible.
    hiddenStatuses = new Set([
      'Stopped',
      'Failed',
      'Error',
      'Disconnected',
      'Completed',
      UNSET_QUERY_STATUS,
    ]);

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
      getPersistentQueries: vi.fn(async () => [makeQueryInfo()]),
    } as unknown as IPersistentQueryService;

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
      persistentQueryService,
      statusFilterService
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
    beforeEach(() => {
      (
        persistentQueryService.getPersistentQueries as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
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
        } as Partial<QueryInfo>),
      ]);
    });

    it('lists the visible queries directly under the server, alphabetized', async () => {
      const server = makeServerState();
      const children = (await provider.getChildren(
        server
      )) as PersistentQueryTreeNode[];

      expect(persistentQueryService.getPersistentQueries).toHaveBeenCalledWith(
        server.url
      );
      // Two visible queries, then the trailing hidden-count node.
      expect(
        children
          .slice(0, -1)
          .map(c => (c as PersistentQueryNode).queryInfo.name)
      ).toEqual(['Alpha PQ', 'Zeta PQ']);
      expect(children.at(-1)).toEqual({
        dheServerUrl: server.url,
        hiddenCount: 2,
      });
    });

    it('excludes the hidden statuses', async () => {
      const children = (await provider.getChildren(
        makeServerState()
      )) as PersistentQueryTreeNode[];

      const names = children.map(
        c => (c as PersistentQueryNode).queryInfo?.name
      );
      expect(names).not.toContain('Terminated PQ');
      expect(names).not.toContain('No Status PQ');
    });

    it('shows a status it does not recognize (not in the hidden set)', async () => {
      (
        persistentQueryService.getPersistentQueries as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        makeQueryInfo({
          name: 'Future PQ',
          designated: { status: 'Hibernating' },
        } as unknown as Partial<QueryInfo>),
      ]);

      const children = (await provider.getChildren(
        makeServerState()
      )) as PersistentQueryNode[];

      expect(children.map(c => c.queryInfo.name)).toEqual(['Future PQ']);
    });

    it('returns an empty list when the service reports none', async () => {
      (
        persistentQueryService.getPersistentQueries as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

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
      expect(leaves.map(([, v]) => v.title)).toEqual(['my_table', 'my_figure']);
      // Leaves are keyed by the worker URL (from the browse connection).
      leaves.forEach(([url]) => expect(url.href).toBe(WORKER_URL.href));

      // Verify the open command wiring via the tree item.
      const item = await provider.getTreeItem(leaves[0]);
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
    it('renders a DHE server node with no count description', async () => {
      (
        persistentQueryService.getPersistentQueries as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        makeQueryInfo({ serial: 'serial-1', name: 'Alpha PQ' }),
      ]);
      hiddenStatuses.clear();

      const item = await provider.getTreeItem(makeServerState());
      expect(item.label).toBe('DHE');
      expect(item.description).toBeUndefined();
    });

    it('renders the hidden-count node with the filter command', async () => {
      const item = await provider.getTreeItem({
        dheServerUrl: DHE_URL,
        hiddenCount: 20007,
      });

      expect(item.label).toBe('Hidden (20,007)');
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
      const leaf: PersistentQueryTreeNode = [
        WORKER_URL,
        { title: 'my_table', name: 'my_table', type: 'Table', id: 'v1' },
      ] as [URL, VariableDefintion];
      const item = await provider.getTreeItem(leaf);
      expect(item.label).toBe('my_table');
      expect(item.command?.command).toBe(OPEN_VARIABLE_PANELS_CMD);
    });
  });

  describe('getStatusCounts', () => {
    it('sums across servers and buckets an unset status under the empty string', async () => {
      const otherUrl = new URL('https://other.example.com/');
      (serverManager.getServers as ReturnType<typeof vi.fn>).mockReturnValue([
        makeServerState(),
        makeServerState({ url: otherUrl }),
        makeServerState({
          url: new URL('https://disconnected.example.com/'),
          isConnected: false,
        }),
      ]);

      (
        persistentQueryService.getPersistentQueries as ReturnType<typeof vi.fn>
      ).mockImplementation(async (url: URL) =>
        url === otherUrl
          ? [
              makeQueryInfo({ name: 'Other Running' }),
              makeQueryInfo({
                name: 'Other Unset',
                designated: undefined,
              } as Partial<QueryInfo>),
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

      expect(onFilterDidUpdate).toBeDefined();
      onFilterDidUpdate?.();

      expect(onDidChangeTreeData).toHaveBeenCalled();
    });
  });
});
