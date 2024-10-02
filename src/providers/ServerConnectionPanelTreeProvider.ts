import * as vscode from 'vscode';
import type {
  IPanelService,
  IServerManager,
  ServerConnection,
  ServerConnectionPanelNode,
} from '../types';
import { TreeDataProviderBase } from './TreeDataProviderBase';
import {
  getPanelConnectionTreeItem,
  getPanelVariableTreeItem,
  sortByStringProp,
} from '../util';

export class ServerConnectionPanelTreeProvider extends TreeDataProviderBase<ServerConnectionPanelNode> {
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

    return getPanelConnectionTreeItem(connectionOrVariable);
  };

  getChildren = (
    connectionOrRoot?: ServerConnection
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
