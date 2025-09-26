import * as vscode from 'vscode';
import type {
  IPanelService,
  IServerManager,
  ConnectionState,
  ServerConnectionPanelNode,
} from '../types';
import { ServerTreeProviderBase } from './ServerTreeProviderBase';
import {
  getPanelConnectionTreeItem,
  getPanelVariableTreeItem,
  sortByStringProp,
} from '../util';
import { getFirstSupportedConsoleType } from '../services';

export class ServerConnectionPanelTreeProvider extends ServerTreeProviderBase<ServerConnectionPanelNode> {
  constructor(serverManager: IServerManager, panelService: IPanelService) {
    super(serverManager);
    this._panelService = panelService;

    this._panelService.onDidUpdate(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  private readonly _panelService: IPanelService;

  getTreeItem = async (
    connectionOrVariable: ServerConnectionPanelNode
  ): Promise<vscode.TreeItem> => {
    if (Array.isArray(connectionOrVariable)) {
      return getPanelVariableTreeItem(connectionOrVariable);
    }

    const serverLabel = this.serverManager.getServer(
      connectionOrVariable.serverUrl,
      false
    )?.label;

    return getPanelConnectionTreeItem(
      connectionOrVariable,
      getFirstSupportedConsoleType,
      serverLabel
    );
  };

  getChildren = (
    connectionOrRoot?: ConnectionState
  ): vscode.ProviderResult<ServerConnectionPanelNode[]> => {
    if (connectionOrRoot == null) {
      return this.serverManager
        .getConnections()
        .sort(sortByStringProp('serverUrl'));
    }

    return [...this._panelService.getVariables(connectionOrRoot.serverUrl)]
      .sort(sortByStringProp('title'))
      .map(variable => [connectionOrRoot.serverUrl, variable]);
  };
}
