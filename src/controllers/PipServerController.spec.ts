import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { PipServerController } from './PipServerController';
import type { PythonEnvironment, PythonEnvironmentApi } from '../util';
import type { IServerManager, IToastService } from '../types';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

vi.mock('../util', async () => {
  const actual = await vi.importActual<typeof import('../util')>('../util');
  return {
    ...actual,
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

// Import after mocks are set up
const { getPythonEnvsExtensionApi } = await import('../util');

const mockEnvironment: PythonEnvironment = {
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
};

const mockPackages = [
  {
    pkgId: { id: 'dh', managerId: 'pip', environmentId: 'env1' },
    name: 'deephaven-server',
    displayName: 'Deephaven Server',
    version: '0.36.0',
  },
];

function createMockExtension(
  isActive: boolean,
  envResult: PythonEnvironment | undefined,
  packagesResult: typeof mockPackages | undefined
): vscode.Extension<PythonEnvironmentApi> {
  const api = {
    getEnvironment: vi.fn().mockResolvedValue(envResult),
    getPackages: vi.fn().mockResolvedValue(packagesResult),
    onDidChangePackages: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  };
  return {
    isActive,
    activate: vi.fn().mockResolvedValue(undefined),
    exports: api,
  } as unknown as vscode.Extension<PythonEnvironmentApi>;
}

function createController(): PipServerController {
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

  return new PipServerController(
    context,
    serverManager,
    outputChannel,
    toastService
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  // Add missing properties to the vscode.window mock
  Object.assign(vscode.window, {
    onDidCloseTerminal: vi
      .fn()
      .mockName('onDidCloseTerminal')
      .mockReturnValue({ dispose: vi.fn() }),
    terminals: [],
    createTerminal: vi.fn().mockReturnValue({
      sendText: vi.fn(),
      exitStatus: undefined,
      dispose: vi.fn(),
    }),
  });
});

describe('getPythonInterpreterPath', () => {
  it('returns null when Python Environments extension is not found', async () => {
    vi.mocked(getPythonEnvsExtensionApi).mockReturnValue(undefined);

    const controller = createController();
    const result = await controller.getPythonInterpreterPath();

    expect(result).toBeNull();
  });

  it('returns null when getEnvironment returns undefined', async () => {
    const mockExt = createMockExtension(true, undefined, undefined);
    vi.mocked(getPythonEnvsExtensionApi).mockReturnValue(
      mockExt as unknown as ReturnType<typeof getPythonEnvsExtensionApi>
    );

    const controller = createController();
    const result = await controller.getPythonInterpreterPath();

    expect(result).toBeNull();
  });

  it('returns executable path when environment is found (extension already active)', async () => {
    const mockExt = createMockExtension(true, mockEnvironment, undefined);
    vi.mocked(getPythonEnvsExtensionApi).mockReturnValue(
      mockExt as unknown as ReturnType<typeof getPythonEnvsExtensionApi>
    );

    const controller = createController();
    // Clear mocks after constructor to only track calls from getPythonInterpreterPath
    vi.clearAllMocks();
    vi.mocked(getPythonEnvsExtensionApi).mockReturnValue(
      mockExt as unknown as ReturnType<typeof getPythonEnvsExtensionApi>
    );

    const result = await controller.getPythonInterpreterPath();

    expect(result).toBe('/path/to/env/bin/python');
    // When extension is already active, activate should not be called
    expect(mockExt.activate).not.toHaveBeenCalled();
    expect(mockExt.exports.getEnvironment).toHaveBeenCalledWith(undefined);
  });

  it('activates extension and returns executable path when extension is not yet active', async () => {
    const mockExt = createMockExtension(false, mockEnvironment, undefined);
    vi.mocked(getPythonEnvsExtensionApi).mockReturnValue(
      mockExt as unknown as ReturnType<typeof getPythonEnvsExtensionApi>
    );

    const controller = createController();
    const result = await controller.getPythonInterpreterPath();

    expect(mockExt.activate).toHaveBeenCalled();
    expect(result).toBe('/path/to/env/bin/python');
  });
});

describe('checkPipInstall', () => {
  it('returns isAvailable false on unsupported platform', async () => {
    vi.stubEnv('PLATFORM', 'win32');
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });

    const controller = createController();
    const result = await controller.checkPipInstall();

    expect(result.isAvailable).toBe(false);

    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('returns isAvailable false when Python interpreter not found', async () => {
    vi.mocked(getPythonEnvsExtensionApi).mockReturnValue(undefined);

    const controller = createController();
    const result = await controller.checkPipInstall();

    expect(result.isAvailable).toBe(false);
  });

  it('returns isAvailable false when Python extension not found for package check', async () => {
    // First call (getPythonInterpreterPath) returns extension, second call (checkPipInstall body) returns undefined
    const mockExt = createMockExtension(true, mockEnvironment, undefined);
    vi.mocked(getPythonEnvsExtensionApi)
      .mockReturnValueOnce(
        mockExt as unknown as ReturnType<typeof getPythonEnvsExtensionApi>
      )
      .mockReturnValueOnce(undefined);

    const controller = createController();
    const result = await controller.checkPipInstall();

    expect(result.isAvailable).toBe(false);
  });

  it('returns isAvailable false when getEnvironment returns null during package check', async () => {
    const mockExtWithEnv = createMockExtension(
      true,
      mockEnvironment,
      undefined
    );
    const mockExtNoEnv = createMockExtension(true, undefined, undefined);

    vi.mocked(getPythonEnvsExtensionApi)
      .mockReturnValueOnce(
        mockExtWithEnv as unknown as ReturnType<
          typeof getPythonEnvsExtensionApi
        >
      )
      .mockReturnValueOnce(
        mockExtNoEnv as unknown as ReturnType<typeof getPythonEnvsExtensionApi>
      );

    const controller = createController();
    const result = await controller.checkPipInstall();

    expect(result.isAvailable).toBe(false);
  });

  it('returns isAvailable false when deephaven-server is not in packages', async () => {
    const packagesWithoutDh = [
      {
        pkgId: { id: 'np', managerId: 'pip', environmentId: 'env1' },
        name: 'numpy',
        displayName: 'NumPy',
        version: '1.26.0',
      },
    ];
    const mockExt = createMockExtension(
      true,
      mockEnvironment,
      packagesWithoutDh
    );
    vi.mocked(getPythonEnvsExtensionApi).mockReturnValue(
      mockExt as unknown as ReturnType<typeof getPythonEnvsExtensionApi>
    );

    const controller = createController();
    const result = await controller.checkPipInstall();

    expect(result.isAvailable).toBe(false);
  });

  it('returns isAvailable false when getPackages returns undefined', async () => {
    const mockExt = createMockExtension(true, mockEnvironment, undefined);
    vi.mocked(getPythonEnvsExtensionApi).mockReturnValue(
      mockExt as unknown as ReturnType<typeof getPythonEnvsExtensionApi>
    );

    const controller = createController();
    const result = await controller.checkPipInstall();

    expect(result.isAvailable).toBe(false);
  });

  it('returns isAvailable true with interpreter path and environment when deephaven-server is installed', async () => {
    const mockExt = createMockExtension(true, mockEnvironment, mockPackages);
    vi.mocked(getPythonEnvsExtensionApi).mockReturnValue(
      mockExt as unknown as ReturnType<typeof getPythonEnvsExtensionApi>
    );

    const controller = createController();
    const result = await controller.checkPipInstall();

    expect(result.isAvailable).toBe(true);
    if (result.isAvailable) {
      expect(result.interpreterPath).toBe('/path/to/env/bin/python');
      expect(result.environment).toBe(mockEnvironment);
    }
  });

  it('calls getPackages with the environment returned by getEnvironment', async () => {
    const mockExt = createMockExtension(true, mockEnvironment, mockPackages);
    vi.mocked(getPythonEnvsExtensionApi).mockReturnValue(
      mockExt as unknown as ReturnType<typeof getPythonEnvsExtensionApi>
    );

    const controller = createController();
    await controller.checkPipInstall();

    expect(mockExt.exports.getPackages).toHaveBeenCalledWith(mockEnvironment);
  });
});
