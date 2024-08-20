import * as vscode from 'vscode';
import { TreeDataProviderBase } from './TreeDataProviderBase';
import { CONNECTION_TREE_ITEM_CONTEXT, ICON_ID } from '../common';
import type { IDhService, ServerConnectionNode } from '../types';

/**
 * Provider for the server connection tree view.
 */
export class ServerConnectionTreeProvider extends TreeDataProviderBase<ServerConnectionNode> {
  async getTreeItem(
    connectionOrUri: ServerConnectionNode
  ): Promise<vscode.TreeItem> {
    // Uri node associated with a parent connection node
    if (connectionOrUri instanceof vscode.Uri) {
      return {
        description: connectionOrUri.path,
        command: {
          command: 'vscode.open',
          title: 'Open Uri',
          arguments: [connectionOrUri],
        },
        resourceUri: connectionOrUri,
      };
    }

    const [consoleType] = connectionOrUri.isInitialized
      ? await connectionOrUri.getConsoleTypes()
      : [];

    const hasUris = this.serverManager.hasConnectionUris(connectionOrUri);

    // Connection node
    return {
      label: new URL(connectionOrUri.serverUrl.toString()).host,
      description: consoleType,
      contextValue: CONNECTION_TREE_ITEM_CONTEXT.isConnection,
      collapsibleState: hasUris
        ? vscode.TreeItemCollapsibleState.Expanded
        : undefined,
      iconPath: new vscode.ThemeIcon(
        connectionOrUri.isConnected ? ICON_ID.connected : ICON_ID.connecting
      ),
    };
  }

  getChildren = (
    elementOrRoot?: IDhService
  ): vscode.ProviderResult<IDhService[] | vscode.Uri[]> => {
    if (elementOrRoot == null) {
      return this.serverManager
        .getConnections()
        .sort((a, b) =>
          a.serverUrl.toString().localeCompare(b.serverUrl.toString())
        );
    }

    return this.serverManager.getConnectionUris(elementOrRoot);
  };

  /**
   * Get the parent of the given element. Note that this is required in order
   * for `TreeView.reveal` method to work.
   * @param element
   */
  getParent = (element: ServerConnectionNode): IDhService | null => {
    if (element instanceof vscode.Uri) {
      return this.serverManager.getUriConnection(element);
    }

    return null;
  };
}
