import * as vscode from 'vscode';
import * as path from 'node:path';
import { ServerTreeProviderBase } from './ServerTreeProviderBase';
import { CONNECTION_TREE_ITEM_CONTEXT, ICON_ID } from '../common';
import type {
  ConnectionState,
  IPanelService,
  IServerManager,
  ServerConnectionNode,
} from '../types';
import {
  getConnectionServerTreeItem,
  getConnectionTreeRootNodes,
  getConsoleTypeIconId,
  getPanelVariableLeaves,
  getPanelVariableTreeItem,
  getWorkerNodeLabel,
  isInstanceOf,
  isServerStateNode,
  sortByStringProp,
} from '../util';
import { DhcService, getFirstSupportedConsoleType } from '../services';

/**
 * Provider for the server connection tree view. Each server node lists its
 * console worker connections, and each worker lists the editor files associated
 * with it followed by the panels open on its session.
 */
export class ServerConnectionTreeProvider extends ServerTreeProviderBase<ServerConnectionNode> {
  constructor(serverManager: IServerManager, panelService: IPanelService) {
    super(serverManager);
    this._panelService = panelService;

    // Refresh whenever a worker's variables change (panel opened / closed, code
    // run), since worker nodes now list them.
    this.disposables.add(
      this._panelService.onDidUpdate(() => {
        this._onDidChangeTreeData.fire();
      })
    );
  }

  private readonly _panelService: IPanelService;

  /**
   * The editor uris associated with a connection, alphabetized by the file name
   * the node shows (the full path is only the node description).
   * @param connection The worker connection.
   */
  private _getSortedUris = (connection: ConnectionState): vscode.Uri[] =>
    this.serverManager
      .getConnectionUris(connection)
      .sort(
        (a, b) =>
          path.posix
            .basename(a.path)
            .localeCompare(path.posix.basename(b.path)) ||
          a.path.localeCompare(b.path)
      );

  getTreeItem = async (
    node: ServerConnectionNode
  ): Promise<vscode.TreeItem> => {
    // Panel leaf node associated with a parent connection node. Worker
    // connections always own a console session (`getConnections` excludes
    // browse connections), so their variables can be deleted.
    if (Array.isArray(node)) {
      return getPanelVariableTreeItem(node, true);
    }

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
    const consoleType = await getFirstSupportedConsoleType(node);

    const hasChildren =
      this.serverManager.hasConnectionUris(node) ||
      getPanelVariableLeaves(this._panelService, node.serverUrl).length > 0;

    // Identify connections created by the extension or in-flight placeholders
    const isOwned = isInstanceOf(node, DhcService) ? node.isOwned : true;

    // Connection node
    return {
      // Worker names end in a long generated id, so the node shows a shortened
      // form and keeps the full name on hover.
      label: getWorkerNodeLabel(node.label),
      tooltip: node.label,
      contextValue: node.isConnected
        ? CONNECTION_TREE_ITEM_CONTEXT.isConnectionConnected(isOwned)
        : CONNECTION_TREE_ITEM_CONTEXT.isConnectionConnecting(isOwned),
      collapsibleState: hasChildren
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

    // Panel leaf nodes have no children.
    if (Array.isArray(elementOrRoot)) {
      return [];
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

    // Connection node -> its editor uris, then its open panels. Files sort to
    // the top since they are the association the user manages; panels follow.
    return [
      ...this._getSortedUris(elementOrRoot),
      ...getPanelVariableLeaves(this._panelService, elementOrRoot.serverUrl),
    ];
  };

  /**
   * Get the parent of the given element. Note that this is required in order
   * for `TreeView.reveal` method to work.
   * @param element
   */
  getParent = (element: ServerConnectionNode): ServerConnectionNode | null => {
    // Panel leaf node -> the connection hosting the variable.
    if (Array.isArray(element)) {
      const [workerUrl] = element;
      return this.serverManager.getConnection(workerUrl) ?? null;
    }

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
