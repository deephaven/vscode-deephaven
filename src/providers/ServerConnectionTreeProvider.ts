import * as vscode from 'vscode';
import { ServerTreeProviderBase } from './ServerTreeProviderBase';
import { CONNECTION_TREE_ITEM_CONTEXT, ICON_ID } from '../common';
import type { ConsoleType, ServerConnectionNode } from '../types';
import {
  getConnectionServerTreeItem,
  getConnectionTreeRootNodes,
  getConsoleTypeIconId,
  isInstanceOf,
  isServerStateNode,
  sortByStringProp,
} from '../util';
import { DhcService } from '../services';
import { getServerMatchPortIfLocalHost } from '../mcp/utils';

/**
 * Provider for the server connection tree view.
 */
export class ServerConnectionTreeProvider extends ServerTreeProviderBase<ServerConnectionNode> {
  getTreeItem = async (
    node: ServerConnectionNode
  ): Promise<vscode.TreeItem> => {
    // Uri node associated with a parent connection node
    if (node instanceof vscode.Uri) {
      return {
        description: node.path,
        contextValue: CONNECTION_TREE_ITEM_CONTEXT.isUri,
        command: {
          command: 'vscode.open',
          title: 'Open Uri',
          arguments: [node],
        },
        resourceUri: node,
      };
    }

    // DHE server node grouping its worker connections.
    if (isServerStateNode(node)) {
      return getConnectionServerTreeItem(node);
    }

    // Console type (language) drives the node icon rather than the description.
    let consoleType: ConsoleType | undefined;
    if (isInstanceOf(node, DhcService) && node.isInitialized) {
      [consoleType] = await node.getConsoleTypes();
    }

    // Prefer the persistent query name (what the DHE Query Monitor shows) over
    // the local correlation tagId. Attached workers get a synthesized random
    // tagId that matches nothing server-side, and created workers' tagId can
    // diverge from their query name; the PQ name is the stable identifier in
    // both cases. Falls back to tagId for plain DHC connections, which have no
    // associated WorkerInfo.
    const workerInfo = await this.serverManager.getWorkerInfo(node.serverUrl);
    const workerName = workerInfo?.name ?? node.tagId ?? '';

    const hasUris = this.serverManager.hasConnectionUris(node);

    // DHE worker nodes are nested under their server node, so the worker name
    // becomes the node label and the server label lives on the parent. Flat DHC
    // connections keep the server label as the node label and show the worker
    // name as the description.
    const isWorkerChild =
      this.serverManager.getServerForConnection(node) != null;

    const serverLabel = getServerMatchPortIfLocalHost(
      this.serverManager,
      node.serverUrl
    )?.label;

    const label = isWorkerChild
      ? workerName
      : (serverLabel ?? node.serverUrl.host);

    const description = isWorkerChild ? undefined : workerName;

    // Connection node
    return {
      label,
      description,
      contextValue: node.isConnected
        ? CONNECTION_TREE_ITEM_CONTEXT.isConnectionConnected
        : CONNECTION_TREE_ITEM_CONTEXT.isConnectionConnecting,
      collapsibleState: hasUris
        ? vscode.TreeItemCollapsibleState.Expanded
        : undefined,
      // Show the language (Python/Groovy) icon when idle/connected; show the
      // spinner while busy (connecting or running code).
      iconPath: new vscode.ThemeIcon(
        node.isRunningCode || !node.isConnected
          ? ICON_ID.connecting
          : getConsoleTypeIconId(consoleType)
      ),
    };
  };

  getChildren = (
    elementOrRoot?: ServerConnectionNode
  ): vscode.ProviderResult<ServerConnectionNode[]> => {
    // Root: DHE server nodes + flat DHC connection nodes.
    if (elementOrRoot == null) {
      return getConnectionTreeRootNodes(this.serverManager);
    }

    // Uri leaf nodes have no children.
    if (elementOrRoot instanceof vscode.Uri) {
      return [];
    }

    // DHE server node -> its worker connections.
    if (isServerStateNode(elementOrRoot)) {
      return this.serverManager
        .getConnections(elementOrRoot.url)
        .sort(sortByStringProp('serverUrl'));
    }

    // Connection node -> its editor uris.
    return this.serverManager.getConnectionUris(elementOrRoot);
  };

  /**
   * Get the parent of the given element. Note that this is required in order
   * for `TreeView.reveal` method to work.
   * @param element
   */
  getParent = (element: ServerConnectionNode): ServerConnectionNode | null => {
    if (element instanceof vscode.Uri) {
      return this.serverManager.getUriConnection(element);
    }

    if (isServerStateNode(element)) {
      return null;
    }

    // Connection node -> its parent DHE server (or null for flat DHC).
    return this.serverManager.getServerForConnection(element) ?? null;
  };
}
