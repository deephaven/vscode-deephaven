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

    const hasUris = this.serverManager.hasConnectionUris(node);

    // Identify connections created by the extension or in-flight placeholders
    const isOwned = isInstanceOf(node, DhcService) ? node.isOwned : true;

    // Connection node
    return {
      label: node.label,
      contextValue: node.isConnected
        ? CONNECTION_TREE_ITEM_CONTEXT.isConnectionConnected(isOwned)
        : CONNECTION_TREE_ITEM_CONTEXT.isConnectionConnecting(isOwned),
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
    // Root: one server node per server that has connections.
    if (elementOrRoot == null) {
      return getConnectionTreeRootNodes(this.serverManager);
    }

    // Uri leaf nodes have no children.
    if (elementOrRoot instanceof vscode.Uri) {
      return [];
    }

    // Server node -> its worker connections.
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

    // Connection node -> its parent server.
    return this.serverManager.getServerForConnection(element) ?? null;
  };
}
