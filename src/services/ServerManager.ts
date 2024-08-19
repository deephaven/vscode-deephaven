import * as vscode from 'vscode';
import {
  ConsoleType,
  SERVER_STATUS_CHECK_INTERVAL,
  type ServerState,
} from '../common';
import { isDhcServerRunning } from '../dh/dhc';
import { isDheServerRunning } from '../dh/dhe';
import type {
  IConfigService,
  IDhService,
  IDhServiceFactory,
  IServerManager,
  IToastService,
} from './types';
import { getInitialServerStates } from '../util/serverUtils';
import { PollingService } from './PollingService';
import { Logger } from '../util';

const logger = new Logger('ServerManager');

export class ServerManager implements IServerManager {
  private _outputChannel: vscode.OutputChannel;
  private _poller: PollingService;
  private _serverMap: Map<string, ServerState>;
  private _connectionMap: Map<string, IDhService>;
  private _dhcServiceFactory: IDhServiceFactory;
  private _toaster: IToastService;
  private _uriConnectionsMap: Map<vscode.Uri, IDhService>;

  private _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  constructor(
    configService: IConfigService,
    dhcServiceFactory: IDhServiceFactory,
    outputChannel: vscode.OutputChannel,
    toaster: IToastService
  ) {
    this._dhcServiceFactory = dhcServiceFactory;
    this._outputChannel = outputChannel;
    this._toaster = toaster;

    const initialDhcServerState = getInitialServerStates(
      'DHC',
      configService.getCoreServers()
    );

    const initialDheServerState = getInitialServerStates(
      'DHE',
      configService.getEnterpriseServers()
    );

    this._serverMap = new Map(
      [...initialDhcServerState, ...initialDheServerState].map(state => [
        state.url,
        state,
      ])
    );

    this._connectionMap = new Map();
    this._uriConnectionsMap = new Map();
    this._poller = new PollingService();
  }

  connectToServer = async (serverUrl: string): Promise<void> => {
    if (this.hasConnection(serverUrl)) {
      logger.info('Already connected to server:', serverUrl);
      return;
    }

    const serverState = this._serverMap.get(serverUrl);

    // TODO: implement DHE
    if (serverState == null || serverState.type !== 'DHC') {
      return;
    }

    const connection = this._dhcServiceFactory.create(serverUrl);

    this._connectionMap.set(serverUrl, connection);
    this._onDidUpdate.fire();

    if (!(await connection.initDh())) {
      this._connectionMap.delete(serverUrl);
    }

    this._onDidUpdate.fire();
  };

  disconnectFromServer = async (serverUrl: string): Promise<void> => {
    const connection = this._connectionMap.get(serverUrl);

    if (connection == null) {
      return;
    }

    this._connectionMap.delete(serverUrl);
    this._uriConnectionsMap.forEach((dhService, uri) => {
      if (dhService === connection) {
        this._uriConnectionsMap.delete(uri);
      }
    });

    await connection.dispose();

    this._outputChannel.appendLine(`Disconnected from server: '${serverUrl}'.`);

    this._onDidUpdate.fire();
  };

  hasConnection = (serverUrl: string): boolean => {
    return this._connectionMap.has(serverUrl);
  };

  getServers = (): ServerState[] => {
    // Start polling server status the first time servers are requested.
    // TBD: Is there a way to stop this when the servers list goes out of view?
    if (!this._poller.isRunning) {
      this._poller.start(this.updateStatus, SERVER_STATUS_CHECK_INTERVAL);
    }

    return [...this._serverMap.values()];
  };

  getConnections = (): IDhService[] => {
    return [...this._connectionMap.values()];
  };

  getEditorConnection = async (
    editor: vscode.TextEditor
  ): Promise<IDhService | null> => {
    const uri = editor.document.uri;

    if (!this._uriConnectionsMap.has(uri)) {
      // Default to first connection supporting the console type
      const [dhService] = await this.consoleTypeConnections(
        editor.document.languageId as ConsoleType
      );

      if (dhService != null) {
        this._uriConnectionsMap.set(uri, dhService);
      }
    }

    const dhService = this._uriConnectionsMap.get(uri);

    if (dhService == null) {
      const logMsg = `No active connection found supporting '${editor.document.languageId}' console type.`;
      logger.debug(logMsg);
      this._outputChannel.appendLine(logMsg);
      this._toaster.error(logMsg);
      return null;
    }

    return dhService;
  };

  consoleTypeConnections = async (
    consoleType: ConsoleType
  ): Promise<IDhService[]> => {
    const connections: IDhService[] = [];

    for (const dhService of this._connectionMap.values()) {
      const consoleTypes = await dhService.getConsoleTypes();

      if (consoleTypes.has(consoleType)) {
        connections.push(dhService);
      }
    }

    return connections;
  };

  updateStatus = async (): Promise<void> => {
    const promises = this.getServers().map(server =>
      (server.type === 'DHC'
        ? isDhcServerRunning(server.url)
        : isDheServerRunning(server.url)
      ).then(isRunning => {
        this._serverMap.set(server.url, { ...server, isRunning });
        if ((server.isRunning ?? false) !== isRunning) {
          // If server goes from running to stopped, get rid of any active
          // connections to it.
          if (!isRunning) {
            this.disconnectFromServer(server.url);
          }

          this._onDidUpdate.fire();
        }
      })
    );

    await Promise.all(promises);
  };

  async dispose(): Promise<void> {}
}
