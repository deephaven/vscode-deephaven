import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DhcService } from './DhcService';
import { ConfigService } from './ConfigService';
import type { RemoteFileSourceService } from './RemoteFileSourceService';
import type { UniqueID } from '../types';

vi.mock('vscode');

vi.mock('./ConfigService', () => {
  const mockConfigService = {
    getImportPrefix: vi.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention
  return { ConfigService: mockConfigService };
});

/** Build a minimal DhcService instance that has a session already set up. */
function createTestDhcService({
  pythonRemoteFileSourcePlugin,
  setControllerImportPrefixes,
  setPythonServerExecutionContext,
  sessionRunCode,
}: {
  pythonRemoteFileSourcePlugin?: DhcType.Widget | null;
  setControllerImportPrefixes?: ReturnType<typeof vi.fn>;
  setPythonServerExecutionContext?: ReturnType<typeof vi.fn>;
  sessionRunCode?: ReturnType<typeof vi.fn>;
}): DhcService {
  const mockSetControllerImportPrefixes =
    setControllerImportPrefixes ?? vi.fn();
  const mockSetPythonServerExecutionContext =
    setPythonServerExecutionContext ?? vi.fn().mockResolvedValue(undefined);
  const mockSessionRunCode =
    sessionRunCode ??
    vi.fn().mockResolvedValue({
      error: '',
      changes: { created: [], updated: [], removed: [] },
    });

  const mockSession = {
    runCode: mockSessionRunCode,
  } as unknown as DhcType.IdeSession;

  const mockCn = {
    getConsoleTypes: vi.fn().mockResolvedValue(['python']),
  } as unknown as DhcType.IdeConnection;

  const mockRemoteFileSourceService = {
    setControllerImportPrefixes: mockSetControllerImportPrefixes,
    setPythonServerExecutionContext: mockSetPythonServerExecutionContext,
  } as unknown as RemoteFileSourceService;

  const mockDiagnosticsCollection = {
    set: vi.fn(),
    clear: vi.fn(),
  } as unknown as vscode.DiagnosticCollection;

  const service = Object.assign(Object.create(DhcService.prototype), {
    session: mockSession,
    cn: mockCn,
    cnId: 'test-cn-id' as UniqueID,
    pythonRemoteFileSourcePlugin:
      pythonRemoteFileSourcePlugin !== undefined
        ? pythonRemoteFileSourcePlugin
        : ({} as DhcType.Widget),
    groovyRemoteFileSourcePluginService: null,
    remoteFileSourceService: mockRemoteFileSourceService,
    diagnosticsCollection: mockDiagnosticsCollection,
    groovyDiagnosticsCollection: mockDiagnosticsCollection,
    outputChannel: {
      appendLine: vi.fn(),
      show: vi.fn(),
    } as unknown as vscode.OutputChannel,
    toaster: { error: vi.fn(), info: vi.fn() },
    _isRunningCode: false,
    _onDidChangeRunningCodeStatus: { fire: vi.fn() },
    disposables: { add: vi.fn() },
    serverUrl: new URL('http://localhost:10000/'),
  });

  // Wire up isRunningCode setter to call fire like the real implementation
  Object.defineProperty(service, 'isRunningCode', {
    get() {
      return this._isRunningCode;
    },
    set(value: boolean) {
      if (this._isRunningCode !== value) {
        this._isRunningCode = value;
        this._onDidChangeRunningCodeStatus.fire(value);
      }
    },
    configurable: true,
  });

  return service;
}

describe('DhcService.runCode – importPrefix setting', () => {
  const mockSetControllerImportPrefixes = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use setting prefix when importPrefix is configured', async () => {
    vi.mocked(ConfigService.getImportPrefix).mockReturnValue('myPrefix');

    const service = createTestDhcService({
      setControllerImportPrefixes: mockSetControllerImportPrefixes,
    });

    await service.runCode('x = 1', 'python');

    expect(mockSetControllerImportPrefixes).toHaveBeenCalledWith(
      new Set(['myPrefix'])
    );
  });

  it('should use Set with single prefix when importPrefix is configured as empty string', async () => {
    vi.mocked(ConfigService.getImportPrefix).mockReturnValue('');

    const service = createTestDhcService({
      setControllerImportPrefixes: mockSetControllerImportPrefixes,
    });

    await service.runCode('x = 1', 'python');

    expect(mockSetControllerImportPrefixes).toHaveBeenCalledWith(new Set(['']));
  });

  it('should fall back to extraction when importPrefix is undefined and code has prefixes', async () => {
    vi.mocked(ConfigService.getImportPrefix).mockReturnValue(undefined);

    const service = createTestDhcService({
      setControllerImportPrefixes: mockSetControllerImportPrefixes,
    });

    const code =
      'deephaven_enterprise.controller_import.meta_import("myPrefix")\n';

    await service.runCode(code, 'python');

    expect(mockSetControllerImportPrefixes).toHaveBeenCalledWith(
      new Set(['myPrefix'])
    );
  });

  it('should not call setControllerImportPrefixes when importPrefix is undefined and no prefixes found in snippet', async () => {
    vi.mocked(ConfigService.getImportPrefix).mockReturnValue(undefined);

    const service = createTestDhcService({
      setControllerImportPrefixes: mockSetControllerImportPrefixes,
    });

    await service.runCode('x = 1', 'python');

    expect(mockSetControllerImportPrefixes).not.toHaveBeenCalled();
  });

  it('should call setControllerImportPrefixes for full file runs even when no prefixes found', async () => {
    vi.mocked(ConfigService.getImportPrefix).mockReturnValue(undefined);

    const service = createTestDhcService({
      setControllerImportPrefixes: mockSetControllerImportPrefixes,
    });

    const mockDoc = {
      uri: vscode.Uri.file('/path/to/file.py'),
      getText: vi.fn().mockReturnValue('x = 1'),
    } as unknown as vscode.TextDocument;

    await service.runCode(mockDoc, 'python');

    expect(mockSetControllerImportPrefixes).toHaveBeenCalledWith(new Set());
  });

  it('setting always takes precedence over code content (even for snippets without meta_import)', async () => {
    vi.mocked(ConfigService.getImportPrefix).mockReturnValue('forced');

    const service = createTestDhcService({
      setControllerImportPrefixes: mockSetControllerImportPrefixes,
    });

    await service.runCode('x = 1', 'python');

    expect(mockSetControllerImportPrefixes).toHaveBeenCalledWith(
      new Set(['forced'])
    );
  });
});
