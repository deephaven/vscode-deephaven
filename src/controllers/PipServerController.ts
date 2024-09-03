import * as vscode from 'vscode';
import { getPipServerUrl, Logger, parsePort } from '../util';
import type { Disposable, Port, IServerManager, IToastService } from '../types';
import {
  PIP_SERVER_STATUS_CHECK_INTERVAL,
  PIP_SERVER_STATUS_CHECK_TIMEOUT,
  PIP_SERVER_SUPPORTED_PLATFORMS,
  PYTHON_ENV_WAIT,
} from '../common';
import { isDhcServerRunning } from '../dh/dhc';
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
            if (t.exitStatus?.code !== 0) {
              const msg = `Server on port ${p} exited with code ${t.exitStatus?.code}`;
              logger.error(msg);
              this._outputChannel.appendLine(msg);
              this._toaster.error(msg);
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
   * Start a terminal and attempt an import of `deephaven_server` to check if
   * servers can be managed from the extension.
   */
  checkPipInstall = async (): Promise<boolean> => {
    if (!PIP_SERVER_SUPPORTED_PLATFORMS.has(process.platform)) {
      return false;
    }

    if (this._checkPipInstallPromise == null) {
      this._checkPipInstallPromise = new Promise(async resolve => {
        const terminal = vscode.window.createTerminal({
          name: `Deephaven check pip server install`,
          isTransient: true,
        });

        // Give python extension time to setup .venv if configured
        await waitFor(PYTHON_ENV_WAIT);

        // Attempt to import deephaven_server to see if it's installed and exit
        // with code 2 if it fails.
        terminal.sendText(`python -c 'import deephaven_server;' || exit 2`);
        terminal.sendText('exit 0');

        const subscription = vscode.window.onDidCloseTerminal(
          t => {
            if (t === terminal) {
              subscription.dispose();

              resolve(t.exitStatus?.code === 0);
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
      this.disposeServers([port]);
    }

    this._pollers.delete(port);
    void this._serverManager.updateStatus([serverUrl]);
  };

  startServer = async (): Promise<void> => {
    const [port] = this.getAvailablePorts();

    if (port == null) {
      const msg = 'No available ports';
      logger.error(msg);
      this._outputChannel.appendLine(msg);
      this._toaster.error(msg);
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

    // In case user disposes terminal before server starts
    if (this._serverUrlTerminalMap.has(port)) {
      terminal.sendText(`python -c 'import deephaven_server;' || exit 2`);

      terminal.sendText(
        [
          'deephaven server',
          '--jvm-args "-DAuthHandlers=io.deephaven.auth.AnonymousAuthenticationHandler -Dprocess.info.system-info.enabled=false"',
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
