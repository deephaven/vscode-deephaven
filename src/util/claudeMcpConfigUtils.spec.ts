import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getClaudeFolderPaths,
  hasClaudeMcpServer,
  registerClaudeMcpServers,
  resolveClaudeCliPath,
  unregisterClaudeMcpServers,
} from './claudeMcpConfigUtils';
import { MCP_DOCS_SERVER_URL } from '../common';

vi.mock('vscode');
vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('node:os');

const mockHomeDir = '/mock/home';
const cliPath = '/mock/claude';
// Literal `${…}` that Claude expands from its environment
const mcpUrl = 'http://localhost:${DEEPHAVEN_VSCODE_MCP_PORT}/mcp';

type ExecFileCallback = (
  error: Error | null,
  stdout: string,
  stderr: string
) => void;

/**
 * Mock `execFile` to call back with an error for any call where `shouldFail`
 * returns true.
 * @param shouldFail Determines which calls fail
 * @param errorCode Error `code`. A number is a process exit code. A string or
 * null means the process didn't run or didn't finish (e.g. `ENOENT`, timeout).
 */
function mockExecFile(
  shouldFail: (file: string, args: string[]) => boolean = () => false,
  errorCode: number | string | null = 1
): void {
  vi.mocked(execFile).mockImplementation(((
    file: string,
    args: string[],
    _options: unknown,
    callback: ExecFileCallback
  ) => {
    if (shouldFail(file, args)) {
      callback(
        Object.assign(new Error('mock error'), { code: errorCode }),
        '',
        'mock stderr'
      );
    } else {
      callback(null, '', '');
    }
  }) as unknown as typeof execFile);
}

/** Mock the file system so only the given paths are executable files. */
function mockExecutableFiles(filePaths: string[]): void {
  vi.mocked(fs.accessSync).mockImplementation(filePath => {
    if (!filePaths.includes(String(filePath))) {
      throw new Error('ENOENT');
    }
  });
  vi.mocked(fs.statSync).mockReturnValue({
    isFile: () => true,
  } as fs.Stats);
}

/** Override `process.platform` for the current test. */
function mockPlatform(platform: NodeJS.Platform): void {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
}

/** Get [file, args, cwd] for each `execFile` call. */
function getExecFileCalls(): [string, string[], string | undefined][] {
  return vi
    .mocked(execFile)
    .mock.calls.map(([file, args, options]) => [
      file as string,
      args as string[],
      (options as { cwd?: string }).cwd,
    ]);
}

const remove = (
  folder: string,
  name: string
): [string, string[], string | undefined] => [
  cliPath,
  ['mcp', 'remove', '--scope', 'local', name],
  folder,
];

