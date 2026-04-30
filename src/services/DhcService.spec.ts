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
    getImportPrefixes: vi.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention
  return { ConfigService: mockConfigService };
});

/** Build a minimal DhcService instance that has a session already set up. */
function createTestDhcService({
  pythonRemoteFileSourcePlugin,
  setControllerImportPrefixes = vi.fn(),
  setPythonServerExecutionContext = vi.fn().mockResolvedValue(undefined),
  sessionRunCode = vi.fn().mockResolvedValue({
    error: '',
    changes: { created: [], updated: [], removed: [] },
  }),
}: {
  pythonRemoteFileSourcePlugin?: DhcType.Widget | null;
  setControllerImportPrefixes?: ReturnType<typeof vi.fn>;
  setPythonServerExecutionContext?: ReturnType<typeof vi.fn>;
  sessionRunCode?: ReturnType<typeof vi.fn>;
} = {}): DhcService {
  const mockSession = {
    runCode: sessionRunCode,
  } as unknown as DhcType.IdeSession;

  const mockCn = {
    getConsoleTypes: vi.fn().mockResolvedValue(['python']),
  } as unknown as DhcType.IdeConnection;

  const mockRemoteFileSourceService = {
    setControllerImportPrefixes,
    setPythonServerExecutionContext,
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

  return service;
}

function mockTextDoc(codeText: string): vscode.TextDocument {
  return {
    uri: vscode.Uri.file('/path/to/file.py'),
    getText: vi.fn().mockReturnValue(codeText),
  } as unknown as vscode.TextDocument;
}

describe('DhcService.runCode – importPrefixes setting', () => {
  const mockSetControllerImportPrefixes = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      label: 'uses setting prefixes when configured',
      configPrefixes: ['myPrefix'],
      input: 'x = 1',
      expected: new Set(['myPrefix']),
    },
    {
      label: 'uses all prefixes when multiple configured',
      configPrefixes: ['prefix1', 'prefix2'],
      input: 'x = 1',
      expected: new Set(['prefix1', 'prefix2']),
    },
    {
      label: 'falls back to extraction when undefined and code has prefixes',
      configPrefixes: undefined,
      input: 'deephaven_enterprise.controller_import.meta_import("myPrefix")\n',
      expected: new Set(['myPrefix']),
    },
    {
      label: 'skips call when undefined and no prefixes in snippet',
      configPrefixes: undefined,
      input: 'x = 1',
      expected: null,
    },
    {
      label: 'calls with empty set for full file runs even when no prefixes found',
      configPrefixes: undefined,
      input: mockTextDoc('x = 1'),
      expected: new Set(),
    },
    {
      label: 'setting takes precedence over meta_import in code',
      configPrefixes: ['forced'],
      input: 'deephaven_enterprise.controller_import.meta_import("otherPrefix")\n',
      expected: new Set(['forced']),
    },
    {
      label: 'setting takes precedence over meta_import in text doc',
      configPrefixes: ['forced'],
      input: mockTextDoc(
        'deephaven_enterprise.controller_import.meta_import("otherPrefix")\n'
      ),
      expected: new Set(['forced']),
    },
  ])('$label', async ({ configPrefixes, input, expected }) => {
    vi.mocked(ConfigService.getImportPrefixes).mockReturnValue(configPrefixes);

    const service = createTestDhcService({
      setControllerImportPrefixes: mockSetControllerImportPrefixes,
    });

    await service.runCode(input, 'python');

    if (expected == null) {
      expect(mockSetControllerImportPrefixes).not.toHaveBeenCalled();
    } else {
      expect(mockSetControllerImportPrefixes).toHaveBeenCalledWith(expected);
    }
  });
});
