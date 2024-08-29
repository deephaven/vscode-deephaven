import * as vscode from 'vscode';
import {
  ICON_ID,
  SERVER_TREE_ITEM_CONTEXT,
  type ServerTreeItemContextValue,
} from '../common';
import { TreeDataProviderBase } from './TreeDataProviderBase';
import type { ServerGroupState, ServerNode } from '../types/treeViewTypes';
import { getServerDescription } from '../util';

function isServerGroupState(node: ServerNode): node is ServerGroupState {
  return typeof node === 'string';
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
export class ServerTreeProvider extends TreeDataProviderBase<ServerNode> {
  getTreeItem(
    element: ServerNode
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    if (isServerGroupState(element)) {
      return {
        label: element,
        iconPath: new vscode.ThemeIcon(ICON_ID.server),
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      };
    }

    const isConnected = this.serverManager.hasConnection(element.url);
    const isRunning = element.isRunning ?? false;
    const contextValue = getServerContextValue({ isConnected, isRunning });
    const canConnect =
      contextValue === SERVER_TREE_ITEM_CONTEXT.isServerRunningDisconnected;
    const urlStr = element.url.toString();
    const description = getServerDescription(
      isConnected ? 1 : 0,
      element.label
    );

    return {
      label: new URL(urlStr).host,
      description,
      tooltip: canConnect ? `Click to connect to ${urlStr}` : urlStr,
      contextValue: element.type === 'DHC' ? contextValue : undefined,
      iconPath: new vscode.ThemeIcon(
        isRunning
          ? isConnected
            ? ICON_ID.serverConnected
            : ICON_ID.serverRunning
          : ICON_ID.serverStopped
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
        runningServers.length === 0 ? undefined : ('Running' as const),
        stoppedServers.length === 0 ? undefined : ('Stopped' as const),
      ].filter(child => child != null);
    }

    if (isServerGroupState(elementOrRoot)) {
      return elementOrRoot === 'Running' ? runningServers : stoppedServers;
    }
  }
}
