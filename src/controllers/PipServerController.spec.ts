import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PipServerController } from './PipServerController';
import {
  getPythonEnvsExtensionApi,
  PackageChangeKind,
  type PythonEnvironment,
  type PythonEnvironmentApi,
  withResolvers,
} from '../util';
import { PIP_SERVER_LIST_PACKAGES_TIMEOUT_MS } from '../common';
import type { IServerManager, IToastService } from '../types';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

vi.mock('../util/extensionApiUtils', async () => {
  const actual = await vi.importActual<
    typeof import('../util/extensionApiUtils')
  >('../util/extensionApiUtils');
  return {
    ...actual,
    // Only the extension lookup is mocked. `getPythonEnvironment` and its
    // scope resolution run for real against the mocked `vscode` module.
    getPythonEnvsExtensionApi: vi.fn(),
  };
});

vi.mock('../services', async () => {
  const actual =
    await vi.importActual<typeof import('../services')>('../services');
  return {
    ...actual,
    pollUntilTrue: vi
      .fn()
      .mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
  };
});

vi.mock('../dh/dhc', () => ({
  isDhcServerRunning: vi.fn().mockResolvedValue(true),
}));

const mockEnvironment = {
  envId: { id: 'env1', managerId: 'venv' },
  name: 'myenv',
  displayName: 'My Env',
  displayPath: '/path/to/env',
  version: '3.11.0',
  environmentPath: {} as vscode.Uri,
  execInfo: {
    run: { executable: '/path/to/env/bin/python' },
  },
  sysPrefix: '/path/to/env',
} as PythonEnvironment;

function createPackage(name: string): { name: string } {
  return { name };
}

type MockApi = {
  getEnvironment: ReturnType<typeof vi.fn>;
  getPackages: ReturnType<typeof vi.fn>;
  onDidChangePackages: ReturnType<typeof vi.fn>;
  onDidChangeEnvironment: ReturnType<typeof vi.fn>;
};

/**
 * Create a mock Python Environments api and register it as the result of
 * `getPythonEnvsExtensionApi`.
 */
function mockApi(
  options: {
    environment?: PythonEnvironment | undefined;
    packages?: { name: string }[] | undefined;
  } = {}
): MockApi {
  // Check key presence rather than using destructuring defaults so that an
  // explicit `undefined` can be distinguished from an omitted option.
  const environment =
    'environment' in options ? options.environment : mockEnvironment;
  const packages =
    'packages' in options
      ? options.packages
      : [createPackage('deephaven-server')];

  const api: MockApi = {
    getEnvironment: vi.fn().mockResolvedValue(environment),
    getPackages: vi.fn().mockResolvedValue(packages),
    onDidChangePackages: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onDidChangeEnvironment: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  };

  vi.mocked(getPythonEnvsExtensionApi).mockResolvedValue(
    api as unknown as PythonEnvironmentApi
  );

  return api;
}

/** Register a missing / disabled Python Environments extension. */
function mockApiUnavailable(): void {
  vi.mocked(getPythonEnvsExtensionApi).mockResolvedValue(undefined);
}

function createController(): {
  controller: PipServerController;
  serverManager: IServerManager;
} {
  const context = {
    subscriptions: [],
    extension: { packageJSON: { version: '1.0.0' } },
  } as unknown as vscode.ExtensionContext;

  const serverManager = {
    onDidLoadConfig: vi.fn(),
    syncManagedServers: vi.fn().mockResolvedValue(undefined),
    canStartServer: false,
    getServers: vi.fn().mockReturnValue([]),
    getServer: vi.fn(),
    disconnectFromServer: vi.fn(),
    updateStatus: vi.fn(),
  } as unknown as IServerManager;

  const outputChannel = {
    appendLine: vi.fn(),
  } as unknown as vscode.OutputChannel;

  const toastService = {
    error: vi.fn(),
    info: vi.fn(),
  } as unknown as IToastService;

  const controller = new PipServerController(
    context,
    serverManager,
    outputChannel,
    toastService
  );

  return { controller, serverManager };
}

let originalPlatform: NodeJS.Platform;

