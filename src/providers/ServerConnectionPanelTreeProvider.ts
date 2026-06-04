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
  getPanelConnectionTreeItem,
  getPanelVariableTreeItem,
  isServerStateNode,
  sortByStringProp,
} from '../util';
import { getFirstSupportedConsoleType } from '../services';
import { getServerMatchPortIfLocalHost } from '../mcp/utils';

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

    const serverLabel = getServerMatchPortIfLocalHost(
      this.serverManager,
      node.serverUrl
    )?.label;

    const workerInfo = await this.serverManager.getWorkerInfo(node.serverUrl);

    // DHE worker nodes are nested under their server node (worker name as the
    // label); flat DHC connections keep the server label.
    const isWorkerChild = this.serverManager.getServerForConnection(node) != null;

    return getPanelConnectionTreeItem(
      node,
      getFirstSupportedConsoleType,
      serverLabel,
      workerInfo?.name,
      isWorkerChild
    );
  };

  getChildren = (
    elementOrRoot?: ServerConnectionPanelNode
  ): vscode.ProviderResult<ServerConnectionPanelNode[]> => {
    // Root: DHE server nodes + flat DHC connection nodes.
    if (elementOrRoot == null) {
      return getConnectionTreeRootNodes(this.serverManager);
    }

    // Variable leaf nodes have no children.
    if (Array.isArray(elementOrRoot)) {
      return [];
    }

    // DHE server node -> its worker connections.
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
