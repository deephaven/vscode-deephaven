import * as vscode from 'vscode';
import { ICON_ID, SERVER_TREE_ITEM_CONTEXT } from '../common';
import { TreeDataProviderBase } from './TreeDataProviderBase';
import type { ServerGroupState, ServerNode } from '../types/treeViewTypes';
import {
  getServerContextValue,
  getServerDescription,
  getServerIconPath,
} from '../util';

function isServerGroupState(node: ServerNode): node is ServerGroupState {
  return typeof node === 'string';
}

/**
 * Provider for the server tree view.
 */
export class ServerTreeProvider extends TreeDataProviderBase<ServerNode> {
  getTreeItem(
    element: ServerNode
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    if (isServerGroupState(element)) {
      return {
        label: element,
        iconPath: new vscode.ThemeIcon(ICON_ID.server),
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        contextValue:
          element === 'Managed' && this.serverManager.canStartServer
            ? SERVER_TREE_ITEM_CONTEXT.canStartServer
            : undefined,
      };
    }

    const isConnected = this.serverManager.hasConnection(element.url);
    const isManaged = element.isManaged ?? false;
    const isRunning = element.isRunning ?? false;
    const contextValue = getServerContextValue({
      isConnected,
      isManaged,
      isRunning,
    });
    const canConnect =
      contextValue === SERVER_TREE_ITEM_CONTEXT.isManagedServerDisconnected ||
      contextValue === SERVER_TREE_ITEM_CONTEXT.isServerRunningDisconnected;
    const urlStr = element.url.toString();
    const description = getServerDescription(
      isConnected ? 1 : 0,
      isManaged,
      element.label
    );

    return {
      label: new URL(urlStr).host,
      description,
      tooltip: canConnect ? `Click to connect to ${urlStr}` : urlStr,
      contextValue: element.type === 'DHC' ? contextValue : undefined,
      iconPath: new vscode.ThemeIcon(
        getServerIconPath({ isConnected, isManaged, isRunning })
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

    const managedServers = [];
    const runningServers = [];
    const stoppedServers = [];

    for (const server of servers) {
      if (server.isManaged) {
        managedServers.push(server);
      } else if (server.isRunning) {
        runningServers.push(server);
      } else {
        stoppedServers.push(server);
      }
    }

    // Root node
    if (elementOrRoot == null) {
      // Only show groups that contain server child nodes
      return [
        this.serverManager.canStartServer || managedServers.length > 0
          ? ('Managed' as const)
          : undefined,
        runningServers.length === 0 ? undefined : ('Running' as const),
        stoppedServers.length === 0 ? undefined : ('Stopped' as const),
      ].filter(child => child != null);
    }

    if (isServerGroupState(elementOrRoot)) {
      return {
        /* eslint-disable @typescript-eslint/naming-convention */
        Managed: managedServers,
        Running: runningServers,
        Stopped: stoppedServers,
        /* eslint-enable @typescript-eslint/naming-convention */
      }[elementOrRoot];
    }
  }
}
