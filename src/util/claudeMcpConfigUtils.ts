import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CLAUDE_MCP_DOCS_SERVER_NAME,
  CLAUDE_MCP_SERVER_NAME,
  CLAUDE_MCP_SERVER_URL,
  MCP_DOCS_SERVER_URL,
} from '../common';
import { Logger } from './Logger';

const logger = new Logger('claudeMcpConfigUtils');

const CLAUDE_CLI_NAME = 'claude';
const CLAUDE_VERSION_TIMEOUT_MS = 5000;
const CLAUDE_MCP_TIMEOUT_MS = 15000;
const WINDOWS_DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

/**
 * Result of running the Claude CLI.
 * - `success`: exited with code 0
 * - `nonZeroExit`: ran to completion but exited with a non-zero code. The CLI
 *   uses exit code 1 both for real failures and for expected cases such as
 *   removing a server that doesn't exist.
 * - `failed`: didn't run or didn't finish (e.g. not found or timed out)
 */
type ClaudeCliResult = 'success' | 'nonZeroExit' | 'failed';

/**
 * Run the Claude CLI with the given args.
 * @param cliPath Path to the Claude CLI executable
 * @param args CLI arguments
 * @param options cwd and timeout
 * @returns The result of running the command
 */
function runClaudeCli(
  cliPath: string,
  args: string[],
  { cwd, timeout }: { cwd?: string; timeout: number }
): Promise<ClaudeCliResult> {
  // npm installs `claude.cmd` on Windows, and Node refuses to run `.cmd` /
  // `.bat` files without a shell. `cliPath` is always absolute, so the shell
  // won't resolve it from `cwd`. Quote it in case it contains spaces.
  const isWindowsScript =
    process.platform === 'win32' && /\.(bat|cmd)$/i.test(cliPath);

  // npm's `.cmd` shims run a bare `node` when `node.exe` isn't next to the
  // shim, and `cmd.exe` resolves bare commands from the current directory
  // first. `cwd` is a workspace folder, so stop `cmd.exe` from searching it
  // (otherwise a workspace containing `node.exe` would run instead).
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const noCwdSearchEnv = { NoDefaultCurrentDirectoryInExePath: '1' };
  const env = isWindowsScript
    ? { ...process.env, ...noCwdSearchEnv }
    : undefined;

  return new Promise(resolve => {
    execFile(
      isWindowsScript ? `"${cliPath}"` : cliPath,
      args,
      { cwd, timeout, shell: isWindowsScript, env },
      (error, _stdout, stderr) => {
        if (error != null) {
          logger.debug(
            `'${cliPath} ${args.join(' ')}' failed:`,
            stderr || error.message
          );
          // `code` is the exit code if the process exited, or a string error
          // code (e.g. `ENOENT`) / null (e.g. killed on timeout) otherwise
          resolve(typeof error.code === 'number' ? 'nonZeroExit' : 'failed');
          return;
        }

        resolve('success');
      }
    );
  });
}

/**
 * Check if the given path is an executable file.
 */
