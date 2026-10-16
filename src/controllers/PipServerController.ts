import * as vscode from 'vscode';
import * as fs from 'node:fs';
import path from 'node:path';
import {
  getPythonEnvsExtensionApi,
  getPipServerUrl,
  Logger,
  PackageChangeKind,
  parsePort,
  rejectAfterTimeout,
  type PythonEnvironment,
  getPythonEnvironment,
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
  PIP_SERVER_LIST_PACKAGES_TIMEOUT_MS,
  PIP_SERVER_SUPPORTED_PLATFORMS,
} from '../common';
import { isDhcServerRunning } from '../dh/dhc';
import { pollUntilTrue } from '../services/PollingService';

const logger = new Logger('PipServerController');

/** PEP 503 normalized name of the package that provides the managed server. */
const DEEPHAVEN_SERVER_PACKAGE_NAME = 'deephaven-server';

/**
 * Normalize a Python package name for comparison per PEP 503. Package managers
 * are inconsistent about whether they report `deephaven-server` or
 * `deephaven_server`, so normalize before comparing.
 * @param name The package name to normalize.
 * @returns The normalized package name.
 */
function normalizePackageName(name: string): string {
  return name.replace(/[-_.]+/g, '-').toLowerCase();
}

/**
 * Get a key that uniquely identifies a Python environment. Environment ids are
 * only unique per environment manager.
 * @param environment The environment.
 * @returns The key or `undefined` if no environment.
 */
