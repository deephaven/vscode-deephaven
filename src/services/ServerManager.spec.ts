import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerManager } from './ServerManager';
import { URLMap, withResolvers, type PromiseWithResolvers } from '../util';
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
  _pendingConnectionMap: URLMap<PromiseWithResolvers<ConnectionState | null>>;
  _pendingServerConnections: URLMap<PromiseWithResolvers<void>>;
  _dhcServiceFactory: { create: ReturnType<typeof vi.fn> };
  _dheServiceCache: {
    has: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  _resolvePendingServerConnection: (serverUrl: URL) => void;
  _createOrAttachToWorkers: (
    dheService: IDheService,
    workerConsoleType?: unknown,
    createWorkerIfNone?: boolean
  ) => Promise<ConnectionState[]>;
  _createWorker: ReturnType<typeof vi.fn>;
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
  return { label: 'Mock connection state', isConnected: true, serverUrl: url };
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

describe('ServerManager.connectToServer', () => {
  let manager: TestServerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createServerManager();
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
    expect(manager._dhcServiceFactory.create).not.toHaveBeenCalled();
  });

  it('only connects once when called concurrently for the same DHC server', async () => {
    manager._serverMap.set(dhcServer0.url, dhcServer0);

    // Hold the client handshake open so the connection stays in flight.
    const { promise: clientPromise, resolve: resolveClient } =
      withResolvers<object>();
    const connection = {
      getClient: vi.fn().mockReturnValue(clientPromise),
      initSession: vi.fn().mockResolvedValue(true),
      onDidDisconnect: vi.fn(),
      onDidChangeRunningCodeStatus: vi.fn(),
    };
    manager._dhcServiceFactory.create.mockReturnValue(connection);

    const first = manager.connectToServer(serverUrl);
    const second = manager.connectToServer(serverUrl);

    // The second call dedupes against the in-flight connection rather than
    // creating a new one.
    expect(manager._dhcServiceFactory.create).toHaveBeenCalledTimes(1);
    expect(manager.isServerConnecting(serverUrl)).toBe(true);

    resolveClient({});

    expect(await first).toBe(connection);
    expect(await second).toBe(connection);
  });

  it('dedups concurrent client connections for DHE servers', () => {
    manager._serverMap.set(dheServer0.url, dheServer0);

    // Leave the DHE service acquisition pending so the client connection stays
    // in flight.
    const { promise } = withResolvers<IDheService>();
    manager._dheServiceCache.get.mockReturnValue(promise);

    void manager.connectToServer(serverUrl);
    void manager.connectToServer(serverUrl);

    // The DHE client connection is singular, so concurrent attempts reuse the
    // in-flight connection rather than starting a second one (multiple workers
    // are created later, off the single client connection).
    expect(manager._dheServiceCache.get).toHaveBeenCalledTimes(1);
    expect(manager.isServerConnecting(serverUrl)).toBe(true);
  });
});

describe('ServerManager._createOrAttachToWorkers', () => {
  let manager: TestServerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createServerManager();
    // Isolate the create-vs-attach decision from the placeholder/attach
    // plumbing.
    manager._createWorker = vi.fn().mockResolvedValue(null);
  });

  function mockDheServiceWithNoWorkers(): IDheService {
    return {
      listAttachableWorkers: vi.fn().mockResolvedValue([]),
      registerWorkerInfo: vi.fn(),
    } as unknown as IDheService;
  }

  it('does not create a worker when none are attachable and createWorkerIfNone is false', async () => {
    const dheService = mockDheServiceWithNoWorkers();

    const result = await manager._createOrAttachToWorkers(
      dheService,
      undefined,
      false
    );

    expect(result).toEqual([]);
    expect(manager._createWorker).not.toHaveBeenCalled();
  });

  it('creates a worker when none are attachable and createWorkerIfNone defaults to true', async () => {
    const dheService = mockDheServiceWithNoWorkers();

    await manager._createOrAttachToWorkers(dheService);

    expect(manager._createWorker).toHaveBeenCalledTimes(1);
  });
});

describe('ServerManager.isServerConnecting', () => {
  let manager: TestServerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createServerManager();
  });

  it('reflects a pending server connection and fires onDidUpdate when it resolves', () => {
    const onDidUpdate = vi.fn();
    manager.onDidUpdate(onDidUpdate);

    expect(manager.isServerConnecting(serverUrl)).toBe(false);

    manager._pendingServerConnections.set(serverUrl, withResolvers());
    expect(manager.isServerConnecting(serverUrl)).toBe(true);

    manager._resolvePendingServerConnection(serverUrl);
    expect(manager.isServerConnecting(serverUrl)).toBe(false);
    expect(onDidUpdate).toHaveBeenCalledTimes(1);
  });

  it('resolves idempotently and does not fire when there is no pending entry', () => {
    const onDidUpdate = vi.fn();
    manager.onDidUpdate(onDidUpdate);

    // Resolving when not connecting is a no-op (no fire).
    manager._resolvePendingServerConnection(serverUrl);
    expect(onDidUpdate).not.toHaveBeenCalled();

    manager._pendingServerConnections.set(serverUrl, withResolvers());
    manager._resolvePendingServerConnection(serverUrl);
    expect(onDidUpdate).toHaveBeenCalledTimes(1);

    // Resolving again is a no-op (no extra fire).
    manager._resolvePendingServerConnection(serverUrl);
    expect(onDidUpdate).toHaveBeenCalledTimes(1);
  });

  it('clears the pending entry when a connect settles, so a retry is not blocked', async () => {
    manager._serverMap.set(dhcServer0.url, dhcServer0);

    // First attempt fails to get a client; `_doConnectToServer`'s `finally`
    // must clear the pending entry (no stale entry left behind).
    const failConnection = { getClient: vi.fn().mockResolvedValue(null) };
    const okConnection = {
      getClient: vi.fn().mockResolvedValue({}),
      initSession: vi.fn().mockResolvedValue(true),
      onDidDisconnect: vi.fn(),
      onDidChangeRunningCodeStatus: vi.fn(),
    };
    manager._dhcServiceFactory.create
      .mockReturnValueOnce(failConnection)
      .mockReturnValueOnce(okConnection);

    expect(await manager.connectToServer(serverUrl)).toBeNull();
    expect(manager.isServerConnecting(serverUrl)).toBe(false);

    // The retry is not blocked by a stale pending entry — it starts a new
    // connection rather than deduping against the failed one.
    expect(await manager.connectToServer(serverUrl)).toBe(okConnection);
    expect(manager._dhcServiceFactory.create).toHaveBeenCalledTimes(2);
    expect(manager.isServerConnecting(serverUrl)).toBe(false);
  });
});
