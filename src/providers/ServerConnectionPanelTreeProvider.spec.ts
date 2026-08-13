import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import type { QueryInfo } from '@deephaven-enterprise/jsapi-types';
import { ServerConnectionPanelTreeProvider } from './ServerConnectionPanelTreeProvider';
import type {
  ConnectionState,
  IPanelService,
  IPersistentQueryService,
  IServerManager,
  PersistentQueryNode,
  ServerConnectionPanelNode,
  ServerState,
  VariableDefintion,
  WorkerInfo,
} from '../types';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

const DHE_URL = new URL('https://dhe.example.com:8123/');
const IC_WORKER_URL = new URL('https://dhe.example.com:8123/worker/ic/');
const PQ_WORKER_URL = new URL('https://dhe.example.com:8123/worker/pq/');

/** A running PQ with openable objects. */
function makeQueryInfo(overrides: Record<string, unknown> = {}): QueryInfo {
  return {
    serial: 'serial-1',
    name: 'My PQ',
    type: 'DeephavenCommunity',
    designated: {
      status: 'Running',
      jsApiUrl: `${PQ_WORKER_URL.href}jsapi/dh-core.js`,
      ideUrl: `${PQ_WORKER_URL.href}ide`,
      objects: [
        { title: 'my_table', name: 'my_table', type: 'Table', id: 'v1' },
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
    connectionCount: 1,
    ...overrides,
  } as ServerState;
}

describe('ServerConnectionPanelTreeProvider', () => {
  let serverManager: IServerManager;
  let panelService: IPanelService;
  let persistentQueryService: IPersistentQueryService;
  let provider: ServerConnectionPanelTreeProvider;
  let connections: ConnectionState[];

  beforeEach(() => {
    vi.clearAllMocks();

    connections = [
      {
        label: 'IC worker',
        isConnected: true,
        serverUrl: IC_WORKER_URL,
      } as ConnectionState,
    ];

    panelService = {
      onDidUpdate: vi.fn(() => vi.fn()),
      getVariables: vi.fn(() => []),
    } as unknown as IPanelService;

    persistentQueryService = {
      onDidUpdate: vi.fn(() => vi.fn()),
      getPersistentQueries: vi.fn(async () => [makeQueryInfo()]),
    } as unknown as IPersistentQueryService;

    serverManager = {
      onDidUpdate: vi.fn(() => vi.fn()),
      onDidDisconnect: vi.fn(() => vi.fn()),
      getConnections: vi.fn(() => connections),
      getConnection: vi.fn(() => connections[0]),
      registerBrowseConnection: vi.fn(
        async (): Promise<WorkerInfo> =>
          ({ workerUrl: PQ_WORKER_URL, name: 'My PQ' }) as WorkerInfo
      ),
    } as unknown as IServerManager;

    provider = new ServerConnectionPanelTreeProvider(
      serverManager,
      panelService,
      persistentQueryService
    );
  });

  describe('getChildren (server)', () => {
    it('lists console worker connections followed by openable PQs', async () => {
      const children = (await provider.getChildren(
        makeServerState()
      )) as ServerConnectionPanelNode[];

      expect(children).toHaveLength(2);
      expect((children[0] as ConnectionState).label).toBe('IC worker');
      expect((children[1] as PersistentQueryNode).queryInfo.name).toBe('My PQ');
      expect((children[1] as PersistentQueryNode).dheServerUrl).toBe(DHE_URL);
    });

    it('omits PQs that have no openable objects', async () => {
      (
        persistentQueryService.getPersistentQueries as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        // Stopped: no designated worker at all.
        makeQueryInfo({ name: 'Stopped PQ', designated: undefined }),
        // Running but exports nothing.
        makeQueryInfo({
          name: 'Empty PQ',
          designated: {
            status: 'Running',
            jsApiUrl: `${PQ_WORKER_URL.href}jsapi/dh-core.js`,
            ideUrl: `${PQ_WORKER_URL.href}ide`,
            objects: [],
          },
        }),
        // Running with objects but no IDE endpoint (e.g. a helper query).
        makeQueryInfo({
          name: 'Not browsable PQ',
          designated: {
            status: 'Running',
            jsApiUrl: `${PQ_WORKER_URL.href}jsapi/dh-core.js`,
            ideUrl: null,
            objects: [{ title: 't', name: 't', type: 'Table', id: 'v1' }],
          },
        }),
      ]);

      const children = await provider.getChildren(makeServerState());
      expect(children).toHaveLength(1);
      expect((children[0] as ConnectionState).label).toBe('IC worker');
    });

    it('does not query PQs for a DHC server', async () => {
      const children = await provider.getChildren(
        makeServerState({ type: 'DHC', url: new URL('http://localhost:10000') })
      );

      expect(children).toHaveLength(1);
      expect(
        persistentQueryService.getPersistentQueries
      ).not.toHaveBeenCalled();
    });
  });

  describe('getChildren (connection -> panel variables)', () => {
    it('omits variables whose type is not an openable panel', async () => {
      (panelService.getVariables as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 'v1', title: 'my_table', name: 'my_table', type: 'Table' },
        { id: 'v2', title: 'ui', name: 'ui', type: 'deephaven.ui.Element' },
        {
          id: 'v3',
          title: 'dash',
          name: 'dash',
          type: 'deephaven.ui.Dashboard',
        },
        { id: 'v4', title: 'legacy', name: 'legacy', type: 'TableMap' },
        { id: 'v5', title: 'tree', name: 'tree', type: 'Treemap' },
        { id: 'v6', title: 'widget', name: 'widget', type: 'OtherWidget' },
        { id: 'v7', title: 'acl', name: 'acl', type: 'AclService' },
      ]);

      const leaves = (await provider.getChildren(connections[0])) as [
        URL,
        VariableDefintion,
      ][];

      expect(leaves.map(([, v]) => v.title)).toEqual(['my_table', 'ui']);
    });
  });

  describe('getChildren (PQ -> object leaves)', () => {
    it('registers a browse connection and returns the PQ object leaves', async () => {
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
      expect(leaves.map(([, v]) => v.title)).toEqual(['my_table']);
      leaves.forEach(([url]) => expect(url.href).toBe(PQ_WORKER_URL.href));
    });
  });

  describe('getTreeItem', () => {
    it('renders a PQ node with the language icon, matching console workers', async () => {
      const item = await provider.getTreeItem({
        dheServerUrl: DHE_URL,
        queryInfo: makeQueryInfo({ scriptLanguage: 'Python' }),
      });

      expect(item.label).toBe('My PQ');
      expect(item.contextValue).toBe('isPersistentQuery');
      expect((item.iconPath as vscode.ThemeIcon).id).toBe('dh-python');
    });

    it('renders a server node', async () => {
      const item = await provider.getTreeItem(makeServerState());
      expect(item.label).toBe('DHE');
    });

    it('offers the delete action on a console session variable', async () => {
      (serverManager.getConnection as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          label: 'IC worker',
          isConnected: true,
          serverUrl: IC_WORKER_URL,
        }
      );

      const item = await provider.getTreeItem([
        IC_WORKER_URL,
        { title: 'my_table', name: 'my_table', type: 'Table' },
      ] as [URL, VariableDefintion]);

      expect(item.contextValue).toBe('canDeleteDeephavenVariable');
    });

    it('offers no delete action on a PQ object (browse connection)', async () => {
      (serverManager.getConnection as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          label: 'My PQ',
          isConnected: true,
          isBrowseConnection: true,
          serverUrl: PQ_WORKER_URL,
        }
      );

      const item = await provider.getTreeItem([
        PQ_WORKER_URL,
        { title: 'my_table', name: 'my_table', type: 'Table' },
      ] as [URL, VariableDefintion]);

      expect(item.contextValue).toBeUndefined();
    });
  });
});
