import * as vscode from 'vscode';
import type {
  IPanelService,
  IServerManager,
  ServerConnectionPanelNode,
} from '../types';
import { ServerTreeProviderBase } from './ServerTreeProviderBase';
import {
  getConnectionServerTreeItem,
  getConnectionTreeRootNodes,
  getConnectionWorkerLabel,
  getPanelConnectionTreeItem,
  getPanelVariableTreeItem,
  isServerStateNode,
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
    node: ServerConnectionPanelNode
  ): Promise<vscode.TreeItem> => {
    // Variable leaf node.
    if (Array.isArray(node)) {
      return getPanelVariableTreeItem(node);
    }

    // DHE server node grouping its worker connections.
    if (isServerStateNode(node)) {
      return getConnectionServerTreeItem(node);
    }

    // Worker (connection) node, nested under its server node. DHE workers use
    // their persistent-query name; DHC connections fall back to their server's
    // label so the single child mirrors its parent server node.
    const workerInfo = await this.serverManager.getWorkerInfo(node.serverUrl);
    const parentServer = this.serverManager.getServerForConnection(node);
    const label = getConnectionWorkerLabel(
      parentServer,
      node,
      workerInfo?.name
    );

    return getPanelConnectionTreeItem(
      node,
      getFirstSupportedConsoleType,
      label
    );
  };

  getChildren = (
    elementOrRoot?: ServerConnectionPanelNode
  ): vscode.ProviderResult<ServerConnectionPanelNode[]> => {
    // Root: one server node per server that has connections.
    if (elementOrRoot == null) {
      return getConnectionTreeRootNodes(this.serverManager);
    }

    // Variable leaf nodes have no children.
    if (Array.isArray(elementOrRoot)) {
      return [];
    }

    // Server node -> its worker connections.
    if (isServerStateNode(elementOrRoot)) {
      return this.serverManager
        .getConnections(elementOrRoot.url)
        .sort(sortByStringProp('serverUrl'));
    }

    // Connection node -> its panel variables.
    return [...this._panelService.getVariables(elementOrRoot.serverUrl)]
      .sort(sortByStringProp('title'))
      .map(variable => [elementOrRoot.serverUrl, variable]);
  };
}