function isExecutableFile(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Get the absolute paths of Claude CLI executables on PATH, in PATH order.
 * Resolve these ourselves rather than running the bare command name, since
 * Windows command lookup checks the current directory first, and Claude CLI
 * commands run with a workspace folder as `cwd`. That would allow a workspace
 * to contain a `claude.cmd` that runs instead of the real CLI. Relative PATH
 * entries are skipped for the same reason.
 */
function getClaudeCliPathsOnPath(): string[] {
  const dirs = (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(dir => path.isAbsolute(dir));

  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? WINDOWS_DEFAULT_PATHEXT)
          .split(';')
          .filter(ext => ext !== '')
      : [''];

  return dirs.flatMap(dir =>
    exts.map(ext => path.join(dir, `${CLAUDE_CLI_NAME}${ext.toLowerCase()}`))
  );
}

/**
 * Get the paths of the Claude CLI binary bundled with the Claude Code VS Code
 * extension. The extension doesn't add it to PATH, so users who only installed
 * the extension have no other CLI. Mirrors the extension's own lookup, which on
 * Windows on ARM prefers a bundled x64 binary.
 * @param claudeExtensionPath Install path of the Claude Code VS Code extension
 */
function getBundledClaudeCliPaths(claudeExtensionPath: string): string[] {
  if (process.platform === 'win32') {
    return [
      path.join(
        claudeExtensionPath,
        'resources',
        'native-binaries',
        'win32-x64',
        `${CLAUDE_CLI_NAME}.exe`
      ),
      path.join(
        claudeExtensionPath,
        'resources',
        'native-binary',
        `${CLAUDE_CLI_NAME}.exe`
      ),
    ];
  }

  return [
    path.join(
      claudeExtensionPath,
      'resources',
      'native-binary',
      CLAUDE_CLI_NAME
    ),
  ];
}

/**
 * Get the absolute paths of installed Claude CLI candidates. The extension
 * host doesn't always inherit the user's shell PATH (e.g. when VS Code is
 * launched from the macOS Dock), so include default install locations as
 * fallbacks, then the binary bundled with the Claude Code VS Code extension.
 * @param claudeExtensionPath Install path of the Claude Code VS Code extension,
 * if installed
 */
export function getClaudeCliCandidates(claudeExtensionPath?: string): string[] {
  const homeDir = os.homedir();

  const fallbacks =
    process.platform === 'win32'
      ? [path.join(homeDir, '.local', 'bin', `${CLAUDE_CLI_NAME}.exe`)]
      : [
          path.join(homeDir, '.local', 'bin', CLAUDE_CLI_NAME),
          path.join(homeDir, '.claude', 'local', CLAUDE_CLI_NAME),
        ];

  const bundled =
    claudeExtensionPath == null
      ? []
      : getBundledClaudeCliPaths(claudeExtensionPath);

  return [
    ...new Set([...getClaudeCliPathsOnPath(), ...fallbacks, ...bundled]),
  ].filter(isExecutableFile);
}

/**
 * Resolve the path to an installed Claude CLI.
 * @param claudeExtensionPath Install path of the Claude Code VS Code extension,
 * if installed
 * @returns The first candidate that successfully runs `--version`, or null if
 * the Claude CLI is not installed.
 */
export async function resolveClaudeCliPath(
  claudeExtensionPath?: string
): Promise<string | null> {
  for (const candidate of getClaudeCliCandidates(claudeExtensionPath)) {
    const result = await runClaudeCli(candidate, ['--version'], {
      timeout: CLAUDE_VERSION_TIMEOUT_MS,
    });

    if (result === 'success') {
      return candidate;
    }
  }

  return null;
}

/**
 * Remove an MCP server from Claude `local` scope config. Note that `--scope`
 * must always be specified, otherwise the CLI removes the server from whichever
 * scope it is found in (e.g. a user-scoped server configured by the user).
 * @returns The result of running the remove command
 */
function removeClaudeMcpServer(
  cliPath: string,
  folderPath: string,
  name: string
): Promise<ClaudeCliResult> {
  return runClaudeCli(cliPath, ['mcp', 'remove', '--scope', 'local', name], {
    cwd: folderPath,
    timeout: CLAUDE_MCP_TIMEOUT_MS,
  });
}

/**
 * Add or replace an HTTP MCP server in Claude `local` scope config. The CLI
 * fails to add a server that already exists, so remove it first.
 * @returns true if the server was added, false otherwise
 */
async function upsertClaudeMcpServer(
  cliPath: string,
  folderPath: string,
  name: string,
  url: string
): Promise<boolean> {
  await removeClaudeMcpServer(cliPath, folderPath, name);

  const isSuccess =
    (await runClaudeCli(
      cliPath,
      ['mcp', 'add', '--scope', 'local', '--transport', 'http', name, url],
      { cwd: folderPath, timeout: CLAUDE_MCP_TIMEOUT_MS }
    )) === 'success';

  if (isSuccess) {
    logger.info(
      `Registered Claude MCP server '${name}' (${url}) for`,
      folderPath
    );
  } else {
    logger.warn(
      `Failed to register Claude MCP server '${name}' for`,
      folderPath
    );
  }

  return isSuccess;
}

/**
 * Check if an MCP server is configured for the given folder. Any Claude config
 * scope counts, which is fine since the Deephaven server names are specific to
 * this extension, so a server with one of those names was added by it at
 * `local` scope. Checking the scope itself would mean parsing human-readable
 * `claude mcp get` output, since the CLI has no machine-readable format.
 * @param cliPath Path to the Claude CLI executable
 * @param folderPath Folder to check
 * @param name MCP server name
 * @returns true if the server is configured
 */
export async function hasClaudeMcpServer(
  cliPath: string,
  folderPath: string,
  name: string
): Promise<boolean> {
  return (
    (await runClaudeCli(cliPath, ['mcp', 'get', name], {
      cwd: folderPath,
      timeout: CLAUDE_MCP_TIMEOUT_MS,
    })) === 'success'
  );
}

/**
 * Register Deephaven MCP servers in Claude `local` scope config for the given
 * folder. Claude keys `local` scope config by git root (or by the exact folder
 * if not in a git repo). The Deephaven MCP server URL references the port via
 * an environment variable that Claude expands, so the config doesn't depend on
 * which window registered it.
 * @param cliPath Path to the Claude CLI executable
 * @param folderPath Workspace folder path
 * @param isDocsEnabled Whether to register the Deephaven docs MCP server
 * @returns true if any server was registered
 */
export async function registerClaudeMcpServers(
  cliPath: string,
  folderPath: string,
  isDocsEnabled: boolean
): Promise<boolean> {
  const isRegistered = await upsertClaudeMcpServer(
    cliPath,
    folderPath,
    CLAUDE_MCP_SERVER_NAME,
    CLAUDE_MCP_SERVER_URL
  );

  if (!isDocsEnabled) {
    await removeClaudeMcpServer(
      cliPath,
      folderPath,
      CLAUDE_MCP_DOCS_SERVER_NAME
    );
    return isRegistered;
  }

  const isDocsRegistered = await upsertClaudeMcpServer(
    cliPath,
    folderPath,
    CLAUDE_MCP_DOCS_SERVER_NAME,
    MCP_DOCS_SERVER_URL
  );

  return isRegistered || isDocsRegistered;
}

/**
 * Remove Deephaven MCP servers from Claude `local` scope config for the given
 * folder.
 * @param cliPath Path to the Claude CLI executable
 * @param folderPath Workspace folder path
 * @returns true if every remove command ran to completion. A non-zero exit
 * counts as completed since it is expected for servers that don't exist.
 */
export async function unregisterClaudeMcpServers(
  cliPath: string,
  folderPath: string
): Promise<boolean> {
  let isComplete = true;

  for (const name of [CLAUDE_MCP_SERVER_NAME, CLAUDE_MCP_DOCS_SERVER_NAME]) {
    const result = await removeClaudeMcpServer(cliPath, folderPath, name);

    if (result === 'success') {
      logger.info(`Removed Claude MCP server '${name}' for`, folderPath);
    } else if (result === 'failed') {
      logger.warn(
        `Failed to remove Claude MCP server '${name}' for`,
        folderPath
      );
      isComplete = false;
    }
  }

  return isComplete;
}

/**
 * Get the file system paths of the given workspace folders that the Claude CLI
 * can run in. The extension runs in the remote extension host for remote
 * workspaces (e.g. Dev Containers, Remote - SSH), where workspace folders have
 * the `vscode-remote` scheme and `fsPath` is a path on the remote machine.
 * @param folders Workspace folders
 * @returns File system paths of the folders
 */
export function getClaudeFolderPaths(
  folders: readonly vscode.WorkspaceFolder[]
): string[] {
  const isRemote = vscode.env.remoteName != null;

  return folders
    .filter(
      ({ uri }) =>
        uri.scheme === 'file' || (isRemote && uri.scheme === 'vscode-remote')
    )
    .map(({ uri }) => uri.fsPath);
}
