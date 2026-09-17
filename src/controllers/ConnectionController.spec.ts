import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionController } from './ConnectionController';
import type {
  ConnectionState,
  IServerManager,
  IToastService,
  ServerState,
} from '../types';
import type { CreateQueryViewProvider } from '../providers';

vi.mock('vscode');

vi.mock('../util', async () => {
  const actual = await vi.importActual<typeof import('../util')>('../util');
  return {
    ...actual,
    isInstanceOf: vi.fn(() => true),
    createConnectStatusBarItem: vi.fn(() => ({
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
    updateConnectionStatusBarItem: vi.fn(),
  };
});

const uri = { toString: () => 'file:///test.py' } as vscode.Uri;

const host1 = {
  serverUrl: new URL('https://host1.example.com:8123/'),
  ownedCn: mockConnection(true, 'host1'),
  externalCn: mockConnection(false, 'host1'),
};

const host2 = {
  ownedCn: mockConnection(true, 'host2'),
};

function mockConnection(
  isOwned: boolean,
  hostId: `host${number}`
): ConnectionState {
  return {
    isOwned,
    serverUrl: new URL(
      `https://${hostId}.example.com:8123/worker/${isOwned ? 'owned' : 'external'}/`
    ),
    supportsConsoleType: vi.fn().mockResolvedValue(true),
  } as unknown as ConnectionState;
}

function createController(
  connections: ConnectionState[],
  servers: ServerState[] = []
): [ConnectionController, IServerManager] {
  const serverManager = {
    getEditorConnection: vi.fn().mockResolvedValue(null),
    getUriConnection: vi.fn().mockReturnValue(null),
    getConnections: vi.fn((url?: URL) => {
      if (url == null) {
        return connections;
      }
      // Mirrors ServerManager: an exact worker URL returns that connection, a
      // server URL returns every worker under that server.
      const exact = connections.find(cn => cn.serverUrl.href === url.href);
      return exact == null
        ? connections.filter(cn => cn.serverUrl.origin === url.origin)
        : [exact];
    }),
    getServers: vi.fn().mockReturnValue(servers),
    onDidRegisterEditor: vi.fn(),
    onDidServerStatusChange: vi.fn(),
    onDidUpdate: vi.fn(),
    onDidDisconnect: vi.fn(),
    connectToServer: vi.fn(),
  } as unknown as IServerManager;

  const controller = new ConnectionController(
    { subscriptions: [] } as unknown as vscode.ExtensionContext,
    {} as unknown as CreateQueryViewProvider,
    serverManager,
    { appendLine: vi.fn() } as unknown as vscode.OutputChannel,
    { info: vi.fn(), error: vi.fn() } as unknown as IToastService
  );

  controller.connectEditor = vi.fn();
  controller.onPromptUserToSelectConnection = vi.fn().mockResolvedValue(false);

  return [controller, serverManager];
}

describe('ConnectionController.getOrCreateConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-selects a sole owned connection', async () => {
    const [controller] = createController([host1.ownedCn]);

    await controller.getOrCreateConnection(uri, 'python');

    expect(controller.connectEditor).toHaveBeenCalledWith(
      host1.ownedCn,
      uri,
      'python'
    );
  });

  // External consoles populate the tree but must never be auto-selected to run
  // code in — see `_createOrAttachToWorkers`.
  it('prompts rather than auto-selecting a sole external connection', async () => {
    const [controller] = createController([host1.externalCn]);

    await controller.getOrCreateConnection(uri, 'python');

    expect(controller.connectEditor).not.toHaveBeenCalled();
    expect(controller.onPromptUserToSelectConnection).toHaveBeenCalled();
  });

  it('connects to the sole free server rather than a lone external connection', async () => {
    const server = { url: host1.serverUrl } as ServerState;
    const [controller] = createController([host1.externalCn], [server]);

    await controller.getOrCreateConnection(uri, 'python');

    expect(controller.connectEditor).toHaveBeenCalledWith(
      server,
      uri,
      'python'
    );
  });

  it('selects an external connection named by its own worker URL', async () => {
    const [controller] = createController([host1.externalCn]);

    await controller.getOrCreateConnection(
      uri,
      'python',
      host1.externalCn.serverUrl
    );

    expect(controller.connectEditor).toHaveBeenCalledWith(
      host1.externalCn,
      uri,
      'python'
    );
  });

  it('selects an owned connection named by its server URL', async () => {
    const [controller] = createController([host1.ownedCn]);

    await controller.getOrCreateConnection(uri, 'python', host1.serverUrl);

    expect(controller.connectEditor).toHaveBeenCalledWith(
      host1.ownedCn,
      uri,
      'python'
    );
  });

  it('does not select an owned connection on a different server', async () => {
    const [controller] = createController([host2.ownedCn, host1.externalCn]);

    await controller.getOrCreateConnection(uri, 'python', host1.serverUrl);

    expect(controller.connectEditor).not.toHaveBeenCalled();
  });

  it('selects the named worker even when another server has an owned one', async () => {
    const [controller] = createController([host2.ownedCn, host1.externalCn]);

    await controller.getOrCreateConnection(
      uri,
      'python',
      host1.externalCn.serverUrl
    );

    expect(controller.connectEditor).toHaveBeenCalledWith(
      host1.externalCn,
      uri,
      'python'
    );
  });

  it('does not select an external connection named only by its server URL', async () => {
    const [controller] = createController([host1.externalCn]);

    await controller.getOrCreateConnection(uri, 'python', host1.serverUrl);

    expect(controller.connectEditor).not.toHaveBeenCalled();
  });
});
