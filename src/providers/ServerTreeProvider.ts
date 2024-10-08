import * as vscode from 'vscode';
import { TreeDataProviderBase } from './TreeDataProviderBase';
import type { ServerGroupState, ServerNode } from '../types/treeViewTypes';
import {
  assertNever,
  getServerGroupTreeItem,
  getServerTreeItem,
  groupServers,
} from '../util';

function isServerGroupState(node: ServerNode): node is ServerGroupState {
  return typeof node === 'string';
}

/**
 * Provider for the server tree view.
 */
export class ServerTreeProvider extends TreeDataProviderBase<ServerNode> {
  getTreeItem = (element: ServerNode): vscode.TreeItem => {
    if (isServerGroupState(element)) {
      return getServerGroupTreeItem(element, this.serverManager.canStartServer);
    }

    const connectionCount = this.serverManager.connectionCount(element.url);
    const isManaged = element.isManaged ?? false;
    const isRunning = element.isRunning ?? false;

    return getServerTreeItem({
      server: element,
      connectionCount,
      isManaged,
      isRunning,
    });
  };

  getChildren(elementOrRoot?: ServerNode): vscode.ProviderResult<ServerNode[]> {
    const { managed, running, stopped } = groupServers(
      this.serverManager.getServers()
    );

    // Root node
    if (elementOrRoot == null) {
      const children: ServerGroupState[] = [];

      if (managed.length > 0 || this.serverManager.canStartServer) {
        children.push('Managed');
      }

      if (running.length > 0) {
        children.push('Running');
      }

      if (stopped.length > 0) {
        children.push('Stopped');
      }

      return children;
    }

    if (isServerGroupState(elementOrRoot)) {
      switch (elementOrRoot) {
        case 'Managed':
          return managed;

        case 'Running':
          return running;

        case 'Stopped':
          return stopped;

        default:
          assertNever(elementOrRoot, 'elementOrRoot');
      }
    }
  }
}
