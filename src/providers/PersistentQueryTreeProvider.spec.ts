import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import type { QueryInfo } from '@deephaven-enterprise/jsapi-types';
import { PersistentQueryTreeProvider } from './PersistentQueryTreeProvider';
import type {
  IPersistentQueryService,
  PersistentQueryGroupNode,
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
  let provider: PersistentQueryTreeProvider;

  beforeEach(() => {
    vi.clearAllMocks();

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
      persistentQueryService
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

  describe('getChildren (server -> status groups)', () => {
    it('returns the Running group before the Stopped group', async () => {
      (
        persistentQueryService.getPersistentQueries as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        makeQueryInfo({
          serial: 'serial-1',
          name: 'Stopped PQ',
          designated: { status: 'Stopped' },
        } as unknown as Partial<QueryInfo>),
        makeQueryInfo({ serial: 'serial-2', name: 'Running PQ' }),
      ]);

      const server = makeServerState();
      const children = (await provider.getChildren(
        server
      )) as PersistentQueryGroupNode[];

      expect(persistentQueryService.getPersistentQueries).toHaveBeenCalledWith(
        server.url
      );
      expect(children.map(c => c.group)).toEqual(['Running', 'Stopped']);
      children.forEach(c => expect(c.dheServerUrl).toBe(server.url));
    });

    it('omits a group that holds no queries', async () => {
      (
        persistentQueryService.getPersistentQueries as ReturnType<typeof vi.fn>
      ).mockResolvedValue([makeQueryInfo({ name: 'Running PQ' })]);

      const children = (await provider.getChildren(
        makeServerState()
      )) as PersistentQueryGroupNode[];

      expect(children.map(c => c.group)).toEqual(['Running']);
    });

    it('returns an empty list when the service reports none', async () => {
      (
        persistentQueryService.getPersistentQueries as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      const children = await provider.getChildren(makeServerState());
      expect(children).toEqual([]);
    });
  });

  describe('getChildren (group -> persistent queries)', () => {
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

    it('lists the running queries alphabetized', async () => {
      const children = (await provider.getChildren({
        dheServerUrl: DHE_URL,
        group: 'Running',
      })) as PersistentQueryNode[];

      expect(children.map(c => c.queryInfo.name)).toEqual([
        'Alpha PQ',
        'Zeta PQ',
      ]);
      children.forEach(c => expect(c.dheServerUrl).toBe(DHE_URL));
    });

    it('lists the terminal + unset-status queries under Stopped', async () => {
      const children = (await provider.getChildren({
        dheServerUrl: DHE_URL,
        group: 'Stopped',
      })) as PersistentQueryNode[];

      expect(children.map(c => c.queryInfo.name)).toEqual([
        'No Status PQ',
        'Terminated PQ',
      ]);
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
    it('renders a DHE server node', async () => {
      const item = await provider.getTreeItem(makeServerState());
      expect(item.label).toBe('DHE');
    });

    it('renders a status group node with its query count', async () => {
      (
        persistentQueryService.getPersistentQueries as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        makeQueryInfo({ serial: 'serial-1', name: 'Alpha PQ' }),
        makeQueryInfo({ serial: 'serial-2', name: 'Beta PQ' }),
      ]);

      const item = await provider.getTreeItem({
        dheServerUrl: DHE_URL,
        group: 'Running',
      });

      expect(item.label).toBe('Running');
      expect(item.description).toBe('(2)');
      expect(item.contextValue).toBe('isPersistentQueryGroup');
    });

    it('renders a persistent-query node with the language icon + name', async () => {
      const node: PersistentQueryNode = {
        dheServerUrl: DHE_URL,
        queryInfo: makeQueryInfo({
          name: 'My PQ',
          scriptLanguage: 'Python',
        } as Partial<QueryInfo>),
      };
      const item = await provider.getTreeItem(node);
      expect(item.label).toBe('My PQ');
      expect(item.contextValue).toBe('isPersistentQuery');
      // Status lives on the group now, so the node shows its language.
      expect((item.iconPath as vscode.ThemeIcon).id).toBe('dh-python');
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
});
