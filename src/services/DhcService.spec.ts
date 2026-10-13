import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DhcService } from './DhcService';
import { ConfigService } from './ConfigService';
import type { RemoteFileSourceService } from './RemoteFileSourceService';
import type { PublicOf, UniqueID } from '../types';

vi.mock('vscode');

vi.mock('./ConfigService', () => {
  const mockConfigService = {
    getImportPrefixes: vi.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention
  return { ConfigService: mockConfigService };
});

beforeEach(() => {
  vi.clearAllMocks();
});

function createMockCn(): DhcType.IdeConnection {
  return {
    getConsoleTypes: vi.fn().mockResolvedValue(['python']),
  } as unknown as DhcType.IdeConnection;
}

type DhcServicePublicCn = PublicOf<DhcService> & {
  cn: DhcType.IdeConnection | null;
};

/** Build a minimal DhcService instance that has a session already set up. */
function createTestDhcService({
  cn = createMockCn(),
  pythonRemoteFileSourcePlugin,
  setControllerImportPrefixes = vi.fn(),
  setPythonServerExecutionContext = vi.fn().mockResolvedValue(undefined),
  sessionRunCode = vi.fn().mockResolvedValue({
    error: '',
    changes: { created: [], updated: [], removed: [] },
  }),
}: {
  cn?: DhcType.IdeConnection | null;
  pythonRemoteFileSourcePlugin?: DhcType.Widget | null;
  setControllerImportPrefixes?: ReturnType<typeof vi.fn>;
  setPythonServerExecutionContext?: ReturnType<typeof vi.fn>;
  sessionRunCode?: ReturnType<typeof vi.fn>;
} = {}): DhcServicePublicCn {
  const mockSession = {
    runCode: sessionRunCode,
  } as unknown as DhcType.IdeSession;

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
    cn,
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
    _runningCodeCount: 0,
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

describe('runCode – importPrefixes setting', () => {
  const mockSetControllerImportPrefixes = vi.fn();

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
      label:
        'calls with empty set for full file runs even when no prefixes found',
      configPrefixes: undefined,
      input: mockTextDoc('x = 1'),
      expected: new Set(),
    },
    {
      label: 'setting takes precedence over meta_import in code',
      configPrefixes: ['forced'],
      input:
        'deephaven_enterprise.controller_import.meta_import("otherPrefix")\n',
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

describe('runCode – isRunningCode', () => {
  /** Session `runCode` mock whose calls stay pending until settled. */
  function createDeferredSessionRunCode(): {
    sessionRunCode: ReturnType<typeof vi.fn>;
    resolveNext: () => void;
    rejectNext: (err: unknown) => void;
  } {
    const pending: {
      resolve: (value: DhcType.ide.CommandResult) => void;
      reject: (err: unknown) => void;
    }[] = [];

    const sessionRunCode = vi.fn(
      () =>
        new Promise<DhcType.ide.CommandResult>((resolve, reject) => {
          pending.push({ resolve, reject });
        })
    );

    return {
      sessionRunCode,
      resolveNext: (): void =>
        pending.shift()!.resolve({
          error: '',
          changes: { created: [], updated: [], removed: [] },
        } as unknown as DhcType.ide.CommandResult),
      rejectNext: (err: unknown): void => pending.shift()!.reject(err),
    };
  }

  it('stays true until all overlapping runs have finished', async () => {
    const { sessionRunCode, resolveNext } = createDeferredSessionRunCode();
    const service = createTestDhcService({ sessionRunCode });

    const run1 = service.runCode('x = 1', 'python');
    const run2 = service.runCode('y = 2', 'python');

    await vi.waitFor(() => expect(sessionRunCode).toHaveBeenCalledTimes(2));
    expect(service.isRunningCode).toBe(true);

    resolveNext();
    await run1;
    expect(service.isRunningCode).toBe(true);

    resolveNext();
    await run2;
    expect(service.isRunningCode).toBe(false);
  });

  it('clears once a failed run and its overlapping run have finished', async () => {
    const { sessionRunCode, resolveNext, rejectNext } =
      createDeferredSessionRunCode();
    const service = createTestDhcService({ sessionRunCode });

    const run1 = service.runCode('x = 1', 'python');
    const run2 = service.runCode('y = 2', 'python');

    await vi.waitFor(() => expect(sessionRunCode).toHaveBeenCalledTimes(2));

    rejectNext(new Error('boom'));
    await expect(run1).rejects.toThrow();
    expect(service.isRunningCode).toBe(true);

    resolveNext();
    await run2;
    expect(service.isRunningCode).toBe(false);
  });

  it('decrements once when a run throws after execution completes', async () => {
    const { sessionRunCode, resolveNext } = createDeferredSessionRunCode();
    const service = createTestDhcService({ sessionRunCode });

    // Throws when `runCode` reads `result.error`, after execution has finished
    sessionRunCode.mockResolvedValueOnce({
      get error(): string {
        throw new Error('boom');
      },
      changes: { created: [], updated: [], removed: [] },
    });

    await service.runCode('x = 1', 'python').catch(() => {});
    expect(service.isRunningCode).toBe(false);

    const run2 = service.runCode('y = 2', 'python');
    await vi.waitFor(() => expect(sessionRunCode).toHaveBeenCalledTimes(2));
    expect(service.isRunningCode).toBe(true);

    resolveNext();
    await run2;
    expect(service.isRunningCode).toBe(false);
  });

  it('fires the status event only when the status changes', async () => {
    const { sessionRunCode, resolveNext } = createDeferredSessionRunCode();
    const service = createTestDhcService({ sessionRunCode });
    const fire = (
      service as unknown as {
        _onDidChangeRunningCodeStatus: { fire: ReturnType<typeof vi.fn> };
      }
    )._onDidChangeRunningCodeStatus.fire;

    const run1 = service.runCode('x = 1', 'python');
    const run2 = service.runCode('y = 2', 'python');

    await vi.waitFor(() => expect(sessionRunCode).toHaveBeenCalledTimes(2));
    expect(fire.mock.calls).toEqual([[true]]);
    fire.mockClear();

    resolveNext();
    await run1;
    expect(fire).not.toHaveBeenCalled();

    resolveNext();
    await run2;

    expect(fire.mock.calls).toEqual([[false]]);
  });
});

describe('getConnection', () => {
  it('initializes the session when no connection exists yet', async () => {
    const service = createTestDhcService({ cn: null });

    const mockCn = createMockCn();

    // `initSession` establishes the connection as a side effect.
    const initSession = vi
      .spyOn(service, 'initSession')
      .mockImplementation(async () => {
        service.cn = mockCn;
        return true;
      });

    const result = await service.getConnection();

    expect(initSession).toHaveBeenCalledOnce();
    expect(result).toBe(mockCn);
  });

  it('returns the existing connection without re-initializing', async () => {
    const service = createTestDhcService();

    const initSession = vi.spyOn(service, 'initSession');

    const result = await service.getConnection();

    expect(initSession).not.toHaveBeenCalled();
    expect(result).toBe(service.cn);
  });
});
