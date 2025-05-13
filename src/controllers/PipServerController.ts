import * as vscode from 'vscode';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  getMsPythonExtensionApi,
  getPipServerUrl,
  Logger,
  parsePort,
} from '../util';
import type {
  IDisposable,
  Port,
  IServerManager,
  IToastService,
} from '../types';
import {
  PIP_SERVER_STATUS_CHECK_INTERVAL,
  PIP_SERVER_STATUS_CHECK_TIMEOUT,
  PIP_SERVER_SUPPORTED_PLATFORMS,
} from '../common';
import { isDhcServerRunning } from '../dh/dhc';
import { pollUntilTrue } from '../services';

const logger = new Logger('PipServerController');

export class PipServerController implements IDisposable {
  constructor(
    context: vscode.ExtensionContext,
    serverManager: IServerManager,
    outputChannel: vscode.OutputChannel,
    toastService: IToastService
  ) {
    this._context = context;
    this._pollers = new Map();
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

    this._serverManager.onDidLoadConfig(this.onDidLoadConfig);
  }

  private readonly _context: vscode.ExtensionContext;
  private readonly _outputChannel: vscode.OutputChannel;
  private readonly _pollers: Map<Port, { cancel: () => void }>;
  private readonly _serverUrlTerminalMap: Map<Port, vscode.Terminal>;
  private readonly _serverManager: IServerManager;
  private readonly _toaster: IToastService;
  private _isPipServerInstalled = false;
  private _reservedPorts: ReadonlySet<Port> = new Set();

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
   * Attempt an import of `deephaven_server` to check if
   * servers can be managed from the extension.
   */
  checkPipInstall = async (): Promise<
    | { isAvailable: true; interpreterPath: string }
    | { isAvailable: false; interpreterPath?: never }
  > => {
    if (!PIP_SERVER_SUPPORTED_PLATFORMS.has(process.platform)) {
      logger.debug(`Pip server not supported on platform: ${process.platform}`);
      return { isAvailable: false };
    }

    logger.debug('Checking pip install');

    const pythonInterpreterPath = await this.getPythonInterpreterPath();
    if (pythonInterpreterPath == null) {
      return { isAvailable: false };
    }

    try {
      execFileSync(pythonInterpreterPath, ['-c', 'import deephaven_server']);
      return { isAvailable: true, interpreterPath: pythonInterpreterPath };
    } catch (err) {
      return { isAvailable: false };
    }
  };

  /**
   * Gets the next available port for starting a pip server.
   * @returns A port number or `null` if no ports are available.
   */
  getNextAvailablePort = (): Port | null => {
    for (let i = 10000; i < 10050; ++i) {
      if (
        !this._serverUrlTerminalMap.has(i as Port) &&
        !this._reservedPorts.has(i as Port)
      ) {
        return i as Port;
      }
    }

    return null;
  };

  /**
   * Get Python interpreter path from the MS Python extension.
   * @returns The Python interpreter path or `null` if not found.
   */
  getPythonInterpreterPath = async (): Promise<string | null> => {
    const pythonExtension = getMsPythonExtensionApi();

    if (pythonExtension == null) {
      logger.debug('Python extension not found');
      return null;
    }

    if (!pythonExtension.isActive) {
      await pythonExtension.activate();
    }

    const pythonApi = pythonExtension.exports;
    const interpreter = await pythonApi.environments.getActiveEnvironmentPath();
    logger.debug('Python interpreter:', interpreter);

    return interpreter?.path ?? null;
  };

  /**
   * Whenever server config loads, reserve any ports that are explicitly
   * configured.
   */
  onDidLoadConfig = (): void => {
    const servers = this._serverManager.getServers();

    const reservedPorts = new Set<Port>();
    const toDispose = new Set<Port>();

    for (const server of servers) {
      const port = parsePort(server.url.port);

      reservedPorts.add(port);

      // If an existing pip managed server port has become explicitly configured,
      // mark it for disposal.
      if (!server.isManaged && this._serverUrlTerminalMap.has(port)) {
        toDispose.add(port);
      }
    }

    this._reservedPorts = reservedPorts;

    if (toDispose.size > 0) {
      this.disposeServers(toDispose);
    }
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
    const port = this.getNextAvailablePort();

    if (port == null) {
      this._logAndShowError('No available ports');
      return;
    }

    // In case pip env has changed since last server check
    const { isAvailable, interpreterPath } = await this.checkPipInstall();
    this._isPipServerInstalled = isAvailable;

    if (!isAvailable) {
      this._logAndShowError('Pip server environment no longer available.');
      return;
    }

    const terminal = vscode.window.createTerminal({
      name: `Deephaven (${port})`,
      env: {
        /* eslint-disable @typescript-eslint/naming-convention */
        // This allows us to use the `venv` configured by the Python extension
        // without having to wait for the extension to activate it.
        PATH: path.dirname(interpreterPath),
        // Set the workspace root as PYTHONPATH so we can use Python modules in
        // the workspace
        PYTHONPATH: './',
        /* eslint-enable @typescript-eslint/naming-convention */
      },
      isTransient: true,
    });

    this._serverUrlTerminalMap.set(port, terminal);
    this.syncManagedServers();

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

    // const venvPath = path.dirname(interpreterPath);
    // terminal.sendText(`export PATH=${venvPath}:$PATH`);
    terminal.sendText(
      [
        'deephaven server',
        `--jvm-args "${jvmArgsStr}"`,
        `--port ${port}`,
        '--no-browser',
      ].join(' ')
    );

    await this.pollUntilServerStarts(port);
  };

  stopServer = async (url: URL): Promise<void> => {
    this._serverManager.disconnectFromServer(url);

    const port = parsePort(url.port);

    await this.disposeServers([port]);
  };

  syncManagedServers = async (): Promise<void> => {
    if (!this._isPipServerInstalled) {
      this._isPipServerInstalled = (await this.checkPipInstall()).isAvailable;
    }

    this._serverManager.canStartServer =
      this._isPipServerInstalled && this.getNextAvailablePort() != null;

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
      this._serverUrlTerminalMap.delete(port);

      if (terminal != null && terminal.exitStatus == null) {
        // One time subscription to update server status after terminal is closed
        const oneTime = vscode.window.onDidCloseTerminal(t => {
          if (t === terminal) {
            oneTime.dispose();
            this._serverManager.updateStatus();
          }
        });

        // Send ctrl+c to stop pip server, then exit the terminal. This allows
        // `onDidCloseTerminal` to fire once the server is actually stopped vs
        // `terminal.dispose()` which will fire `onDidCloseTerminal` immediately
        // before the server process has actually finished exiting.
        const ctrlC = String.fromCharCode(3);
        terminal.sendText(ctrlC);
        terminal.sendText('exit');
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
