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

// Connections here are plain mocks rather than real `DhcService` instances, so
// the `instanceof` narrowing in `isDhcService` has to be stubbed — which is
// what the `isInstanceOf` indirection exists for.
vi.mock('../util/isInstanceOf', async () => {
  const actual = await vi.importActual('../util/isInstanceOf');
  return {
    ...actual,
    isInstanceOf: vi.fn(() => true),
  };
});

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
    createWorker?: boolean
  ) => Promise<ConnectionState | null>;
  _createWorker: ReturnType<typeof vi.fn>;
  _attachToWorker: ReturnType<typeof vi.fn>;
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
    await expect(manager.connectToServer(serverUrl, undefined)).rejects.toThrow(
      `Server with URL '${serverUrl}' not found.`
    );
  });

  it('returns the existing connection for an already-connected DHC server', async () => {
    manager._serverMap.set(dhcServer1.url, dhcServer1);
    manager._connectionMap.set(serverUrl, cn1);

    const result = await manager.connectToServer(serverUrl, undefined);

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

    const first = manager.connectToServer(serverUrl, undefined);
    const second = manager.connectToServer(serverUrl, undefined);

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

    void manager.connectToServer(serverUrl, undefined);
    void manager.connectToServer(serverUrl, undefined);

    // Each caller consults the cache, which memoizes the in-flight promise —
    // so this is still a single `DheService` and a single login. The dedupe
    // lives in `ByURLAsyncCache`, not here: `ServerManager` must not dedupe the
    // whole connect, or a second caller's worker request would be dropped.
    expect(manager._dheServiceCache.get).toHaveBeenCalledTimes(2);
    expect(manager.isServerConnecting(serverUrl)).toBe(true);
  });

  it('shares the DHE login but runs each concurrent worker request', async () => {
    manager._serverMap.set(dheServer0.url, dheServer0);

    // Hold the DHE service acquisition open so both calls overlap on the login.
    const { promise: servicePromise, resolve: resolveService } =
      withResolvers<IDheService>();
    manager._dheServiceCache.get.mockReturnValue(servicePromise);

    const createOrAttach = vi.fn().mockResolvedValue(null);
    manager._createOrAttachToWorkers = createOrAttach;

    const dheService = {
      getClient: vi.fn().mockResolvedValue({}),
      onWorkerAttachable: vi.fn(),
      onWorkerRemoved: vi.fn(),
    } as unknown as IDheService;

    const first = manager.connectToServer(serverUrl, 'python');
    const second = manager.connectToServer(serverUrl, 'groovy', {
      createWorker: true,
    });

    // The DHE server reads as connecting while the shared login is in flight.
    expect(manager.isServerConnecting(serverUrl)).toBe(true);

    resolveService(dheService);
    await Promise.all([first, second]);

    // ...and stops once it settles.
    expect(manager.isServerConnecting(serverUrl)).toBe(false);

    // Both callers consult the cache; it memoizes, so one service and one
    // login reach the server.
    expect(manager._dheServiceCache.get).toHaveBeenCalledTimes(2);

    // ...and the once-per-service event wiring runs once, not once per caller.
    expect(dheService.onWorkerAttachable).toHaveBeenCalledTimes(1);
    expect(dheService.onWorkerRemoved).toHaveBeenCalledTimes(1);

    // ...but neither worker request is dropped as a duplicate: each keeps its
    // own console type and `createWorker` flag.
    expect(createOrAttach).toHaveBeenCalledTimes(2);
    expect(createOrAttach).toHaveBeenCalledWith(dheService, 'python', false);
    expect(createOrAttach).toHaveBeenCalledWith(dheService, 'groovy', true);
  });
});

