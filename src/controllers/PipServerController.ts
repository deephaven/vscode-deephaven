import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { isDhcServerRunning } from '@deephaven/require-jsapi';
import {
  getPipServerUrl,
  getPipStatusFilePath,
  Logger,
  parsePort,
} from '../util';
import type { Disposable, Port, IServerManager, IToastService } from '../types';
import {
  PIP_SERVER_STATUS_CHECK_INTERVAL,
  PIP_SERVER_STATUS_CHECK_TIMEOUT,
  PIP_SERVER_SUPPORTED_PLATFORMS,
  PYTHON_ENV_WAIT,
} from '../common';
import { pollUntilTrue, waitFor } from '../util/promiseUtils';

const logger = new Logger('PipServerController');

export class PipServerController implements Disposable {
  constructor(
    context: vscode.ExtensionContext,
    serverManager: IServerManager,
    portRange: Iterable<Port>,
    outputChannel: vscode.OutputChannel,
    toastService: IToastService
  ) {
    this._context = context;
    this._pollers = new Map();
    this._portRange = new Set(portRange);
    this._serverUrlTerminalMap = new Map();
    this._serverManager = serverManager;
    this._outputChannel = outputChannel;
    this._toaster = toastService;

    vscode.window.onDidCloseTerminal(
      terminal => {
        for (const [p, t] of this._serverUrlTerminalMap.entries()) {
          if (t === terminal) {
            if ((t.exitStatus?.code ?? 0) !== 0) {
              const msg = `Server on port ${p} exited with code ${t.exitStatus?.code}`;
              this._logAndShowError(msg);
            }

            this.disposeServers([p]);
            break;
          }
        }
      },
      undefined,
      this._context.subscriptions
    );
  }

  private readonly _context: vscode.ExtensionContext;
  private readonly _outputChannel: vscode.OutputChannel;
  private readonly _pollers: Map<Port, { cancel: () => void }>;
  private readonly _portRange: ReadonlySet<Port>;
  private readonly _serverUrlTerminalMap: Map<Port, vscode.Terminal>;
  private readonly _serverManager: IServerManager;
  private readonly _toaster: IToastService;
  private _checkPipInstallPromise: Promise<boolean> | null = null;
  private _isPipServerInstalled = false;

  /**
   * Log and show an error message to the user.
   * @param msg The error message to log and show.
   */
  private _logAndShowError = (msg: string): void => {
    logger.error(msg);
    this._outputChannel.appendLine(msg);
    this._toaster.error(msg);
  };

  /**
   * Start a terminal and attempt an import of `deephaven_server` to check if
   * servers can be managed from the extension.
   */
  checkPipInstall = async (): Promise<boolean> => {
    if (!PIP_SERVER_SUPPORTED_PLATFORMS.has(process.platform)) {
      return false;
    }

    if (this._checkPipInstallPromise == null) {
      const statusFilePath = getPipStatusFilePath();

      try {
        // Delete any existing status file
        fs.unlinkSync(statusFilePath);
      } catch {}

      this._checkPipInstallPromise = new Promise(async resolve => {
        const terminal = vscode.window.createTerminal({
          name: `Deephaven check pip server install`,
          isTransient: true,
        });

        // Give python extension time to setup .venv if configured
        await waitFor(PYTHON_ENV_WAIT);

        // Attempt to import deephaven_server to see if it's installed and write
        // "ready" to status file if successful.
        terminal.sendText(
          `python -c 'import deephaven_server;' && echo ready > ${statusFilePath}`
        );
        terminal.sendText('exit 0');

        const subscription = vscode.window.onDidCloseTerminal(
          t => {
            if (t === terminal) {
              subscription.dispose();

              // Get result of status check from tmp file
              const isReady = fs.existsSync(statusFilePath);

              resolve(isReady);
              this._checkPipInstallPromise = null;
            }
          },
          undefined,
          this._context.subscriptions
        );
      });
    }

    return this._checkPipInstallPromise;
  };

  getAvailablePorts = (): Port[] => {
    return [...this._portRange]
      .filter(port => !this._serverUrlTerminalMap.has(port))
      .sort();
  };