const add = (
  folder: string,
  name: string,
  url: string
): [string, string[], string | undefined] => [
  cliPath,
  ['mcp', 'add', '--scope', 'local', '--transport', 'http', name, url],
  folder,
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(os.homedir).mockReturnValue(mockHomeDir);
  mockExecFile();
  mockExecutableFiles([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('resolveClaudeCliPath', () => {
  const binA = path.join('/mock', 'binA');
  const binB = path.join('/mock', 'binB');
  const localBinClaude = path.join(mockHomeDir, '.local', 'bin', 'claude');

  beforeEach(() => {
    mockPlatform('linux');
    vi.stubEnv('PATH', ['relative/bin', binA, binB].join(path.delimiter));
  });

  it('should return absolute path of first `claude` on PATH', async () => {
    const binBClaude = path.join(binB, 'claude');
    mockExecutableFiles([binBClaude, localBinClaude]);

    expect(await resolveClaudeCliPath()).toBe(binBClaude);
    expect(getExecFileCalls()).toEqual([
      [binBClaude, ['--version'], undefined],
    ]);
    expect(vi.mocked(execFile).mock.calls[0][2]).toMatchObject({
      shell: false,
      env: undefined,
    });
  });

  it('should ignore relative PATH entries', async () => {
    mockExecutableFiles([path.join('relative/bin', 'claude')]);

    expect(await resolveClaudeCliPath()).toBeNull();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('should fall back to default install location if not on PATH', async () => {
    mockExecutableFiles([localBinClaude]);

    expect(await resolveClaudeCliPath()).toBe(localBinClaude);
  });

  it('should skip candidates that fail to run', async () => {
    const binAClaude = path.join(binA, 'claude');
    mockExecutableFiles([binAClaude, localBinClaude]);
    mockExecFile(file => file === binAClaude, 'EACCES');

    expect(await resolveClaudeCliPath()).toBe(localBinClaude);
  });

  it('should return null if Claude CLI is not installed', async () => {
    expect(await resolveClaudeCliPath()).toBeNull();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('should run Windows `.cmd` scripts by quoted absolute path in a shell', async () => {
    mockPlatform('win32');
    vi.stubEnv('PATHEXT', '.EXE;.CMD');
    const binAClaudeCmd = path.join(binA, 'claude.cmd');
    mockExecutableFiles([binAClaudeCmd]);

    expect(await resolveClaudeCliPath()).toBe(binAClaudeCmd);
    expect(vi.mocked(execFile).mock.calls[0][0]).toBe(`"${binAClaudeCmd}"`);
    expect(vi.mocked(execFile).mock.calls[0][2]).toMatchObject({
      shell: true,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      env: expect.objectContaining({ NoDefaultCurrentDirectoryInExePath: '1' }),
    });
  });

  it('should fall back to `claude.exe` default install location on Windows', async () => {
    mockPlatform('win32');
    const localBinClaudeExe = path.join(
      mockHomeDir,
      '.local',
      'bin',
      'claude.exe'
    );
    mockExecutableFiles([localBinClaudeExe]);

    expect(await resolveClaudeCliPath()).toBe(localBinClaudeExe);
  });

  describe('Claude Code VS Code extension bundled binary', () => {
    const extensionPath = path.join('/mock', 'claude-code-extension');
    const nativeBinaryDir = path.join(
      extensionPath,
      'resources',
      'native-binary'
    );

    it('should fall back to bundled binary', async () => {
      const bundledClaude = path.join(nativeBinaryDir, 'claude');
      mockExecutableFiles([bundledClaude]);

      expect(await resolveClaudeCliPath(extensionPath)).toBe(bundledClaude);
    });

    it('should prefer an installed CLI over the bundled binary', async () => {
      mockExecutableFiles([
        localBinClaude,
        path.join(nativeBinaryDir, 'claude'),
      ]);

      expect(await resolveClaudeCliPath(extensionPath)).toBe(localBinClaude);
    });

    it('should ignore bundled binary if extension path is not provided', async () => {
      mockExecutableFiles([path.join(nativeBinaryDir, 'claude')]);

      expect(await resolveClaudeCliPath()).toBeNull();
    });

    it.each([
      [
        'x64 binary on Windows on ARM',
        path.join(
          extensionPath,
          'resources',
          'native-binaries',
          'win32-x64',
          'claude.exe'
        ),
      ],
      ['native binary', path.join(nativeBinaryDir, 'claude.exe')],
    ])(
      'should fall back to bundled `claude.exe` on Windows: %s',
      async (_label, bundledClaudeExe) => {
        mockPlatform('win32');
        mockExecutableFiles([bundledClaudeExe]);

        expect(await resolveClaudeCliPath(extensionPath)).toBe(
          bundledClaudeExe
        );
      }
    );
  });
});

describe('registerClaudeMcpServers', () => {
  const folder = '/mock/folderA';

  it('should upsert servers for the folder', async () => {
    const result = await registerClaudeMcpServers(cliPath, folder, true);

    expect(result).toBe(true);
    expect(getExecFileCalls()).toEqual([
      remove(folder, 'deephaven-vscode'),
      add(folder, 'deephaven-vscode', mcpUrl),
      remove(folder, 'deephaven-vscode-docs'),
      add(folder, 'deephaven-vscode-docs', MCP_DOCS_SERVER_URL),
    ]);
  });

  it('should remove docs server if docs are disabled', async () => {
    await registerClaudeMcpServers(cliPath, folder, false);

    expect(getExecFileCalls()).toEqual([
      remove(folder, 'deephaven-vscode'),
      add(folder, 'deephaven-vscode', mcpUrl),
      remove(folder, 'deephaven-vscode-docs'),
    ]);
  });

  it('should add servers even if remove fails', async () => {
    mockExecFile((_file, args) => args[1] === 'remove');

    const result = await registerClaudeMcpServers(cliPath, folder, false);

    expect(result).toBe(true);
    expect(getExecFileCalls()).toContainEqual(
      add(folder, 'deephaven-vscode', mcpUrl)
    );
  });

  it('should return true if only docs server is registered', async () => {
    mockExecFile(
      (_file, args) => args[1] === 'add' && args.includes('deephaven-vscode')
    );

    expect(await registerClaudeMcpServers(cliPath, folder, true)).toBe(true);
  });

  it('should return false if add fails for all servers', async () => {
    mockExecFile((_file, args) => args[1] === 'add');

    expect(await registerClaudeMcpServers(cliPath, folder, true)).toBe(false);
  });
});

describe('hasClaudeMcpServer', () => {
  it.each([
    ['configured', null, true],
    ['not configured', 1, false],
    ['CLI fails to run', 'ENOENT', false],
  ] as const)(
    'should return whether the server is configured: %s',
    async (label, errorCode, expected) => {
      mockExecFile(() => label !== 'configured', errorCode);

      expect(
        await hasClaudeMcpServer(cliPath, '/mock/folderA', 'deephaven-vscode')
      ).toBe(expected);
      expect(getExecFileCalls()).toEqual([
        [cliPath, ['mcp', 'get', 'deephaven-vscode'], '/mock/folderA'],
      ]);
    }
  );
});

describe('unregisterClaudeMcpServers', () => {
  it('should only remove servers from local scope', async () => {
    await unregisterClaudeMcpServers(cliPath, '/mock/folderA');

    expect(getExecFileCalls()).toEqual([
      remove('/mock/folderA', 'deephaven-vscode'),
      remove('/mock/folderA', 'deephaven-vscode-docs'),
    ]);
  });

  it.each([
    ['all succeed', null, true],
    ['servers do not exist (non-zero exit)', 1, true],
    ['remove does not run (e.g. not found)', 'ENOENT', false],
    ['remove does not finish (e.g. timeout)', null, false],
  ] as const)(
    'should return whether cleanup completed: %s',
    async (label, errorCode, expected) => {
      mockExecFile(() => label !== 'all succeed', errorCode);

      expect(await unregisterClaudeMcpServers(cliPath, '/mock/folderA')).toBe(
        expected
      );
    }
  );
});

describe('getClaudeFolderPaths', () => {
  const folder = (uri: string): vscode.WorkspaceFolder => ({
    uri: vscode.Uri.parse(uri),
    name: uri,
    index: 0,
  });

  const folders = [
    folder('file:///local/folder'),
    folder('vscode-remote:///remote/folder'),
    folder('untitled:///untitled/folder'),
    folder('vscode-vfs:///virtual/folder'),
  ];

  it('should only include `file` folders in a local window', () => {
    expect(getClaudeFolderPaths(folders)).toEqual(['/local/folder']);
  });

  it('should include `vscode-remote` folders in a remote window', () => {
    vi.spyOn(vscode.env, 'remoteName', 'get').mockReturnValue('dev-container');

    expect(getClaudeFolderPaths(folders)).toEqual([
      '/local/folder',
      '/remote/folder',
    ]);
  });
});
