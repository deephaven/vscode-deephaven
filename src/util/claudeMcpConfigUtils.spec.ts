import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  registerClaudeMcpServers,
  resolveClaudeCliPath,
  unregisterClaudeMcpServers,
} from './claudeMcpConfigUtils';
import { MCP_DOCS_SERVER_URL } from '../common';

vi.mock('vscode');
vi.mock('node:child_process');
vi.mock('node:os');

const mockHomeDir = '/mock/home';
const cliPath = '/mock/claude';
const port = 45001;
const mcpUrl = `http://localhost:${port}/mcp`;

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
});

describe('resolveClaudeCliPath', () => {
  it('should return `claude` if found on PATH', async () => {
    expect(await resolveClaudeCliPath()).toBe('claude');
    expect(getExecFileCalls()).toEqual([['claude', ['--version'], undefined]]);
  });

  it('should fall back to default install location if not on PATH', async () => {
    mockExecFile(file => file === 'claude', 'ENOENT');

    expect(await resolveClaudeCliPath()).toBe(
      path.join(
        mockHomeDir,
        '.local',
        'bin',
        process.platform === 'win32' ? 'claude.exe' : 'claude'
      )
    );
  });

  it('should return null if Claude CLI is not installed', async () => {
    mockExecFile(() => true);

    expect(await resolveClaudeCliPath()).toBeNull();
  });
});

describe('registerClaudeMcpServers', () => {
  const folders = ['/mock/folderA', '/mock/folderB'];

  it('should upsert servers for each folder sequentially', async () => {
    const result = await registerClaudeMcpServers(cliPath, folders, port, true);

    expect(result).toBe(true);
    expect(getExecFileCalls()).toEqual(
      folders.flatMap(folder => [
        remove(folder, 'deephaven-vscode'),
        add(folder, 'deephaven-vscode', mcpUrl),
        remove(folder, 'deephaven-docs'),
        add(folder, 'deephaven-docs', MCP_DOCS_SERVER_URL),
      ])
    );
  });

  it('should remove docs server if docs are disabled', async () => {
    await registerClaudeMcpServers(cliPath, ['/mock/folderA'], port, false);

    expect(getExecFileCalls()).toEqual([
      remove('/mock/folderA', 'deephaven-vscode'),
      add('/mock/folderA', 'deephaven-vscode', mcpUrl),
      remove('/mock/folderA', 'deephaven-docs'),
    ]);
  });

  it('should add servers even if remove fails', async () => {
    mockExecFile((_file, args) => args[1] === 'remove');

    const result = await registerClaudeMcpServers(
      cliPath,
      ['/mock/folderA'],
      port,
      false
    );

    expect(result).toBe(true);
    expect(getExecFileCalls()).toContainEqual(
      add('/mock/folderA', 'deephaven-vscode', mcpUrl)
    );
  });

  it('should return true if only docs server is registered', async () => {
    mockExecFile(
      (_file, args) => args[1] === 'add' && args.includes('deephaven-vscode')
    );

    expect(await registerClaudeMcpServers(cliPath, folders, port, true)).toBe(
      true
    );
  });

  it('should return false if add fails for all folders', async () => {
    mockExecFile((_file, args) => args[1] === 'add');

    expect(await registerClaudeMcpServers(cliPath, folders, port, true)).toBe(
      false
    );
  });
});

describe('unregisterClaudeMcpServers', () => {
  it('should only remove servers from local scope', async () => {
    await unregisterClaudeMcpServers(cliPath, ['/mock/folderA']);

    expect(getExecFileCalls()).toEqual([
      remove('/mock/folderA', 'deephaven-vscode'),
      remove('/mock/folderA', 'deephaven-docs'),
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

      expect(await unregisterClaudeMcpServers(cliPath, ['/mock/folderA'])).toBe(
        expected
      );
    }
  );
});