  pollUntilServerStarts = async (port: Port): Promise<void> => {
    // If there's already a poller for this port, cancel it.
    this._pollers.get(port)?.cancel();

    const serverUrl = getPipServerUrl(port);

    const { promise, cancel } = pollUntilTrue(
      () => {
        logger.debug(`Polling Pip server: '${serverUrl}'`);
        return isDhcServerRunning(serverUrl);
      },
      PIP_SERVER_STATUS_CHECK_INTERVAL,
      PIP_SERVER_STATUS_CHECK_TIMEOUT
    );

    this._pollers.set(port, { cancel });

    try {
      await promise;
      logger.debug(`Pip server started: '${serverUrl}'`);
    } catch (err) {
      logger.error(err);
      void this.disposeServers([port]);
    }

    this._pollers.delete(port);
    void this._serverManager.updateStatus([serverUrl]);
  };

  startServer = async (): Promise<void> => {
    const [port] = this.getAvailablePorts();

    if (port == null) {
      this._logAndShowError('No available ports');
      return;
    }

    const terminal = vscode.window.createTerminal({
      name: `Deephaven (${port})`,
      env: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        PYTHONPATH: './',
      },
      isTransient: true,
    });

    this._serverUrlTerminalMap.set(port, terminal);
    this.syncManagedServers();

    // Give python extension time to setup .venv if configured
    await waitFor(PYTHON_ENV_WAIT);

    // If user disposes terminal before server starts, it will be removed from
    // _serverUrlTerminalMap, so check it to verify it's still there before
    // proceeding.
    if (this._serverUrlTerminalMap.has(port)) {
      // In case pip env has changed since last server check
      this._isPipServerInstalled = await this.checkPipInstall();

      if (!this._isPipServerInstalled) {
        this._logAndShowError(
          'Could not find `deephaven_server` Python module.'
        );

        this.disposeServers([port]);

        return;
      }

      const serverUrl = getPipServerUrl(port);

      const serverState = this._serverManager.getServer(serverUrl);
      if (serverState?.isManaged !== true) {
        this._logAndShowError(
          `Unexpected server state for managed server: '${serverUrl}'`
        );
        return;
      }

      const jvmArgs: [`-D${string}`, string][] = [
        ['-Dauthentication.psk', serverState.psk],
      ];

      const isMac = process.platform === 'darwin';
      // Required for M1/M2 macs:
      // https://deephaven.io/core/docs/getting-started/pip-install/#m2-macs
      if (isMac) {
        jvmArgs.push(['-Dprocess.info.system-info.enabled', 'false']);
      }

      const jvmArgsStr = jvmArgs
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');

      terminal.sendText(
        [
          'deephaven server',
          `--jvm-args "${jvmArgsStr}"`,
          `--port ${port}`,
          '--no-browser',
        ].join(' ')
      );

      await this.pollUntilServerStarts(port);
    }
  };

  stopServer = async (url: URL): Promise<void> => {
    this._serverManager.disconnectFromServer(url);

    const port = parsePort(url.port);

    await this.disposeServers([port]);
  };

  syncManagedServers = async (): Promise<void> => {
    if (!this._isPipServerInstalled) {
      this._isPipServerInstalled = await this.checkPipInstall();
    }

    this._serverManager.canStartServer =
      this._isPipServerInstalled && this.getAvailablePorts().length > 0;

    if (!this._isPipServerInstalled) {
      this._serverManager.syncManagedServers([]);
      return;
    }

    const runningPorts = [...this._serverUrlTerminalMap.keys()];

    this._serverManager.syncManagedServers(runningPorts.map(getPipServerUrl));
  };

  disposeServers = async (ports: Iterable<Port>): Promise<void> => {
    for (const port of ports) {
      const terminal = this._serverUrlTerminalMap.get(port);

      if (terminal != null) {
        terminal.dispose();
        this._serverUrlTerminalMap.delete(port);
      }

      this._pollers.get(port)?.cancel();
      this._pollers.delete(port);
    }

    await this.syncManagedServers();
  };

  dispose = async (): Promise<void> => {
    this.disposeServers(this._serverUrlTerminalMap.keys());
  };
}
