import * as vscode from 'vscode';
import { ServerTreeProviderBase } from './ServerTreeProviderBase';
import { CONNECTION_TREE_ITEM_CONTEXT, ICON_ID } from '../common';
import type {
  IDhcService,
  ConnectionState,
  ConsoleType,
  ServerConnectionNode,
} from '../types';
import {
  getConsoleTypeIconId,
  isInstanceOf,
  sortByStringProp,
} from '../util';
import { DhcService } from '../services';
import { getServerMatchPortIfLocalHost } from '../mcp/utils';

/**
 * Provider for the server connection tree view.
 */
export class ServerConnectionTreeProvider extends ServerTreeProviderBase<ServerConnectionNode> {
  getTreeItem = async (
    connectionOrUri: ServerConnectionNode
  ): Promise<vscode.TreeItem> => {
    // Uri node associated with a parent connection node
    if (connectionOrUri instanceof vscode.Uri) {
      return {
        description: connectionOrUri.path,
        contextValue: CONNECTION_TREE_ITEM_CONTEXT.isUri,
        command: {
          command: 'vscode.open',
          title: 'Open Uri',
          arguments: [connectionOrUri],
        },
        resourceUri: connectionOrUri,
      };
    }

    // Console type (language) drives the node icon rather than the description.
    let consoleType: ConsoleType | undefined;
    if (
      isInstanceOf(connectionOrUri, DhcService) &&
      connectionOrUri.isInitialized
    ) {
      [consoleType] = await connectionOrUri.getConsoleTypes();
    }

    // Prefer the persistent query name (what the DHE Query Monitor shows) over
    // the local correlation tagId. Attached workers get a synthesized random
    // tagId that matches nothing server-side, and created workers' tagId can
    // diverge from their query name; the PQ name is the stable identifier in
    // both cases. Falls back to tagId for plain DHC connections, which have no
    // associated WorkerInfo.
    const workerInfo = await this.serverManager.getWorkerInfo(
      connectionOrUri.serverUrl
    );
    const description = workerInfo?.name ?? connectionOrUri.tagId ?? '';

    const hasUris = this.serverManager.hasConnectionUris(connectionOrUri);

    const serverLabel = getServerMatchPortIfLocalHost(
      this.serverManager,
      connectionOrUri.serverUrl
    )?.label;

    const label = serverLabel ?? connectionOrUri.serverUrl.host;

    // Connection node
    return {
      label,
      description,
      contextValue: connectionOrUri.isConnected
        ? CONNECTION_TREE_ITEM_CONTEXT.isConnectionConnected
        : CONNECTION_TREE_ITEM_CONTEXT.isConnectionConnecting,
      collapsibleState: hasUris
        ? vscode.TreeItemCollapsibleState.Expanded
        : undefined,
      // Show the language (Python/Groovy) icon when idle/connected; show the
      // spinner while busy (connecting or running code).
      iconPath: new vscode.ThemeIcon(
        connectionOrUri.isRunningCode || !connectionOrUri.isConnected
          ? ICON_ID.connecting
          : getConsoleTypeIconId(consoleType)
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
