import type { IServerManager } from '../types';
import { TreeDataProviderBase } from './TreeDataProviderBase';

/**
 * Base class for tree data providers that depend on a server manager.
 */
export abstract class ServerTreeProviderBase<
  T,
> extends TreeDataProviderBase<T> {
  constructor(serverManager: IServerManager) {
    super();

    this.serverManager = serverManager;

    this.serverManager.onDidUpdate(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  protected readonly serverManager: IServerManager;
}
