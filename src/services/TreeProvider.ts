import * as vscode from 'vscode';
import {
  ICON_ID,
  ServerState,
  SERVER_TREE_ITEM_CONTEXT,
  type ServerTreeItemContextValue,
  CONNECTION_TREE_ITEM_CONTEXT,
  MIME_TYPE,
} from '../common';
import { IDhService, IServerManager } from './types';
import { getEditorForUri } from '../util';

/**
 * Base class for tree view data providers.
 */
export abstract class TreeProvider<T> implements vscode.TreeDataProvider<T> {
  constructor(readonly serverManager: IServerManager) {
    serverManager.onDidUpdate(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  private _onDidChangeTreeData = new vscode.EventEmitter<
    T | undefined | void
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  abstract getTreeItem(element: T): vscode.TreeItem | Thenable<vscode.TreeItem>;

  abstract getChildren(element?: T | undefined): vscode.ProviderResult<T[]>;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

type ServerGroupState = { label: string };
type ServerNode = ServerGroupState | ServerState;
type ServerConnectionNode = IDhService | vscode.Uri;

export interface ServerTreeView extends vscode.TreeView<ServerNode> {}
export interface ServerConnectionTreeView
  extends vscode.TreeView<ServerConnectionNode> {}

function isServerGroupState(node: ServerNode): node is ServerGroupState {
  return 'label' in node;
}

function getServerContextValue({
  isConnected,
  isRunning,
}: {
  isConnected: boolean;
  isRunning: boolean;
}): ServerTreeItemContextValue {
  if (isRunning) {
    return isConnected
      ? SERVER_TREE_ITEM_CONTEXT.isServerRunningConnected
      : SERVER_TREE_ITEM_CONTEXT.isServerRunningDisconnected;
  }

  return SERVER_TREE_ITEM_CONTEXT.isServerStopped;
}

/**
 * Provider for the server tree view.
 */
export class ServerTreeProvider extends TreeProvider<ServerNode> {
  getTreeItem(
    element: ServerNode
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    if (isServerGroupState(element)) {
      return {
        label: element.label,
        iconPath: new vscode.ThemeIcon('server'),
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      };
    }

    const isConnected = this.serverManager.hasConnection(element.url);
    const isRunning = element.isRunning ?? false;
    const contextValue = getServerContextValue({ isConnected, isRunning });
    const canConnect =
      contextValue === SERVER_TREE_ITEM_CONTEXT.isServerRunningDisconnected;

    return {
      label: new URL(element.url).host,
      description: element.type === 'DHC' ? undefined : 'Enterprise',
      tooltip: canConnect ? `Click to connect to ${element.url}` : element.url,
      contextValue: element.type === 'DHC' ? contextValue : undefined,
      iconPath: new vscode.ThemeIcon(
        isRunning ? 'circle-large-filled' : 'circle-slash'
      ),
      command: canConnect
        ? {
            title: 'Open in Browser',
            command: 'vscode-deephaven.connectToServer',
            arguments: [element],
          }
        : undefined,
    };
  }

  getChildren(elementOrRoot?: ServerNode): vscode.ProviderResult<ServerNode[]> {
    const servers = this.serverManager.getServers();

    const runningServers = [];
    const stoppedServers = [];

    for (const server of servers) {
      if (server.isRunning) {
        runningServers.push(server);
      } else {
        stoppedServers.push(server);
      }
    }

    // Root node
    if (elementOrRoot == null) {
      // Only show groups that contain server child nodes
      return [
        runningServers.length === 0 ? undefined : { label: 'Running' },
        stoppedServers.length === 0 ? undefined : { label: 'Stopped' },
      ].filter(child => child != null);
    }

    if (isServerGroupState(elementOrRoot)) {
      return elementOrRoot.label === 'Running'
        ? runningServers
        : stoppedServers;
    }
  }
}

/**
 * Provider for the server connection tree view.
 */
export class ServerConnectionTreeProvider extends TreeProvider<ServerConnectionNode> {
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
      label: new URL(connectionOrUri.serverUrl).host,
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
        .sort((a, b) => a.serverUrl.localeCompare(b.serverUrl));
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

/**
 * Drag and drop controller for the server connection tree view.
 */
export class ServerConnectionTreeDragAndDropController
  implements vscode.TreeDragAndDropController<ServerConnectionNode>
{
  constructor(readonly serverManager: IServerManager) {}

  dropMimeTypes: readonly string[] = [MIME_TYPE.uriList];
  dragMimeTypes: readonly string[] = [MIME_TYPE.uriList];

  handleDrop = async (
    target: ServerConnectionNode | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> => {
    // Only target connection nodes
    if (target == null || target instanceof vscode.Uri) {
      return;
    }

    const transferItem = dataTransfer.get(MIME_TYPE.uriList);
    if (transferItem == null) {
      return;
    }

    const uri = vscode.Uri.parse(transferItem.value);
    const editor = await getEditorForUri(uri);

    try {
      await this.serverManager.setEditorConnection(editor, target);
    } catch {}
  };
}
