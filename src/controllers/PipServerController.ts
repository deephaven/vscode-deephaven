import * as vscode from 'vscode';
import { Logger } from '../util';
import type { Disposable, IServerManager, IToastService } from '../types';
import { PIP_SERVER_SUPPORTED_PLATFORMS } from '../common';

const logger = new Logger('PipServerController');

type Port = number;

export class PipServerController implements Disposable {
  constructor(
    context: vscode.ExtensionContext,
    serverManager: IServerManager,
    portRange: number[],
    outputChannel: vscode.OutputChannel,
    toastService: IToastService
  ) {
    this._context = context;
    this._portRange = new Set(portRange);
    this._serverUrlTerminalMap = new Map();
    this._serverManager = serverManager;
    this._outputChannel = outputChannel;
    this._toaster = toastService;

    vscode.window.onDidCloseTerminal(
      terminal => {
        for (const [p, t] of this._serverUrlTerminalMap.entries()) {
          if (t === terminal) {
            this._serverUrlTerminalMap.delete(p);
            this.syncManagedServers();
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
  private readonly _portRange: Set<Port>;
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
        await waitFor(1500);

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
    await waitFor(1000);

    terminal.sendText(`python -c 'import deephaven_server;' || exit 2`);

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

    const terminal = this._serverUrlTerminalMap.get(port);

    if (terminal == null) {
      return;
    }

    terminal.dispose();
    this._serverUrlTerminalMap.delete(port);

    this.syncManagedServers();
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

    this._serverManager.syncManagedServers(
      runningPorts.map(port => new URL(`http://localhost:${port}`))
    );
  };

  dispose = async (): Promise<void> => {
    for (const terminal of this._serverUrlTerminalMap.values()) {
      terminal.dispose();
    }
    this._serverUrlTerminalMap.clear();

    await this.syncManagedServers();
  };
}

function waitFor(waitMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, waitMs));
}
