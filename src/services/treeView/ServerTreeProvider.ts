import * as vscode from 'vscode';
import {
  SERVER_TREE_ITEM_CONTEXT,
  type ServerTreeItemContextValue,
} from '../../common';
import { TreeDataProviderBase } from './TreeDataProviderBase';
import type { ServerGroupState, ServerNode } from './types';

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
export class ServerTreeProvider extends TreeDataProviderBase<ServerNode> {
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

    const urlStr = element.url.toString();

    return {
      label: new URL(urlStr).host,
      description: element.type === 'DHC' ? undefined : 'Enterprise',
      tooltip: canConnect ? `Click to connect to ${urlStr}` : urlStr,
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