beforeEach(() => {
  vi.clearAllMocks();

  originalPlatform = process.platform;

  // `checkPipInstall` short circuits on unsupported platforms, so pin a
  // supported one for the majority of tests.
  Object.defineProperty(process, 'platform', {
    value: 'linux',
    configurable: true,
  });

  // Add missing properties to the vscode mocks
  Object.assign(vscode.window, {
    onDidCloseTerminal: vi
      .fn()
      .mockName('onDidCloseTerminal')
      .mockReturnValue({ dispose: vi.fn() }),
    terminals: [],
    activeTextEditor: undefined,
    createTerminal: vi.fn().mockReturnValue({
      sendText: vi.fn(),
      exitStatus: undefined,
      dispose: vi.fn(),
    }),
  });

  Object.assign(vscode.workspace, {
    workspaceFolders: undefined,
  });

  vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(undefined);

  mockApi();
});

afterEach(() => {
  Object.defineProperty(process, 'platform', {
    value: originalPlatform,
    configurable: true,
  });
});

describe('checkPipInstall', () => {
  it.each(['win32', 'aix'] as const)(
    'returns isAvailable false on unsupported platform: %s',
    async platform => {
      Object.defineProperty(process, 'platform', {
        value: platform,
        configurable: true,
      });

      const { controller } = createController();
      const result = await controller.checkPipInstall();

      expect(result.isAvailable).toBe(false);
    }
  );

  it('returns isAvailable false when the Python Environments extension is unavailable', async () => {
    mockApiUnavailable();

    const { controller } = createController();
    const result = await controller.checkPipInstall();

    expect(result.isAvailable).toBe(false);
  });

  it('returns isAvailable false when no environment is selected', async () => {
    mockApi({ environment: undefined });

    const { controller } = createController();
    const result = await controller.checkPipInstall();

    expect(result.isAvailable).toBe(false);
  });

  it('returns isAvailable false when getPackages returns undefined', async () => {
    mockApi({ packages: undefined });

    const { controller } = createController();
    const result = await controller.checkPipInstall();

    expect(result.isAvailable).toBe(false);
  });

  it('returns isAvailable false when deephaven-server is not installed', async () => {
    mockApi({ packages: [createPackage('numpy')] });

    const { controller } = createController();
    const result = await controller.checkPipInstall();

    expect(result.isAvailable).toBe(false);
  });

  it('returns isAvailable false when getPackages throws', async () => {
    const api = mockApi();
    api.getPackages.mockRejectedValue(new Error('pip list failed'));

    const { controller } = createController();
    const result = await controller.checkPipInstall();

    expect(result.isAvailable).toBe(false);
  });

  it.each([
    'deephaven-server',
    'deephaven_server',
    'Deephaven-Server',
    'deephaven.server',
  ])('detects the package reported as %s', async packageName => {
    mockApi({ packages: [createPackage(packageName)] });

    const { controller } = createController();
    const result = await controller.checkPipInstall();

    expect(result.isAvailable).toBe(true);
    expect(result.environment).toBe(mockEnvironment);
  });

  it('returns isAvailable false when getPackages never settles', async () => {
    vi.useFakeTimers();
    try {
      const api = mockApi();
      api.getPackages.mockReturnValue(new Promise(() => {}));

      const { controller } = createController();
      const resultPromise = controller.checkPipInstall();

      await vi.advanceTimersByTimeAsync(PIP_SERVER_LIST_PACKAGES_TIMEOUT_MS);

      await expect(resultPromise).resolves.toEqual({ isAvailable: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls getPackages with the environment returned by getEnvironment', async () => {
    const api = mockApi();

    const { controller } = createController();
    await controller.checkPipInstall();

    expect(api.getPackages).toHaveBeenCalledWith(mockEnvironment, {
      skipCache: false,
    });
  });

  it('bypasses the package cache when skipCache is true', async () => {
    const api = mockApi();

    const { controller } = createController();
    await controller.checkPipInstall({ skipCache: true });

    expect(api.getPackages).toHaveBeenCalledWith(mockEnvironment, {
      skipCache: true,
    });
  });
});

describe('environment scope resolution', () => {
  const workspaceUri = { fsPath: '/workspace/a' } as vscode.Uri;
  const activeUri = { fsPath: '/workspace/a/project/main.py' } as vscode.Uri;

  it('resolves the active editor file when it is in a workspace folder', async () => {
    const api = mockApi();

    Object.assign(vscode.window, {
      activeTextEditor: { document: { uri: activeUri } },
    });
    Object.assign(vscode.workspace, {
      workspaceFolders: [{ uri: workspaceUri }],
    });
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue({
      uri: workspaceUri,
    } as vscode.WorkspaceFolder);

    const { controller } = createController();
    await controller.checkPipInstall();

    expect(api.getEnvironment).toHaveBeenCalledWith(activeUri);
  });

  it('falls back to the first workspace folder when the active editor is not in a workspace', async () => {
    const api = mockApi();

    Object.assign(vscode.window, {
      activeTextEditor: {
        document: { uri: { fsPath: '/elsewhere/scratch.py' } as vscode.Uri },
      },
    });
    Object.assign(vscode.workspace, {
      workspaceFolders: [{ uri: workspaceUri }],
    });
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(undefined);

    const { controller } = createController();
    await controller.checkPipInstall();

    expect(api.getEnvironment).toHaveBeenCalledWith(workspaceUri);
  });

  it('falls back to the first workspace folder when there is no active editor', async () => {
    const api = mockApi();

    Object.assign(vscode.workspace, {
      workspaceFolders: [{ uri: workspaceUri }],
    });

    const { controller } = createController();
    await controller.checkPipInstall();

    expect(api.getEnvironment).toHaveBeenCalledWith(workspaceUri);
  });

  it('resolves to global scope when there is no workspace', async () => {
    const api = mockApi();

    const { controller } = createController();
    await controller.checkPipInstall();

    expect(api.getEnvironment).toHaveBeenCalledWith(undefined);
  });
});

describe('active editor changes', () => {
  const workspaceUri = { fsPath: '/workspace' } as vscode.Uri;
  const fileA = { fsPath: '/workspace/a/main.py' } as vscode.Uri;
  const fileB = { fsPath: '/workspace/b/main.py' } as vscode.Uri;
  const otherEnvironment = {
    ...mockEnvironment,
    envId: { id: 'env2', managerId: 'ms-python.python:conda' },
  } as PythonEnvironment;

  beforeEach(() => {
    Object.assign(vscode.workspace, {
      workspaceFolders: [{ uri: workspaceUri }],
    });
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockImplementation(uri =>
      uri.fsPath.startsWith('/workspace/')
        ? ({ uri: workspaceUri } as vscode.WorkspaceFolder)
        : undefined
    );
  });

  /**
   * Create a controller that has checked pip install against `fileA` and
   * return the registered active editor change handler.
   */
  async function setup(): Promise<{
    api: MockApi;
    controller: PipServerController;
    onEditorChange: (editor: vscode.TextEditor | undefined) => Promise<void>;
    syncSpy: ReturnType<typeof vi.spyOn>;
  }> {
    Object.assign(vscode.window, {
      activeTextEditor: { document: { uri: fileA } },
    });

    const api = mockApi();
    const { controller } = createController();
    await controller.subscribeToPythonEnvChanges();
    await controller.checkPipInstall();

    const [onEditorChange] = vi
      .mocked(vscode.window.onDidChangeActiveTextEditor)
      .mock.calls.at(-1) as [
      (editor: vscode.TextEditor | undefined) => Promise<void>,
    ];

    const syncSpy = vi
      .spyOn(controller, 'syncManagedServers')
      .mockResolvedValue(undefined);

    api.getEnvironment.mockClear();

    return {
      api,
      controller,
      onEditorChange,
      syncSpy,
    };
  }

  function editorFor(uri: vscode.Uri): vscode.TextEditor {
    return { document: { uri } } as vscode.TextEditor;
  }

  it('re-checks availability when the new file resolves to a different environment', async () => {
    const { api, onEditorChange, syncSpy } = await setup();
    api.getEnvironment.mockResolvedValue(otherEnvironment);

    await onEditorChange(editorFor(fileB));

    expect(api.getEnvironment).toHaveBeenCalledWith(fileB);
    expect(syncSpy).toHaveBeenCalledWith({ forceCheck: true });
  });

  it('does not re-check when the new file resolves to the same environment', async () => {
    const { onEditorChange, syncSpy } = await setup();

    await onEditorChange(editorFor(fileB));

    expect(syncSpy).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'no text editor', editor: undefined },
    {
      label: 'a non-workspace document',
      editor: editorFor({ fsPath: '/elsewhere/scratch.py' } as vscode.Uri),
    },
  ])(
    'keeps the previous file scope when focus moves to $label',
    async ({ editor }) => {
      const { api, controller, onEditorChange, syncSpy } = await setup();

      await onEditorChange(editorFor(fileB));
      syncSpy.mockClear();
      api.getEnvironment.mockClear();

      await onEditorChange(editor);

      expect(api.getEnvironment).not.toHaveBeenCalled();
      expect(syncSpy).not.toHaveBeenCalled();

      await controller.checkPipInstall();

      expect(api.getEnvironment).toHaveBeenCalledWith(fileB);
    }
  );
});

describe('subscribeToPythonEnvChanges', () => {
  it('resolves without throwing when the extension is unavailable', async () => {
    mockApiUnavailable();

    const { controller } = createController();
    await expect(
      controller.subscribeToPythonEnvChanges()
    ).resolves.not.toThrow();
  });

  it.each([
    { kind: PackageChangeKind.add, name: 'deephaven_server', shouldSync: true },
    {
      kind: PackageChangeKind.remove,
      name: 'deephaven-server',
      shouldSync: true,
    },
    { kind: PackageChangeKind.add, name: 'numpy', shouldSync: false },
    { kind: PackageChangeKind.remove, name: 'numpy', shouldSync: false },
  ])(
    'package change: $kind $name -> re-check: $shouldSync',
    async ({ kind, name, shouldSync }) => {
      const api = mockApi();
      const { controller } = createController();
      await controller.subscribeToPythonEnvChanges();

      const syncSpy = vi
        .spyOn(controller, 'syncManagedServers')
        .mockResolvedValue(undefined);

      const [onPackagesChange] = api.onDidChangePackages.mock.calls.at(-1)!;

      onPackagesChange({ changes: [{ kind, pkg: createPackage(name) }] });

      if (shouldSync) {
        expect(syncSpy).toHaveBeenCalledWith({ forceCheck: true });
      } else {
        expect(syncSpy).not.toHaveBeenCalled();
      }
    }
  );

  it('re-checks availability when the selected environment changes', async () => {
    const api = mockApi();
    const { controller } = createController();
    await controller.subscribeToPythonEnvChanges();

    const syncSpy = vi
      .spyOn(controller, 'syncManagedServers')
      .mockResolvedValue(undefined);

    const [onEnvironmentChange] = api.onDidChangeEnvironment.mock.calls.at(-1)!;

    onEnvironmentChange({ uri: undefined, old: undefined, new: undefined });

    expect(syncSpy).toHaveBeenCalledWith({ forceCheck: true });
  });
});

describe('recheckPipInstall', () => {
  it('forces a sync and handles a failed sync', async () => {
    const { controller } = createController();
    const syncSpy = vi
      .spyOn(controller, 'syncManagedServers')
      .mockRejectedValue(new Error('sync failed'));

    // Vitest fails the run on unhandled rejections, so this also verifies the
    // error is caught.
    controller.recheckPipInstall();
    await vi.waitFor(() => expect(syncSpy).toHaveBeenCalledOnce());
    await Promise.resolve();

    expect(syncSpy).toHaveBeenCalledWith({ forceCheck: true });
  });
});

describe('syncManagedServers', () => {
  it.each([
    {
      label: 'not installed',
      packages: [createPackage('numpy')],
      canStartServer: false,
      expectedSyncArgs: [[]],
    },
    {
      label: 'installed',
      packages: [createPackage('deephaven-server')],
      canStartServer: true,
      expectedSyncArgs: [[], false],
    },
  ])(
    'syncs server manager when deephaven-server is $label',
    async ({ packages, canStartServer, expectedSyncArgs }) => {
      mockApi({ packages });

      const { controller, serverManager } = createController();
      await controller.syncManagedServers({ forceCheck: true });

      expect(serverManager.canStartServer).toBe(canStartServer);
      expect(serverManager.syncManagedServers).toHaveBeenCalledWith(
        ...expectedSyncArgs
      );
    }
  );

  it.each([
    { forceCheck: true, skipCache: true },
    { forceCheck: false, skipCache: false },
  ])(
    'checks packages with skipCache $skipCache when forceCheck is $forceCheck',
    async ({ forceCheck, skipCache }) => {
      const api = mockApi();

      const { controller } = createController();
      await controller.syncManagedServers({ forceCheck });

      expect(api.getPackages).toHaveBeenCalledWith(mockEnvironment, {
        skipCache,
      });
    }
  );

  it('discards the result of a superseded check', async () => {
    const api = mockApi();

    // First check (e.g. for a previously active file) is slow and reports
    // installed. Second check is fast and reports not installed.
    const slow = withResolvers<{ name: string }[]>();
    api.getPackages
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce([createPackage('numpy')]);

    const { controller, serverManager } = createController();

    const first = controller.syncManagedServers({ forceCheck: true });
    await controller.syncManagedServers({ forceCheck: true });

    slow.resolve([createPackage('deephaven-server')]);
    await first;

    expect(serverManager.canStartServer).toBe(false);
    expect(serverManager.syncManagedServers).toHaveBeenCalledOnce();
    expect(serverManager.syncManagedServers).toHaveBeenCalledWith([]);
  });

  it('skips the package check when already installed and forceCheck is false', async () => {
    const api = mockApi();

    const { controller } = createController();

    // Not yet known to be installed, so the first sync still checks packages
    await controller.syncManagedServers({ forceCheck: false });
    expect(api.getPackages).toHaveBeenCalledOnce();
    api.getPackages.mockClear();

    await controller.syncManagedServers({ forceCheck: false });

    expect(api.getPackages).not.toHaveBeenCalled();
  });
});

describe('startServer', () => {
  beforeEach(() => {
    vi.stubEnv('PATH', '/usr/bin');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    {
      label: 'venv',
      managerId: 'ms-python.python:venv',
      envPrefixVarName: 'VIRTUAL_ENV',
    },
    {
      label: 'conda',
      managerId: 'ms-python.python:conda',
      envPrefixVarName: 'CONDA_PREFIX',
    },
  ])(
    'creates a hidden terminal configured for a $label environment',
    async ({ managerId, envPrefixVarName }) => {
      mockApi({
        environment: {
          ...mockEnvironment,
          envId: { id: 'env1', managerId },
        },
      });

      const { controller, serverManager } = createController();
      vi.mocked(serverManager.getServer).mockReturnValue({
        isManaged: true,
        psk: 'mock.psk',
      } as ReturnType<IServerManager['getServer']>);

      await controller.startServer();

      expect(vscode.window.createTerminal).toHaveBeenCalledWith({
        name: 'Deephaven (10000)',
        env: {
          /* eslint-disable @typescript-eslint/naming-convention */
          PATH: '/path/to/env/bin:/usr/bin',
          PYTHONPATH: './',
          [envPrefixVarName]: '/path/to/env',
          /* eslint-enable @typescript-eslint/naming-convention */
        },
        isTransient: true,
        hideFromUser: true,
      });
    }
  );

  it('does not start a server when superseded by a newer check', async () => {
    const api = mockApi();

    // Start-time check is slow and reports installed. Newer check is fast and
    // reports not installed.
    const slow = withResolvers<{ name: string }[]>();
    api.getPackages
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce([createPackage('numpy')]);

    const { controller, serverManager } = createController();

    const start = controller.startServer();
    await controller.syncManagedServers({ forceCheck: true });

    slow.resolve([createPackage('deephaven-server')]);
    await start;

    expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    expect(serverManager.canStartServer).toBe(false);
  });
});
