import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerManager } from './ServerManager';
import { URLMap, withResolvers } from '../util';
import type {
  ConnectionState,
  IAsyncCacheService,
  IConfigService,
  IDhcServiceFactory,
  IDheService,
  ISecretService,
  IToastService,
  PublicOf,
  ServerState,
  ServerType,
} from '../types';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

// Avoid real server status polling triggered by the constructor's
// `loadServerConfig` call.
vi.mock('../dh/dhc', () => ({
  isDhcServerRunning: vi.fn().mockResolvedValue(false),
}));
vi.mock('../dh/dhe', () => ({
  getWorkerCredentials: vi.fn(),
  isDheServerRunning: vi.fn().mockResolvedValue(false),
}));

/**
 * Internal shape of `ServerManager` used to seed state and stub the actual
 * connection logic so we can exercise the `connectToServer` race-condition
 * handling in isolation.
 */
type TestServerManager = PublicOf<ServerManager> & {
  _serverMap: URLMap<ServerState>;
  _connectionMap: URLMap<ConnectionState>;
  _pendingConnectionMap: URLMap<Promise<ConnectionState | null>>;
  _doConnectToServer: ReturnType<typeof vi.fn>;
};

/** Build a `ServerManager` with minimal mocked dependencies. */
function createServerManager(): TestServerManager {
  const configService = {
    getCoreServers: vi.fn().mockReturnValue([]),
    getEnterpriseServers: vi.fn().mockReturnValue([]),
  } as unknown as IConfigService;

  const dhcServiceFactory = {
    create: vi.fn(),
  } as unknown as IDhcServiceFactory;

  const dheServiceCache = {
    has: vi.fn().mockReturnValue(false),
    get: vi.fn(),
  } as unknown as IAsyncCacheService<URL, IDheService>;

  const manager = new ServerManager(
    configService,
    new URLMap(),
    dhcServiceFactory,
    new URLMap(),
    dheServiceCache,
    { appendLine: vi.fn() } as unknown as vscode.OutputChannel,
    {} as ISecretService,
    { info: vi.fn(), error: vi.fn() } as IToastService
  ) as unknown as TestServerManager;

  return manager;
}

function mockConnectionState(url: URL): ConnectionState {
  return { isConnected: true, serverUrl: url };
}

function mockServerState({
  url,
  type = 'DHC',
  connectionCount = 0,
}: {
  url: URL;
  type?: ServerType;
  connectionCount?: number;
}): ServerState {
  return {
    type,
    url,
    isConnected: connectionCount > 0,
    isRunning: true,
    connectionCount,
  };
}

const serverUrl = new URL('http://localhost:10000/');
const dhcServer0 = mockServerState({
  url: serverUrl,
  type: 'DHC',
});
const dhcServer1 = mockServerState({
  url: serverUrl,
  type: 'DHC',
  connectionCount: 1,
});
const dheServer0 = mockServerState({
  url: serverUrl,
  type: 'DHE',
});
const cn1 = mockConnectionState(serverUrl);
const cn2 = mockConnectionState(serverUrl);

describe('ServerManager.connectToServer', () => {
  let manager: TestServerManager;

  let promise: Promise<ConnectionState | null>;
  let resolve: (value: ConnectionState | null) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createServerManager();

    ({ promise, resolve } = withResolvers<ConnectionState | null>());

    manager._doConnectToServer = vi.fn().mockReturnValue(promise);
  });

  it('throws when the server is not found', async () => {
    await expect(manager.connectToServer(serverUrl)).rejects.toThrow(
      `Server with URL '${serverUrl}' not found.`
    );
  });

  it('returns the existing connection for an already-connected DHC server', async () => {
    manager._serverMap.set(dhcServer1.url, dhcServer1);
    manager._connectionMap.set(serverUrl, cn1);

    const result = await manager.connectToServer(serverUrl);

    expect(result).toBe(cn1);
    expect(manager._doConnectToServer).not.toHaveBeenCalled();
  });

  it('only connects once when called concurrently for the same DHC server', async () => {
    manager._serverMap.set(dhcServer0.url, dhcServer0);

    const first = manager.connectToServer(serverUrl);
    const second = manager.connectToServer(serverUrl);

    // The in-progress connection is reused rather than starting a new one.
    expect(manager._doConnectToServer).toHaveBeenCalledTimes(1);

    resolve(cn1);

    expect(await first).toBe(cn1);
    expect(await second).toBe(cn1);
  });

  it('clears the pending connection once it resolves so later calls reconnect', async () => {
    manager._serverMap.set(dhcServer0.url, dhcServer0);

    manager._doConnectToServer.mockResolvedValue(cn1);
    const first = manager.connectToServer(serverUrl);
    expect(manager._pendingConnectionMap.has(serverUrl)).toBe(true);
    expect(await first).toBe(cn1);

    expect(manager._pendingConnectionMap.has(serverUrl)).toBe(false);

    // A subsequent connect attempt is not blocked by the resolved pending entry.
    manager._doConnectToServer.mockResolvedValue(cn2);
    const second = manager.connectToServer(serverUrl);
    expect(await second).toBe(cn2);

    expect(manager._doConnectToServer).toHaveBeenCalledTimes(2);
  });

  it('does not track pending connections for DHE servers', async () => {
    manager._serverMap.set(dheServer0.url, dheServer0);

    void manager.connectToServer(serverUrl);
    void manager.connectToServer(serverUrl);

    // DHE supports multiple connections, so concurrent calls each start one.
    expect(manager._doConnectToServer).toHaveBeenCalledTimes(2);
    expect(manager._pendingConnectionMap.has(serverUrl)).toBe(false);
  });
});
