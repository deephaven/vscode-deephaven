import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { ServerConnectionTreeProvider } from './ServerConnectionTreeProvider';
import type {
  ConnectionState,
  IPanelService,
  IServerManager,
  ServerConnectionNode,
  ServerState,
  VariableDefintion,
} from '../types';
import { OPEN_VARIABLE_PANELS_CMD } from '../common';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

const DHE_URL = new URL('https://dhe.example.com:8123/');
const WORKER_URL = new URL('https://dhe.example.com:8123/worker/ic/');

const WORKER_LABEL = 'IC - VS Code - KM7lskRLXCESeQpTBPSTB';

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

function makeVariable(title: string, id: string): VariableDefintion {
  return { id, title, name: title, type: 'Table' } as VariableDefintion;
}

describe('ServerConnectionTreeProvider', () => {
  let serverManager: IServerManager;
  let panelService: IPanelService;
  let provider: ServerConnectionTreeProvider;
  let connection: ConnectionState;
  let uris: vscode.Uri[];
  let variables: VariableDefintion[];

  beforeEach(() => {
    vi.clearAllMocks();

    connection = {
      label: WORKER_LABEL,
      isConnected: true,
      serverUrl: WORKER_URL,
    } as ConnectionState;

    uris = [];
    variables = [];

    panelService = {
      onDidUpdate: vi.fn(() => vi.fn()),
      getVariables: vi.fn(() => variables),
    } as unknown as IPanelService;

    serverManager = {
      onDidUpdate: vi.fn(() => vi.fn()),
      getConnections: vi.fn(() => [connection]),
      getConnection: vi.fn(() => connection),
      getConnectionUris: vi.fn(() => uris),
      hasConnectionUris: vi.fn(() => uris.length > 0),
      getServers: vi.fn(() => [makeServerState()]),
      getServerForConnection: vi.fn(() => makeServerState()),
      getUriConnection: vi.fn(() => connection),
    } as unknown as IServerManager;

    provider = new ServerConnectionTreeProvider(serverManager, panelService);
  });

  describe('getChildren', () => {
    it('returns one server node per server at the root', async () => {
      const children = (await provider.getChildren()) as ServerState[];
      expect(children).toHaveLength(1);
      expect(children[0].url).toBe(DHE_URL);
    });

    it('returns a server node`s worker connections', async () => {
      const children = (await provider.getChildren(
        makeServerState()
      )) as ConnectionState[];
      expect(children).toEqual([connection]);
    });

    it('lists files alphabetized, then panels alphabetized', async () => {
      uris = [
        vscode.Uri.parse('file:///workspace/z_first.py'),
        vscode.Uri.parse('file:///workspace/nested/a_second.py'),
      ];
      variables = [
        makeVariable('zebra', 'v1'),
        makeVariable('apple', 'v2'),
        // Not an openable panel type — must be dropped.
        {
          id: 'v3',
          title: 'acl',
          name: 'acl',
          type: 'AclService',
        } as unknown as VariableDefintion,
      ];

      const children = (await provider.getChildren(
        connection
      )) as ServerConnectionNode[];

      expect(children).toHaveLength(4);
      expect((children[0] as vscode.Uri).path).toBe(
        '/workspace/nested/a_second.py'
      );
      expect((children[1] as vscode.Uri).path).toBe('/workspace/z_first.py');
      expect((children[2] as [URL, VariableDefintion])[1].title).toBe('apple');
      expect((children[3] as [URL, VariableDefintion])[1].title).toBe('zebra');
      // Panel leaves are keyed by the worker url.
      expect((children[2] as [URL, VariableDefintion])[0]).toBe(WORKER_URL);
    });

    it('returns no children for leaf nodes', async () => {
      expect(
        await provider.getChildren(vscode.Uri.parse('file:///workspace/a.py'))
      ).toEqual([]);
      expect(
        await provider.getChildren([WORKER_URL, makeVariable('t1', 'v1')])
      ).toEqual([]);
    });
  });

  describe('getTreeItem', () => {
    it('shortens the worker label and keeps the full name on hover', async () => {
      const item = await provider.getTreeItem(connection);
      expect(item.label).toBe('IC - VS Code - KM7lsk');
      expect(item.tooltip).toBe(WORKER_LABEL);
    });

    it('has no expander when the worker has no files or panels', async () => {
      const item = await provider.getTreeItem(connection);
      expect(item.collapsibleState).toBeUndefined();
    });

    it('expands a worker that only has panels', async () => {
      variables = [makeVariable('t1', 'v1')];
      const item = await provider.getTreeItem(connection);
      expect(item.collapsibleState).toBe(
        vscode.TreeItemCollapsibleState.Expanded
      );
    });

    it('expands a worker that only has files', async () => {
      uris = [vscode.Uri.parse('file:///workspace/a.py')];
      const item = await provider.getTreeItem(connection);
      expect(item.collapsibleState).toBe(
        vscode.TreeItemCollapsibleState.Expanded
      );
    });

    it('renders a panel leaf with the open command + delete action', async () => {
      const item = await provider.getTreeItem([
        WORKER_URL,
        makeVariable('t1', 'v1'),
      ]);
      expect(item.label).toBe('t1');
      expect(item.command?.command).toBe(OPEN_VARIABLE_PANELS_CMD);
      // Console-session variables can be deleted (PQ objects cannot).
      expect(item.contextValue).toBe('canDeleteDeephavenVariable');
    });

    it('renders a uri leaf', async () => {
      const uri = vscode.Uri.parse('file:///workspace/a.py');
      const item = await provider.getTreeItem(uri);
      expect(item.contextValue).toBe('isUri');
      expect(item.resourceUri).toBe(uri);
    });
  });

  describe('getParent', () => {
    it('resolves a panel leaf to its connection', () => {
      expect(provider.getParent([WORKER_URL, makeVariable('t1', 'v1')])).toBe(
        connection
      );
      expect(serverManager.getConnection).toHaveBeenCalledWith(WORKER_URL);
    });

    it('resolves a uri leaf to its connection', () => {
      const uri = vscode.Uri.parse('file:///workspace/a.py');
      expect(provider.getParent(uri)).toBe(connection);
    });

    it('resolves a connection to its server', () => {
      expect((provider.getParent(connection) as ServerState).url).toBe(DHE_URL);
    });

    it('resolves a server to the root', () => {
      expect(provider.getParent(makeServerState())).toBeNull();
    });
  });

  it('refreshes when the panel service updates', () => {
    const listener = (panelService.onDidUpdate as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as () => void;

    const onDidChangeTreeData = vi.fn();
    provider.onDidChangeTreeData(onDidChangeTreeData);

    listener();

    expect(onDidChangeTreeData).toHaveBeenCalled();
  });
});