function getEnvironmentKey(
  environment: PythonEnvironment | undefined
): string | undefined {
  return environment == null
    ? undefined
    : `${environment.envId.managerId}:${environment.envId.id}`;
}

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
    this._pythonScopeUri = vscode.window.activeTextEditor?.document.uri;

    this.reconnectToExistingTerminals();

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

    void this.subscribeToPythonEnvChanges();
  }

  private readonly _context: vscode.ExtensionContext;
  private readonly _outputChannel: vscode.OutputChannel;
  private readonly _pollers: Map<Port, { cancel: () => void }>;
  private readonly _serverUrlTerminalMap: Map<Port, vscode.Terminal>;
  private readonly _serverManager: IServerManager;
  private readonly _toaster: IToastService;
  private _isPipServerInstalled = false;
  /** Incremented per package check so superseded results can be discarded. */
  private _pipInstallCheckId = 0;
  /** Key of the environment used by the most recent `checkPipInstall`. */
  private _lastEnvironmentKey: string | undefined;
  /**
   * Uri of the most recently active workspace file. Used to resolve the Python
   * environment. Only updated for text editors in a workspace folder so that
   * focusing a webview (e.g. a Deephaven panel) or a non-workspace document
   * doesn't change which environment is used.
   */
  private _pythonScopeUri: vscode.Uri | undefined;
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
   * Force a re-check of whether servers can be managed. Errors are logged
   * rather than left as unhandled rejections since callers are event handlers.
   */
  recheckPipInstall = (): void => {
    this.syncManagedServers({ forceCheck: true }).catch(err => {
      logger.error('Failed to re-check pip install:', err);
    });
  };

  /**
   * Subscribe to Python Environments extension events that can change whether
   * servers can be managed from the extension. If the extension is unavailable,
   * managed servers stay disabled and no subscriptions are made.
   */
  subscribeToPythonEnvChanges = async (): Promise<void> => {
    const api = await getPythonEnvsExtensionApi();

    if (api == null) {
      logger.debug(
        'Python Environments extension unavailable. Managed servers disabled.'
      );
      return;
    }

    // The active editor may have changed while the api was activating.
    const previousScopeUri = this._pythonScopeUri;
    if (
      this._updatePythonScopeUri(vscode.window.activeTextEditor) &&
      this._pythonScopeUri?.toString() !== previousScopeUri?.toString()
    ) {
      this.recheckPipInstall();
    }

    // Installing or removing `deephaven-server` in the active environment
    // toggles whether servers can be managed.
    api.onDidChangePackages(
      ({ changes }) => {
        const deephavenServerChanged = changes.some(
          ({ pkg, kind }) =>
            normalizePackageName(pkg.name) === DEEPHAVEN_SERVER_PACKAGE_NAME &&
            (kind === PackageChangeKind.add ||
              kind === PackageChangeKind.remove)
        );
        if (deephavenServerChanged) {
          this.recheckPipInstall();
        }
      },
      undefined,
      this._context.subscriptions
    );

    // Selecting a different interpreter (venv -> uv, etc.) swaps the set of
    // installed packages, so re-check availability against the new environment.
    api.onDidChangeEnvironment(
      () => {
        this.recheckPipInstall();
      },
      undefined,
      this._context.subscriptions
    );

    // Python Environments selects environments per Python project, so switching
    // to a file in a different project can change the environment.
    vscode.window.onDidChangeActiveTextEditor(
      async editor => {
        if (!this._updatePythonScopeUri(editor)) {
          return;
        }

        try {
          const environment = await getPythonEnvironment(
            api,
            this._pythonScopeUri
          );
          if (getEnvironmentKey(environment) !== this._lastEnvironmentKey) {
            this.recheckPipInstall();
          }
        } catch (err) {
          logger.error('Failed to resolve Python environment:', err);
        }
      },
      undefined,
      this._context.subscriptions
    );
  };

  /**
   * Update `_pythonScopeUri` if the editor is in a workspace folder.
   * @returns True if updated.
   */
  private _updatePythonScopeUri = (
    editor: vscode.TextEditor | undefined
  ): boolean => {
    const uri = editor?.document.uri;
    if (uri == null || vscode.workspace.getWorkspaceFolder(uri) == null) {
      return false;
    }

    this._pythonScopeUri = uri;
    return true;
  };

  /**
   * Check whether `deephaven-server` is installed in the active Python
   * environment to determine if servers can be managed from the extension.
   * @param options Optional options:
   *  - skipCache If true, bypass the package manager cache.
   */
  checkPipInstall = async ({
    skipCache = false,
  }: { skipCache?: boolean } = {}): Promise<
    | { isAvailable: true; environment: PythonEnvironment }
    | { isAvailable: false; environment?: never }
  > => {
    if (!PIP_SERVER_SUPPORTED_PLATFORMS.has(process.platform)) {
      logger.debug(`Pip server not supported on platform: ${process.platform}`);
      return { isAvailable: false };
    }

    logger.debug('Checking pip install');

    const api = await getPythonEnvsExtensionApi();
    if (api == null) {
      return { isAvailable: false };
    }

    const checkId = this._pipInstallCheckId;
    let environment;
    try {
      environment = await getPythonEnvironment(api, this._pythonScopeUri);
    } catch (err) {
      logger.debug('Failed to resolve Python environment:', err);
      return { isAvailable: false };
    }

    if (checkId === this._pipInstallCheckId) {
      this._lastEnvironmentKey = getEnvironmentKey(environment);
    }

    if (environment == null) {
      logger.debug('No active Python environment');
      return { isAvailable: false };
    }

    logger.debug(
      'Using Python interpreter:',
      environment.execInfo.run.executable
    );

    // Package lists are cached. Bypass the cache on an explicit re-check so
    // that packages installed outside of VS Code get picked up.
    // Bound the call with a timeout so a stuck package manager can't leave
    // managed server status unresolved.
    const timeoutDisposables: vscode.Disposable[] = [];
    let packages;
    try {
      packages = await Promise.race([
        api.getPackages(environment, { skipCache }),
        rejectAfterTimeout(
          PIP_SERVER_LIST_PACKAGES_TIMEOUT_MS,
          `Timed out listing packages after ${PIP_SERVER_LIST_PACKAGES_TIMEOUT_MS}ms`,
          timeoutDisposables
        ),
      ]);
    } catch (err) {
      // Listing packages shells out to the underlying package manager, which
      // can fail for reasons unrelated to Deephaven. Treat it as "unavailable"
      // rather than failing the surrounding server status refresh.
      logger.debug('Failed to list packages:', err);
      return { isAvailable: false };
    } finally {
      timeoutDisposables.forEach(d => d.dispose());
    }

    const hasDeephavenServer = packages?.some(
      pkg => normalizePackageName(pkg.name) === DEEPHAVEN_SERVER_PACKAGE_NAME
    );

    if (!hasDeephavenServer) {
      logger.debug(
        `${DEEPHAVEN_SERVER_PACKAGE_NAME} not installed in active environment`
      );
      return { isAvailable: false };
    }

    logger.debug(
      `${DEEPHAVEN_SERVER_PACKAGE_NAME} installed in active environment`
    );

    return { isAvailable: true, environment };
  };

  /**
   * There's not a a dependable way to close terminals when extension is
   * deactivated. In cases where the extension is updated, this can result in
   * orphaned terminals running pip servers. We can identify any existing pip
   * server terminals and reconnect to them to avoid the orphans.
   */
  reconnectToExistingTerminals = async (): Promise<void> => {
    const PIP_SERVER_TERMINAL_NAME_REGEX = /Deephaven \((\d+)\)/;

    for (const terminal of vscode.window.terminals) {
      const [, portStr] =
        PIP_SERVER_TERMINAL_NAME_REGEX.exec(terminal.name) ?? [];

      logger.debug('terminal name:', terminal.name, 'portStr:', portStr);

      if (portStr != null) {
        logger.debug('Found existing pip server terminal:', terminal.name);
        const port = parsePort(portStr);
        this._serverUrlTerminalMap.set(port, terminal);
      }
    }

    // Also serves as the initial availability check.
    await this.syncManagedServers();

    for (const port of this._serverUrlTerminalMap.keys()) {
      await this.pollUntilServerStarts(port);
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
        return isDhcServerRunning(serverUrl, logger);
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
    const checkId = ++this._pipInstallCheckId;
    const { isAvailable, environment } = await this.checkPipInstall();

    if (checkId !== this._pipInstallCheckId) {
      this._logAndShowError(
        'Python environment changed while starting server. Please try again.'
      );
      return;
    }

    this._isPipServerInstalled = isAvailable;

    if (!isAvailable) {
      this._logAndShowError('Pip server environment no longer available.');
      return;
    }

    const interpreterBinDirPath = path.dirname(
      environment.execInfo.run.executable
    );

    const { managerId } = environment.envId;
    const { sysPrefix } = environment;
    const isConda = managerId.endsWith(':conda');
    const isVenv = fs.existsSync(path.join(sysPrefix, 'pyvenv.cfg'));

    // Create the terminal directly rather than through the Python Environments
    // `createTerminal` api. In its default `command` activation mode, that api
    // calls `terminal.show()` regardless of `hideFromUser` and then skips
    // activation for hidden terminals, so we'd get a visible, unactivated
    // terminal. Keeping the terminal hidden ensures that activation commands do
    // not interfere with the pip server process.
    const terminal = vscode.window.createTerminal({
      name: `Deephaven (${port})`,
      env: {
        /* eslint-disable @typescript-eslint/naming-convention */
        // Mimic environment activation by putting the environment's bin dir
        // first on the PATH. Note that this does not run conda `activate.d`
        // scripts (e.g. `JAVA_HOME` set by conda's `openjdk` package).
        PATH: `${interpreterBinDirPath}${path.delimiter}${process.env.PATH}`,
        // Set the workspace root as PYTHONPATH so we can use Python modules in
        // the workspace.
        PYTHONPATH: './',
        // `null` unsets values inherited from VS Code's environment.
        CONDA_PREFIX: isConda ? sysPrefix : null,
        VIRTUAL_ENV: isVenv ? sysPrefix : null,
        /* eslint-enable @typescript-eslint/naming-convention */
      },
      isTransient: true,
      // Environment activation commands injected into visible terminals can
      // race with and kill the pip server process. Hiding the terminal prevents
      // activation from being injected. Server output is sent to the
      // Output -> Deephaven panel, so the terminal doesn't need to be visible.
      hideFromUser: true,
    });
    this._serverUrlTerminalMap.set(port, terminal);
    await this.syncManagedServers();

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
  };

  stopServer = async (url: URL): Promise<void> => {
    this._serverManager.disconnectFromServer(url);

    const port = parsePort(url.port);

    await this.disposeServers([port]);
  };

  /**
   * Sync current managed server state with the server manager.
   * @param options Optional options:
   *  - forceCheck If true, force a re-check of pip server availability
   */
  syncManagedServers = async ({
    forceCheck = false,
  }: {
    forceCheck?: boolean;
  } = {}): Promise<void> => {
    if (forceCheck || !this._isPipServerInstalled) {
      const checkId = ++this._pipInstallCheckId;
      const { isAvailable } = await this.checkPipInstall({
        skipCache: forceCheck,
      });

      // A newer check started while this one was in flight. Let it win.
      if (checkId !== this._pipInstallCheckId) {
        logger.debug('Discarding superseded pip install check');
        return;
      }

      this._isPipServerInstalled = isAvailable;
    }

    this._serverManager.canStartServer =
      this._isPipServerInstalled && this.getNextAvailablePort() != null;

    const runningPorts = [...this._serverUrlTerminalMap.keys()];

    // Reuse stored PSKs so reconnected terminals stay authenticated even if
    // a newer sync supersedes the reconnect sync.
    await this._serverManager.syncManagedServers(
      runningPorts.map(getPipServerUrl),
      true
    );
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
