import * as vscode from 'vscode';
import { TreeDataProviderBase } from './TreeDataProviderBase';
import { CONNECTION_TREE_ITEM_CONTEXT, ICON_ID } from '../common';
import type {
  IDhcService,
  ConnectionState,
  ServerConnectionNode,
} from '../types';
import { isInstanceOf, sortByStringProp } from '../util';
import { DhcService } from '../services';

/**
 * Provider for the server connection tree view.
 */
export class ServerConnectionTreeProvider extends TreeDataProviderBase<ServerConnectionNode> {
  getTreeItem = async (
    connectionOrUri: ServerConnectionNode
  ): Promise<vscode.TreeItem> => {
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

    const descriptionTokens: string[] = [];

    if (
      isInstanceOf(connectionOrUri, DhcService) &&
      connectionOrUri.isInitialized
    ) {
      const [consoleType] = await connectionOrUri.getConsoleTypes();
      if (consoleType) {
        descriptionTokens.push(consoleType);
      }
    }

    if (connectionOrUri.tagId) {
      descriptionTokens.push(connectionOrUri.tagId);
    }

    const hasUris = this.serverManager.hasConnectionUris(connectionOrUri);

    const serverLabel = this.serverManager.getServer(
      connectionOrUri.serverUrl,
      false
    )?.label;

    const label =
      serverLabel == null
        ? connectionOrUri.serverUrl.host
        : `${serverLabel}:${connectionOrUri.serverUrl.port}`;

    // Connection node
    return {
      label,
      description: descriptionTokens.join(' - '),
      contextValue: CONNECTION_TREE_ITEM_CONTEXT.isConnection,
      collapsibleState: hasUris
        ? vscode.TreeItemCollapsibleState.Expanded
        : undefined,
      iconPath: new vscode.ThemeIcon(
        connectionOrUri.isConnected ? ICON_ID.connected : ICON_ID.connecting
      ),
    };
  };

  getChildren = (
    elementOrRoot?: IDhcService
  ): vscode.ProviderResult<ServerConnectionNode[]> => {
    if (elementOrRoot == null) {
      return this.serverManager
        .getConnections()
        .sort(sortByStringProp('serverUrl'));
    }

    return this.serverManager.getConnectionUris(elementOrRoot);
  };

  /**
   * Get the parent of the given element. Note that this is required in order
   * for `TreeView.reveal` method to work.
   * @param element
   */
  getParent = (element: ServerConnectionNode): ConnectionState | null => {
    if (element instanceof vscode.Uri) {
      return this.serverManager.getUriConnection(element);
    }

    return null;
  };
}
