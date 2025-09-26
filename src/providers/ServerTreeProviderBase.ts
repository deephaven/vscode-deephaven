import type { IServerManager } from '../types';
import { TreeDataProviderBase } from './TreeDataProviderBase';

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
