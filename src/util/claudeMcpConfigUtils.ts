import { execFile } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CLAUDE_MCP_DOCS_SERVER_NAME,
  CLAUDE_MCP_SERVER_NAME,
  MCP_DOCS_SERVER_URL,
} from '../common';
import { Logger } from './Logger';

const logger = new Logger('claudeMcpConfigUtils');

const CLAUDE_CLI_NAME = 'claude';
const CLAUDE_VERSION_TIMEOUT_MS = 5000;
const CLAUDE_MCP_TIMEOUT_MS = 15000;

/**
 * Run the Claude CLI with the given args.
 * @param cliPath Path to the Claude CLI executable
 * @param args CLI arguments
 * @param options cwd and timeout
 * @returns true if the command exited successfully, false otherwise
 */
function runClaudeCli(
  cliPath: string,
  args: string[],
  { cwd, timeout }: { cwd?: string; timeout: number }
): Promise<boolean> {
  return new Promise(resolve => {
    execFile(
      cliPath,
      args,
      {
        cwd,
        timeout,
        // npm installs `claude.cmd` on Windows, which can't be run without a
        // shell. Only needed for the bare command name resolved via PATH.
        shell: process.platform === 'win32' && cliPath === CLAUDE_CLI_NAME,
      },
      (error, _stdout, stderr) => {
        if (error != null) {
          logger.debug(
            `'${cliPath} ${args.join(' ')}' failed:`,
            stderr || error.message
          );
          resolve(false);
          return;
        }

        resolve(true);
      }
    );
  });
}

/**
 * Get the candidate paths for the Claude CLI. The extension host doesn't
 * always inherit the user's shell PATH (e.g. when VS Code is launched from the
 * macOS Dock), so include default install locations as fallbacks.
 */
export function getClaudeCliCandidates(): string[] {
  const homeDir = os.homedir();

  if (process.platform === 'win32') {
    return [
      CLAUDE_CLI_NAME,
      path.join(homeDir, '.local', 'bin', `${CLAUDE_CLI_NAME}.exe`),
    ];
  }

  return [
    CLAUDE_CLI_NAME,
    path.join(homeDir, '.local', 'bin', CLAUDE_CLI_NAME),
    path.join(homeDir, '.claude', 'local', CLAUDE_CLI_NAME),
  ];
}

/**
 * Resolve the path to an installed Claude CLI.
 * @returns The first candidate that successfully runs `--version`, or null if
 * the Claude CLI is not installed.
 */
export async function resolveClaudeCliPath(): Promise<string | null> {
  for (const candidate of getClaudeCliCandidates()) {
    if (
      await runClaudeCli(candidate, ['--version'], {
        timeout: CLAUDE_VERSION_TIMEOUT_MS,
      })
    ) {
      return candidate;
    }
  }

  return null;
}

/**
 * Remove an MCP server from Claude `local` scope config. Note that `--scope`
 * must always be specified, otherwise the CLI removes the server from whichever
 * scope it is found in (e.g. a user-scoped server configured by the user).
 * @returns true if the server was removed, false if it didn't exist or failed
 */
function removeClaudeMcpServer(
  cliPath: string,
  folderPath: string,
  name: string
): Promise<boolean> {
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

  const isSuccess = await runClaudeCli(
    cliPath,
    ['mcp', 'add', '--scope', 'local', '--transport', 'http', name, url],
    { cwd: folderPath, timeout: CLAUDE_MCP_TIMEOUT_MS }
  );

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
 * Register Deephaven MCP servers in Claude `local` scope config for the given
 * folders. Claude keys `local` scope config by git root (or by the exact folder
 * if not in a git repo). Folders are processed sequentially since concurrent
 * CLI calls can race writing the Claude config file.
 * @param cliPath Path to the Claude CLI executable
 * @param folderPaths Workspace folder paths
 * @param port Port the Deephaven MCP server is running on
 * @param isDocsEnabled Whether to register the Deephaven docs MCP server
 * @returns true if the Deephaven MCP server was registered for any folder
 */
export async function registerClaudeMcpServers(
  cliPath: string,
  folderPaths: string[],
  port: number,
  isDocsEnabled: boolean
): Promise<boolean> {
  let isRegistered = false;

  for (const folderPath of folderPaths) {
    if (
      await upsertClaudeMcpServer(
        cliPath,
        folderPath,
        CLAUDE_MCP_SERVER_NAME,
        `http://localhost:${port}/mcp`
      )
    ) {
      isRegistered = true;
    }

    if (isDocsEnabled) {
      await upsertClaudeMcpServer(
        cliPath,
        folderPath,
        CLAUDE_MCP_DOCS_SERVER_NAME,
        MCP_DOCS_SERVER_URL
      );
    } else {
      await removeClaudeMcpServer(
        cliPath,
        folderPath,
        CLAUDE_MCP_DOCS_SERVER_NAME
      );
    }
  }

  return isRegistered;
}

/**
 * Remove Deephaven MCP servers from Claude `local` scope config for the given
 * folders.
 * @param cliPath Path to the Claude CLI executable
 * @param folderPaths Workspace folder paths
 */
export async function unregisterClaudeMcpServers(
  cliPath: string,
  folderPaths: string[]
): Promise<void> {
  for (const folderPath of folderPaths) {
    for (const name of [CLAUDE_MCP_SERVER_NAME, CLAUDE_MCP_DOCS_SERVER_NAME]) {
      if (await removeClaudeMcpServer(cliPath, folderPath, name)) {
        logger.info(`Removed Claude MCP server '${name}' for`, folderPath);
      }
    }
  }
}
