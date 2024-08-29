import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getTempDir } from '../util';
import type { Disposable, IServerManager } from '../types';
import { PIP_SERVER_STATUS_DIRECTORY, PIP_SERVER_STATUS_FILE } from '../common';
import { PollingService } from '../services';

type Port = number;

export class PipServerController implements Disposable {
  constructor(serverManager: IServerManager, portRange: number[]) {
    this._poller = new PollingService();
    this._portRange = new Set(portRange);
    this._serverTerminalMap = new Map();
    this._serverManager = serverManager;

    this._poller.start(this.syncManagedServers, 10000);
  }

  private _isEnvironmentReadyPromise: Promise<boolean> | null = null;
  private _isEnvironmentReadyCheckTerminal: vscode.Terminal | null = null;

  private readonly _poller: PollingService;
  private readonly _portRange: Set<Port>;
  private readonly _serverTerminalMap: Map<Port, vscode.Terminal>;
  private readonly _serverManager: IServerManager;

  /**
   * Attempt to run `deephaven` command in a new terminal and create a tmp file
   * if successful. Then check for the existence of the tmp file to determine
   * if the environment is ready.
   */
  private _checkIsEnvironmentReady = (): Promise<boolean> => {
    return new Promise(async resolve => {
      const cwd = getTempDir(false, PIP_SERVER_STATUS_DIRECTORY);
      const statusFileName = PIP_SERVER_STATUS_FILE;
      const statusFilePath = path.join(cwd, statusFileName);

      if (this._isEnvironmentReadyCheckTerminal == null) {
        this._isEnvironmentReadyCheckTerminal = vscode.window.createTerminal({
          name: 'Deephaven: Check Pip Environment',
          cwd,
          isTransient: true,
        });
      }

      try {
        fs.unlinkSync(statusFilePath);
      } catch {}

      // Give python extension time to setup .venv if configured
      await waitFor(1000);

      this._isEnvironmentReadyCheckTerminal.sendText(
        `deephaven && echo ready > ${statusFileName}`
      );

      // Wait for status check to run
      await waitFor(2000);

      const isReady = fs.existsSync(statusFilePath);

      resolve(isReady);
    });
  };

  getAvailablePorts = (): Port[] => {
    return [...this._portRange]
      .filter(port => !this._serverTerminalMap.has(port))
      .sort();
  };

  isEnvironmentReady = async (): Promise<boolean> => {
    if (this._isEnvironmentReadyPromise == null) {
      this._isEnvironmentReadyPromise = this._checkIsEnvironmentReady();

      this._isEnvironmentReadyPromise.then(() => {
        this._isEnvironmentReadyPromise = null;
      });
    }

    return this._isEnvironmentReadyPromise;
  };

  startServer = async (): Promise<void> => {
    const [port] = this.getAvailablePorts();

    if (port == null) {
      throw new Error('No available ports');
    }

    const terminal = vscode.window.createTerminal({
      name: `Deephaven Server (${port})`,
      env: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        PYTHONPATH: './',
      },
      isTransient: true,
    });

    this._serverTerminalMap.set(port, terminal);

    // Give python extension time to setup .venv if configured
    await waitFor(1000);

    terminal.sendText(
      [
        'deephaven server',
        '--jvm-args "-DAuthHandlers=io.deephaven.auth.AnonymousAuthenticationHandler -Dprocess.info.system-info.enabled=false"',
        `--port ${port}`,
        '--no-browser',
      ].join(' ')
    );
  };

  stopServer = (url: URL): void => {
    this._serverManager.disconnectFromServer(url);

    const port = Number(url.port);

    const terminal = this._serverTerminalMap.get(port);

    if (terminal == null) {
      return;
    }

    terminal.dispose();
    this._serverTerminalMap.delete(port);
  };

  syncManagedServers = async (): Promise<void> => {
    if (!(await this.isEnvironmentReady())) {
      return;
    }

    const ports = this.getAvailablePorts();

    this._serverManager.addManagedServers(
      ports.map(port => new URL(`http://localhost:${port}`))
    );
  };

  dispose = async (): Promise<void> => {};
}

function waitFor(waitMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, waitMs));
}