describe('ServerManager.disconnectFromDHEServer', () => {
  let manager: TestServerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createServerManager();
  });

  it('fires onDidDisconnect for the DHE server itself', async () => {
    manager._serverMap.set(dheServer0.url, dheServer0);

    const disconnected: string[] = [];
    manager.onDidDisconnect(url => disconnected.push(url.toString()));

    await manager.disconnectFromDHEServer(serverUrl);

    expect(disconnected).toEqual([serverUrl.toString()]);
  });

  it('fires onDidDisconnect for a DHE server dropped from config', async () => {
    manager._serverMap.set(dheServer0.url, dheServer0);

    const disconnected: string[] = [];
    manager.onDidDisconnect(url => disconnected.push(url.toString()));

    // Config no longer lists the server, so `loadServerConfig` drops it.
    await manager.loadServerConfig();

    expect(disconnected).toEqual([serverUrl.toString()]);
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

  /**
   * A DHE service exposing `attachable` as the user's own consoles that this
   * extension did not create.
   */
  function mockDheService(attachable: string[] = []): IDheService {
    return {
      serverUrl,
      listAttachableWorkers: vi
        .fn()
        .mockResolvedValue(attachable.map(serial => ({ serial }))),
      registerWorkerInfo: vi.fn((queryInfo: { serial: string }) => ({
        name: `worker-${queryInfo.serial}`,
        serial: queryInfo.serial,
      })),
    } as unknown as IDheService;
  }

  it('does not create a worker when createWorker is false', async () => {
    const dheService = mockDheService();

    const result = await manager._createOrAttachToWorkers(
      dheService,
      undefined,
      false
    );

    expect(result).toBeNull();
    expect(manager._createWorker).not.toHaveBeenCalled();
  });

  it('creates a worker when none are attachable and createWorker is true', async () => {
    const dheService = mockDheService();

    await manager._createOrAttachToWorkers(dheService, undefined, true);

    expect(manager._createWorker).toHaveBeenCalledTimes(1);
  });

  it('creates an owned worker even when the user already has consoles to attach', async () => {
    // The reported bug: connecting a server in order to run a script adopted
    // one of the user's existing (non-owned) consoles instead of creating one.
    const dheService = mockDheService(['existing-1', 'existing-2']);

    const owned = mockConnectionState(serverUrl);
    const ownedWorkerInfo = { name: 'owned', serial: 'owned-1' };
    manager._createWorker = vi.fn().mockResolvedValue(ownedWorkerInfo);
    manager._attachToWorker = vi.fn(async (_label, _url, isOwned) =>
      isOwned ? owned : mockConnectionState(serverUrl)
    );

    const result = await manager._createOrAttachToWorkers(
      dheService,
      undefined,
      true
    );

    expect(manager._createWorker).toHaveBeenCalledTimes(1);
    // The created worker is the one attached as owned.
    expect(manager._attachToWorker).toHaveBeenCalledWith(
      ownedWorkerInfo.name,
      serverUrl,
      true,
      ownedWorkerInfo
    );
    // The existing consoles are still attached so they populate the tree...
    expect(manager._attachToWorker).toHaveBeenCalledTimes(3);
    // ...but the connection handed back is the one we own.
    expect(result).toBe(owned);
  });

  it('lists the attachable workers before creating one', async () => {
    // The created worker is itself a running InteractiveConsole owned by the
    // user, so listing after creating would enumerate it and attach it a
    // second time.
    const dheService = mockDheService(['existing-1']);

    manager._createWorker = vi
      .fn()
      .mockResolvedValue({ name: 'owned', serial: 'owned-1' });
    manager._attachToWorker = vi
      .fn()
      .mockResolvedValue(mockConnectionState(serverUrl));

    await manager._createOrAttachToWorkers(dheService, undefined, true);

    expect(
      vi.mocked(dheService.listAttachableWorkers).mock.invocationCallOrder[0]
    ).toBeLessThan(manager._createWorker.mock.invocationCallOrder[0]);
  });

  it('attaches existing consoles without creating one when createWorker is false', async () => {
    const dheService = mockDheService(['existing-1', 'existing-2']);

    const attached = mockConnectionState(serverUrl);
    manager._attachToWorker = vi.fn().mockResolvedValue(attached);

    const result = await manager._createOrAttachToWorkers(
      dheService,
      undefined,
      false
    );

    expect(manager._createWorker).not.toHaveBeenCalled();
    expect(manager._attachToWorker).toHaveBeenCalledTimes(2);
    expect(result).toBe(attached);
  });

  it('returns null rather than a non-owned console when worker creation fails', async () => {
    const dheService = mockDheService(['existing-1']);

    // `_createWorker` returns null on failure / cancellation (already reported).
    manager._createWorker = vi.fn().mockResolvedValue(null);
    manager._attachToWorker = vi
      .fn()
      .mockResolvedValue(mockConnectionState(serverUrl));

    const result = await manager._createOrAttachToWorkers(
      dheService,
      undefined,
      true
    );

    expect(result).toBeNull();
    // The existing console is still attached for the tree.
    expect(manager._attachToWorker).toHaveBeenCalledTimes(1);
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

    expect(await manager.connectToServer(serverUrl, undefined)).toBeNull();
    expect(manager._dhcServiceFactory.create).toHaveBeenCalledTimes(1);
    expect(manager.isServerConnecting(serverUrl)).toBe(false);

    // The retry is not blocked by a stale pending entry — it starts a new
    // connection rather than deduping against the failed one.
    expect(await manager.connectToServer(serverUrl, undefined)).toBe(
      okConnection
    );
    expect(manager._dhcServiceFactory.create).toHaveBeenCalledTimes(2);
    expect(manager.isServerConnecting(serverUrl)).toBe(false);
  });
});
